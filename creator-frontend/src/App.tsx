import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChatDialog } from './components/ChatDialog'
import { ChatBar } from './components/ChatBar'
import { ProjectCard } from './components/ProjectCard'
import { ConfirmView } from './components/ConfirmView'
import { ResultView } from './components/ResultView'
import { useSession } from './hooks/useSession'
import type { ProjectData } from './components/ProjectCard'
import type { TaskResult } from './types'

const FILTER_TABS = [
  { key: 'all', label: '全部项目' },
  { key: 'PUBLISHED', label: '已发布' },
  { key: 'GENERATING', label: '生成中' },
  { key: 'FAILED', label: '失败' },
] as const

export default function App() {
  const { state, streamingText, recommendations, initSession, sendUserMessage, goToConfirm, handleSubmit, backToChat } = useSession()
  const [result, setResult] = useState<TaskResult | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const didInit = useRef(false)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (data.success) setProjects(data.data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProjects(); const i = setInterval(fetchProjects, 8000); return () => clearInterval(i) }, [fetchProjects])

  useEffect(() => {
    if (state.status === 'confirming' && state.sessionId && dialogOpen) {
      setConfirmOpen(true)
    }
  }, [state.status, state.sessionId, dialogOpen])

  const filtered = activeFilter === 'all'
    ? projects
    : activeFilter === 'GENERATING'
      ? projects.filter(p => p.status === 'GENERATING' || p.status === 'PUBLISHING')
      : projects.filter(p => p.status === activeFilter)

  const stats = {
    total: projects.length,
    published: projects.filter(p => p.status === 'PUBLISHED').length,
    generating: projects.filter(p => p.status === 'GENERATING' || p.status === 'PUBLISHING').length,
    failed: projects.filter(p => p.status === 'FAILED').length,
  }

  const openNewDialog = useCallback(() => {
    setDialogOpen(true)
    if (!didInit.current) {
      didInit.current = true
      initSession()
    }
  }, [initSession])

  const handleQuickSend = useCallback((text: string) => {
    setDialogOpen(true)
    if (!didInit.current) {
      didInit.current = true
      initSession()
    }
    sendUserMessage(text)
  }, [initSession, sendUserMessage])

  const handleDialogSubmit = useCallback(async (scheduledAt: string | null) => {
    const r = await handleSubmit(scheduledAt)
    if (r) {
      setResult(r)
      setConfirmOpen(false)
      setResultOpen(true)
      fetchProjects()
    }
  }, [handleSubmit, fetchProjects])

  const handleNewTask = useCallback(() => {
    setResult(null)
    setResultOpen(false)
    setDialogOpen(false)
    didInit.current = false
    initSession()
  }, [initSession])

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-col h-screen bg-background">
        {/* ===== 顶部导航 ===== */}
        <header className="flex items-center h-12 px-5 gap-3 bg-card border-b shrink-0">
          <div className="flex items-center gap-2 mr-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="text-xs">🎬</span>
            </div>
            <span className="font-bold text-sm">AI 视频创作</span>
          </div>
          <nav className="flex gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 rounded text-xs transition-colors ${
                  activeFilter === tab.key
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span>总计 <strong className="text-foreground">{stats.total}</strong></span>
            <span>已发布 <strong className="text-foreground">{stats.published}</strong></span>
            <span>生成中 <strong className="text-foreground">{stats.generating}</strong></span>
          </div>
          <Button variant="outline" size="icon-sm" className="shrink-0">⚙️</Button>
          <Button size="xs" onClick={openNewDialog} className="shrink-0">
            + 新建项目
          </Button>
        </header>

        {/* ===== 嵌入式对话栏 ===== */}
        <ChatBar
          onSend={handleQuickSend}
          onExpand={openNewDialog}
          isStreaming={state.isStreaming}
        />

        {/* ===== 项目卡片网格 ===== */}
        <main className="flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              创作项目 <span className="font-normal text-muted-foreground/60">({filtered.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="text-4xl mb-3">📭</span>
              <h3 className="text-lg font-semibold mb-1">
                {activeFilter === 'all' ? '还没有项目' : '没有匹配的项目'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {activeFilter === 'all' ? '在上方输入框描述你的创意，或点击「新建项目」开始创作' : '试试切换其他筛选条件'}
              </p>
              {activeFilter === 'all' && (
                <Button variant="outline" onClick={openNewDialog}>+ 新建项目</Button>
              )}
            </div>
          )}
        </main>

        {/* ===== 对话弹窗 ===== */}
        <ChatDialog
          open={dialogOpen && !confirmOpen && !resultOpen}
          onOpenChange={setDialogOpen}
          messages={state.messages}
          streamingText={streamingText}
          isStreaming={state.isStreaming}
          onSend={sendUserMessage}
        />

        {/* ===== 确认弹窗 ===== */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-[500px]" showCloseButton>
            <ConfirmView
              sessionId={state.sessionId!}
              onBack={() => { setConfirmOpen(false); backToChat() }}
              onSubmit={handleDialogSubmit}
              recommendations={recommendations}
            />
          </DialogContent>
        </Dialog>

        {/* ===== 结果弹窗 ===== */}
        <Dialog open={resultOpen} onOpenChange={setResultOpen}>
          <DialogContent className="sm:max-w-[420px]" showCloseButton>
            <ResultView result={result!} onNewTask={handleNewTask} />
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
