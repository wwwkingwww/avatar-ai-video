const STEPS = ['描述需求', '确认参数', '提交生成']

interface StepIndicatorProps {
  step: number
}

export function StepIndicator({ step }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {STEPS.map((_, i) => (
        <span key={i} className={`step-dot ${i + 1 <= step ? 'active' : ''} ${i + 1 < step ? 'done' : ''}`} />
      ))}
      <span className="step-label">{STEPS[step - 1]}</span>
    </div>
  )
}
