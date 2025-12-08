
import { supabase } from '../supabaseClient';

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
export const fetchIdsByStatus = async (status: string): Promise<string[]> => {
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
    return uniqueIds.sort() as string[];
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
export const fetchManifestosByCIA = async (cia: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Operacional')
      .select('ID_Manifesto, Ação') // Select Action column to check status
      .ilike('CIA', cia); // Use ilike for case-insensitive matching

    if (error) {
         console.warn("Error fetching CIA manifestos from SMO_Operacional.", error);
         return [];
    }

    if (!data) return [];

    // Filter logic: Only return items where Ação is NOT "Conferir Manifesto"
    const filteredData = data.filter((item: any) => item['Ação'] !== 'Conferir Manifesto');

    const uniqueIds = Array.from(new Set(filteredData.map((item: any) => item['ID_Manifesto']))).filter(Boolean);
    return uniqueIds.sort() as string[];
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
    
    if (currentError) {
        return { success: false, message: 'Erro ao validar status do manifesto: ' + currentError.message };
    }

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
        } else if (action === 'Conferir Manifesto') {
            newStatus = 'Conferência Concluída'; 
        }
        
        await supabase
          .from('SMO_Sistema')
          .update({ 
              Status: newStatus, 
              "Usuario_Operação": name 
          }) 
          .eq('ID_Manifesto', id);
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
            "ação": action,
            id_manifesto: id,
            nome: name,
            "Conferir Manifesto": formattedDate
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
    } else if (action === 'Conferir Manifesto') {
        return { success: true, message: 'Conferência Iniciada' };
    } else {
        return { success: true, message: 'Registro salvo com sucesso!' };
    }

  } catch (error: any) {
    return { success: false, message: 'Erro ao processar: ' + error.message };
  }
};
