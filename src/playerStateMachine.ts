/**
 * 播放器确定性有限状态机 (Finite State Machine)
 * 统一收敛分散在 Feed / Player / VideoSurface 中的 playing/waiting/paused/err/playTry 竞争态
 */

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "switching_line"
  | "error";

export type PlaybackMachineState = {
  status: PlaybackStatus;
  error: string | null;
  /** 最近一次状态流转发生的时间戳 */
  lastTransitionAt: number;
};

export type PlaybackEvent =
  | { type: "LOAD_START" }
  | { type: "CAN_PLAY" }
  | { type: "PLAYING" }
  | { type: "PAUSE" }
  | { type: "WAITING" }
  | { type: "SEEKING"; target: number }
  | { type: "SEEKED" }
  | { type: "ERROR"; error: string }
  | { type: "SWITCH_LINE" }
  | { type: "RETRY" }
  | { type: "RESET" };

export const INITIAL_MACHINE_STATE: PlaybackMachineState = {
  status: "idle",
  error: null,
  lastTransitionAt: Date.now(),
};

export function playerStateReducer(
  current: PlaybackMachineState,
  event: PlaybackEvent,
): PlaybackMachineState {
  const now = Date.now();
  switch (event.type) {
    case "LOAD_START":
      return { status: "loading", error: null, lastTransitionAt: now };

    case "CAN_PLAY":
      if (current.status === "loading") {
        return { ...current, status: "buffering", lastTransitionAt: now };
      }
      return current;

    case "PLAYING":
      return { status: "playing", error: null, lastTransitionAt: now };

    case "PAUSE":
      // 如果已经处于 error 态，不要被 pause 冲掉
      if (current.status === "error") return current;
      return { status: "paused", error: null, lastTransitionAt: now };

    case "WAITING":
    case "SEEKING":
      // 避免在错误态下被底层的 waiting 事件冲掉报错面板
      if (current.status === "error") return current;
      return { ...current, status: "buffering", lastTransitionAt: now };

    case "SEEKED":
      if (current.status === "buffering") {
        // seeked 后如果没报错，保持 buffering 等待 playing 事件唤醒
        return current;
      }
      return current;

    case "ERROR":
      return { status: "error", error: event.error, lastTransitionAt: now };

    case "SWITCH_LINE":
      return { status: "switching_line", error: null, lastTransitionAt: now };

    case "RETRY":
      return { status: "loading", error: null, lastTransitionAt: now };

    case "RESET":
      return { status: "idle", error: null, lastTransitionAt: now };

    default:
      return current;
  }
}

/* 状态断言辅助函数 */
export const isBufferingOrLoading = (s: PlaybackStatus): boolean =>
  s === "loading" || s === "buffering" || s === "switching_line";

export const isPlaybackActive = (s: PlaybackStatus): boolean =>
  s === "playing";

export const isPlaybackPaused = (s: PlaybackStatus): boolean =>
  s === "paused";

export const hasPlaybackError = (s: PlaybackStatus): boolean =>
  s === "error";
