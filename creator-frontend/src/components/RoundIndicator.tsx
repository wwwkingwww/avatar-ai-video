const MAX_ROUNDS = 4;

interface RoundIndicatorProps {
  round: number;
}

export function RoundIndicator({ round }: RoundIndicatorProps) {
  return (
    <div className="round-indicator">
      <div className="round-dots">
        {Array.from({ length: MAX_ROUNDS }, (_, i) => {
          const r = i + 1;
          let cls = 'round-dot';
          if (r < round) cls += ' done';
          else if (r === round) cls += ' active';
          return <div key={r} className={cls} />;
        })}
      </div>
      <span className="round-label">第 {round}/{MAX_ROUNDS} 轮</span>
    </div>
  );
}
