import { useState } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'templates' | 'my-works' | 'featured'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'templates', label: '官方模板' },
  { key: 'my-works', label: '我的作品' },
  { key: 'featured', label: '精选推荐' },
]

const TEMPLATES = [
  { icon: '🎤', label: '口播带货', desc: '真人出镜 · 30 秒', highlight: true },
  { icon: '📦', label: '产品发布', desc: '电影级特写 · 45 秒' },
  { icon: '📱', label: '应用演示', desc: '录屏风格 · 60 秒' },
  { icon: '🎬', label: 'Vlog 日常', desc: '生活记录 · 30 秒' },
  { icon: '🎮', label: '游戏集锦', desc: '高光时刻 · 30 秒' },
  { icon: '🍔', label: '美食探店', desc: '诱人特写 · 45 秒' },
  { icon: '💄', label: '美妆教程', desc: '步骤演示 · 60 秒' },
  { icon: '🏠', label: '房屋展示', desc: '全景导览 · 60 秒' },
]

const MY_WORKS_EXAMPLE = [
  { title: '新品发布宣传片', platform: '抖音', time: '5 小时前', published: true },
]

const FEATURED = [
  { title: '数码测评', author: '@创作者_A', views: '1.2 万播放' },
  { title: '街头美食探', author: '@创作者_B', views: '8.5 千播放' },
  { title: '开箱魔盒', author: '@创作者_C', views: '6.2 千播放' },
  { title: '功能演示', author: '@创作者_D', views: '3.8 千播放' },
]

interface PortfolioGridProps {
  onTemplateClick?: (label: string) => void
}

export function PortfolioGrid({ onTemplateClick }: PortfolioGridProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('templates')

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border/30">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm transition-colors relative -mb-px',
              'font-display tracking-wide',
              activeTab === tab.key
                ? 'text-primary border-b-2 border-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {activeTab === 'templates' &&
          TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              onClick={() => onTemplateClick?.(tpl.label)}
              className={cn(
                'group flex flex-col rounded-lg border p-4 transition-all duration-300 hover:-translate-y-0.5',
                tpl.highlight
                  ? 'bg-primary/5 border-primary/20 shadow-md shadow-primary/5'
                  : 'bg-card/30 border-border/30 hover:border-border/60',
              )}
            >
              <div className={cn(
                'w-full aspect-cinema rounded-md flex items-center justify-center text-3xl mb-3',
                tpl.highlight
                  ? 'bg-gradient-to-br from-primary/10 to-amber-600/5'
                  : 'bg-gradient-to-br from-muted/20 to-muted/5',
              )}>
                {tpl.icon}
              </div>
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {tpl.label}
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">
                {tpl.desc}
              </span>
            </button>
          ))}

        {activeTab === 'my-works' && (
          <>
            {MY_WORKS_EXAMPLE.map((work) => (
              <div key={work.title} className="relative group flex flex-col rounded-lg border border-border/30 bg-card/30 overflow-hidden hover:border-border/60 transition-colors">
                <div className="aspect-cinema bg-black/40 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                  <div className="h-10 w-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center text-sm">
                    ▶
                  </div>
                </div>
                {work.published && (
                  <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-500/90 text-white">
                    已发布
                  </span>
                )}
                <div className="p-3">
                  <p className="text-sm text-foreground font-medium">{work.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{work.platform} · {work.time}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 bg-card/10 min-h-[120px] opacity-40 hover:opacity-60 transition-opacity cursor-pointer">
              <span className="text-2xl text-muted-foreground">+</span>
              <span className="text-xs text-muted-foreground font-display italic">创建新作品</span>
            </div>
          </>
        )}

        {activeTab === 'featured' &&
          FEATURED.map((work) => (
            <div key={work.title} className="group flex flex-col rounded-lg border border-border/30 bg-card/30 overflow-hidden hover:border-border/60 transition-colors">
              <div className="aspect-cinema bg-gradient-to-br from-amber-500/5 to-amber-700/5 flex items-center justify-center text-2xl">
                🏆
              </div>
              <div className="p-3">
                <p className="text-sm text-foreground font-medium">{work.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{work.author} · {work.views}</p>
              </div>
            </div>
          ))}
      </div>

      <p className="text-center text-xs text-muted-foreground font-display italic">
        {activeTab === 'templates' && '点击模板自动填入对话 —'}
        {activeTab === 'my-works' && '登录后查看完整作品集 —'}
        {activeTab === 'featured' && '每周精选 · 社区投稿 —'}
      </p>
    </div>
  )
}
