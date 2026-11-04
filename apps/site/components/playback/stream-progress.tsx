import "./playback.css";
export interface StreamProgressProps {
  fraction: number;
  run: number;
}

export function StreamProgress({ fraction, run }: StreamProgressProps) {
  return (
    <div
      className="od-stream-progress"
      role="progressbar"
      aria-label="Demo source received"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
    >
      <span key={run} style={{ transform: `scaleX(${fraction})` }} />
    </div>
  );
}
