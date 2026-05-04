import { useState } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'templates' | 'my-works' | 'featured'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'templates', label: '官方模板', icon: '🎬' },
  { key: 'my-works', label: '我的作品', icon: '📁' },
  { key: 'featured', label: '优秀作品', icon: '⭐' },
]

const TEMPLATES = [
  { icon: '🎤', label: '口播带货', desc: '真人出镜 · 30s', highlight: true },
  { icon: '📦', label: '产品开箱', desc: '特写镜头 · 45s' },
  { icon: '📱', label: '功能演示', desc: 'APP 界面 · 60s' },
  { icon: '🎬', label: 'Vlog 模板', desc: '日常记录 · 30s' },
  { icon: '🎮', label: '游戏集锦', desc: '精彩操作 · 30s' },
  { icon: '🍔', label: '美食探店', desc: '诱人特写 · 45s' },
  { icon: '💄', label: '美妆教程', desc: '步骤演示 · 60s' },
  { icon: '🏠', label: '房屋展示', desc: '全景导览 · 60s' },
]

const MY_WORKS_EXAMPLE = [
  { title: '产品介绍视频', platform: '抖音', time: '5小时前', published: true },
]

const FEATURED = [
  { title: '科技测评', author: '@创作者A', views: '1.2w 播放' },
  { title: '美食探店', author: '@创作者B', views: '8.5k 播放' },
  { title: '产品开箱', author: '@创作者C', views: '6.2k 播放' },
  { title: '功能演示', author: '@创作者D', views: '3.8k 播放' },
]

interface PortfolioGridProps {
  onTemplateClick?: (label: string) => void
}

export function PortfolioGrid({ onTemplateClick }: PortfolioGridProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('templates')

  return (
    <div className="space-y-4">
      <div className="flex gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm rounded-t-lg transition-colors',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary font-medium border-b-2 border-primary'
                : 'text-white/25 hover:text-white/50',
            )}
          >
            <span className="text-xs">{tab.icon}</span>
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
                'flex flex-col items-center gap-1 rounded-lg border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 text-left',
                tpl.highlight
                  ? 'bg-primary/5 border-primary/15'
                  : 'bg-white/[0.02] border-white/5',
              )}
            >
              <div className={cn(
                'w-full h-14 rounded-md flex items-center justify-center text-2xl mb-1',
                tpl.highlight
                  ? 'bg-gradient-to-br from-primary/20 to-purple-500/10'
                  : 'bg-gradient-to-br from-cyan-500/10 to-cyan-500/5',
              )}>
                {tpl.icon}
              </div>
              <span className="text-sm font-semibold text-foreground">{tpl.label}</span>
              <span className="text-xs text-white/25">{tpl.desc}</span>
            </button>
          ))}

        {activeTab === 'my-works' && (
          <>
            {MY_WORKS_EXAMPLE.map((work) => (
              <div key={work.title} className="relative flex flex-col rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
                <div className="h-14 bg-black/30 flex items-center justify-center text-lg">▶</div>
                {work.published && (
                  <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/90 text-white">已发布</span>
                )}
                <div className="p-3">
                  <p className="text-sm text-foreground">{work.title}</p>
                  <p className="text-xs text-white/20">{work.platform} · {work.time}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/5 bg-white/[0.01] min-h-[100px] opacity-40 hover:opacity-60 transition-opacity cursor-pointer">
              <span className="text-xl">＋</span>
              <span className="text-xs text-white/20">创建新作品</span>
            </div>
          </>
        )}

        {activeTab === 'featured' &&
          FEATURED.map((work) => (
            <div key={work.title} className="flex flex-col rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
              <div className="h-14 bg-gradient-to-br from-amber-500/10 to-amber-500/5 flex items-center justify-center text-lg">🏆</div>
              <div className="p-3">
                <p className="text-sm text-foreground">{work.title}</p>
                <p className="text-xs text-white/20">{work.author} · {work.views}</p>
              </div>
            </div>
          ))}
      </div>

      {activeTab === 'templates' && (
        <p className="text-center text-xs text-white/10 hover:text-white/25 cursor-pointer transition-colors">
          查看更多模板 →
        </p>
      )}
      {activeTab === 'my-works' && (
        <p className="text-center text-xs text-white/10">登录后可查看全部作品</p>
      )}
      {activeTab === 'featured' && (
        <p className="text-center text-xs text-white/10">每周精选 · 社区投稿</p>
      )}
    </div>
  )
}
