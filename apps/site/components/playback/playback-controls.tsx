import "./playback.css";
import { Check, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@snackbit/opendil/ui";
import { HeroRate } from "./hero-rate";

export interface PlaybackControlsProps {
  rate: number;
  onRate: (rate: number) => void;
  running: boolean;
  complete: boolean;
  preparing: boolean;
  onPause: () => void;
  onReplay: () => void;
  onFinish: () => void;
  onReset: () => void;
  disabled?: boolean;
  canPause?: boolean;
}

export function PlaybackControls({
  rate,
  onRate,
  running,
  complete,
  preparing,
  onPause,
  onReplay,
  onFinish,
  onReset,
  disabled = false,
  canPause = true,
}: PlaybackControlsProps) {
  return (
    <>
      <HeroRate value={rate} onChange={onRate} />
      <Button
        size="xs"
        variant="ghost"
        onClick={onPause}
        disabled={disabled || complete || preparing || !canPause}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
        {running ? "Pause" : "Resume"}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={onReplay}
        disabled={disabled || preparing}
      >
        <RotateCcw size={14} />
        Replay
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={complete && !preparing ? onReset : onFinish}
        disabled={disabled && !complete}
      >
        {complete && !preparing ? <RotateCcw size={14} /> : <Check size={14} />}
        {complete && !preparing ? "Reset" : "Finish"}
      </Button>
    </>
  );
}
