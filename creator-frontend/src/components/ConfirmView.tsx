import { useState, useEffect } from 'react';
import { getConfirmData } from '../services/api';
import type { ConfirmData } from '../types';

const LABELS: Record<string, string> = {
  template: '模板类型', content: '视频文案', platforms: '目标平台',
  files: '素材文件', style: '风格偏好', tags: '话题标签',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'platforms' && Array.isArray(value)) {
    const map: Record<string, string> = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书' };
    return value.map((v) => map[String(v)] || String(v)).join('、');
  }
  if (key === 'files' && Array.isArray(value)) {
    return value.map((f: { name: string }) => f.name).join('、');
  }
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '未指定');
}

interface ConfirmViewProps {
  sessionId: string;
  onBack: () => void;
  onSubmit: () => void;
}

export function ConfirmView({ sessionId, onBack, onSubmit }: ConfirmViewProps) {
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getConfirmData(sessionId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return <div className="confirm-view"><p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>加载确认信息...</p></div>;
  if (error) return <div className="confirm-view"><p style={{ textAlign: 'center', color: 'var(--error)' }}>{error}</p><div className="confirm-actions"><button className="btn-back" onClick={onBack}>← 返回</button></div></div>;
  if (!data) return null;

  const entries = Object.entries(data.items).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  );

  return (
    <div className="confirm-view">
      <h2 className="confirm-title">📋 需求确认</h2>
      <div className="confirm-card">
        {entries.map(([key, value]) => (
          <div key={key} className="confirm-item">
            <span className="label">{LABELS[key] || key}</span>
            <span className="value">{formatValue(key, value)}</span>
          </div>
        ))}
      </div>
      {data.missing.length > 0 && (
        <div className="missing-section">
          <div className="missing-title">⚠ 以下信息尚未收集（不影响提交）</div>
          {data.missing.map((field) => (
            <div key={field} className="missing-item">· {LABELS[field] || field}</div>
          ))}
        </div>
      )}
      <div className="confirm-actions">
        <button className="btn-back" onClick={onBack}>← 继续编辑</button>
        <button className="btn-submit" onClick={onSubmit}>✓ 确认提交</button>
      </div>
    </div>
  );
}
