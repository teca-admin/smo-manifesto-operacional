
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ActionType, 
  FeedbackMessage,
  ManifestoItem
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
  processBatchManifestos,
  checkConnection,
  authenticateCIA,
  fetchCIAUsers
} from './services/api';
import { supabase } from './supabaseClient';
import LoadingOverlay from './components/LoadingOverlay';
import CustomSelect from './components/CustomSelect';

// Icons
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
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
  const [currentUser, setCurrentUser] = useState<string>('');

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
  const [idsList, setIdsList] = useState<ManifestoItem[]>([]);
  const [manifestosForEmployee, setManifestosForEmployee] = useState<string[]>([]);

  // UI State
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Processando...');
  const [updating, setUpdating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<FeedbackMessage>({ text: '', type: '' });
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  
  // Dashboard State (CIA)
  const [processedCount, setProcessedCount] = useState<number>(0);
  // Per-item processing state for inline actions
  const [processingItems, setProcessingItems] = useState<string[]>([]);
  
  // Pending Modal State
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [pendingInhValue, setPendingInhValue] = useState<string>('');
  const [pendingIzValue, setPendingIzValue] = useState<string>('');
  
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
    const names = await fetchNames();
    setNamesList(names);
  }, []);

  const loadIds = useCallback(async () => {
    setUpdating(true);
    const ids = await fetchIdsByStatus('Manifesto Recebido');
    setIdsList(ids);
    setTimeout(() => setUpdating(false), 500);
  }, []);

  const loadIdsForConference = useCallback(async () => {
    if (!currentUser) return;
    setUpdating(true);
    const mode = action === 'Conferência Concluída' ? 'completed' : 'pending';
    const ids = await fetchManifestosByCIA(currentUser, mode);
    setIdsList(ids);
    setTimeout(() => setUpdating(false), 500);
  }, [currentUser, action]);

  const loadIdsFinalization = useCallback(async () => {
    setUpdating(true);
    const names = await fetchNamesForFinalization();
    setNamesList(names);
    setTimeout(() => setUpdating(false), 500);
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!userType) return;

    const channel = supabase
      .channel('realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'SMO_Sistema_de_Manifesto_Operacional', table: 'SMO_Sistema' },
        (payload) => {
          if (action === 'Iniciar Manifesto') {
            loadIds();
          } else if (action === 'Finalizar Manifesto') {
            loadIdsFinalization();
            if (name) {
              fetchManifestosForEmployee(name).then(setManifestosForEmployee);
            }
          } else if (action === 'Conferir Manifesto' || action === 'Conferência Concluída') {
            // For conference, we rely more on optimistic updates and local state to prevent UI jumping
            // but we still listen for external changes
            loadIdsForConference();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [action, name, loadIds, loadNames, loadIdsFinalization, loadIdsForConference, userType]);

  // --- Event Handlers ---

  useEffect(() => {
    setFeedback({ text: '', type: '' });
    setName('');
    setSelectedManifestoId('');
    setManifestosForEmployee([]);
    setProcessedCount(0);
    setProcessingItems([]);
    setPendingItem(null);
    setPendingInhValue('');
    setPendingIzValue('');

    if (action === 'Iniciar Manifesto') {
      loadNames();
      loadIds();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization();
    } else if (action === 'Conferir Manifesto' || action === 'Conferência Concluída') {
      loadIdsForConference();
    }
  }, [action, loadNames, loadIds, loadIdsFinalization, loadIdsForConference]);

  const handleRefresh = () => {
    if (updating) return;
    setConnectionError(null);
    setProcessedCount(0);
    checkConnection().then(res => !res.success && setConnectionError(res.message));

    if (action === 'Iniciar Manifesto') {
      loadIds();
      loadNames();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization();
    } else if (action === 'Conferir Manifesto' || action === 'Conferência Concluída') {
      loadIdsForConference();
    }
  };

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
  
  const handleManifestoSelect = async (id: string) => {
      setSelectedManifestoId(id);
  };

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
          setCiaUsername('');
          setCiaPassword('');
          setShowPassword(false);
      } else {
          setLoginError('Credenciais inválidas ou erro no acesso.');
      }
  };

  // Handle Inline Submit for Conferência Concluída items
  const handleInlineSubmit = async (itemAction: ActionType, id: string, reason?: string) => {
    // Prevent double submission for the same item
    if (processingItems.includes(id)) return;
    
    // Add to processing list (Local loading state)
    setProcessingItems(prev => [...prev, id]);
    setFeedback({ text: '', type: '' });
    
    // Call API
    const result = await submitManifestoAction(itemAction, id, currentUser, reason);
    
    // Remove from processing list
    setProcessingItems(prev => prev.filter(pid => pid !== id));
    
    if (result.success) {
        setProcessedCount(prev => prev + 1);
        
        // Close modal if it was open for this item
        if (pendingItem === id) {
            setPendingItem(null);
            setPendingInhValue('');
            setPendingIzValue('');
        }

        // OPTIMISTIC UPDATE: Remove from list immediately
        setIdsList(prev => prev.filter(item => item.id !== id));

        // We DO NOT call loadIdsForConference() here to avoid race conditions.
        // We rely on the optimistic update to update the UI instantly.
        // The background Realtime subscription will eventually sync if needed.
    } else {
        setFeedback({ text: result.message, type: 'error' });
    }
  };

  const handlePendenteClick = (id: string) => {
      setPendingItem(id);
      setPendingInhValue('');
      setPendingIzValue('');
  };

  const handleSubmit = async (overrideAction?: ActionType) => {
    setFeedback({ text: '', type: '' });

    const actionToSubmit = overrideAction || action;
    const submissionName = (action === 'Conferir Manifesto' || action === 'Conferência Concluída') ? currentUser : name;

    if (!actionToSubmit) return;
    
    const isBatchMode = (action === 'Conferir Manifesto' && userType === 'CIA');

    // --- Validations ---
    
    // 1. Strict Name Validation (WFS Actions)
    if ((action === 'Iniciar Manifesto' || action === 'Finalizar Manifesto') && (!name || name.trim() === '')) {
        setFeedback({ text: 'ERRO: É obrigatório atribuir o manifesto a alguém (selecionar Nome).', type: 'error' });
        return;
    }

    // 2. Generic Name Validation
    if (!submissionName || submissionName.trim() === '') {
        setFeedback({ text: 'Por favor, selecione ou digite o nome do responsável.', type: 'error' });
        return;
    }

    // 3. Validate Manifesto Selection (if not batch mode)
    if (!isBatchMode && !selectedManifestoId) {
      setFeedback({ text: 'Selecione um manifesto para prosseguir.', type: 'error' });
      return;
    }
    
    // 4. Validate Batch Mode
    if (isBatchMode && idsList.length === 0) {
        setFeedback({ text: 'Nenhum manifesto disponível para processar.', type: 'error' });
        return;
    }

    const submissionKey = `${actionToSubmit}-${selectedManifestoId}-${submissionName}`;

    if (!isBatchMode && lastSubmission === submissionKey) {
      setFeedback({ text: 'Este registro já foi enviado recentemente!', type: 'error' });
      return;
    }

    setLoading(true);
    setLoadingMessage('Processando...');

    setTimeout(async () => {
      let result;
      
      if (isBatchMode) {
          const idsToProcess = idsList.map(item => item.id);
          result = await processBatchManifestos('Conferir Manifesto', idsToProcess, submissionName);
      } else {
          result = await submitManifestoAction(actionToSubmit, selectedManifestoId, submissionName);
      }
      
      setLoading(false);
      
      if (result.success) {
        if (!isBatchMode) setLastSubmission(submissionKey);
        setFeedback({ text: result.message, type: 'success' });

        setTimeout(() => {
            setFeedback({ text: '', type: '' });
            setUserType(null); 
            setCurrentUser('');
            setShowCIALogin(false);
            setAction('');
            setName('');
            setSelectedManifestoId('');
            setManifestosForEmployee([]);
        }, 1500);

      } else {
        setFeedback({ text: result.message, type: 'error' });
      }
    }, 1500); 
  };

  // --- LOGIN SCREEN ---
  if (!userType) {
    if (showCIALogin) {
        return (
            <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
                <h2 className="text-[#50284f] text-[22px] font-bold mb-[30px]">Acesso CIA</h2>
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
                          onKeyDown={(e) => e.key === 'Enter' && handleCIALoginSubmit()}
                          className="w-full p-[12px] border border-[#cbd5e1] rounded-[12px] text-[14px] text-center outline-none focus:border-[#50284f] bg-[#f0f2f5] pr-[40px] text-[#333]"
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

    return (
      <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
        <h2 className="text-[#ee2f24] text-[22px] font-bold mb-[30px]">SMO - Manifesto Operacional</h2>
        <p className="text-[#666] text-[14px] mb-[20px] font-medium">Selecione o perfil de acesso:</p>
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
          <h2 className={`text-[22px] font-bold ${userType === 'CIA' ? 'text-[#50284f]' : 'text-[#ee2f24]'}`}>SMO - Manifesto Operacional</h2>
          <div className="mt-2 inline-block px-3 py-1 bg-[#f0f2f5] text-[#666] text-[11px] font-bold rounded-full uppercase tracking-wider hover:bg-[#e2e4e8]">
              Acesso: {userType} {userType === 'CIA' && currentUser && `(${currentUser})`}
          </div>
      </div>

      {connectionError && (
        <div className="bg-[#fff0f1] border border-[#ffcdd2] text-[#c62828] p-3 rounded-[8px] text-[13px] text-left mb-4">
            <p className="font-bold mb-1">Erro de Conexão:</p>
            <p className="mb-2 break-all">{connectionError}</p>
        </div>
      )}

      <label className="block mt-[15px] mb-[5px] font-bold text-[#444] text-[14px] text-left">Ação</label>
      <div className="flex gap-2 items-start">
        <div className="flex-1">
            <CustomSelect 
                options={userType === 'CIA' ? ['Conferir Manifesto', 'Conferência Concluída'] : ['Iniciar Manifesto', 'Finalizar Manifesto']}
                value={action}
                onChange={(val) => setAction(val as ActionType)}
                placeholder="Selecione"
                disabled={!!connectionError}
                theme={userType === 'CIA' ? 'purple' : 'red'}
            />
        </div>
        {action && (
            <button 
                onClick={handleRefresh}
                className={`mt-[5px] p-[12px] bg-white font-bold border rounded-[12px] cursor-pointer transition-all duration-200 flex items-center justify-center flex-shrink-0 hover:bg-[#f8f9fa] shadow-sm ${updating ? 'opacity-70 cursor-wait' : ''} ${userType === 'CIA' ? 'text-[#50284f] border-[#50284f]' : 'text-[#ee2f24] border-[#ee2f24]'}`}
            >
                <div className={updating ? 'animate-spin' : ''}><RefreshIcon /></div>
            </button>
        )}
      </div>

      {/* RENDER FOR CONFERÊNCIA CONCLUÍDA (CIA) - CARD VIEW */}
      {action === 'Conferência Concluída' && userType === 'CIA' && (
        <div className="animate-fadeIn mt-[15px]">
             <h3 className="text-[#333] font-bold text-[14px] text-left mb-[8px]">Manifestos em Conferência</h3>
             <div className="bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] p-[10px] rounded-[8px] mb-[15px] text-[12px] font-bold text-center">
                 Total de manifestos em conferência: {idsList.length} | Processados: {processedCount}
             </div>
             
             <div className="overflow-y-auto custom-scrollbar max-h-[350px]">
                 {idsList.length === 0 ? (
                    <div className="text-[#6c757d] italic text-center p-[30px] text-[13px] border-2 border-dashed border-gray-200 rounded-[12px]">
                        Nenhum manifesto pendente
                    </div>
                 ) : (
                    idsList.map(item => (
                        <div key={item.id} className="bg-white border border-[#e0e0e0] rounded-[12px] p-[15px] mb-[12px] shadow-sm text-left relative transition-all hover:shadow-md">
                            <div className="flex justify-between items-center mb-[10px]">
                                <span className="font-bold text-[#50284f] text-[15px]">{item.id}</span>
                                <span className="bg-[#fff3cd] text-[#856404] text-[10px] font-bold px-[8px] py-[3px] rounded-[4px] border border-[#ffeeba]">
                                    PENDENTE
                                </span>
                            </div>
                            
                            <div className="bg-[#f8f9fa] rounded-[8px] p-[10px] mb-[12px] border border-gray-100 flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-[#888] mb-[2px] uppercase">CARGAS (IN/H)</label>
                                    <div className="w-full bg-white border border-[#ddd] rounded-[6px] p-[6px] text-center font-bold text-[#333] text-[14px]">
                                        {item.cargasInh || '0'}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-[#888] mb-[2px] uppercase">CARGAS (IZ)</label>
                                    <div className="w-full bg-white border border-[#ddd] rounded-[6px] p-[6px] text-center font-bold text-[#333] text-[14px]">
                                        {item.cargasIz || '0'}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 mt-[5px]">
                                <button 
                                    onClick={() => handleInlineSubmit('Conferência Concluída', item.id)}
                                    disabled={processingItems.includes(item.id)}
                                    className="flex-1 bg-[#28a745] hover:bg-[#218838] text-white font-bold py-[8px] rounded-[8px] text-[13px] shadow-sm transition-colors disabled:opacity-60"
                                >
                                    {processingItems.includes(item.id) ? '...' : 'Completo'}
                                </button>
                                <button 
                                    onClick={() => handlePendenteClick(item.id)}
                                    disabled={processingItems.includes(item.id)}
                                    className="flex-1 bg-[#fd7e14] hover:bg-[#e8710e] text-white font-bold py-[8px] rounded-[8px] text-[13px] shadow-sm transition-colors disabled:opacity-60"
                                >
                                    Pendente
                                </button>
                            </div>
                        </div>
                    ))
                 )}
             </div>
        </div>
      )}

      {/* RENDER FOR OTHER ACTIONS */}
      {(action === 'Iniciar Manifesto' || action === 'Conferir Manifesto') && (
        <div className="animate-fadeIn">
            {action === 'Iniciar Manifesto' && (
                <div className="mt-[15px]">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
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

            <div className="mt-[15px]">
                <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">ID Manifesto</label>
                
                <div className="overflow-y-auto custom-scrollbar max-h-[350px] bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-[10px]">
                     {idsList.length === 0 ? (
                        <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">
                            {connectionError ? 'Sem conexão' : 'Nenhum manifesto disponível'}
                        </div>
                     ) : (
                         idsList.map(item => {
                            if (action === 'Conferir Manifesto' && userType === 'CIA') {
                                return (
                                    <div key={item.id} className="w-full p-[12px] my-[6px] bg-white border border-[#e0e0e0] rounded-[10px] text-[13px] text-left font-medium shadow-sm">
                                        <span className="font-bold text-[#333]">{item.id}</span>
                                    </div>
                                );
                            } else {
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleManifestoSelect(item.id)}
                                        className={`w-full flex flex-col justify-center items-start p-[12px] my-[6px] border rounded-[10px] text-[13px] text-left font-medium relative transition-all duration-200 cursor-pointer 
                                            ${selectedManifestoId === item.id 
                                                ? 'bg-gradient-to-r from-[#ee2f24] to-[#ff6f61] text-white border-transparent shadow-md transform scale-[1.02]' 
                                                : 'bg-white text-[#495057] border-[#e9ecef] hover:bg-[#fff0f1] hover:border-[#ffcdd2]'
                                            }`}
                                    >
                                        <div className="w-full flex justify-between items-center">
                                            <span className="font-bold">{item.id}</span>
                                            {selectedManifestoId === item.id && (
                                                <span className="bg-white/25 text-white text-[10px] uppercase font-bold px-[8px] py-[2px] rounded-[6px] border border-white/40 tracking-wide">
                                                    {action === 'Iniciar Manifesto' ? 'Iniciar' : 'Selecionado'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            }
                         })
                     )}
                </div>
            </div>
        </div>
      )}

      {action === 'Finalizar Manifesto' && (
        <div className="animate-fadeIn">
            <div className="mt-[15px]">
                <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
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
            {name && (
                <div className="mt-[10px] bg-white border border-[#dee2e6] rounded-[12px] p-[15px] animate-slideDown">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">ID Manifesto</label>
                    <div className="max-h-[200px] overflow-y-auto overflow-x-hidden text-left custom-scrollbar p-[4px]">
                        {manifestosForEmployee.length === 0 ? (
                            <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">Nenhum manifesto encontrado</div>
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

      {action && (
        userType === 'CIA' ? (
            // CIA BUTTON: Only for Conferir Manifesto batch processing. Conferência Concluída uses inline buttons.
            action === 'Conferir Manifesto' ? (
                <button 
                    id="btnProcessar"
                    onClick={() => handleSubmit()}
                    disabled={loading || !!connectionError}
                    className="w-full p-[14px] mt-[25px] bg-[#50284f] hover:bg-[#7a3e79] shadow-lg text-white font-bold text-[16px] border-none rounded-[12px] cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.03]"
                >
                    {loading ? 'Processando...' : 'Processar Manifesto'}
                </button>
            ) : null
        ) : (
            <button 
                id="btnEnviar"
                onClick={() => handleSubmit()}
                disabled={loading || !!connectionError}
                className={`w-full p-[14px] mt-[25px] bg-gradient-to-br from-[#ee2f24] to-[#ff6f61] hover:shadow-[0_5px_15px_rgba(238,47,36,0.4)] text-white font-bold text-[16px] border-none rounded-[12px] cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.03]`}
            >
                {loading ? 'Processando...' : (
                    action === 'Iniciar Manifesto' ? 'Iniciar Manifesto' : 
                    action === 'Finalizar Manifesto' ? 'Finalizar Manifesto' : 
                    'Enviar'
                )}
            </button>
        )
      )}

      {feedback.text && (
        <div className={`mt-[15px] p-[10px] rounded-[8px] text-[14px] font-bold animate-slideDown ${feedback.type === 'success' ? 'bg-[#d4edda] border border-[#c3e6cb] text-[#155724]' : 'bg-[#f8d7da] border border-[#f5c6cb] text-[#721c24]'}`}>
            {feedback.text}
        </div>
      )}

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

      <LoadingOverlay isVisible={loading} message={loadingMessage} />

      {pendingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn p-4">
              <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[360px] p-[25px] relative animate-slideDown">
                  <h3 className="text-[#50284f] text-[18px] font-bold mb-[15px] text-center border-b pb-2">
                      Reportar Pendência
                  </h3>
                  <div className="bg-[#f8f9fa] rounded-[10px] p-[10px] mb-[15px] border border-gray-100 text-[13px]">
                      <div className="flex justify-between mb-1">
                          <span className="font-bold text-[#666]">ID:</span>
                          <span className="font-bold text-[#333]">{pendingItem}</span>
                      </div>
                      {(() => {
                          const item = idsList.find(i => i.id === pendingItem);
                          if (!item) return null;
                          return (
                            <div className="flex gap-2 mt-2">
                                <div className="flex-1 bg-white border p-2 rounded text-center">
                                    <div className="text-[10px] text-[#888] font-bold uppercase">Cargas (IN/H)</div>
                                    <div className="font-bold text-[#333]">{item.cargasInh || '0'}</div>
                                </div>
                                <div className="flex-1 bg-white border p-2 rounded text-center">
                                    <div className="text-[10px] text-[#888] font-bold uppercase">Cargas (IZ)</div>
                                    <div className="font-bold text-[#333]">{item.cargasIz || '0'}</div>
                                </div>
                            </div>
                          );
                      })()}
                  </div>
                  <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Qual a pendência?</label>
                  
                  <div className="flex gap-3 mb-[20px]">
                      <div className="flex-1">
                          <input
                              type="number"
                              value={pendingInhValue}
                              onChange={(e) => {
                                  const val = e.target.value;
                                  const item = idsList.find(i => i.id === pendingItem);
                                  const max = parseInt(item?.cargasInh || '0');
                                  
                                  if (val === '') {
                                    setPendingInhValue('');
                                  } else {
                                    const numVal = parseInt(val);
                                    if (!isNaN(numVal) && numVal >= 0 && numVal <= max) {
                                      setPendingInhValue(val);
                                    }
                                  }
                              }}
                              placeholder="CARGAS (IN/H)"
                              className="w-full p-[12px] border border-[#cbd5e1] rounded-[12px] text-[14px] text-center outline-none focus:border-[#fd7e14] bg-[#fff] text-black placeholder:text-gray-500"
                          />
                      </div>
                      <div className="flex-1">
                          <input
                              type="number"
                              value={pendingIzValue}
                              onChange={(e) => {
                                  const val = e.target.value;
                                  const item = idsList.find(i => i.id === pendingItem);
                                  const max = parseInt(item?.cargasIz || '0');
                                  
                                  if (val === '') {
                                    setPendingIzValue('');
                                  } else {
                                    const numVal = parseInt(val);
                                    if (!isNaN(numVal) && numVal >= 0 && numVal <= max) {
                                      setPendingIzValue(val);
                                    }
                                  }
                              }}
                              placeholder="CARGAS (IZ)"
                              className="w-full p-[12px] border border-[#cbd5e1] rounded-[12px] text-[14px] text-center outline-none focus:border-[#fd7e14] bg-[#fff] text-black placeholder:text-gray-500"
                          />
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button 
                          onClick={() => setPendingItem(null)}
                          className="flex-1 p-[12px] bg-white border border-[#ccc] text-[#666] font-bold rounded-[10px] hover:bg-[#f1f1f1]"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={() => {
                            const formattedObservation = `Pendência Registrada: Cargas (IN/H): ${pendingInhValue || '0'} | Cargas (IZ): ${pendingIzValue || '0'}`;
                            const itemId = pendingItem;
                            // Optimistically close modal
                            setPendingItem(null); 
                            // Call submit
                            handleInlineSubmit('Pendente', itemId!, formattedObservation);
                          }}
                          disabled={(!pendingInhValue && !pendingIzValue) || processingItems.includes(pendingItem!)}
                          className="flex-1 p-[12px] bg-[#fd7e14] text-white font-bold rounded-[10px] shadow-md hover:bg-[#e8710e] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                          {processingItems.includes(pendingItem!) ? 'Processando...' : 'Confirmar'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
