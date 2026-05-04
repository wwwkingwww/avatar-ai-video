interface SectionDividerProps {
  label: string
  className?: string
}

export function SectionDivider({ label, className }: SectionDividerProps) {
  return (
    <div className={`flex items-center gap-3 px-1 py-2 ${className || ''}`}>
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-xs text-white/35 font-medium whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  )
}
