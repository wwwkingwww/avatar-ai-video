interface PreviewSlotProps {
  label: string
  value: string | null
  icon: string
  status: 'empty' | 'pending' | 'filled' | 'error'
}

export function PreviewSlot({ label, value, icon, status }: PreviewSlotProps) {
  return (
    <div className={`preview-slot ${status}`}>
      <span className="preview-slot-icon">{icon}</span>
      <span className="preview-slot-label">{label}</span>
      <span className="preview-slot-value">{status === 'empty' ? '待填写' : value || '—'}</span>
      {status === 'filled' && <span className="preview-slot-check">✓</span>}
    </div>
  )
}
