
import { supabase } from '../supabaseClient';
import { ManifestoItem } from '../types';

// --- CHECK CONNECTION ---
// Função utilitária para verificar se a conexão com o Supabase está funcionando
export const checkConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // Tenta uma consulta leve apenas para verificar a conectividade e permissões
    const { error } = await supabase
      .from('SMO_Sistema')
      .select('count', { count: 'exact', head: true });

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Conectado com sucesso' };
  } catch (e: any) {
    return { success: false, message: e.message || "Erro desconhecido de conexão" };
  }
};

// --- AUTHENTICATION ---
// Verify CIA credentials
export const authenticateCIA = async (username: string, password: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('Cadastro_de_Perfil_CIA')
      .select('id')
      .eq('CIA', username)
      .eq('Senha', password)
      .maybeSingle();

    if (error) {
        console.warn("Auth error:", error);
        return false;
    }
    
    return !!data;
  } catch (e) {
    console.error("Auth exception:", e);
    return false;
  }
};

// Fetch CIA Users for Login Dropdown
export const fetchCIAUsers = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('Cadastro_de_Perfil_CIA')
      .select('CIA');

    if (error) {
      console.warn("Error fetching CIA users.", error);
      return [];
    }
    if (!data) return [];
    
    // Extract unique users
    const uniqueUsers = Array.from(new Set(data.map((item: any) => item['CIA']))).filter(Boolean);
    return uniqueUsers.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchCIAUsers", e);
    return [];
  }
};

// --- INICIAR MANIFESTO: NAMES ---
// Prompt: Ação: Iniciar Manifesto | Campo: Nome | Table: Cadastro_Operacional
// Logic: Retornar os dados da tabela "Usuario_Operação"
export const fetchNames = async (status?: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('Cadastro_Operacional')
      .select('Usuario_Operação');

    if (error) {
      console.warn("Error fetching names from Cadastro_Operacional.", error);
      return [];
    }

    if (!data) return [];

    // Extract names, remove nulls/duplicates, and sort
    const uniqueNames = Array.from(new Set(data.map((item: any) => item['Usuario_Operação']))).filter(Boolean);
    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNames", e);
    return [];
  }
};

// --- FINALIZAR/CONFERIR MANIFESTO: NAMES ---
// Prompt: Ação: Conferir Manifesto (e Finalizar Manifesto) | Campo: Nome | Table: SMO_Sistema
// Logic: =SE([@Status]="Manifesto Iniciado";[@[Usuario_Operação]];"")
// CORREÇÃO: Usando .ilike para ignorar espaços em branco (ex: "  Manifesto Iniciado") que existem no banco.
export const fetchNamesForFinalization = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('Usuario_Operação')
      .ilike('Status', '%Manifesto Iniciado%');

    if (error) {
        console.warn("Error fetching names for finalization from SMO_Sistema.", error);
        return [];
    }

    if (!data) return [];

    const uniqueNames = Array.from(new Set(data.map((item: any) => item['Usuario_Operação']))).filter(Boolean);

    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNamesForFinalization", e);
    return [];
  }
};

// --- INICIAR/CONFERIR MANIFESTO: IDS ---
// Prompt: Ação: Iniciar Manifesto | Campo: ID Manifesto | Table: SMO_Sistema
// Logic: Retornar os dados da coluna "ID_Manifesto" que estão com o status especificado
// Updated to return ManifestoItem[] for consistency
export const fetchIdsByStatus = async (status: string): Promise<ManifestoItem[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .ilike('Status', `%${status}%`); // Changed to ilike for robustness

    if (error) {
        console.warn("Error fetching IDs from SMO_Sistema.", error);
        return [];
    }
    
    if (!data) return [];

    const uniqueIds = Array.from(new Set(data.map((item: any) => item.ID_Manifesto))).filter(Boolean);
    return uniqueIds.sort().map((id: any) => ({ id }));
  } catch (e) {
    console.error("Unexpected error in fetchIdsByStatus", e);
    return [];
  }
};

// Fetch IDs for a specific employee (Finalizar/Conferir Manifesto context)
// Logic: Filter by Name AND Status='Manifesto Iniciado' (ignoring spaces)
export const fetchManifestosForEmployee = async (name: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Usuario_Operação', name)
      .ilike('Status', '%Manifesto Iniciado%'); // .ilike corrige a falha de leitura por espaços extras

    if (error) {
         console.warn("Error fetching employee manifestos.", error);
         return [];
    }

    if (!data) return [];

    return data.map((item: any) => item.ID_Manifesto);
  } catch (e) {
    return [];
  }
};

