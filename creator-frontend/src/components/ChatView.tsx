import { RoundIndicator } from './RoundIndicator';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import type { Message, UploadedFile } from '../types';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  round: number;
  uploadedFiles: UploadedFile[];
  forceConfirm: boolean;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  onGoToConfirm: () => void;
}

export function ChatView({
  messages, streamingText, isStreaming, round, uploadedFiles,
  forceConfirm, onSend, onUpload, onGoToConfirm,
}: ChatViewProps) {
  return (
    <>
      <RoundIndicator round={round} />
      <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} />
      {forceConfirm && !isStreaming ? (
        <div className="input-area">
          <button
            className="btn-submit"
            onClick={onGoToConfirm}
            style={{ flex: 1, padding: '14px 20px', borderRadius: 'var(--radius-md)', background: 'var(--accent-gradient)', color: '#fff', border: 'none', fontSize: 'var(--font-md)', cursor: 'pointer', fontWeight: 500 }}
          >
            📋 查看需求确认
          </button>
        </div>
      ) : (
        <InputArea onSend={onSend} onUpload={onUpload} uploadedFiles={uploadedFiles} disabled={isStreaming} />
      )}
    </>
  );
}
