import { useState, useEffect, useRef } from 'react'
import type { TaskResult, TaskStatusInfo } from '../types'
import { getTaskStatus } from '../services/api'

interface ResultViewProps {
  result: TaskResult;
  onNewTask: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: '已提交',
  SCHEDULED: '已排期',
  GENERATING: '正在生成视频',
  GENERATED: '视频已生成',
  PUBLISHING: '正在发布到平台',
  PUBLISHED: '已发布完成',
  PUBLISH_FAILED: '发布部分失败',
  FAILED: '任务失败',
}

const PROGRESS_STEPS = ['SUBMITTED', 'GENERATING', 'GENERATED', 'PUBLISHING', 'PUBLISHED'] as const
const TERMINAL_STATUSES = ['PUBLISHED', 'PUBLISH_FAILED', 'FAILED']

function getStepIndex(status: string): number {
  if (status === 'SCHEDULED') return 0
  const idx = PROGRESS_STEPS.indexOf(status as typeof PROGRESS_STEPS[number])
  if (idx >= 0) return idx
  if (status === 'PUBLISH_FAILED' || status === 'FAILED') {
    return status === 'PUBLISH_FAILED' ? 3 : 1
  }
  return 0
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ResultView({ result, onNewTask }: ResultViewProps) {
  const [taskInfo, setTaskInfo] = useState<TaskStatusInfo | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        try {
          const info = await getTaskStatus(result.taskId)
          if (!cancelled) {
            setTaskInfo(info)
            if (TERMINAL_STATUSES.includes(info.status)) return
          }
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 3000))
      }
    }
    poll()

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [result.taskId])

  const status = taskInfo?.status || result.status
  const stepIndex = getStepIndex(status)
  const isTerminal = TERMINAL_STATUSES.includes(status)
  const isSuccess = status === 'PUBLISHED'
  const isFailed = status === 'FAILED'
  const isPartFailed = status === 'PUBLISH_FAILED'

  return (
    <div className="result-view">
      <div className="result-icon">
        {isTerminal ? (isSuccess ? '🎉' : isPartFailed ? '⚠️' : '❌') : '⏳'}
      </div>
      <h2 className="result-title">
        {isTerminal ? (isSuccess ? '发布完成' : isPartFailed ? '部分完成' : '任务失败') : STATUS_LABELS[status] || '处理中'}
      </h2>

      <div className="result-info">
        <div>任务编号: <strong>{result.taskId}</strong></div>
        <div>已用时间: <strong>{formatElapsed(elapsed)}</strong></div>
      </div>

      <div className="progress-steps">
        {PROGRESS_STEPS.map((step, i) => {
          let cls = 'progress-step'
          if (i < stepIndex) cls += ' done'
          else if (i === stepIndex && !isTerminal) cls += ' active'
          else if (i === stepIndex && isFailed) cls += ' failed'
          return (
            <div key={step} className={cls}>
              <div className="step-dot" />
              <span className="step-label">{STATUS_LABELS[step]}</span>
            </div>
          )
        })}
      </div>

      {taskInfo?.videoUrl && status !== 'FAILED' && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <video
            src={taskInfo.videoUrl}
            controls
            style={{ width: '100%', maxHeight: 240, borderRadius: 8, background: '#000' }}
          />
        </div>
      )}

      {taskInfo?.error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,0,0,0.08)', borderRadius: 6, fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          {taskInfo.error}
        </div>
      )}

      {!isTerminal && (
        <div style={{ marginTop: 12, fontSize: 'var(--font-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>
          正在自动更新状态...
        </div>
      )}

      <div className="result-actions">
        <button className="btn-primary" onClick={onNewTask}>创建新任务</button>
      </div>
    </div>
  );
}
