interface MissingHintProps {
  items: string[]
}

export function MissingHint({ items }: MissingHintProps) {
  if (items.length === 0) return null
  return <div className="missing-hint">⏳ 还差：{items.join('、')}</div>
}
