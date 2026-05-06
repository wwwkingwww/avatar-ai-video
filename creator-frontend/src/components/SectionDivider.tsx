export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <hr className="gold-rule flex-1" />
      <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-medium whitespace-nowrap">
        {label}
      </span>
      <hr className="gold-rule flex-1" />
    </div>
  )
}