// Fetch Manifestos for a specific CIA (Conferir Manifesto context)
// Logic: Filter by CIA column in SMO_Operacional
// Update: Query ID_Manifesto directly as the ID column, and use ilike for CIA to handle casing issues
// Update 2: Filter out records where 'Ação' is 'Conferir Manifesto'
// Update 3: Robust filtering for Ação (trim, lowercase, handle legacy 'Conferência Concluída')
// Update 4: Added viewMode to togggle between pending (todo) and completed (history) items
// Update 5: Fetch extra columns "Cargas_(IN/H)" and "Cargas_(IZ)"
export const fetchManifestosByCIA = async (cia: string, viewMode: 'pending' | 'completed' = 'pending'): Promise<ManifestoItem[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Operacional')
      .select('ID_Manifesto, Ação, "Cargas_(IN/H)", "Cargas_(IZ)"') // Select ID, Action and Details columns
      .ilike('CIA', cia); // Use ilike for case-insensitive matching

    if (error) {
         console.warn("Error fetching CIA manifestos from SMO_Operacional.", error);
         return [];
    }

    if (!data) return [];

    // Filter logic:
    // If viewMode is 'pending' (Conferir Manifesto): Hide items that are already conferred.
    // If viewMode is 'completed' (Conferência Concluída): Show ONLY items that are already conferred.
    const filteredData = data.filter((item: any) => {
        const acaoRaw = item['Ação'];
        const acao = acaoRaw ? acaoRaw.toString().trim().toLowerCase() : '';
        
        // Define what counts as "Completed"
        const isCompleted = acao === 'conferir manifesto' || 
                            acao === 'conferência concluída' || 
                            acao === 'conferencia concluida';

        if (viewMode === 'pending') {
             // Show if NOT completed (null, empty, or other status)
             return !isCompleted;
        } else {
             // Show if IS completed
             return isCompleted;
        }
    });

    // Map to ManifestoItem and deduplicate by ID
    const uniqueItemsMap = new Map<string, ManifestoItem>();
    
    filteredData.forEach((item: any) => {
        const id = item['ID_Manifesto'];
        if (id && !uniqueItemsMap.has(id)) {
            uniqueItemsMap.set(id, {
                id: id,
                cargasInh: item['Cargas_(IN/H)'],
                cargasIz: item['Cargas_(IZ)']
            });
        }
    });

    return Array.from(uniqueItemsMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    console.error("Unexpected error in fetchManifestosByCIA", e);
    return [];
  }
};

// --- HELPER FUNCTIONS (UNUSED IN LOGIC BUT KEPT FOR STRUCTURE IF NEEDED) ---
export const fetchCIAs = async (): Promise<string[]> => { return []; };
export const fetchNamesByStatus = async (status: string): Promise<string[]> => { return []; };

