export interface Manifesto {
  id: string;
  status: string;
  nome_funcionario?: string;
  cia?: string;
}

export type ActionType = '' | 'Iniciar Manifesto' | 'Finalizar Manifesto';

export interface FeedbackMessage {
  text: string;
  type: 'success' | 'error' | '';
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
}