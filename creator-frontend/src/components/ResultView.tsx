import type { TaskResult } from '../types';

interface ResultViewProps {
  result: TaskResult;
  onNewTask: () => void;
}

export function ResultView({ result, onNewTask }: ResultViewProps) {
  return (
    <div className="result-view">
      <div className="result-icon">✅</div>
      <h2 className="result-title">任务已提交</h2>
      <div className="result-info">
        <div>任务编号: <strong>{result.taskId}</strong></div>
        <div>预计完成: <strong>{result.estimatedMinutes} 分钟</strong></div>
        <div style={{ marginTop: 8, fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          视频正在生成中，完成后将自动发布到指定平台
        </div>
      </div>
      <div className="result-actions">
        <button className="btn-primary" onClick={onNewTask}>创建新任务</button>
      </div>
    </div>
  );
}
