interface QuickOptionsProps {
  options: string[];
  onSelect?: (option: string) => void;
}

export function QuickOptions({ options, onSelect }: QuickOptionsProps) {
  return (
    <div className="quick-options">
      {options.map((opt, i) => (
        <button key={i} className="quick-option" onClick={() => onSelect?.(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}
