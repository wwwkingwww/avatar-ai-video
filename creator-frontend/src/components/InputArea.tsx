import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import type { UploadedFile } from '../types';
import { FileUploader } from './FileUploader';

interface InputAreaProps {
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  uploadedFiles: UploadedFile[];
  disabled: boolean;
}

export function InputArea({ onSend, onUpload, uploadedFiles, disabled }: InputAreaProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && uploadedFiles.length === 0) return;
    onSend(trimmed);
    setText('');
  }, [text, uploadedFiles, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        onUpload(files[i]);
      }
    }
    e.target.value = '';
  };

  return (
    <>
      <FileUploader files={uploadedFiles} onUpload={onUpload} disabled={disabled} />
      <div className="input-area">
        <button className="attach-btn" onClick={() => fileInputRef.current?.click()} disabled={disabled}>📎</button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="描述你想做什么视频..." rows={1} disabled={disabled} />
        <button className="send-btn" onClick={handleSend} disabled={disabled || (!text.trim() && uploadedFiles.length === 0)}>➤</button>
      </div>
    </>
  );
}
