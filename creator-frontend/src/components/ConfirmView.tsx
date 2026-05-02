import { useState, useEffect } from 'react';
import { getConfirmData } from '../services/api';
import { SchedulePicker } from './SchedulePicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { ConfirmData, ModelRecommendation, ModelField } from '../types';

const LABELS: Record<string, string> = {
  template: '模板类型', script: '视频文案', platforms: '目标平台',
  files: '素材文件', style: '风格偏好', tags: '话题标签',
  taskType: '任务类型', duration: '时长', model: '模型',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'platforms' && Array.isArray(value)) {
    const map: Record<string, string> = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书' };
    return value.map((v) => map[String(v)] || String(v)).join('、');
  }
  if (key === 'files' && Array.isArray(value)) {
    return value.map((f: { name: string }) => f.name).join('、');
  }
  if (key === 'taskType') {
    const map: Record<string, string> = {
      'text-to-video': '文生视频',
      'image-to-video': '图生视频',
      'text-to-image': '文生图',
      'video-to-video': '视频编辑'
    };
    return map[String(value)] || String(value);
  }
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '未指定');
}

interface ConfirmViewProps {
  sessionId: string;
  onBack: () => void;
  onSubmit: (scheduledAt: string | null) => void;
  recommendations?: ModelRecommendation[];
}

export function ConfirmView({ sessionId, onBack, onSubmit, recommendations = [] }: ConfirmViewProps) {
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [selectedRecIndex, setSelectedRecIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getConfirmData(sessionId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return (
    <div className="confirm-view">
      <Skeleton className="h-8 w-40 mx-auto" />
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
  if (error) return (
    <div className="confirm-view">
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <p style={{ color: 'var(--error)' }}>{error}</p>
          <Button variant="outline" onClick={onBack}>← 返回</Button>
        </CardContent>
      </Card>
    </div>
  );
  if (!data) return null;

  const items = data.items || {};
  const intent = (items.intent as Record<string, unknown>) || {};
  const currentRec = recommendations[selectedRecIndex];
  const hasTaskType = !!intent.taskType;

  const entries = Object.entries(items).filter(
    ([k, v]) =>
      k !== 'intent' && k !== 'phase' && k !== 'recommendations' && k !== 'selectedModel' &&
      v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );

  const intentEntries = Object.entries(intent).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== false
  );

  return (
    <div className="confirm-view">
      <h2 className="confirm-title">📋 需求确认</h2>
      <Card>
        <CardContent className="p-4 space-y-3">
          {hasTaskType && (
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary">
                {formatValue('taskType', intent.taskType)}
              </Badge>
              {currentRec && (
                <Badge variant="outline">{String(currentRec.name)}</Badge>
              )}
            </div>
          )}

          {intentEntries.map(([key, val]) => (
            <div key={key} className="confirm-item">
              <span className="label">{LABELS[key] || key}</span>
              <span className="value">{formatValue(key, val)}</span>
            </div>
          ))}

          {entries.map(([key, value]) => (
            <div key={key} className="confirm-item">
              <span className="label">{LABELS[key] || key}</span>
              <span className="value">{formatValue(key, value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {recommendations.length > 0 && (
        <div className="recommendations-section mt-3">
          <div className="text-sm font-medium mb-2 text-muted-foreground">
            🤖 AI 推荐模型
          </div>
          <div className="flex gap-2 flex-wrap">
            {recommendations.map((rec, idx) => (
              <button
                key={rec.endpoint}
                onClick={() => setSelectedRecIndex(idx)}
                className={`p-3 rounded-lg border text-left text-sm transition-colors min-w-[140px] ${
                  idx === selectedRecIndex
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-semibold">{rec.name}</div>
                <div className="text-xs text-muted-foreground">{rec.description}</div>
                {rec.estimatedCost !== undefined && (
                  <div className="text-xs mt-1 text-muted-foreground">
                    预估: {JSON.stringify(rec.estimatedCost)} RH币
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentRec?.fields && currentRec.fields.length > 0 && (
        <div className="params-section mt-3">
          <div className="text-sm font-medium mb-2 text-muted-foreground">
            ⚙️ 参数设置
          </div>
          <Card>
            <CardContent className="p-3 space-y-2">
              {currentRec.fields.map((field: ModelField) => (
                <div key={`${field.nodeId}-${field.fieldName}`} className="flex items-center gap-2 text-sm">
                  <span className="label min-w-[60px] text-muted-foreground">
                    {field.description || field.fieldName}
                  </span>
                  <span className="value">
                    {field.fieldValue || '(默认)'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <SchedulePicker onSelect={setScheduledAt} selected={scheduledAt} />

      {data.missing.length > 0 && (
        <div className="missing-section">
          <div className="missing-title">⚠ 以下信息尚未收集（不影响提交）</div>
          {data.missing.map((field) => (
            <div key={field} className="missing-item">· {LABELS[field] || field}</div>
          ))}
        </div>
      )}
      <div className="confirm-actions">
        <Button variant="outline" className="flex-1" onClick={onBack}>← 继续编辑</Button>
        <Button className="flex-1" onClick={() => onSubmit(scheduledAt)}>✓ 确认提交</Button>
      </div>
    </div>
  );
}
