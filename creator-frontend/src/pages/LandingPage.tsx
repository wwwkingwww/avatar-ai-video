import { useSession } from '../hooks/useSession'
import { ChatView } from '../components/ChatView'
import { ChatBar } from '../components/ChatBar'
import { PortfolioGrid } from '../components/PortfolioGrid'
import { ToolGrid } from '../components/ToolGrid'
import { SectionDivider } from '../components/SectionDivider'
import { Link } from 'react-router-dom'

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant' as const,
  content: '你好！我是 AI 视频创作助手 👋\n\n想做什么类型的视频？选择下方模板、或在输入框直接描述你的创意，我就能帮你生成！',
  timestamp: Date.now(),
}

export function LandingPage() {
  const {
    step, state, streamingText, uploadedFiles,
    context, taskId, initSession, sendUserMessage, handleFileUpload,
  } = useSession()

  const handleTemplateClick = (label: string) => {
    sendUserMessage(label)
    document.querySelector('.landing-chat-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  const displayMessages = state.messages.length > 0 ? state.messages : [WELCOME_MESSAGE]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-lg">🎬</span>
        <span className="font-bold text-sm text-foreground">AI 视频创作</span>
        <div className="flex-1" />
        <Link
          to="/dashboard"
          className="text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-md border border-white/10 hover:border-white/20"
        >
          管理后台
        </Link>
        <button className="text-xs text-white/35 hover:text-white/60 transition-colors px-3 py-1.5 rounded-md border border-white/8">
          登录
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-6 pb-12">
        <section className="landing-chat-section">
          <div className="rounded-xl border border-primary/10 overflow-hidden bg-white/[0.01] min-h-[400px] sm:min-h-[480px] flex flex-col">
            <div className="bg-gradient-to-r from-primary/5 to-purple-500/3 px-4 py-2.5 border-b border-primary/5 flex items-center gap-2">
              <span className="text-sm text-primary font-semibold">💬 AI 视频创作助手</span>
              <span className="flex-1" />
              <span className="text-[11px] text-white/30 hidden sm:inline">直接对话开始创作 👇</span>
            </div>

            <ChatView
              compact
              chatBar={
                <ChatBar
                  onSend={sendUserMessage}
                  isStreaming={state.isStreaming}
                />
              }
              step={step}
              messages={displayMessages}
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

        <footer className="text-center pt-6 text-xs text-white/15">
          AI 视频创作平台 · 让每个人都能轻松创作视频
        </footer>
      </div>
    </div>
  )
}