// --- SUBMIT ACTION ---
export const submitManifestoAction = async (
  action: string, 
  id: string, 
  name: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // 0. Validation: Check current status to prevent duplicates
    // Fetch the current status of the manifesto
    const { data: currentData, error: currentError } = await supabase
      .from('SMO_Sistema')
      .select('Status')
      .eq('ID_Manifesto', id)
      .single();
    
    // Note: If we are in "Conferir Manifesto" (CIA), we might be working with SMO_Operacional IDs 
    // that might not exist in SMO_Sistema yet or we don't care about SMO_Sistema status validation
    // the same way WFS does. 
    // However, existing logic implies interactions with SMO_Sistema.
    // For bulk processing in CIA, we often skip this check or handle it loosely.

    const currentStatus = (currentData?.Status || '').trim().toLowerCase();

    // Validate Status transition
    // Nota: Removida a validação para "Conferir Manifesto" pois a trava deve existir apenas para a área WFS.
    if (action === 'Iniciar Manifesto') {
        if (!currentStatus.includes('manifesto recebido')) {
             return { success: false, message: 'Ação bloqueada: Este manifesto já foi iniciado ou processado.' };
        }
    } else if (action === 'Finalizar Manifesto') {
        if (!currentStatus.includes('manifesto iniciado')) {
             return { success: false, message: 'Ação bloqueada: Este manifesto não está iniciado.' };
        }
    } 

    // 1. Insert Log
    const { error } = await supabase
      .from('registros_operacionais')
      .insert([
        { 
          manifesto_id: id, 
          acao: action, 
          nome: name, 
          created_at: new Date().toISOString() 
        }
      ]);

    // 2. Update SMO_Sistema Status
    if (!error) {
        let newStatus = '';
        if (action === 'Iniciar Manifesto') {
            newStatus = 'Manifesto Iniciado';
        } else if (action === 'Finalizar Manifesto') {
            newStatus = 'Manifesto Finalizado';
        } else if (action === 'Conferir Manifesto' || action === 'Conferência Concluída') {
            newStatus = 'Conferência Concluída'; 
        } else if (action === 'Pendente') {
            newStatus = 'Manifesto Pendente';
        }
        
        // If the action is for CIA, we might also need to update SMO_Operacional 'Ação' column
        // based on previous logic requirements, or simply SMO_Sistema. 
        // Assuming SMO_Sistema is the master record for status.
        await supabase
          .from('SMO_Sistema')
          .update({ 
              Status: newStatus, 
              "Usuario_Operação": name 
          }) 
          .eq('ID_Manifesto', id);
        
        // Also update SMO_Operacional Ação column if it exists to hide it from the list
        if (action === 'Conferir Manifesto' || action === 'Conferência Concluída' || action === 'Pendente') {
            await supabase
                .from('SMO_Operacional')
                .update({ 'Ação': action === 'Pendente' ? 'Pendente' : 'Conferir Manifesto' }) 
                .eq('ID_Manifesto', id);
        }
    }

    // 3. Webhook Integration
    // Updated Webhook URL for Easypanel N8N
    const webhookUrl = 'https://teca-admin-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';

    const formattedDate = new Date().toLocaleString('pt-BR');
    let webhookBody: any = {};

    if (action === 'Iniciar Manifesto') {
        webhookBody = {
            "ação": action,
            id_manifesto: id,
            nome: name,
            Manifesto_Iniciado: formattedDate
        };
    } else if (action === 'Finalizar Manifesto') {
        webhookBody = {
            "ação": action,
            id_manifesto: id,
            nome: name,
            Manifesto_Finalizado: formattedDate
        };
    } else if (action === 'Conferir Manifesto') {
        webhookBody = {
            "ação": action, // Sends 'Conferir Manifesto'
            id_manifesto: id,
            nome: name,
            "Conferir Manifesto": formattedDate
        };
    } else if (action === 'Conferência Concluída') {
         webhookBody = {
            "ação": action,
            id_manifesto: id,
            nome: name,
            "Conferir Manifesto": formattedDate // Keeping same key for consistency
        };
    } else if (action === 'Pendente') {
        webhookBody = {
            "ação": action,
            id_manifesto: id,
            nome: name,
            "Manifesto_Pendente": formattedDate
        };
    }

    if (Object.keys(webhookBody).length > 0) {
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookBody)
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
    }
    
    if (action === 'Iniciar Manifesto') {
        return { success: true, message: 'Manifesto iniciado com sucesso!' };
    } else if (action === 'Finalizar Manifesto') {
        return { success: true, message: 'Manifesto finalizado com sucesso!' };
    } else if (action === 'Conferir Manifesto' || action === 'Conferência Concluída') {
        return { success: true, message: 'Conferência Iniciada' };
    } else if (action === 'Pendente') {
        return { success: true, message: 'Manifesto marcado como pendente.' };
    } else {
        return { success: true, message: 'Registro salvo com sucesso!' };
    }

  } catch (error: any) {
    return { success: false, message: 'Erro ao processar: ' + error.message };
  }
};

// --- BATCH PROCESS ACTION ---
export const processBatchManifestos = async (
    action: string,
    ids: string[],
    name: string
): Promise<{ success: boolean; message: string }> => {
    try {
        if (ids.length === 0) {
            return { success: false, message: "Nenhum manifesto para processar." };
        }

        // We use Promise.all to process all items in parallel.
        // This ensures logs, DB updates, and webhooks are triggered for everyone.
        // In a very large scale scenario, we might batch this in chunks, but for UI lists < 50 items, this is fine.
        
        // We use the same 'submitManifestoAction' for consistency.
        // Note: submitManifestoAction handles individual status updates and webhooks.
        
        const results = await Promise.all(
            ids.map(id => submitManifestoAction(action, id, name))
        );

        // Check if any failed
        const failures = results.filter(r => !r.success);
        
        if (failures.length > 0) {
            // If some failed, return a warning, but mostly it's a success if at least some worked.
            // If all failed:
            if (failures.length === ids.length) {
                 return { success: false, message: `Falha ao processar todos os ${ids.length} manifestos.` };
            }
            return { success: true, message: `Processado com alertas: ${failures.length} falharam.` };
        }

        return { success: true, message: `${ids.length} manifestos processados com sucesso!` };

    } catch (error: any) {
        return { success: false, message: 'Erro no processamento em lote: ' + error.message };
    }
};
