import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { Header } from '@/components/layout/Header'
import { StatCard } from '@/components/StatCard'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { isAuthenticated, fetchStats, type AdminStats } from '@/services/admin-api'
import { Package, Eye, EyeOff, FileEdit, Settings, BarChart3 } from 'lucide-react'
import { ModelManager } from './ModelManager'

const navTitleMap: Record<string, { title: string; description: string }> = {
  dashboard: { title: '管理概览', description: '模型注册、系统状态总览' },
  models: { title: '模型管理', description: '管理模型注册表、控制前端可见性' },
  settings: { title: '系统配置', description: 'API Key、路由策略等全局设置' },
  analytics: { title: '数据统计', description: '模型使用量、成功率等数据分析' },
}

export function AdminDashboard() {
  const { view } = useParams<{ view?: string }>()
  const navigate = useNavigate()
  const activeView = view || 'dashboard'

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

  const handleNavigate = useCallback((v: string) => {
    navigate(v === 'dashboard' ? '/admin/dashboard' : `/admin/dashboard/${v}`)
  }, [navigate])

  const currentNav = navTitleMap[activeView] || navTitleMap.dashboard

  const [stats, setStats] = useState<AdminStats>({ total: 0, published: 0, disabled: 0, draft: 0 })
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchStats()
      if (res.success) setStats(res.data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  return (
    <DashboardShell>
      <AdminSidebar onNavigate={handleNavigate} />
      <main className="flex-1 flex flex-col min-w-0">
        <Header title={currentNav.title} description={currentNav.description} />
        <div className="flex-1 overflow-auto p-6">
          <div style={{ maxWidth: 1280, marginLeft: 'auto', marginRight: 'auto' }}>
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="模型总数" value={stats.total} icon={Package} />
                <StatCard title="已发布" value={stats.published} icon={Eye} />
                <StatCard title="已禁用" value={stats.disabled} icon={EyeOff} />
                <StatCard title="草稿" value={stats.draft} icon={FileEdit} />
              </div>

              {loading && (
                <Card>
                  <CardContent className="p-6 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              )}
              {!loading && (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">模型注册管理</h3>
                    <p className="text-sm text-muted-foreground">
                      前往"模型管理"页面查看和管理注册表中的所有模型
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeView === 'models' && <ModelManager />}

          {activeView === 'settings' && (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">系统配置</h3>
                <p className="text-sm text-muted-foreground">将在 Phase 2 实现</p>
              </CardContent>
            </Card>
          )}

          {activeView === 'analytics' && (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">数据统计</h3>
                <p className="text-sm text-muted-foreground">将在 Phase 3 实现</p>
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      </main>
    </DashboardShell>
  )
}

