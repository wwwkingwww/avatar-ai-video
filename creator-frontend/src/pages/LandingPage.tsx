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
  content: 'Welcome to the studio.\n\nDescribe your vision — a product reveal, a talking-head monologue, a cinematic montage — and I\'ll bring it to life.\n\nChoose a template below or type freely.',
  timestamp: Date.now(),
}

const TAGLINES = [
  'AI-powered video creation',
  'From words to cinema',
  'Your creative darkroom',
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
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center">
              <span className="text-xs font-bold text-background">AV</span>
            </div>
            <div>
              <h1 className="font-display text-sm font-semibold tracking-wide text-foreground leading-none">
                Studio Obscura
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
              Dashboard
            </Link>
            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border/30">
              Sign in
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14 pb-20">
        {/* ===== HERO ===== */}
        <section className="text-center space-y-4 pt-2 sm:pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/50 bg-card/50 text-[11px] text-muted-foreground tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            AI Creative Studio
          </div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground leading-[1.08] max-w-2xl mx-auto tracking-tight">
            Turn words into<br />
            <span className="text-primary italic">cinematic</span> video
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            Describe your idea in plain language. Our AI handles casting, lighting, editing, and publishing — across every platform.
          </p>
          <hr className="gold-rule max-w-xs mx-auto" />
        </section>

        {/* ===== CHAT ===== */}
        <section className="landing-chat-section">
          <div className="rounded-xl border border-border/50 overflow-hidden bg-card/30 min-h-[420px] sm:min-h-[500px] flex flex-col shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30 bg-card/20">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400/60" />
                <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-[11px] text-muted-foreground font-display italic tracking-wide">
                  Session — Direct
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  Describe your video idea
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
              onSend={sendUserMessage}
              onUpload={handleFileUpload}
              onNewTask={() => { initSession() }}
            />
          </div>
        </section>

        {/* ===== PORTFOLIO ===== */}
        <SectionDivider label="Featured Templates" />
        <section>
          <PortfolioGrid onTemplateClick={handleTemplateClick} />
        </section>

        {/* ===== TOOLS ===== */}
        <SectionDivider label="Creative Toolset" />
        <section>
          <ToolGrid />
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="text-center pt-8 space-y-3">
          <hr className="gold-rule max-w-sm mx-auto" />
          <p className="text-xs text-muted-foreground font-display italic">
            Studio Obscura · AI Video Creation Platform
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            Every creator deserves a darkroom.
          </p>
        </footer>
      </div>
    </div>
  )
}
