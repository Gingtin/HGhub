import React, { useRef, useState } from "react";
import { fmtTime } from "../api";
import { usePlaybackProgress } from "../playbackStore";
import { IBoltF, IPauseF, IPlayF } from "../icons";

type MobileFeedMiniBarProps = {
  duration: number;
  rotated?: boolean;
  onSeek: (target: number) => void;
  onTrace?: (event: string, data?: Record<string, unknown>) => void;
};

export function MobileFeedMiniBar({ duration, rotated, onSeek, onTrace }: MobileFeedMiniBarProps) {
  const { time } = usePlaybackProgress();
  const [barPct, setBarPct] = useState<number | null>(null);
  const barScrub = useRef(false);

  const barPctAt = (barEl: HTMLElement | null, clientX: number, clientY: number) => {
    const r = barEl?.getBoundingClientRect();
    if (!r) return null;
    const span = rotated ? r.height : r.width;
    if (!span) return null;
    const raw = rotated ? (clientY - r.top) / span : (clientX - r.left) / span;
    return Math.max(0, Math.min(1, raw));
  };

  const barSeekTo = (barEl: HTMLElement | null, clientX: number, clientY: number) => {
    const pct = barPctAt(barEl, clientX, clientY);
    if (pct == null) return null;
    setBarPct(pct);
    return pct;
  };

  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onTrace?.("seek.input.down", { input: "mobile_bar" });
    barScrub.current = true;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    barSeekTo(el, e.clientX, e.clientY);
  };

  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barScrub.current) return;
    e.stopPropagation();
    onTrace?.("seek.input.move", { input: "mobile_bar" });
    barSeekTo(e.currentTarget as HTMLElement, e.clientX, e.clientY);
  };

  const onBarUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barScrub.current) return;
    barScrub.current = false;
    e.stopPropagation();
    const pct = barPctAt(e.currentTarget as HTMLElement, e.clientX, e.clientY) ?? barPct;
    setBarPct(null);
    if (pct != null && duration > 0) {
      const target = Math.max(0, Math.min(duration - 0.15, pct * duration));
      onTrace?.("seek.input.up", { input: "mobile_bar", target });
      onSeek(target);
    }
  };

  const barProgress = barPct ?? (duration ? time / duration : 0);

  return (
    <div className="mx-4 mt-1.5 relative" style={{ height: 22, touchAction: "none" }}
      onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}>
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full transition-all ${barPct !== null ? "h-[5px]" : "h-[2.5px]"}`}
        style={{ background: "rgba(255,255,255,.3)" }}>
        <div className="h-full rounded-full bg-white"
          style={{ width: `${barProgress * 100}%`, transition: barPct !== null ? "none" : "width .25s linear" }} />
      </div>
      {barPct !== null && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2.5 py-1 rounded-md hg-chip-strong backdrop-blur-md text-[12px] font-bold tabular-nums whitespace-nowrap">
          {fmtTime(barPct * (duration || 0))} / {fmtTime(duration)}
        </div>
      )}
    </div>
  );
}

type MobileFullscreenControlsProps = {
  rotated: boolean;
  vpLandscape: boolean;
  duration: number;
  paused: boolean;
  rate: number;
  effRate: number;
  speedLock: boolean;
  setSpeedLock: (v: boolean) => void;
  setRate: (r: number) => void;
  onTogglePlay: () => void;
  onSeek: (target: number) => void;
  onTrace?: (event: string, data?: Record<string, unknown>) => void;
};

export function MobileFullscreenControls({
  rotated, vpLandscape, duration, paused, rate, effRate, speedLock,
  setSpeedLock, setRate, onTogglePlay, onSeek, onTrace,
}: MobileFullscreenControlsProps) {
  const { time } = usePlaybackProgress();
  const [barPct, setBarPct] = useState<number | null>(null);
  const barScrub = useRef(false);

  const barPctAt = (barEl: HTMLElement | null, clientX: number, clientY: number) => {
    const r = barEl?.getBoundingClientRect();
    if (!r) return null;
    const span = rotated ? r.height : r.width;
    if (!span) return null;
    const raw = rotated ? (clientY - r.top) / span : (clientX - r.left) / span;
    return Math.max(0, Math.min(1, raw));
  };

  const barSeekTo = (barEl: HTMLElement | null, clientX: number, clientY: number) => {
    const pct = barPctAt(barEl, clientX, clientY);
    if (pct == null) return null;
    setBarPct(pct);
    return pct;
  };

  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onTrace?.("seek.input.down", { input: "mobile_bar" });
    barScrub.current = true;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    barSeekTo(el, e.clientX, e.clientY);
  };

  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barScrub.current) return;
    e.stopPropagation();
    onTrace?.("seek.input.move", { input: "mobile_bar" });
    barSeekTo(e.currentTarget as HTMLElement, e.clientX, e.clientY);
  };

  const onBarUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barScrub.current) return;
    barScrub.current = false;
    e.stopPropagation();
    const pct = barPctAt(e.currentTarget as HTMLElement, e.clientX, e.clientY) ?? barPct;
    setBarPct(null);
    if (pct != null && duration > 0) {
      const target = Math.max(0, Math.min(duration - 0.15, pct * duration));
      onTrace?.("seek.input.up", { input: "mobile_bar", target });
      onSeek(target);
    }
  };

  const barProgress = barPct ?? (duration ? time / duration : 0);

  return (
    <>
      <div className="absolute inset-x-0 z-30 px-4" style={{ bottom: rotated || vpLandscape ? 46 : "calc(var(--sab, 0px) + 52px)", height: 26 }}>
        <div className="relative h-full" style={{ touchAction: "none" }}
          onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}>
          <div className={`absolute inset-x-0 bottom-[10px] rounded-full transition-all ${barPct !== null ? "h-[5px]" : "h-[3px]"}`}
            style={{ background: "rgba(255,255,255,.3)" }}>
            <div className="h-full rounded-full bg-white" style={{ width: `${barProgress * 100}%` }} />
          </div>
          {barPct !== null && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2.5 py-1 rounded-md hg-chip-strong backdrop-blur-md text-[12px] font-bold tabular-nums whitespace-nowrap">
              {fmtTime(barPct * (duration || 0))} / {fmtTime(duration)}
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 z-40 flex items-center gap-3 px-4"
        style={{ bottom: rotated || vpLandscape ? 10 : "calc(var(--sab, 0px) + 10px)" }}>
        <button onClick={onTogglePlay}
          className="hg-chip shrink-0 w-9 h-9 rounded-full flex items-center justify-center pressable">
          {paused ? <IPlayF size={18} /> : <IPauseF size={17} />}
        </button>
        <span className="shrink-0 text-[11.5px] font-semibold hg-ink-2 tabular-nums">
          {fmtTime(barPct !== null ? barPct * (duration || 0) : time)}
        </span>
        <button
          onClick={() => {
            if (speedLock) { setSpeedLock(false); return; }
            const seq = [1, 1.25, 1.5, 2];
            const idx = seq.indexOf(rate);
            setRate(seq[(idx + 1) % seq.length]);
          }}
          className={`ml-auto shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[12px] font-bold pressable ${effRate !== 1 ? "bg-primary text-on-primary" : "hg-chip hg-ink-2"}`}>
          <IBoltF size={12} />{effRate}x
        </button>
        <span className="shrink-0 text-[11.5px] hg-ink-4 tabular-nums">{fmtTime(duration)}</span>
      </div>
    </>
  );
}
