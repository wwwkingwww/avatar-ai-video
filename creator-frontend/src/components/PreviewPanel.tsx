import { useState } from 'react'
import { PreviewSlot } from './PreviewSlot'
import { MissingHint } from './MissingHint'
import type { UploadedFile } from '../types'
import { taskTypeInfo } from '../services/videoConfig'

interface PreviewPanelProps {
  taskType: string | null
  platforms: string[]
  files: UploadedFile[]
  script: string | null
  missing: string[]
}

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书',
}

export function PreviewPanel({ taskType, platforms, files, script, missing }: PreviewPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const hasContent = taskType || platforms.length > 0 || files.length > 0 || script

  if (!expanded) {
    const summary = hasContent
      ? `🎬 ${taskType ? taskTypeInfo(taskType)?.label || taskType : '未选'} · ${platforms.length > 0 ? platforms.map(p => PLATFORM_LABELS[p] || p).join('、') : '未选平台'} ｜ ${missing.length > 0 ? `${missing.length}项待填` : '✓ 已完成'}`
      : '🎬 视频创作预览 — 点击展开'
    return <div className="preview-panel collapsed" onClick={() => setExpanded(true)}>{summary}</div>
  }

  return (
    <div className="preview-panel">
      <div className="preview-panel-header" onClick={() => setExpanded(false)}>
        <span>🎬 视频创作预览</span><span className="preview-panel-toggle">▲</span>
      </div>
      {!hasContent ? (
        <div className="preview-panel-empty">在下方描述你的视频创意，AI 将引导你完成创作</div>
      ) : (
        <div className="preview-panel-grid">
          <PreviewSlot label="模板" icon="🎤"
            value={taskType ? taskTypeInfo(taskType)?.label || taskType : null}
            status={taskType ? 'filled' : 'empty'} />
          <PreviewSlot label="平台" icon="📱"
            value={platforms.length > 0 ? platforms.map(p => PLATFORM_LABELS[p] || p).join('、') : null}
            status={platforms.length > 0 ? 'filled' : 'empty'} />
          <PreviewSlot label="素材" icon="📷"
            value={files.length > 0 ? `${files.length}个文件` : (taskType === 'text-to-video' ? '纯文案' : null)}
            status={files.length > 0 || taskType === 'text-to-video' ? 'filled' : 'empty'} />
          <PreviewSlot label="文案" icon="📝"
            value={script ? (script.length > 20 ? script.substring(0, 20) + '...' : script) : null}
            status={script ? 'filled' : 'empty'} />
        </div>
      )}
      <MissingHint items={missing} />
    </div>
  )
}
