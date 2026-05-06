import { useRef, useCallback } from 'react';
import { sendMessage } from '../services/api';
import { debugLog } from '../lib/logger';

interface SSEOptions {
  onChunk: (text: string) => void;
  onDone: (info: { round: number; forceConfirm: boolean; context?: Record<string, unknown> }) => void;
  onError: (err: string) => void;
}

export function useSSE() {
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);

  const cancel = useCallback(() => {
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch { /* ignore */ }
      controllerRef.current = null;
    }
    activeRef.current = false;
  }, []);

  const connect = useCallback(
    async (sessionId: string, content: string, attachments: string[], opts: SSEOptions) => {
      if (activeRef.current) {
        debugLog('[useSSE] Already active, canceling previous request');
        cancel();
      }
      activeRef.current = true;

      try {
        controllerRef.current = await sendMessage(
          sessionId, content, attachments,
          (text) => {
            if (!activeRef.current) return;
            opts.onChunk(text);
          },
          (info) => {
            activeRef.current = false;
            controllerRef.current = null;
            opts.onDone(info);
          },
          (err) => {
            activeRef.current = false;
            controllerRef.current = null;
            opts.onError(err);
          }
        );
      } catch (e) {
        activeRef.current = false;
        controllerRef.current = null;
        const errMsg = e instanceof Error ? e.message : String(e);
        opts.onError(errMsg);
      }
    },
    [cancel]
  );

  return { connect, cancel };
}
