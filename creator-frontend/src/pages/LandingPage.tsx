import { useSession } from '../hooks/useSession'
import { ChatView } from '../components/ChatView'
import { ChatBar } from '../components/ChatBar'
import { PortfolioGrid } from '../components/PortfolioGrid'
import { ToolGrid } from '../components/ToolGrid'
import { SectionDivider } from '../components/SectionDivider'
import { Link } from 'react-router-dom'

export function LandingPage() {
  const {
    step, state, streamingText, uploadedFiles,
    context, taskId, initSession, sendUserMessage, handleFileUpload,
  } = useSession()

  const handleTemplateClick = (label: string) => {
    sendUserMessage(label)
    document.querySelector('.landing-chat-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-lg">🎬</span>
        <span className="font-bold text-sm text-foreground">AI 视频创作</span>
        <div className="flex-1" />
        <Link
          to="/dashboard"
          className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5 rounded-md border border-white/10 hover:border-white/20"
        >
          管理后台
        </Link>
        <button className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-md border border-white/8">
          登录
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-6 pb-12">
        <section className="landing-chat-section">
          <div className="rounded-xl border border-primary/10 overflow-hidden bg-white/[0.01]">
            <div className="bg-gradient-to-r from-primary/5 to-purple-500/3 px-4 py-2.5 border-b border-primary/5 flex items-center gap-2">
              <span className="text-sm text-primary font-semibold">💬 AI 视频创作助手</span>
              <span className="flex-1" />
              <span className="text-[10px] text-white/10 hidden sm:inline">直接对话开始创作 👇</span>
            </div>

            <ChatView
              chatBar={
                <ChatBar
                  onSend={sendUserMessage}
                  isStreaming={state.isStreaming}
                />
              }
              step={step}
              messages={state.messages}
              streamingText={streamingText}
              isStreaming={state.isStreaming}
              uploadedFiles={uploadedFiles}
              context={context}
              taskId={taskId}
              onSend={sendUserMessage}
              onUpload={handleFileUpload}
              onNewTask={() => { initSession() }}
            />
          </div>
        </section>

        <SectionDivider label="🎬 作品聚合" />
        <PortfolioGrid onTemplateClick={handleTemplateClick} />

        <SectionDivider label="🛠 实用工具" />
        <ToolGrid />

        <footer className="text-center pt-6 text-xs text-white/5">
          AI 视频创作平台 · 让每个人都能轻松创作视频
        </footer>
      </div>
    </div>
  )
}
