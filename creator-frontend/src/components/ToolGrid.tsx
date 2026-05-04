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
          className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/5 bg-white/[0.01] py-4 px-3 opacity-60 cursor-not-allowed transition-opacity hover:opacity-80"
        >
          <span className="text-xl">{tool.icon}</span>
          <span className="text-xs text-white/35">{tool.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
            {tool.status}
          </span>
        </div>
      ))}
    </div>
  )
}
