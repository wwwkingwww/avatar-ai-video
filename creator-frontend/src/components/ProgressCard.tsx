import { useEffect, useState, useRef, useCallback } from 'react'
import { taskTypeInfo } from '../services/videoConfig'

interface ProgressCardProps {
  taskId: string
  onNewTask: () => void
  onRetry?: () => void
}

interface ProgressState {
  status: string
  template: string | null
  script: string | null
  platform: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  error: string | null
  rhTaskId: string | null
  publishResult: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

const PLATFORM_ICONS: Record<string, string> = { douyin: '🎵', kuaishou: '🎬', xiaohongshu: '📕' }
const PLATFORM_NAMES: Record<string, string> = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书' }

interface PublishInfo {
  videoUrl?: string
  taskId?: string
  results?: { success?: boolean; error?: string; platform?: string }[]
  publishedAt?: string
  error?: string
}

const PIPELINE = [
  { key: 'SUBMITTED', label: '已提交', icon: '📋', detailKey: 'submitted' as const },
  { key: 'GENERATING', label: '生成中', icon: '🎬', detailKey: 'generating' as const },
  { key: 'GENERATED', label: '已生成', icon: '✅', detailKey: 'generated' as const },
  { key: 'PUBLISHING', label: '发布中', icon: '📤', detailKey: 'publishing' as const },
  { key: 'PUBLISHED', label: '已发布', icon: '🎉', detailKey: 'published' as const },
]

const ORDER = ['SUBMITTED', 'GENERATING', 'GENERATED', 'PUBLISHING', 'PUBLISHED']

function stepIndex(status: string): number {
  if (status === 'FAILED' || status === 'PUBLISH_FAILED') return ORDER.indexOf('GENERATING')
  if (status === 'SCHEDULED') return 0
  const i = ORDER.indexOf(status)
  return i >= 0 ? i : 0
}

function progressPercent(status: string): number {
  switch (status) {
    case 'SUBMITTED': return 5
    case 'SCHEDULED': return 10
    case 'GENERATING': return 30
    case 'GENERATED': return 70
    case 'PUBLISHING': return 80
    case 'PUBLISHED': return 100
    case 'FAILED': return 0
    case 'PUBLISH_FAILED': return 50
    default: return 0
  }
}

function estimatedRemaining(status: string, elapsed: number): string {
  if (status === 'SUBMITTED') return '排队中…'
  if (status === 'GENERATING') {
    const remaining = Math.max(0, 120 - elapsed)
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return m > 0 ? `预计剩余 ${m} 分 ${s} 秒` : `预计剩余 ${s} 秒`
  }
  if (status === 'PUBLISHING') return '发布中，约 30 秒'
  if (status === 'PUBLISHED' || status === 'GENERATED') return '已完成'
  return ''
}

export function ProgressCard({ taskId, onNewTask, onRetry }: ProgressCardProps) {
  const [state, setState] = useState<ProgressState>({
    status: 'SUBMITTED', template: null, script: null, platform: null,
    videoUrl: null, thumbnailUrl: null, error: null, rhTaskId: null,
    publishResult: null, createdAt: null, updatedAt: null,
  })
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    const es = new EventSource(`/api/tasks/${taskId}/progress`)
    esRef.current = es
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'update') {
          setState(prev => ({
            status: msg.status || prev.status,
            template: msg.template ?? prev.template,
            script: msg.script ?? prev.script,
            platform: msg.platform ?? prev.platform,
            videoUrl: msg.videoUrl ?? prev.videoUrl,
            thumbnailUrl: msg.thumbnailUrl ?? prev.thumbnailUrl,
            error: msg.error ?? prev.error,
            rhTaskId: msg.rhTaskId ?? prev.rhTaskId,
            publishResult: msg.publishResult ?? prev.publishResult,
            createdAt: msg.createdAt ?? prev.createdAt,
            updatedAt: msg.updatedAt ?? prev.updatedAt,
          }))
          if (msg.createdAt) startRef.current = new Date(msg.createdAt).getTime()
        } else if (msg.type === 'done') {
          setState(prev => ({ ...prev, status: msg.status }))
          es.close()
        } else if (msg.type === 'error' || msg.type === 'timeout') {
          es.close()
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => { es.close() }
  }, [taskId])

  useEffect(() => {
    connect()
    return () => { esRef.current?.close() }
  }, [connect])

  useEffect(() => {
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(i)
  }, [])

  const isError = state.status === 'FAILED' || state.status === 'PUBLISH_FAILED'
  const isDone = state.status === 'PUBLISHED'
  const platforms = (state.platform || '').split(',').filter(Boolean)
  const hasPlatforms = platforms.length > 0
  const isGenerated = state.status === 'GENERATED' && !hasPlatforms
  const idx = stepIndex(state.status)

  const fmte = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return m > 0 ? `${m}分${sec}秒` : `${sec}秒` }

  const publishResults = state.publishResult as PublishInfo | null

  const pct = progressPercent(state.status)

  return (
    <div className="progress-card">
      <div className="progress-card-header">
        <span className="progress-card-title">任务进度</span>
        <span className="progress-card-elapsed">⏱ {fmte(elapsed)}</span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-section">
        <div className="progress-bar-track">
          <div className={`progress-bar-fill ${isError ? 'error' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="progress-bar-label">
          {isError ? '❌ 任务失败' : isDone ? '✅ 全部完成' : `${pct}%`}
        </span>
      </div>

      {/* Estimate */}
      {!isError && !isDone && !isGenerated && (
        <div className="progress-estimate">
          ⏱ {estimatedRemaining(state.status, elapsed)}
        </div>
      )}

      {/* Pipeline */}
      <div className="pipeline">
        {PIPELINE.map((step, i) => {
          let cls = 'pipeline-step'
          if (isError && i <= idx && step.key !== 'PUBLISHED') cls += ' error'
          else if (isDone && i === 4) cls += ' done'
          else if (i < idx) cls += ' done'
          else if (i === idx && !isError && !isDone) cls += ' active'
          return (
            <div key={step.key} className={cls}>
              <div className="pipeline-dot"><span className="pipeline-icon">{step.icon}</span></div>
              <span className="pipeline-label">{step.label}</span>
              {i < PIPELINE.length - 1 && <div className={`pipeline-line ${i < idx ? 'filled' : ''}`} />}
            </div>
          )
        })}
      </div>

      {/* Step Cards */}
      <div className="step-cards">
        {/* 1. Submitted */}
        <StepCard status={idx >= 0 ? (idx > 0 ? 'done' : 'active') : 'pending'} icon="📋" title="已提交">
          <div className="sc-row"><span className="sc-label">模板</span><span className="sc-val">{state.template ? (taskTypeInfo(state.template)?.label || state.template) : '—'}</span></div>
          <div className="sc-row"><span className="sc-label">平台</span><span className="sc-val">{platforms.map(p => `${PLATFORM_ICONS[p] || ''} ${PLATFORM_NAMES[p] || p}`).join('  ') || '—'}</span></div>
          <div className="sc-row"><span className="sc-label">文案</span><span className="sc-val sc-script">{state.script ? (state.script.length > 60 ? state.script.substring(0, 60) + '…' : state.script) : '—'}</span></div>
          {state.rhTaskId && <div className="sc-row"><span className="sc-label">任务ID</span><span className="sc-val sc-mono">{state.rhTaskId.substring(0, 12)}…</span></div>}
        </StepCard>

        {/* 2. Generating */}
        <StepCard status={idx >= 1 ? (idx > 1 ? 'done' : (isError ? 'error' : 'active')) : 'pending'} icon="🎬" title="生成中">
          <div className="sc-row"><span className="sc-label">提示词</span><span className="sc-val sc-script">{state.script || '—'}</span></div>
          <div className="sc-row"><span className="sc-label">模型</span><span className="sc-val sc-mono">alibaba/happyhorse-1.0</span></div>
          {isError && (
            <div className="sc-error">
              <span>❌ {state.error}</span>
              {onRetry && (
                <button className="retry-btn" onClick={onRetry}>
                  🔄 重试
                </button>
              )}
            </div>
          )}
        </StepCard>

        {/* 3. Generated */}
        <StepCard status={idx >= 2 ? (idx > 2 ? 'done' : 'active') : 'pending'} icon="✅" title="已生成">
          {state.videoUrl ? (
            <div className="sc-thumb">
              <video
                src={state.videoUrl}
                controls
                preload="metadata"
                className="sc-video"
                style={{ width: '100%', maxHeight: 200, borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}
              />
              <a href={state.videoUrl} target="_blank" rel="noreferrer" className="sc-thumb-link">
                在新窗口查看视频 →
              </a>
            </div>
          ) : (
            <div className="sc-hint">等待生成完成…</div>
          )}
        </StepCard>

        {/* 4. Publishing */}
        <StepCard status={idx >= 3 ? (idx > 3 ? 'done' : 'active') : 'pending'} icon="📤" title="发布中">
          {hasPlatforms ? (
            <div className="sc-publish-grid">
              {platforms.map((p, i) => {
                const res = publishResults?.results && Array.isArray(publishResults.results) ? publishResults.results[i] : null
                return (
                  <div key={p} className={`sc-pub-item ${res?.success ? 'pub-ok' : 'pub-pend'}`}>
                    <span className="sc-pub-icon">{PLATFORM_ICONS[p] || '📱'}</span>
                    <span className="sc-pub-name">{PLATFORM_NAMES[p] || p}</span>
                    <span className="sc-pub-status">{res?.success ? '✅' : res?.error ? '❌' : '⏳'}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="sc-hint">{isGenerated ? '无需发布（未选择目标平台）' : '等待平台配置…'}</div>
          )}
          {!!publishResults?.publishedAt && <div className="sc-row"><span className="sc-label">发布时间</span><span className="sc-val">{new Date(publishResults.publishedAt as string).toLocaleString()}</span></div>}
        </StepCard>

        {/* 5. Done */}
        <StepCard status={isDone ? 'done' : 'pending'} icon="🎉" title="完成">
          {isDone ? (
            <>
              <div className="sc-success">✅ 已发布到所有平台</div>
              <div className="sc-row"><span className="sc-label">总耗时</span><span className="sc-val">{fmte(elapsed)}</span></div>
            </>
          ) : isGenerated ? (
            <>
              <div className="sc-success">✅ 视频已生成</div>
              <div className="sc-row"><span className="sc-label">耗时</span><span className="sc-val">{fmte(elapsed)}</span></div>
              <div className="sc-hint">未配置目标平台，视频已保存到云端</div>
            </>
          ) : (
            <div className="sc-hint">等待完成…</div>
          )}
        </StepCard>
      </div>

      {(isDone || isError || isGenerated) && (
        <button className="progress-card-btn" onClick={onNewTask}>创建新任务</button>
      )}
    </div>
  )
}

function StepCard({ status, icon, title, children }: {
  status: 'pending' | 'active' | 'done' | 'error'
  icon: string; title: string; children: React.ReactNode
}) {
  return (
    <div className={`step-card ${status}`}>
      <div className="step-card-bar" />
      <div className="step-card-body">
        <div className="step-card-head">
          <span className="step-card-icon">{icon}</span>
          <span className="step-card-title">{title}</span>
          {status === 'active' && <span className="step-card-badge">进行中</span>}
          {status === 'done' && <span className="step-card-badge done">✓</span>}
          {status === 'error' && <span className="step-card-badge error">✗</span>}
        </div>
        <div className="step-card-content">{children}</div>
      </div>
    </div>
  )
}
