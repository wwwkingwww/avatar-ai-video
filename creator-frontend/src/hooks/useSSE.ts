import { useRef, useCallback } from 'react';
import { sendMessage } from '../services/api';

interface SSEOptions {
  onChunk: (text: string) => void;
  onDone: (info: { round: number; forceConfirm: boolean }) => void;
  onError: (err: string) => void;
}

export function useSSE() {
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const connect = useCallback(
    (sessionId: string, content: string, attachments: string[], opts: SSEOptions) => {
      cancel();
      controllerRef.current = sendMessage(
        sessionId, content, attachments,
        opts.onChunk, opts.onDone, opts.onError
      );
    },
    [cancel]
  );

  return { connect, cancel };
}
