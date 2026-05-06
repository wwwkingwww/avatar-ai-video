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
  content: '欢迎来到暗房工作室。\n\n描述你的创意——产品发布、口播独白、电影蒙太奇——我将为你实现。\n\n选择下方模板或自由输入，即刻开始创作。',
  timestamp: Date.now(),
}

const TAGLINES = [
  'AI 驱动视频创作',
  '从文字到影像',
  '你的专属创作暗房',
]

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
  const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center">
              <span className="text-xs font-bold text-background">AV</span>
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold tracking-wide text-foreground leading-none">
                暗房工作室
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase leading-none mt-0.5">
                {tagline}
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <nav className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border/50 hover:border-border"
            >
              管理后台
            </Link>
            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border/30">
              登录
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14 pb-20">
        <section className="text-center space-y-4 pt-2 sm:pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/50 bg-card/50 text-[11px] text-muted-foreground tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            AI 智能创作平台
          </div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground leading-[1.08] max-w-2xl mx-auto tracking-tight">
            用文字创造<br />
            <span className="text-primary italic">电影级</span>视频
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            用自然语言描述你的创意，AI 自动完成选角、布光、剪辑与多平台发布。
          </p>
          <hr className="gold-rule max-w-xs mx-auto" />
        </section>

        <section className="landing-chat-section">
          <div className="rounded-xl border border-border/50 overflow-hidden bg-card/30 h-[420px] sm:h-[500px] flex flex-col shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30 bg-card/20">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400/60" />
                <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-[11px] text-muted-foreground font-display italic tracking-wide">
                  会话 — 直接模式
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  描述你的视频创意
                </span>
                <span className="text-xs opacity-40">↓</span>
              </div>
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
              sessionId={state.sessionId}
              status={state.status}
              onSend={sendUserMessage}
              onUpload={handleFileUpload}
              onNewTask={() => { initSession() }}
            />
          </div>
        </section>

        <SectionDivider label="作品聚合" />
        <section>
          <PortfolioGrid onTemplateClick={handleTemplateClick} />
        </section>

        <SectionDivider label="创作工具箱" />
        <section>
          <ToolGrid />
        </section>

        <footer className="text-center pt-8 space-y-3">
          <hr className="gold-rule max-w-sm mx-auto" />
          <p className="text-xs text-muted-foreground font-display italic">
            暗房工作室 · AI 视频创作平台
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            每个创作者都值得拥有一间暗房。
          </p>
        </footer>
      </div>
    </div>
  )
}
