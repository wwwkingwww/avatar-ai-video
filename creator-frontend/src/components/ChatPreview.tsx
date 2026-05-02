import { templateLabel, platformLabel, PLATFORMS } from '@/services/videoConfig'

interface ChatPreviewProps {
  template: string
  platforms: string[]
  files: { name: string; url: string }[]
  script: string
}

export function ChatPreview({ template, platforms, files, script }: ChatPreviewProps) {
  return (
    <div className="chat-preview">
      <div className="chat-preview-label">实时预览</div>

      {!template && !platforms.length && !files.length && !script && (
        <div className="chat-preview-empty">
          <div className="chat-preview-empty-icon">👀</div>
          <p>选择模板和平台后，<br />这里将实时展示预览效果</p>
        </div>
      )}

      {template && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">🎬 视频模板</div>
          <div className="chat-preview-template">
            <div className="chat-preview-template-badge">{templateLabel(template)}</div>
          </div>
        </div>
      )}

      {platforms.length > 0 && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">📱 发布平台</div>
          <div className="chat-preview-platforms">
            {platforms.map((p) => {
              const info = PLATFORMS[p as keyof typeof PLATFORMS]
              return (
                <div key={p} className="chat-preview-platform-card" style={{ borderColor: info?.color || '#333' }}>
                  <span>{info?.icon || '📱'}</span>
                  <span className="chat-preview-platform-name">{info?.label || p}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">📁 素材文件 ({files.length})</div>
          <div className="chat-preview-files">
            {files.map((f, i) => (
              <div key={i} className="chat-preview-file-chip">
                {f.url ? <img src={f.url} alt={f.name} /> : <span>📄</span>}
                <span className="chat-preview-file-name">{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {script && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">📝 视频文案</div>
          <div className="chat-preview-script">{script}</div>
        </div>
      )}
    </div>
  )
}
