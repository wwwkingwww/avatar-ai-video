import { useState, useCallback } from 'react'

interface QuickOptionsProps {
  options: string[]
  mode?: 'single' | 'multi'
  onSelect?: (option: string) => void
}

export function QuickOptions({ options, mode = 'single', onSelect }: QuickOptionsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((opt: string) => {
    if (mode === 'single') { onSelect?.(opt); return }
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(opt) ? next.delete(opt) : next.add(opt)
      return next
    })
  }, [mode, onSelect])

  const confirmMulti = useCallback(() => {
    if (selected.size > 0) {
      onSelect?.(Array.from(selected).join('、'))
      setSelected(new Set())
    }
  }, [selected, onSelect])

  return (
    <div className="quick-options">
      {options.map((opt, i) => {
        const isSelected = mode === 'multi' && selected.has(opt)
        return (
          <button key={i} className={`quick-option${isSelected ? ' selected' : ''}`}
            onClick={() => toggle(opt)}>
            {isSelected ? '✓ ' : ''}{opt}
          </button>
        )
      })}
      {mode === 'multi' && selected.size > 0 && (
        <button className="quick-option confirm" onClick={confirmMulti}>确认选择</button>
      )}
    </div>
  )
}
