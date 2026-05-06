import { useState, useEffect } from 'react'
import { updateModel, createModel, type AdminModel } from '@/services/admin-api'
import { X } from 'lucide-react'

interface Props {
  model: AdminModel | null
  isCreating: boolean
  onClose: () => void
  onSave: () => void
}

export function ModelEditPanel({ model, isCreating, onClose, onSave }: Props) {
  const [nameCn, setNameCn] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [category, setCategory] = useState('')
  const [taskType, setTaskType] = useState('')
  const [outputType, setOutputType] = useState('')
  const [status, setStatus] = useState('draft')
  const [visible, setVisible] = useState(false)
  const [endpoint, setEndpoint] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (model) {
      setNameCn(model.nameCn || '')
      setNameEn(model.nameEn || '')
      setCategory(model.category || '')
      setTaskType(model.taskType || '')
      setOutputType(model.outputType || '')
      setStatus(model.status || 'draft')
      setVisible(model.visible || false)
      setEndpoint(model.endpoint || '')
    } else {
      setNameCn('')
      setNameEn('')
      setCategory('')
      setTaskType('')
      setOutputType('')
      setStatus('draft')
      setVisible(false)
      setEndpoint('')
    }
  }, [model])

  const handleSave = async () => {
    setError('')
    setSaving(true)

    try {
      if (isCreating) {
        if (!endpoint.trim()) {
          setError('endpoint 为必填项')
          setSaving(false)
          return
        }
        await createModel({
          endpoint: endpoint.trim(),
          nameCn,
          nameEn,
          category,
          taskType,
          outputType,
          status: status as 'draft' | 'published' | 'disabled',
          visible,
        } as Partial<AdminModel>)
      } else if (model) {
        await updateModel(model.id, {
          nameCn,
          nameEn,
          category,
          taskType,
          outputType,
          status,
          visible,
        } as Partial<AdminModel>)
      }
      onSave()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{isCreating ? '新增模型' : '编辑模型'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {isCreating && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint *</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="模型 endpoint"
              />
            </div>
          )}

          {!isCreating && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint</label>
              <input
                value={endpoint}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">中文名</label>
            <input
              value={nameCn}
              onChange={(e) => setNameCn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="中文名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">英文名</label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="英文名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="RunningHub/xxx"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未设置</option>
              <option value="text-to-video">文生视频</option>
              <option value="image-to-video">图生视频</option>
              <option value="text-to-image">文生图</option>
              <option value="image-to-image">图生图</option>
              <option value="video-to-video">视频编辑</option>
              <option value="text-to-3d">文生3D</option>
              <option value="text-to-audio">文生音频</option>
              <option value="text-gen">文本生成</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">输出类型</label>
            <select
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">未设置</option>
              <option value="video">video</option>
              <option value="image">image</option>
              <option value="audio">audio</option>
              <option value="3d">3d</option>
              <option value="string">string</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="disabled">已禁用</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">前端可见</label>
            <button
              onClick={() => setVisible(!visible)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                visible ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  visible ? 'translate-x-[18px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>

          {model && model.params && Array.isArray(model.params) && model.params.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">参数列表（只读）</label>
              <div className="space-y-1 max-h-48 overflow-auto border border-gray-200 rounded-lg p-2">
                {model.params.map((p: Record<string, unknown>, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground py-1 border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-600">{String(p.fieldKey || p.label || '')}</span>
                    <span className="mx-1">·</span>
                    <span>{String(p.type || '')}</span>
                    {Boolean(p.required) && <span className="text-red-400 ml-1">*必填</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
