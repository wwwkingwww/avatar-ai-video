export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: string[];
  timestamp: number;
}

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
}

export interface SessionState {
  sessionId: string | null;
  round: number;
  status: 'chatting' | 'confirming' | 'submitted';
  messages: Message[];
  forceConfirm: boolean;
  isStreaming: boolean;
}

export interface ConfirmData {
  items: Record<string, unknown>;
  missing: string[];
}

export interface TaskResult {
  taskId: string;
  estimatedMinutes: number;
}
