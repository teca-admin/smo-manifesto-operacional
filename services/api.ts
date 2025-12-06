import { supabase } from '../supabaseClient';

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

// --- FINALIZAR MANIFESTO: NAMES ---
// Prompt: Ação: Finalizar Manifesto | Campo: Nome | Table: SMO_Sistema
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

// --- INICIAR MANIFESTO: IDS ---
// Prompt: Ação: Iniciar Manifesto | Campo: ID Manifesto | Table: SMO_Sistema
// Logic: Retornar os dados da coluna "ID_Manifesto" que estão com o status de "Manifesto Recebido"
export const fetchIdsByStatus = async (status: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Status', status); // Expecting 'Manifesto Recebido'

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

// Fetch IDs for a specific employee (Finalizar Manifesto context)
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

// --- FETCH MANIFESTO LOADS (Cargas) ---
// Used for Partial/Complete finalization logic
export const fetchManifestoLoads = async (id: string): Promise<{ inh: number; iz: number }> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('"Cargas_(IN/H)", "Cargas_(IZ)"')
      .eq('ID_Manifesto', id)
      .single();

    if (error) {
      console.warn("Error fetching manifesto loads.", error);
      return { inh: 0, iz: 0 };
    }

    if (!data) return { inh: 0, iz: 0 };

    return {
      inh: Number(data['Cargas_(IN/H)']) || 0,
      iz: Number(data['Cargas_(IZ)']) || 0
    };
  } catch (e) {
    console.error("Unexpected error in fetchManifestoLoads", e);
    return { inh: 0, iz: 0 };
  }
};

// --- HELPER FUNCTIONS (UNUSED IN LOGIC BUT KEPT FOR STRUCTURE IF NEEDED) ---
export const fetchCIAs = async (): Promise<string[]> => { return []; };
export const fetchManifestosByCIA = async (cia: string): Promise<string[]> => { return []; };
export const fetchNamesByStatus = async (status: string): Promise<string[]> => { return []; };

// --- SUBMIT ACTION ---
export const submitManifestoAction = async (
  action: string, 
  id: string, 
  name: string,
  extraData?: { type: 'Completo' | 'Parcial'; inh: number; iz: number }
): Promise<{ success: boolean; message: string }> => {
  try {
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
        const newStatus = action === 'Iniciar Manifesto' ? 'Manifesto Iniciado' : 'Manifesto Finalizado';
        
        await supabase
          .from('SMO_Sistema')
          .update({ 
              Status: newStatus, 
              "Usuario_Operação": name 
          }) 
          .eq('ID_Manifesto', id);
    }

    // 3. Webhook Integration
    let webhookUrl = '';

    // Explicitly using the URLs provided
    if (action === 'Iniciar Manifesto') {
      webhookUrl = 'https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';
    } else if (action === 'Finalizar Manifesto') {
      webhookUrl = 'https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';
    } else {
      // Fallback
      webhookUrl = 'https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';
    }

    const formattedDate = new Date().toLocaleString('pt-BR');
    let webhookBody: any = {};

    if (action === 'Iniciar Manifesto') {
        webhookBody = {
            id_manifesto: id,
            nome: name,
            Manifesto_Iniciado: formattedDate
        };
    } else if (action === 'Finalizar Manifesto') {
        webhookBody = {
            id_manifesto: id,
            nome: name,
            Manifesto_Finalizado: formattedDate,
            // Include extra data if available
            Tipo_Baixa: extraData?.type || 'Completo',
            Cargas_INH_Entregue: extraData?.inh ?? 0,
            Cargas_IZ_Entregue: extraData?.iz ?? 0
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
    } else {
        return { success: true, message: 'Registro salvo com sucesso!' };
    }

  } catch (error: any) {
    return { success: false, message: 'Erro ao processar: ' + error.message };
  }
};