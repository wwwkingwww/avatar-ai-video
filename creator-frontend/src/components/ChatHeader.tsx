import { templateLabel, platformLabel, PLATFORMS } from '@/services/videoConfig'

interface ChatHeaderProps {
  round: number
  template: string
  platforms: string[]
  onBack: () => void
  onAgentOpen: () => void
  onViewDashboard: () => void
}

export function ChatHeader({ round, template, platforms, onBack, onAgentOpen, onViewDashboard }: ChatHeaderProps) {
  return (
    <div className="chat-header">
      <button className="chat-header-back" onClick={onBack}>←</button>

      <div className="chat-header-info">
        <span className="chat-header-title">AI 视频创作</span>
        {template && <span className="chat-header-tag">{templateLabel(template)}</span>}
        {platforms.length > 0 && (
          <span className="chat-header-platforms-chip">
            {platforms.map(p => PLATFORMS[p as keyof typeof PLATFORMS]?.icon || '📱').join(' ')}
            {' '}
            {platforms.map(p => platformLabel(p)).join('、')}
          </span>
        )}
      </div>

      <div className="chat-header-progress">
        {[1, 2, 3, 4].map(i => (
          <span key={i} className={`chat-header-dot ${i <= round ? 'done' : ''}`} />
        ))}
      </div>

      <button className="chat-header-action" onClick={onAgentOpen}>⚡</button>
      <button className="chat-header-action" onClick={onViewDashboard}>📊</button>
    </div>
  )
}
