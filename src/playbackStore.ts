import { useSyncExternalStore } from "react";

export type PlaybackProgress = {
  time: number;
  duration: number;
  buffered: number;
};

type Listener = () => void;

class PlaybackProgressStore {
  private current: PlaybackProgress = { time: 0, duration: 0, buffered: 0 };
  private listeners = new Set<Listener>();

  getSnapshot = (): PlaybackProgress => {
    return this.current;
  };

  getTime = (): number => {
    return this.current.time;
  };

  setTime = (time: number) => {
    if (this.current.time === time) return;
    this.current = { ...this.current, time };
    this.notify();
  };

  setDuration = (duration: number) => {
    if (this.current.duration === duration) return;
    this.current = { ...this.current, duration };
    this.notify();
  };

  setBuffered = (buffered: number) => {
    if (this.current.buffered === buffered) return;
    this.current = { ...this.current, buffered };
    this.notify();
  };

  setProgress = (time: number, duration?: number, buffered?: number) => {
    let changed = false;
    const next = { ...this.current };
    if (time !== next.time) {
      next.time = time;
      changed = true;
    }
    if (duration !== undefined && duration !== next.duration) {
      next.duration = duration;
      changed = true;
    }
    if (buffered !== undefined && buffered !== next.buffered) {
      next.buffered = buffered;
      changed = true;
    }
    if (changed) {
      this.current = next;
      this.notify();
    }
  };

  reset = () => {
    this.current = { time: 0, duration: 0, buffered: 0 };
    this.notify();
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const playbackProgressStore = new PlaybackProgressStore();

export function usePlaybackProgress(): PlaybackProgress {
  return useSyncExternalStore(
    playbackProgressStore.subscribe,
    playbackProgressStore.getSnapshot,
  );
}

export function usePlaybackTime(): number {
  return useSyncExternalStore(
    playbackProgressStore.subscribe,
    playbackProgressStore.getTime,
  );
}
