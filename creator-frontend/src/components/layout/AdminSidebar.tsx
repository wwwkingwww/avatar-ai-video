import { cn } from '@/lib/utils'
import { LayoutDashboard, Package, Settings, BarChart3, ArrowLeft } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Link, useLocation } from 'react-router-dom'

interface AdminSidebarProps {
  onNavigate: (view: string) => void
}

const navItems = [
  { id: 'dashboard', label: '管理概览', icon: LayoutDashboard },
  { id: 'models', label: '模型管理', icon: Package },
  { id: 'settings', label: '系统配置', icon: Settings },
  { id: 'analytics', label: '数据统计', icon: BarChart3 },
]

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const location = useLocation()

  return (
    <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-card shrink-0">
      <div className="flex h-14 items-center gap-2 px-6 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Settings className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-sm">管理后台</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.id === 'dashboard'
              ? location.pathname === '/admin/dashboard'
              : location.pathname === `/admin/dashboard/${item.id}`

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
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
      <div className="p-3">
        <Link
          to="/dashboard"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回前台
        </Link>
      </div>
    </aside>
  )
}
