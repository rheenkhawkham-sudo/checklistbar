interface Props {
  percent: number;
  size?: number;
}

export function CircularProgress({ percent, size = 160 }: Props) {
  const stroke = size < 120 ? 9 : 14;
  const isSmall = size < 120;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth={stroke} fill="none" className="opacity-40" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--progress-start)" />
            <stop offset="100%" stopColor="var(--progress-end)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={isSmall ? "text-lg font-bold tabular-nums" : "text-4xl font-bold tabular-nums"}>{percent}%</span>
        {!isSmall && <span className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Complete</span>}
      </div>
    </div>
  );
}
