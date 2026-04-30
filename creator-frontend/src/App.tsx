import { useEffect, useState } from 'react';
import { useSession } from './hooks/useSession';
import { ChatView } from './components/ChatView';
import { ConfirmView } from './components/ConfirmView';
import { ResultView } from './components/ResultView';
import type { TaskResult } from './types';

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="splash-screen">
      <div style={{ fontSize: 48 }}>🎬</div>
      <h2>AI 视频创作助手</h2>
      <p>用自然语言描述你的视频创意，<br />AI 将帮你生成并自动发布到多平台</p>
      <button onClick={onStart}>开始创作</button>
    </div>
  );
}

export default function App() {
  const { state, streamingText, uploadedFiles, initSession, sendUserMessage, handleFileUpload, goToConfirm, handleSubmit, backToChat } = useSession();
  const [result, setResult] = useState<TaskResult | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => { if (started) { initSession(); } }, [started, initSession]);

  if (!started) return <div className="creator-app"><SplashScreen onStart={() => setStarted(true)} /></div>;

  if (state.status === 'submitted' && result) {
    return <div className="creator-app"><ResultView result={result} onNewTask={() => { setResult(null); initSession(); }} /></div>;
  }

  if (state.status === 'confirming' && state.sessionId) {
    return (
      <div className="creator-app">
        <ConfirmView sessionId={state.sessionId} onBack={backToChat} onSubmit={async () => { const r = await handleSubmit(); if (r) setResult(r); }} />
      </div>
    );
  }

  return (
    <div className="creator-app">
      <ChatView
        messages={state.messages} streamingText={streamingText} isStreaming={state.isStreaming}
        round={state.round} uploadedFiles={uploadedFiles} forceConfirm={state.forceConfirm}
        onSend={sendUserMessage} onUpload={handleFileUpload} onGoToConfirm={goToConfirm}
      />
    </div>
  );
}
