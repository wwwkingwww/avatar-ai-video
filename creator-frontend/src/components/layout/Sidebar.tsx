import { cn } from '@/lib/utils'
import { Film, BarChart3, Calendar, Settings, Video } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

interface SidebarProps {
  activeView: string
  onNavigate: (view: string) => void
}

const navItems = [
  { id: 'dashboard', label: '概览', icon: BarChart3 },
  { id: 'tasks', label: '任务', icon: Film },
  { id: 'create', label: '创作', icon: Video },
  { id: 'calendar', label: '排期', icon: Calendar },
  { id: 'settings', label: '设置', icon: Settings },
]

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card shrink-0">
      <div className="flex h-14 items-center gap-2 px-6 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Film className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm">AI 视频创作</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'create') {
                  window.location.href = '/'
                } else {
                  onNavigate(item.id)
                }
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <Separator />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback>创</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">创作者</p>
            <p className="text-xs text-muted-foreground truncate">免费版</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
