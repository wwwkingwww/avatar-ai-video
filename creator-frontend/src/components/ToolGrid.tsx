const TOOLS = [
  { icon: '✂️', label: '视频剪辑', status: '开发中' },
  { icon: '🎵', label: '配音配乐', status: '开发中' },
  { icon: '📊', label: '数据分析', status: '开发中' },
  { icon: '🖼', label: '封面设计', status: '开发中' },
  { icon: '📝', label: '文案优化', status: '开发中' },
  { icon: '🔗', label: '多平台同步', status: '开发中' },
]

export function ToolGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {TOOLS.map((tool) => (
        <div
          key={tool.label}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/30 bg-card/20 py-5 px-3 opacity-50 cursor-not-allowed transition-all hover:opacity-70 hover:border-border/50"
        >
          <span className="text-xl opacity-70">{tool.icon}</span>
          <span className="text-xs text-muted-foreground font-medium">{tool.label}</span>
          <span className="font-display text-[10px] italic text-muted-foreground/50">
            {tool.status}
          </span>
        </div>
      ))}
    </div>
  )
}
