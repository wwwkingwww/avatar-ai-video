import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface ProjectData {
  id: string
  title?: string
  template: string
  platform: string
  status: string
  videoUrl: string | null
  thumbnailUrl?: string | null
  createdAt: string
}

const templateLabels: Record<string, string> = {
  'talking-head': '口播', 'tech-review': '评测', 'product-showcase': '展示', 'vlog': 'Vlog',
}

const platformIcons: Record<string, string> = {
  douyin: '📱 抖音', kuaishou: '📱 快手', xiaohongshu: '📕 小红书',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  GENERATING: 'default', PUBLISHING: 'default',
  GENERATED: 'secondary', PUBLISHED: 'secondary',
  FAILED: 'destructive',
  DRAFT: 'outline', SCHEDULED: 'outline', CANCELLED: 'outline',
}

const statusLabels: Record<string, string> = {
  DRAFT: '草稿', GENERATING: '生成中', GENERATED: '已生成',
  SCHEDULED: '已排期', PUBLISHING: '发布中', PUBLISHED: '已发布',
  FAILED: '失败', CANCELLED: '已取消',
}

const statusIcons: Record<string, string> = {
  GENERATING: '⏳', PUBLISHING: '⏳',
  GENERATED: '🎥', PUBLISHED: '✅',
  FAILED: '❌', SCHEDULED: '📅',
  DRAFT: '📝', CANCELLED: '🚫',
}

interface ProjectCardProps {
  project: ProjectData
  onClick?: () => void
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const label = project.title || templateLabels[project.template] || project.template || '未命名'
  const status = project.status || 'DRAFT'
  const icon = statusIcons[status] || '📄'

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:border-primary transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
      onClick={onClick}
    >
      <div className="aspect-[16/10] bg-muted flex items-center justify-center text-3xl relative">
        {icon}
        {project.platform && (
          <span className="absolute top-2 left-2 bg-background/70 backdrop-blur text-muted-foreground px-2 py-0.5 rounded text-[10px]">
            {platformIcons[project.platform] || project.platform}
          </span>
        )}
      </div>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">{label}</span>
          <Badge variant={statusVariant[status] || 'outline'} className="shrink-0 text-[10px] h-4 px-1.5">
            {statusLabels[status] || status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{templateLabels[project.template] || project.template}</span>
          <span className="text-border">·</span>
          <span>{new Date(project.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export { templateLabels, platformIcons, statusLabels, statusVariant, statusIcons }
