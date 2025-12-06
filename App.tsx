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
  fetchManifestoLoads,
  fetchCIAs,
  submitManifestoAction
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

const App: React.FC = () => {
  // State
  const [action, setAction] = useState<ActionType>('');
  const [name, setName] = useState<string>('');
  const [selectedManifestoId, setSelectedManifestoId] = useState<string>('');
  
  // Finalization State (Completo/Parcial)
  const [completionType, setCompletionType] = useState<'Completo' | 'Parcial' | ''>('');
  const [currentLoads, setCurrentLoads] = useState<{inh: number, iz: number}>({ inh: 0, iz: 0 });
  const [maxLoads, setMaxLoads] = useState<{inh: number, iz: number}>({ inh: 0, iz: 0 });

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

  const loadIdsFinalization = useCallback(async () => {
    setUpdating(true);
    // Based on requested logic: Finalizar Manifesto loads names where Manifesto_Disponivel is NULL and Manifesto_Iniciado is NOT NULL
    const names = await fetchNamesForFinalization();
    setNamesList(names);
    setTimeout(() => setUpdating(false), 500);
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    const channel = supabase
      .channel('realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'SMO_Sistema' },
        (payload) => {
          // If SMO_Sistema changes (new manifesto or status change), refresh relevant lists
          if (action === 'Iniciar Manifesto') {
            loadIds();
          } else if (action === 'Finalizar Manifesto') {
            loadIdsFinalization(); // Refresh the list of employees with active manifestos
            if (name) {
              // Refresh specific employee list if selected
              fetchManifestosForEmployee(name).then(setManifestosForEmployee);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Cadastro_Operacional' },
        (payload) => {
          // If a new employee is added
          if (action === 'Iniciar Manifesto') loadNames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [action, name, loadIds, loadNames, loadIdsFinalization]);

  // --- Event Handlers ---

  // Handle Action Change
  useEffect(() => {
    setFeedback({ text: '', type: '' });
    setName('');
    setSelectedManifestoId('');
    setManifestosForEmployee([]);
    setCompletionType('');

    if (action === 'Iniciar Manifesto') {
      loadNames();
      loadIds();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization(); // Loads specific names for finalization
    }
  }, [action, loadNames, loadIds, loadIdsFinalization]);

  // Handle Refresh Click
  const handleRefresh = () => {
    if (updating) return;
    if (action === 'Iniciar Manifesto') {
      loadIds();
      loadNames();
    } else if (action === 'Finalizar Manifesto') {
      loadIdsFinalization();
    }
  };

  // Handle Name Selection (Finalizar Manifesto)
  const handleNameChange = async (val: string) => {
    setName(val);
    setSelectedManifestoId('');
    setCompletionType('');
    if (action === 'Finalizar Manifesto' && val) {
      const manifests = await fetchManifestosForEmployee(val);
      setManifestosForEmployee(manifests);
    } else {
      setManifestosForEmployee([]);
    }
  };
  
  // Handle Manifesto ID Selection (trigger load fetch)
  const handleManifestoSelect = async (id: string) => {
      setSelectedManifestoId(id);
      setCompletionType(''); // Reset choice
      if (action === 'Finalizar Manifesto') {
          // Fetch loads to set max values and default values
          setLoading(true); // Short flicker to indicate loading data
          const loads = await fetchManifestoLoads(id);
          setMaxLoads(loads);
          setCurrentLoads(loads); // Default to max for editing
          setLoading(false);
      }
  };

  // Handle Submission
  const handleSubmit = async () => {
    setFeedback({ text: '', type: '' });

    // Validation
    if (!action) return;
    if (action === 'Iniciar Manifesto' && (!name || !selectedManifestoId)) {
      setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
      return;
    }
    if (action === 'Finalizar Manifesto') {
        if (!name || !selectedManifestoId) {
            setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
            return;
        }
        if (!completionType) {
            setFeedback({ text: 'Selecione se está Completo ou Parcial.', type: 'error' });
            return;
        }
        if (completionType === 'Parcial') {
            // Validation for quantities
            if (currentLoads.inh < 0 || currentLoads.inh > maxLoads.inh) {
                 setFeedback({ text: `Cargas (IN/H) inválido. Máximo: ${maxLoads.inh}`, type: 'error' });
                 return;
            }
            if (currentLoads.iz < 0 || currentLoads.iz > maxLoads.iz) {
                 setFeedback({ text: `Cargas (IZ) inválido. Máximo: ${maxLoads.iz}`, type: 'error' });
                 return;
            }
        }
    }

    // Strict name check only if list is populated and not empty
    if (action === 'Iniciar Manifesto' && namesList.length > 0 && !namesList.some(n => n.toLowerCase() === name.toLowerCase())) {
        setFeedback({ text: 'Por favor, escolha um nome válido da lista.', type: 'error' });
        return;
    }

    // Duplicate Check
    const submissionKey = `${action}-${selectedManifestoId}-${name}-${completionType}-${currentLoads.inh}-${currentLoads.iz}`;
    if (lastSubmission === submissionKey) {
      setFeedback({ text: 'Este registro já foi enviado recentemente!', type: 'error' });
      return;
    }

    setLoading(true);
    setLoadingMessage('Processando...');

    // Simulate Network Request
    setTimeout(async () => {
      // Prepare extra data for finalization
      let extraData = undefined;
      if (action === 'Finalizar Manifesto') {
          extraData = {
              type: completionType as 'Completo' | 'Parcial',
              inh: currentLoads.inh,
              iz: currentLoads.iz
          };
      }

      const result = await submitManifestoAction(action, selectedManifestoId, name, extraData);
      
      setLoading(false);
      
      if (result.success) {
        setLastSubmission(submissionKey);

        // Reset App State to Initial (Home)
        setAction('');
        setName('');
        setSelectedManifestoId('');
        setCompletionType('');
        setManifestosForEmployee([]);
        setCurrentLoads({ inh: 0, iz: 0 });

        // Show feedback AFTER state reset to avoid useEffect clearing it
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

  return (
    <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
      
      <h2 className="text-[#ee2536] text-[22px] font-bold mb-[25px]">
        SMO - Manifesto Operacional
      </h2>

      {/* Action Selection */}
      <label htmlFor="acao" className="block mt-[15px] mb-[5px] font-bold text-[#444] text-[14px] text-left">
        Ação
      </label>
      <div className="flex gap-2 items-start">
        <div className="flex-1">
            <CustomSelect 
                options={['Iniciar Manifesto', 'Finalizar Manifesto']}
                value={action}
                onChange={(val) => setAction(val as ActionType)}
                placeholder="Selecione"
            />
        </div>

        {/* Refresh Button */}
        {action && (
            <button 
                onClick={handleRefresh}
                className={`w-[45px] h-[45px] mt-[5px] p-0 bg-transparent text-[#ee2536] font-bold border border-[#ee2536] rounded-[12px] cursor-pointer transition-all duration-200 text-[18px] flex items-center justify-center flex-shrink-0 hover:bg-[#fff0f1] ${updating ? 'opacity-70 cursor-wait' : ''}`}
                title="Atualizar lista"
            >
                <div className={updating ? 'animate-spin' : ''}>
                    <RefreshIcon />
                </div>
            </button>
        )}
      </div>

      {/* -------------------- INICIAR MANIFESTO VIEW -------------------- */}
      {action === 'Iniciar Manifesto' && (
        <div className="animate-fadeIn">
            {/* Name Input */}
            <div className="mt-[15px]">
                <label htmlFor="nome" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
                <CustomSelect
                    options={namesList}
                    value={name}
                    onChange={setName}
                    placeholder="Digite ou selecione"
                    searchable={true}
                />
            </div>

            {/* ID Manifesto List */}
            <div className="mt-[15px]">
                <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">ID Manifesto</label>
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-[10px]">
                     {idsList.length === 0 ? (
                        <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">
                            Nenhum manifesto disponível
                        </div>
                     ) : (
                         idsList.map(id => (
                            <button
                                key={id}
                                onClick={() => setSelectedManifestoId(id)}
                                className={`w-full flex justify-between items-center p-[12px] my-[6px] border rounded-[10px] text-[13px] text-left font-medium relative transition-all duration-200 cursor-pointer 
                                    ${selectedManifestoId === id 
                                        ? 'bg-gradient-to-r from-[#ee2536] to-[#ff6f61] text-white border-transparent shadow-md transform scale-[1.02]' 
                                        : 'bg-white text-[#495057] border-[#e9ecef] hover:bg-[#fff0f1] hover:border-[#ffcdd2]'
                                    }`}
                            >
                                <span className="font-bold">{id}</span>
                                {selectedManifestoId === id && (
                                    <span className="bg-white/25 text-white text-[10px] uppercase font-bold px-[8px] py-[2px] rounded-[6px] border border-white/40 tracking-wide">
                                        Iniciar
                                    </span>
                                )}
                            </button>
                         ))
                     )}
                </div>
            </div>
        </div>
      )}

      {/* -------------------- FINALIZAR MANIFESTO VIEW -------------------- */}
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
                />
            </div>

            {/* Expanded Manifesto Selection Area */}
            {name && (
                // Changed from bg-[#f8f9fa] to bg-white
                <div className="mt-[10px] bg-white border border-[#dee2e6] rounded-[12px] p-[15px] animate-slideDown">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">
                        ID Manifesto
                    </label>
                    {/* Added p-[4px] to container to fix clipping issues with hover animations */}
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
                                                ? 'bg-gradient-to-br from-[#ee2536] to-[#ff6f61] text-white border-[#ee2536] shadow-[0_4px_12px_rgba(238,37,54,0.3)] font-bold' 
                                                : 'bg-[#f5f5f5] text-[#495057] border-[#dee2e6] hover:bg-[#e9ecef] hover:border-[#adb5bd] hover:translate-x-[3px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]'
                                            }`}
                                    >
                                        {id}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Completion Status Selection */}
                    {selectedManifestoId && (
                        <div className="mt-[20px] animate-fadeIn border-t border-gray-200 pt-[15px]">
                            <label className="block mb-[10px] font-bold text-[#444] text-[14px] text-left">
                                Finalização
                            </label>
                            <div className="flex gap-[10px] mb-[15px]">
                                <button
                                    onClick={() => setCompletionType('Completo')}
                                    className={`flex-1 py-[8px] px-[12px] rounded-[8px] text-[13px] font-bold border transition-all ${
                                        completionType === 'Completo'
                                        ? 'bg-[#ee2536] text-white border-[#ee2536]'
                                        : 'bg-white text-[#666] border-[#ddd] hover:bg-[#f5f5f5]'
                                    }`}
                                >
                                    Completo
                                </button>
                                <button
                                    onClick={() => setCompletionType('Parcial')}
                                    className={`flex-1 py-[8px] px-[12px] rounded-[8px] text-[13px] font-bold border transition-all ${
                                        completionType === 'Parcial'
                                        ? 'bg-[#ee2536] text-white border-[#ee2536]'
                                        : 'bg-white text-[#666] border-[#ddd] hover:bg-[#f5f5f5]'
                                    }`}
                                >
                                    Parcial
                                </button>
                            </div>

                            {/* Partial Inputs */}
                            {completionType === 'Parcial' && (
                                <div className="grid grid-cols-2 gap-[10px] animate-slideDown">
                                    <div>
                                        <label className="block text-[12px] font-bold text-[#666] mb-[4px] text-left">
                                            Cargas (IN/H)
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            max={maxLoads.inh}
                                            value={currentLoads.inh}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 0 && val <= maxLoads.inh) {
                                                    setCurrentLoads(prev => ({...prev, inh: val}));
                                                }
                                            }}
                                            className="w-full p-[8px] border border-[#ccc] rounded-[6px] text-[14px] text-center font-bold text-black focus:border-[#ee2536] outline-none bg-white"
                                        />
                                        <div className="text-[10px] text-gray-500 text-right mt-1">Máx: {maxLoads.inh}</div>
                                    </div>
                                    <div>
                                        <label className="block text-[12px] font-bold text-[#666] mb-[4px] text-left">
                                            Cargas (IZ)
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            max={maxLoads.iz}
                                            value={currentLoads.iz}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                if (!isNaN(val) && val >= 0 && val <= maxLoads.iz) {
                                                    setCurrentLoads(prev => ({...prev, iz: val}));
                                                }
                                            }}
                                            className="w-full p-[8px] border border-[#ccc] rounded-[6px] text-[14px] text-center font-bold text-black focus:border-[#ee2536] outline-none bg-white"
                                        />
                                        <div className="text-[10px] text-gray-500 text-right mt-1">Máx: {maxLoads.iz}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
      )}

      {/* Submit Button */}
      {action && (
        <button 
            id="btnEnviar"
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full p-[14px] mt-[25px] bg-gradient-to-br from-[#ee2536] to-[#ff6f61] text-white font-bold text-[16px] border-none rounded-[12px] cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.03] hover:shadow-[0_5px_15px_rgba(238,37,54,0.4)]`}
        >
            {loading ? 'Processando...' : (action === 'Iniciar Manifesto' ? 'Iniciar' : 'Finalizar')}
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

      {/* Overlay Component */}
      <LoadingOverlay isVisible={loading} message={loadingMessage} />

    </div>
  );
};

export default App;