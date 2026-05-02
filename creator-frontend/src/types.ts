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

export interface ModelRecommendation {
  endpoint: string;
  name: string;
  taskType: string;
  description: string;
  fields?: ModelField[];
  estimatedCost?: unknown;
  outputType?: string;
  inputTypes?: string[];
}

export interface ModelField {
  nodeId: string;
  nodeName?: string;
  fieldName: string;
  fieldValue?: string;
  fieldType?: 'STRING' | 'LIST' | 'IMAGE' | 'VIDEO' | 'AUDIO';
  fieldData?: unknown;
  description?: string;
}

export interface IntentContext {
  taskType?: string;
  hasImage?: boolean;
  hasVideo?: boolean;
  preferredDuration?: number;
  preferredQuality?: string;
  style?: string;
  script?: string;
  tags?: string[];
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
  phase?: string;
}

export interface TaskResult {
  taskId: string;
  status: string;
  videoUrl?: string;
  estimatedMinutes: number;
  jobId?: string;
}
