import { useState, useEffect, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { StatCard } from '@/components/StatCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Video, Send, Clock, AlertCircle } from 'lucide-react'

interface DashboardStats {
  total: number
  generated: number
  published: number
  queued: number
  failed: number
}

interface TaskRow {
  id: string
  template: string
  platform: string
  status: string
  videoUrl: string | null
  error: string | null
  createdAt: string
  scheduledAt: string | null
}

const templateLabels: Record<string, string> = {
  'talking-head': '口播', 'tech-review': '评测', 'product-showcase': '展示', 'vlog': 'Vlog',
}
const statusLabels: Record<string, string> = {
  DRAFT: '草稿', GENERATING: '生成中', GENERATED: '已生成',
  SCHEDULED: '已排期', PUBLISHING: '发布中', PUBLISHED: '已发布',
  FAILED: '失败', CANCELLED: '已取消',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline', GENERATING: 'default', GENERATED: 'secondary',
  SCHEDULED: 'outline', PUBLISHING: 'default', PUBLISHED: 'secondary',
  FAILED: 'destructive', CANCELLED: 'outline',
}

const navTitleMap: Record<string, { title: string; description: string }> = {
  dashboard: { title: '创作概览', description: '查看视频创作与发布概况' },
  tasks: { title: '任务列表', description: '管理所有视频创作任务' },
  create: { title: '开始创作', description: 'AI 对话式视频创作' },
  calendar: { title: '排期日历', description: '查看发布排期' },
  settings: { title: '设置', description: '账户与应用设置' },
}

export function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard')
  const currentNav = navTitleMap[activeView] || navTitleMap.dashboard

  const [stats, setStats] = useState<DashboardStats>({ total: 0, generated: 0, published: 0, queued: 0, failed: 0 })
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, tasksRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/tasks'),
      ])
      const statsData = await statsRes.json()
      const tasksData = await tasksRes.json()
      if (statsData.success) setStats(statsData.data)
      if (tasksData.success) setTasks(tasksData.data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const calendarTasks = tasks.filter(t => t.scheduledAt && t.status !== 'PUBLISHED' && t.status !== 'FAILED' && t.status !== 'CANCELLED')

  return (
    <DashboardShell>
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="flex-1 flex flex-col min-w-0">
        <Header title={currentNav.title} description={currentNav.description} />
        <div className="flex-1 overflow-auto p-6">
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="已生成视频" value={stats.generated} icon={Video} />
                <StatCard title="已发布" value={stats.published} icon={Send} />
                <StatCard title="排队中" value={stats.queued} icon={Clock} />
                <StatCard title="失败" value={stats.failed} icon={AlertCircle} />
              </div>

              {tasks.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">最近任务</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>模板</TableHead>
                          <TableHead>平台</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="text-right">创建时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasks.slice(0, 10).map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{templateLabels[t.template] || t.template || '—'}</TableCell>
                            <TableCell>{t.platform || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant[t.status] || 'outline'}>
                                {statusLabels[t.status] || t.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {new Date(t.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {loading && tasks.length === 0 && (
                <Card>
                  <CardContent className="p-6 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              )}
              {!loading && tasks.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Video className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">尚无任务</h3>
                    <p className="text-sm text-muted-foreground">
                      前往创作页面开始你的第一个视频创作
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeView === 'tasks' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">全部任务 ({tasks.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模板</TableHead>
                      <TableHead>平台</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="max-w-40">视频</TableHead>
                      <TableHead className="text-right">创建时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{templateLabels[t.template] || t.template || '—'}</TableCell>
                        <TableCell>{t.platform || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[t.status] || 'outline'}>
                            {statusLabels[t.status] || t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-40 truncate">
                          {t.videoUrl ? (
                            <a href={t.videoUrl} target="_blank" className="text-primary hover:underline" rel="noreferrer">
                              查看视频
                            </a>
                          ) : t.error ? (
                            <span className="text-red-500" title={t.error}>{t.error.slice(0, 40)}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(t.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {tasks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                          暂无任务
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeView === 'calendar' && (
            <div className="space-y-3">
              <h3 className="font-semibold">排期任务 ({calendarTasks.length})</h3>
              {calendarTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">暂无排期任务</p>
                  </CardContent>
                </Card>
              ) : calendarTasks.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📅</span>
                      <div>
                        <p className="font-medium text-sm">{templateLabels[t.template] || t.template}</p>
                        <p className="text-xs text-muted-foreground">{t.platform} · {statusLabels[t.status] || t.status}</p>
                      </div>
                    </div>
                    <div className="text-sm text-right">
                      <p className="font-medium">{t.scheduledAt ? new Date(t.scheduledAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeView === 'settings' && (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <h3 className="text-lg font-semibold">设置页面将在后续 Phase 实现</h3>
                <p className="text-sm text-muted-foreground">用户账户、主题切换等</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </DashboardShell>
  )
}
