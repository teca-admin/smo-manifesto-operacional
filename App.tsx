
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ActionType, 
  FeedbackMessage 
} from './types';
import { 
  fetchNames, 
  fetchNamesByStatus,
  fetchNamesForFinalization,
  fetchIdsByStatus, 
  fetchManifestosForEmployee,
  fetchManifestosByCIA, 
  fetchCIAs,
  submitManifestoAction,
  checkConnection,
  authenticateCIA,
  fetchCIAUsers
} from './services/api';
import { supabase } from './supabaseClient';
import LoadingOverlay from './components/LoadingOverlay';
import CustomSelect from './components/CustomSelect';

// Icons
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
  </svg>
);

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const App: React.FC = () => {
  // Login State
  const [userType, setUserType] = useState<'WFS' | 'CIA' | null>(null);
  const [currentUser, setCurrentUser] = useState<string>(''); // Stores logged in CIA user

  // CIA Login State
  const [showCIALogin, setShowCIALogin] = useState(false);
  const [ciaUsername, setCiaUsername] = useState('');
  const [ciaPassword, setCiaPassword] = useState('');
  const [ciaUsersList, setCiaUsersList] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // State
  const [action, setAction] = useState<ActionType>('');
  const [name, setName] = useState<string>('');
  const [selectedManifestoId, setSelectedManifestoId] = useState<string>('');
  
  // Data Lists
  const [namesList, setNamesList] = useState<string[]>([]);
  const [idsList, setIdsList] = useState<string[]>([]);
  const [manifestosForEmployee, setManifestosForEmployee] = useState<string[]>([]);

  // UI State
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Processando...');
  const [updating, setUpdating] = useState<boolean>(false); // For the refresh button spinner
  const [feedback, setFeedback] = useState<FeedbackMessage>({ text: '', type: '' });
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  
  // Connection State
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // --- Initial Check ---
  useEffect(() => {
    const verifyConnection = async () => {
        const result = await checkConnection();
        if (!result.success) {
            setConnectionError(result.message);
        } else {
            setConnectionError(null);
        }
    };
    verifyConnection();
  }, []);

  // --- Load CIA Users ---
  useEffect(() => {
    if (showCIALogin) {
        fetchCIAUsers().then(setCiaUsersList);
    }
  }, [showCIALogin]);

  // --- Background Transition Effect ---
  useEffect(() => {
    document.body.classList.remove('wfs-mode', 'cia-mode');
    
    if (userType === 'WFS') {
      document.body.classList.add('wfs-mode');
    } else if (userType === 'CIA' || showCIALogin) {
      document.body.classList.add('cia-mode');
    }
  }, [userType, showCIALogin]);

  // --- Data Loading Functions ---

  const loadNames = useCallback(async () => {
    // For "Iniciar Manifesto", we likely want all names or active employees
    const names = await fetchNames();
    setNamesList(names);
  }, []);

  const loadIds = useCallback(async () => {
    setUpdating(true);
    // Based on PDF logic: Iniciar Manifesto needs "Manifesto Recebido"
    const ids = await fetchIdsByStatus('Manifesto Recebido');
    setIdsList(ids);
    setTimeout(() => setUpdating(false), 500); // Visual delay for spinner
  }, []);

  const loadIdsForConference = useCallback(async () => {
    if (!currentUser) return; // Must have a logged in CIA user
    setUpdating(true);
    // Fetch manifestos for the specific CIA that are finalized
    const ids = await fetchManifestosByCIA(currentUser);
    setIdsList(ids);
    setTimeout(() => setUpdating(false), 500);
  }, [currentUser]);

  const loadIdsFinalization = useCallback(async () => {
    setUpdating(true);
    // Based on requested logic: Finalizar Manifesto loads names where Manifesto_Iniciado is NOT NULL
    const names = await fetchNamesForFinalization();
    setNamesList(names);
    setTimeout(() => setUpdating(false), 500);
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!userType) return; // Only subscribe if logged in

    const channel = supabase
      .channel('realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'SMO_Sistema_de_Manifesto_Operacional', table: 'SMO_Sistema' },
        (payload) => {
          // If SMO_Sistema changes (new manifesto or status change), refresh relevant lists
          if (action === 'Iniciar Manifesto') {
            loadIds();
          } else if (action === 'Finalizar Manifesto') {
            loadIdsFinalization();
            if (name) {
              fetchManifestosForEmployee(name).then(setManifestosForEmployee);
            }
          } else if (action === 'Conferir Manifesto') {
            loadIdsForConference();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'SMO_Sistema_de_Manifesto_Operacional', table: 'Cadastro_Operacional' },
        (payload) => {
          // If a new employee is added
          if (action === 'Iniciar Manifesto') loadNames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [action, name, loadIds, loadNames, loadIdsFinalization, loadIdsForConference, userType]);

  // --- Event Handlers ---

  // Handle Action Change
  useEffect(() => {
    setFeedback({ text: '', type: '' });
    setName('');
    setSelectedManifestoId('');
    setManifestosForEmployee([]);

    if (action === 'Iniciar Manifesto') {
      loadNames();
      loadIds();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization(); // Loads names for finalization
    } else if (action === 'Conferir Manifesto') {
      loadIdsForConference(); // Loads IDs for conference filtered by CIA
    }
  }, [action, loadNames, loadIds, loadIdsFinalization, loadIdsForConference]);

  // Handle Refresh Click
  const handleRefresh = () => {
    if (updating) return;
    setConnectionError(null);
    checkConnection().then(res => !res.success && setConnectionError(res.message));

    if (action === 'Iniciar Manifesto') {
      loadIds();
      loadNames();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization();
    } else if (action === 'Conferir Manifesto') {
      loadIdsForConference();
    }
  };

  // Handle Name Selection (Finalizar Manifesto)
  const handleNameChange = async (val: string) => {
    setName(val);
    setSelectedManifestoId('');
    if (action === 'Finalizar Manifesto' && val) {
      const manifests = await fetchManifestosForEmployee(val);
      setManifestosForEmployee(manifests);
    } else {
      setManifestosForEmployee([]);
    }
  };
  
  // Handle Manifesto ID Selection
  const handleManifestoSelect = async (id: string) => {
      setSelectedManifestoId(id);
  };

  // Handle CIA Login Submit
  const handleCIALoginSubmit = async () => {
      if (!ciaUsername || !ciaPassword) {
          setLoginError('Por favor, informe usuário e senha.');
          return;
      }
      
      setLoginError('');
      setIsLoggingIn(true);
      
      const isAuthenticated = await authenticateCIA(ciaUsername, ciaPassword);
      setIsLoggingIn(false);

      if (isAuthenticated) {
          setUserType('CIA');
          setCurrentUser(ciaUsername);
          setShowCIALogin(false);
          // Reset fields
          setCiaUsername('');
          setCiaPassword('');
          setShowPassword(false);
      } else {
          setLoginError('Credenciais inválidas ou erro no acesso.');
      }
  };

  // Handle Submission
  const handleSubmit = async () => {
    setFeedback({ text: '', type: '' });

    // For Conferir Manifesto (CIA), we use the logged-in user, not the 'name' state
    const submissionName = action === 'Conferir Manifesto' ? currentUser : name;

    // Validation
    if (!action) return;
    if (action === 'Iniciar Manifesto' && (!submissionName || !selectedManifestoId)) {
      setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
      return;
    }
    if (action === 'Finalizar Manifesto' && (!submissionName || !selectedManifestoId)) {
        setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
        return;
    }
    if (action === 'Conferir Manifesto' && !selectedManifestoId) {
        setFeedback({ text: 'Selecione um manifesto.', type: 'error' });
        return;
    }

    // Strict name check only if list is populated and not empty (only for WFS actions where name is selected)
    if (action !== 'Conferir Manifesto' && namesList.length > 0 && !namesList.some(n => n.toLowerCase() === submissionName.toLowerCase())) {
        setFeedback({ text: 'Por favor, escolha um nome válido da lista.', type: 'error' });
        return;
    }

    // Duplicate Check
    const submissionKey = `${action}-${selectedManifestoId}-${submissionName}`;
    if (lastSubmission === submissionKey) {
      setFeedback({ text: 'Este registro já foi enviado recentemente!', type: 'error' });
      return;
    }

    setLoading(true);
    setLoadingMessage('Processando...');

    // Simulate Network Request
    setTimeout(async () => {
      const result = await submitManifestoAction(action, selectedManifestoId, submissionName);
      
      setLoading(false);
      
      if (result.success) {
        setLastSubmission(submissionKey);

        // Reset App State to Initial (but keep action for convenience)
        setSelectedManifestoId('');
        setManifestosForEmployee([]);
        // We only clear name if it's not Conferir (since currentUser persists)
        if (action !== 'Conferir Manifesto') setName('');

        // Show feedback AFTER state reset
        setTimeout(() => {
            setFeedback({ text: result.message, type: 'success' });
            // Auto hide success message
            setTimeout(() => setFeedback({text: '', type: ''}), 4000);
        }, 100);

      } else {
        setFeedback({ text: result.message, type: 'error' });
      }
    }, 1500); 
  };

  // --- LOGIN SCREEN ---
  if (!userType) {
    // Check if showing CIA Login Form
    if (showCIALogin) {
        return (
            <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
                <h2 className="text-[#50284f] text-[22px] font-bold mb-[30px]">
                  Acesso CIA
                </h2>

                <div className="text-left mb-[15px]">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px]">Login</label>
                    <CustomSelect
                        options={ciaUsersList}
                        value={ciaUsername}
                        onChange={setCiaUsername}
                        placeholder="Selecione o usuário"
                        searchable={true}
                        theme="purple"
                    />
                </div>

                <div className="text-left mb-[20px]">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px]">Senha</label>
                    <div className="relative">
                      <input 
                          type={showPassword ? "text" : "password"} 
                          value={ciaPassword}
                          onChange={(e) => setCiaPassword(e.target.value)}
                          className="w-full p-[12px] border border-[#cbd5e1] rounded-[12px] text-[14px] text-[#333] bg-[#f0f2f5] outline-none focus:border-[#50284f] transition-colors pr-[40px]"
                      />
                      <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-[#50284f] focus:outline-none"
                      >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                </div>

                {loginError && (
                    <div className="mb-[15px] text-[#dc3545] text-[13px] font-bold bg-[#f8d7da] p-[10px] rounded-[8px] border border-[#f5c6cb]">
                        {loginError}
                    </div>
                )}

                <div className="flex flex-col gap-[10px]">
                    <button 
                        onClick={handleCIALoginSubmit}
                        disabled={isLoggingIn}
                        className="w-full p-[14px] bg-gradient-to-r from-[#50284f] to-[#7a3e79] text-white font-bold text-[16px] rounded-[12px] shadow-[0_4px_12px_rgba(80,40,79,0.25)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoggingIn ? 'Verificando...' : 'Entrar'}
                    </button>
                    
                    <button 
                        onClick={() => { setShowCIALogin(false); setLoginError(''); setCiaUsername(''); setCiaPassword(''); setShowPassword(false); }}
                        className="w-full p-[14px] bg-white text-[#50284f] border border-[#50284f] font-bold text-[14px] rounded-[12px] transition-all hover:bg-[#f8f9fa]"
                    >
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    // Default Profile Selection Screen
    return (
      <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
        <h2 className="text-[#ee2f24] text-[22px] font-bold mb-[30px]">
          SMO - Manifesto Operacional
        </h2>
        
        <p className="text-[#666] text-[14px] mb-[20px] font-medium">
            Selecione o perfil de acesso:
        </p>

        <div className="flex flex-col gap-[12px]">
            <button 
                onClick={() => setUserType('WFS')}
                className="w-full p-[14px] bg-gradient-to-r from-[#ee2f24] to-[#ff6f61] text-white font-bold text-[16px] rounded-[12px] shadow-[0_4px_12px_rgba(238,47,36,0.25)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(238,47,36,0.35)] active:scale-[0.98]"
            >
                WFS
            </button>
            
            <button 
                onClick={() => setShowCIALogin(true)}
                className="w-full p-[14px] bg-gradient-to-r from-[#50284f] to-[#7a3e79] text-white font-bold text-[16px] rounded-[12px] shadow-[0_4px_12px_rgba(80,40,79,0.25)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(80,40,79,0.35)] active:scale-[0.98]"
            >
                CIA
            </button>
        </div>

        {connectionError && (
            <div className="mt-8 bg-[#fff0f1] border border-[#ffcdd2] text-[#c62828] p-3 rounded-[8px] text-[12px] text-left">
                <p className="font-bold mb-1">Status da Conexão:</p>
                <p>{connectionError}</p>
            </div>
        )}
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
      
      <div className="mb-[25px]">
          <h2 className={`text-[22px] font-bold ${userType === 'CIA' ? 'text-[#50284f]' : 'text-[#ee2f24]'}`}>
            SMO - Manifesto Operacional
          </h2>
          <div 
             className="mt-2 inline-block px-3 py-1 bg-[#f0f2f5] text-[#666] text-[11px] font-bold rounded-full uppercase tracking-wider hover:bg-[#e2e4e8]"
             title="Status de acesso"
          >
              Acesso: {userType} {userType === 'CIA' && currentUser && `(${currentUser})`}
          </div>
      </div>

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-[#fff0f1] border border-[#ffcdd2] text-[#c62828] p-3 rounded-[8px] text-[13px] text-left mb-4">
            <p className="font-bold mb-1">Erro de Conexão com Banco de Dados:</p>
            <p className="mb-2 break-all">{connectionError}</p>
            <p className="text-[11px] text-[#444]">
                Verifique se a URL em <code>supabaseClient.ts</code> está correta:
            </p>
            <code className="block bg-white p-1 mt-1 rounded border text-[10px] break-all">
                {(supabase as any).supabaseUrl || 'URL não definida'}
            </code>
        </div>
      )}

      {/* Action Selection */}
      <label htmlFor="acao" className="block mt-[15px] mb-[5px] font-bold text-[#444] text-[14px] text-left">
        Ação
      </label>
      <div className="flex gap-2 items-start">
        <div className="flex-1">
            <CustomSelect 
                options={userType === 'CIA' ? ['Conferir Manifesto'] : ['Iniciar Manifesto', 'Finalizar Manifesto']}
                value={action}
                onChange={(val) => setAction(val as ActionType)}
                placeholder="Selecione"
                disabled={!!connectionError}
                theme={userType === 'CIA' ? 'purple' : 'red'}
            />
        </div>

        {/* Refresh Button */}
        {action && (
            <button 
                onClick={handleRefresh}
                className={`w-[45px] h-[45px] mt-[5px] p-0 bg-transparent font-bold border rounded-[12px] cursor-pointer transition-all duration-200 text-[18px] flex items-center justify-center flex-shrink-0 hover:bg-[#fff0f1] ${updating ? 'opacity-70 cursor-wait' : ''} ${userType === 'CIA' ? 'text-[#50284f] border-[#50284f]' : 'text-[#ee2f24] border-[#ee2f24]'}`}
                title="Atualizar lista"
                disabled={!!connectionError}
            >
                <div className={updating ? 'animate-spin' : ''}>
                    <RefreshIcon />
                </div>
            </button>
        )}
      </div>

      {/* -------------------- INICIAR / CONFERIR MANIFESTO VIEW -------------------- */}
      {/* Both use a direct list of IDs without a Name filter step first */}
      {(action === 'Iniciar Manifesto' || action === 'Conferir Manifesto') && (
        <div className="animate-fadeIn">
            {/* Name Input (Only for Iniciar, NOT for Conferir) */}
            {action === 'Iniciar Manifesto' && (
                <div className="mt-[15px]">
                    <label htmlFor="nome" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
                    <CustomSelect
                        options={namesList}
                        value={name}
                        onChange={setName}
                        placeholder="Digite ou selecione"
                        searchable={true}
                        disabled={!!connectionError}
                    />
                </div>
            )}

            {/* ID Manifesto List */}
            <div className="mt-[15px]">
                <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">ID Manifesto</label>
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-[10px]">
                     {idsList.length === 0 ? (
                        <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">
                            {connectionError ? 'Sem conexão' : 'Nenhum manifesto disponível'}
                        </div>
                     ) : (
                         idsList.map(id => (
                            <button
                                key={id}
                                onClick={() => setSelectedManifestoId(id)}
                                className={`w-full flex justify-between items-center p-[12px] my-[6px] border rounded-[10px] text-[13px] text-left font-medium relative transition-all duration-200 cursor-pointer 
                                    ${selectedManifestoId === id 
                                        ? `${userType === 'CIA' ? 'bg-gradient-to-r from-[#50284f] to-[#7a3e79]' : 'bg-gradient-to-r from-[#ee2f24] to-[#ff6f61]'} text-white border-transparent shadow-md transform scale-[1.02]` 
                                        : 'bg-white text-[#495057] border-[#e9ecef] hover:bg-[#fff0f1] hover:border-[#ffcdd2]'
                                    }`}
                            >
                                <span className="font-bold">{id}</span>
                                {selectedManifestoId === id && (
                                    <span className="bg-white/25 text-white text-[10px] uppercase font-bold px-[8px] py-[2px] rounded-[6px] border border-white/40 tracking-wide">
                                        {action === 'Iniciar Manifesto' ? 'Iniciar' : 'Conferir'}
                                    </span>
                                )}
                            </button>
                         ))
                     )}
                </div>
            </div>
        </div>
      )}

      {/* -------------------- FINALIZAR MANIFESTO VIEW (WFS Only) -------------------- */}
      {action === 'Finalizar Manifesto' && (
        <div className="animate-fadeIn">
            {/* Employee Name Select */}
            <div className="mt-[15px]">
                <label htmlFor="nomeFinalizacao" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
                <CustomSelect 
                    options={namesList}
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Selecione"
                    searchable={true}
                    disabled={!!connectionError}
                    theme='red'
                />
            </div>

            {/* Expanded Manifesto Selection Area */}
            {name && (
                <div className="mt-[10px] bg-white border border-[#dee2e6] rounded-[12px] p-[15px] animate-slideDown">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">
                        ID Manifesto
                    </label>
                    <div className="max-h-[200px] overflow-y-auto overflow-x-hidden text-left custom-scrollbar p-[4px]">
                        {manifestosForEmployee.length === 0 ? (
                            <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">
                                Nenhum manifesto encontrado para este funcionário
                            </div>
                        ) : (
                            <>
                                <div className="bg-[#e8f5e8] border border-[#28a745] text-[#155724] p-[10px] rounded-[8px] mb-[10px] font-bold text-[14px] text-center">
                                    {manifestosForEmployee.length} manifesto(s) encontrado(s)
                                </div>
                                {manifestosForEmployee.map(id => (
                                    <button
                                        key={id}
                                        onClick={() => handleManifestoSelect(id)}
                                        className={`w-full block p-[10px_12px] my-[6px] border rounded-[8px] text-[13px] text-left font-medium relative transition-all duration-200 cursor-pointer 
                                            ${selectedManifestoId === id 
                                                ? 'bg-gradient-to-br from-[#ee2f24] to-[#ff6f61] border-[#ee2f24] shadow-[0_4px_12px_rgba(238,47,36,0.3)] text-white font-bold' 
                                                : 'bg-[#f5f5f5] text-[#495057] border-[#dee2e6] hover:bg-[#e9ecef] hover:border-[#adb5bd] hover:translate-x-[3px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]'
                                            }`}
                                    >
                                        {id}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Submit Button */}
      {action && (
        <button 
            id="btnEnviar"
            onClick={handleSubmit}
            disabled={loading || !!connectionError}
            className={`w-full p-[14px] mt-[25px] bg-gradient-to-br ${userType === 'CIA' ? 'from-[#50284f] to-[#7a3e79] hover:shadow-[0_5px_15px_rgba(80,40,79,0.4)]' : 'from-[#ee2f24] to-[#ff6f61] hover:shadow-[0_5px_15px_rgba(238,47,36,0.4)]'} text-white font-bold text-[16px] border-none rounded-[12px] cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.03]`}
        >
            {loading ? 'Processando...' : (
                action === 'Iniciar Manifesto' ? 'Iniciar Manifesto' : 
                action === 'Finalizar Manifesto' ? 'Finalizar Manifesto' : 
                'Iniciar Conferência'
            )}
        </button>
      )}

      {/* Feedback Messages */}
      {feedback.text && (
        <div className={`mt-[15px] p-[10px] rounded-[8px] text-[14px] font-bold animate-slideDown ${
            feedback.type === 'success' 
            ? 'bg-[#d4edda] border border-[#c3e6cb] text-[#155724]' 
            : 'bg-[#f8d7da] border border-[#f5c6cb] text-[#721c24]'
        }`}>
            {feedback.text}
        </div>
      )}

      {/* Back Button */}
      <button 
          onClick={() => {
              setUserType(null);
              setCurrentUser('');
              setShowCIALogin(false);
              setAction('');
              setName('');
              setSelectedManifestoId('');
              setManifestosForEmployee([]);
              setFeedback({ text: '', type: '' });
          }}
          className={`w-full mt-[15px] p-[14px] bg-white font-bold text-[14px] rounded-[12px] transition-all hover:bg-[#f8f9fa] border ${userType === 'CIA' ? 'text-[#50284f] border-[#50284f]' : 'text-[#ee2f24] border-[#ee2f24]'}`}
      >
          Voltar
      </button>

      {/* Overlay Component */}
      <LoadingOverlay isVisible={loading} message={loadingMessage} />

    </div>
  );
};

export default App;
