export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  options?: string[];
  optionMode?: 'single' | 'multi';
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
  status: 'chatting' | 'submitted' | 'generating';
  messages: Message[];
  isStreaming: boolean;
}

export interface TaskResult {
  taskId: string;
  status: string;
  videoUrl?: string;
  estimatedMinutes: number;
  jobId?: string;
}

export type TaskStatus =
  | 'SUBMITTED'
  | 'SCHEDULED'
  | 'GENERATING'
  | 'GENERATED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PUBLISH_FAILED'
  | 'FAILED'

export interface TaskStatusInfo {
  id: string
  status: TaskStatus
  template: string
  platform: string
  videoUrl: string | null
  thumbnailUrl: string | null
  error: string | null
  rhTaskId: string | null
  rhApiVersion: string | null
  publishResult: unknown
  retryCount: number
  createdAt: string
  updatedAt: string
  scheduledAt: string | null
}
