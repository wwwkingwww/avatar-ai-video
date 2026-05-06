import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchModels, fetchCategories, updateModel, deleteModel, batchOperation, type AdminModel } from '@/services/admin-api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ModelEditPanel } from './ModelEditPanel'
import { Search, Plus, Trash2 } from 'lucide-react'

const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  disabled: '已禁用',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  published: 'default',
  disabled: 'destructive',
}

const inputTypeIcons: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
}

export function ModelManager() {
  const [models, setModels] = useState<AdminModel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categories, setCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingModel, setEditingModel] = useState<AdminModel | null>(null)
  const [creating, setCreating] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const limit = 20

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchModels({ page, limit, search, category: categoryFilter, status: statusFilter })
      setModels(res.data || [])
      setTotalPages(res.meta.totalPages)
      setTotal(res.meta.total)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [page, search, categoryFilter, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    fetchCategories().then((res) => {
      if (res.success) setCategories(res.data)
    }).catch(() => {})
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
    }, 300)
  }

  useEffect(() => {
    setPage(1)
  }, [search, categoryFilter, statusFilter])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === models.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(models.map((m) => m.id)))
    }
  }

  const handleToggleVisible = async (model: AdminModel) => {
    try {
      await updateModel(model.id, { visible: !model.visible } as Partial<AdminModel>)
      loadData()
    } catch { /* ignore */ }
  }

  const handleBatch = async (action: 'publish' | 'disable') => {
    if (selected.size === 0) return
    setBatchLoading(true)
    try {
      await batchOperation([...selected], action)
      setSelected(new Set())
      loadData()
    } catch { /* ignore */ } finally { setBatchLoading(false) }
  }

  const handleDelete = async (model: AdminModel) => {
    if (!confirm(`确定删除模型 "${model.nameCn || model.endpoint}"？此操作不可撤销。`)) return
    try {
      await deleteModel(model.id)
      loadData()
    } catch { /* ignore */ }
  }

  const handleSave = () => {
    loadData()
    setEditingModel(null)
    setCreating(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="搜索模型名称 / endpoint..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c.replace('RunningHub/', '')}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
          <option value="disabled">已禁用</option>
        </select>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新增模型
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
          <button
            onClick={() => handleBatch('publish')}
            disabled={batchLoading}
            className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50"
          >
            批量发布
          </button>
          <button
            onClick={() => handleBatch('disable')}
            disabled={batchLoading}
            className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
          >
            批量禁用
          </button>
        </div>
      )}

      {loading && models.length === 0 ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={models.length > 0 && selected.size === models.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">模型名称</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">分类</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">任务类型</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">前端可见</th>
                  <th className="px-4 py-3 font-medium w-[140px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.nameCn || m.endpoint}</div>
                      <div className="text-xs text-muted-foreground">{m.endpoint}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {m.category.replace('RunningHub/', '')}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1">
                        {(m.inputTypes || []).map((t) => (
                          <span key={t} className="text-xs" title={t}>{inputTypeIcons[t] || '📝'}</span>
                        ))}
                        <span className="text-muted-foreground text-xs ml-1">
                          {m.taskType}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[m.status] || 'outline'}>
                        {statusLabels[m.status] || m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleVisible(m)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          m.visible ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                            m.visible ? 'translate-x-[18px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingModel(m)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          编辑
                        </button>
                        {m.status !== 'published' && (
                          <button
                            onClick={() => handleDelete(m)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-0.5"
                          >
                            <Trash2 className="h-3 w-3" />
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {models.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      暂无模型数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>共 {total} 个模型，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              上一页
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1
              if (totalPages > 5 && page > 3) {
                p = page - 2 + i
                if (p > totalPages) return null
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 border rounded text-xs ${
                    p === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {(editingModel || creating) && (
        <ModelEditPanel
          model={editingModel}
          isCreating={creating}
          onClose={() => { setEditingModel(null); setCreating(false) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
