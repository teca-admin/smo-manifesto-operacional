
import { supabase } from '../supabaseClient';
import { ManifestoItem } from '../types';

// --- CHECK CONNECTION ---
export const checkConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
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
    
    const uniqueUsers = Array.from(new Set(data.map((item: any) => item['CIA']))).filter(Boolean);
    return uniqueUsers.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchCIAUsers", e);
    return [];
  }
};

// --- FETCH DATA FUNCTIONS ---

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

    const uniqueNames = Array.from(new Set(data.map((item: any) => item['Usuario_Operação']))).filter(Boolean);
    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNames", e);
    return [];
  }
};

export const fetchNamesForFinalization = async (): Promise<string[]> => {
  try {
    // Agora busca usuários que tenham manifestos Iniciados OU Pendentes
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('Usuario_Operação')
      .or('Status.ilike.%Manifesto Iniciado%,Status.ilike.%Manifesto Pendente%');

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

export const fetchIdsByStatus = async (status: string): Promise<ManifestoItem[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .ilike('Status', `%${status}%`);

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

export const fetchManifestosForEmployee = async (name: string): Promise<string[]> => {
  try {
    // Agora busca manifestos do usuário que estejam Iniciados OU Pendentes
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Usuario_Operação', name)
      .or('Status.ilike.%Manifesto Iniciado%,Status.ilike.%Manifesto Pendente%');

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

export const fetchManifestosByCIA = async (cia: string, viewMode: 'pending' | 'completed' = 'pending'): Promise<ManifestoItem[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Operacional')
      .select('ID_Manifesto, Ação, "Cargas_(IN/H)", "Cargas_(IZ)"')
      .ilike('CIA', cia);

    if (error) {
         console.warn("Error fetching CIA manifestos from SMO_Operacional.", error);
         return [];
    }

    if (!data) return [];

    const filteredData = data.filter((item: any) => {
        const acaoRaw = item['Ação'];
        const acao = acaoRaw ? acaoRaw.toString().trim().toLowerCase() : '';
        
        if (viewMode === 'pending') {
             // "Conferir Manifesto" > Só aparece se a ação for "Finalizar Manifesto"
             return acao === 'finalizar manifesto';
        } else {
             // "Conferência Concluída" > Só aparece se a ação for "Conferir Manifesto"
             return acao === 'conferir manifesto';
        }
    });

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

export const fetchCIAs = async (): Promise<string[]> => { return []; };
export const fetchNamesByStatus = async (status: string): Promise<string[]> => { return []; };

// --- SUBMIT ACTION ---
export const submitManifestoAction = async (
  action: string, 
  id: string, 
  name: string,
  extraData?: string | { inh: string; iz: string; obs: string }
): Promise<{ success: boolean; message: string }> => {
  try {
    // Validation for WFS actions
    if (action === 'Iniciar Manifesto') {
        const { data: currentData } = await supabase
            .from('SMO_Sistema')
            .select('Status')
            .eq('ID_Manifesto', id)
            .single();
        const currentStatus = (currentData?.Status || '').trim().toLowerCase();
        
        if (!currentStatus.includes('manifesto recebido')) {
             return { success: false, message: 'Ação bloqueada: Este manifesto já foi iniciado ou processado.' };
        }
    } else if (action === 'Finalizar Manifesto') {
        const { data: currentData } = await supabase
            .from('SMO_Sistema')
            .select('Status')
            .eq('ID_Manifesto', id)
            .single();
        const currentStatus = (currentData?.Status || '').trim().toLowerCase();

        // Permite finalizar se estiver Iniciado OU Pendente
        if (!currentStatus.includes('manifesto iniciado') && !currentStatus.includes('manifesto pendente')) {
             return { success: false, message: 'Ação bloqueada: Este manifesto não está iniciado ou pendente.' };
        }
    } 

    // Prepare observation for DB (human readable string)
    let dbObservation = '';
    if (action === 'Pendente' && typeof extraData === 'object') {
        const obsPart = extraData.obs ? ` | Obs: ${extraData.obs}` : '';
        dbObservation = `Pendência Registrada: Cargas (IN/H): ${extraData.inh} | Cargas (IZ): ${extraData.iz}${obsPart}`;
    } else if (typeof extraData === 'string') {
        dbObservation = extraData;
    }

    // 1. Insert Log
    const { error } = await supabase
      .from('registros_operacionais')
      .insert([
        { 
          manifesto_id: id, 
          acao: action, 
          nome: name, 
          observacao: dbObservation,
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
        
        if (newStatus) {
            await supabase
            .from('SMO_Sistema')
            .update({ 
                Status: newStatus, 
                "Usuario_Operação": name 
            }) 
            .eq('ID_Manifesto', id);
        }
        
        // Update SMO_Operacional Ação
        let operacionalAction = '';
        if (action === 'Pendente') {
            operacionalAction = 'Pendente';
        } else if (action === 'Conferir Manifesto') {
            operacionalAction = 'Conferir Manifesto';
        } else if (action === 'Conferência Concluída') {
            operacionalAction = 'Conferência Concluída';
        }

        if (operacionalAction) {
            await supabase
                .from('SMO_Operacional')
                .update({ 'Ação': operacionalAction }) 
                .eq('ID_Manifesto', id);
        }
    }

    // 3. Webhook Integration
    const webhookUrl = 'https://teca-admin-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';
    
    // Formatting date to "dd/mm/aaaa hh:mm:ss" as requested
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
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
            "ação": action,
            id_manifesto: id,
            nome: name,
            "Conferir Manifesto": formattedDate
        };
    } else if (action === 'Conferência Concluída') {
         webhookBody = {
            "ação": action,
            id_manifesto: id,
            nome: name,
            "Conferir Manifesto": formattedDate 
        };
    } else if (action === 'Pendente') {
        // Structured data for N8N
        if (typeof extraData === 'object') {
            webhookBody = {
                "ação": action,
                id_manifesto: id,
                nome: name,
                "Manifesto_Pendente": formattedDate,
                "PendênciaCargas (IN/H)": extraData.inh,
                "PendênciaCargas (IZ)": extraData.iz,
                "observacao": extraData.obs
            };
        } else {
            // Fallback for string
            webhookBody = {
                "ação": action,
                id_manifesto: id,
                nome: name,
                "Manifesto_Pendente": formattedDate,
                "observacao": extraData || ""
            };
        }
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
    } else if (action === 'Conferir Manifesto') {
        return { success: true, message: 'Conferência Iniciada' };
    } else if (action === 'Conferência Concluída') {
        return { success: true, message: 'Conferência concluída!' };
    } else if (action === 'Pendente') {
        return { success: true, message: 'Pendência registrada!' };
    }

    return { success: true, message: 'Ação realizada com sucesso!' };
  } catch (e: any) {
    console.error("Error in submitManifestoAction:", e);
    return { success: false, message: e.message || "Erro ao processar ação." };
  }
};

// --- BATCH PROCESS ---
export const processBatchManifestos = async (
    action: string,
    ids: string[],
    name: string
): Promise<{ success: boolean; message: string }> => {
    try {
        if (ids.length === 0) return { success: false, message: "Nenhum manifesto selecionado." };

        // Process all in parallel
        const promises = ids.map(id => submitManifestoAction(action, id, name));
        await Promise.all(promises);

        return { success: true, message: "Todos os manifestos foram processados!" };
    } catch (e: any) {
        console.error("Error in batch process:", e);
        return { success: false, message: "Erro ao processar lote." };
    }
};
