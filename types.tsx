
export interface Manifesto {
  id: string;
  status: string;
  nome_funcionario?: string;
  cia?: string;
}

export interface ManifestoItem {
  id: string;
  cargasInh?: string;
  cargasIz?: string;
}

export type ActionType = '' | 'Iniciar Manifesto' | 'Finalizar Manifesto' | 'Conferir Manifesto' | 'Conferência Concluída' | 'Pendente';

export interface FeedbackMessage {
  text: string;
  type: 'success' | 'error' | '';
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
}
