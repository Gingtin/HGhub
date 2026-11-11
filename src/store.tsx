import React, { useEffect } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { api, platform as envPlatform } from "./api";
import { isStrictSecurity, setStrictSecurity as setHtmlStrictSecurity } from "./html";
import type { User } from "./types";

export type Platform = "android" | "ios" | "windows" | "macos" | "linux";
export type Theme = "dark" | "light";
export type Tab = "home" | "search" | "category" | "profile";
export type HomeMode = "hall" | "feed";

/** 播放页上下文：ids 是来源列表，index 是当前条目。 */
export type FeedContext = {
  kind: "feed";
  key: string;
  videoIds: number[];
  index: number;
  title: string;
  source: string;
  feedKind?: "video" | "post";
  /** 从观看记录续播：起始集数与秒数 */
  startEp?: number;
  startTime?: number;
};

export type Page =
  | FeedContext
  | { kind: "channel"; key: string; cate: string; name: string }
  | { kind: "ranks"; key: string }
  | { kind: "settings"; key: string }
  | { kind: "posts"; key: string }
  | { kind: "post"; key: string; id: number };

export type PageInput =
  | { kind: "feed"; videoIds: number[]; index: number; title: string; source?: string; feedKind?: "video" | "post"; startEp?: number; startTime?: number }
  | { kind: "channel"; cate: string; name: string }
  | { kind: "ranks" }
  | { kind: "settings" }
  | { kind: "posts" }
  | { kind: "post"; id: number };

export type Toast = { id: number; msg: string; icon?: "ok" | "heart" | "star" | "info" };

/** 观看记录：看到第几集、第几秒（`dur` 用来判断是否已看完） */
export type WatchProgress = { id: number; ep: number; t: number; dur: number; at: number };

type Persist = {
  likes: number[];
  favs: number[];
  history: WatchProgress[];
  follows: number[];
  muted: boolean;
  muteOnStartup: boolean;
  volume: number;
  searchHist: string[];
  homeMode?: HomeMode;
  autoNext?: boolean;
  screenDim?: number;
};

const LS = "hghub_app_v1";
const DEFAULTS: Persist = {
  likes: [], favs: [], history: [], follows: [],
  muted: true, muteOnStartup: true, volume: 0.7, searchHist: [],
  homeMode: "hall",
  autoNext: true,
  screenDim: 0,
};

/** 旧版本 history 是 number[]，读出来时升级成带进度的结构 */
function normalizeHistory(raw: unknown): WatchProgress[] {
  if (!Array.isArray(raw)) return [];
  const out: WatchProgress[] = [];
  raw.forEach((item, i) => {
    if (typeof item === "number") {
      out.push({ id: item, ep: 1, t: 0, dur: 0, at: Date.now() - i });
      return;
    }
    const h = item as Partial<WatchProgress> | null;
    if (h && typeof h.id === "number") {
      out.push({ id: h.id, ep: Number(h.ep) || 1, t: Number(h.t) || 0, dur: Number(h.dur) || 0, at: Number(h.at) || Date.now() - i });
    }
  });
  return out;
}

function loadPersist(): Persist {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return DEFAULTS;
    const p = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persist>) };
    const muteOnStartup = p.muteOnStartup !== false;
    const autoNext = p.autoNext !== false;
    const screenDim = typeof p.screenDim === "number" ? Math.max(0, Math.min(0.75, p.screenDim)) : 0;
    const homeMode = (p.homeMode === "feed" ? "feed" : "hall") as HomeMode;
    return { ...p, muteOnStartup, autoNext, screenDim, muted: muteOnStartup || p.muted === true, history: normalizeHistory(p.history), homeMode };
  } catch {
    return DEFAULTS;
  }
}

function savePersist(p: Partial<Persist>) {
  try {
    const current = loadPersist();
    localStorage.setItem(LS, JSON.stringify({ ...current, ...p }));
  } catch {
    /* ignore */
  }
}

function readTheme(): Theme {
  try {
    return localStorage.getItem("hghub_theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.classList.add(`plat-${envPlatform}`);
  document.documentElement.style.colorScheme = theme;
}

export type Store = {
  platform: Platform;
  theme: Theme; setTheme: (t: Theme) => void;
  tab: Tab; setTab: (t: Tab) => void;
  stack: Page[]; push: (p: PageInput) => void; pop: () => void;
  user: User | null; setUser: (u: User | null) => void;
  loginOpen: boolean; setLoginOpen: (b: boolean) => void;
  logout: () => Promise<void>;
  likes: number[]; favs: number[]; history: WatchProgress[]; follows: number[];
  isLiked: (id: number) => boolean; isFav: (id: number) => boolean;
  toggleLikeLocal: (id: number) => boolean;
  toggleFavLocal: (id: number) => boolean;
  /** 记一条观看记录；`ep/t/dur` 省略时保留原进度，`ep` 变了就把进度归零 */
  addHistory: (id: number, ep?: number, t?: number, dur?: number) => void;
  clearHistory: () => void;
  toggleFollowLocal: (uid: number) => boolean;
  theater: boolean; setTheater: (v: boolean | ((p: boolean) => boolean)) => void;
  fs: boolean; setFs: (v: boolean | ((p: boolean) => boolean)) => void;
  /** 清屏模式（单击屏幕消除所有控件，只保留纯视频内容） */
  clean: boolean; setClean: (v: boolean | ((p: boolean) => boolean)) => void;
  muted: boolean; setMuted: (v: boolean | ((p: boolean) => boolean)) => void;
  muteOnStartup: boolean; setMuteOnStartup: (on: boolean) => void;
  homeMode: HomeMode; setHomeMode: (mode: HomeMode) => void;
  autoNext: boolean; setAutoNext: (v: boolean) => void;
  screenDim: number; setScreenDim: (v: number) => void;
  sleepTimerMinutes: number | null;
  sleepTimerDeadline: number | null;
  setSleepTimer: (m: number | null) => void;
  exportUserData: () => string;
  importUserData: (raw: string | Record<string, unknown>) => { ok: boolean; count: number };
  volume: number; setVolume: (v: number) => void;
  searchHist: string[]; addSearch: (q: string) => void; clearSearchHist: () => void;
  strictSecurity: boolean; strictSecurityReady: boolean; securityPending: boolean; cliRelaxed: boolean; setStrictSecurity: (on: boolean) => Promise<void>;
  toasts: Toast[]; toast: (msg: string, icon?: Toast["icon"]) => void;
};

import type { StoreApi } from "zustand";

type StoreHook = {
  <U>(selector: (state: Store) => U): U;
  (): Store;
  getState: () => Store;
  setState: StoreApi<Store>["setState"];
  subscribe: StoreApi<Store>["subscribe"];
  getInitialState: () => Store;
};

let seq = 0;
let toastSeq = 0;
const initialPersist = loadPersist();

export const useStore: StoreHook = create<Store>((set, get) => ({
  platform: envPlatform,
  theme: readTheme(),
  setTheme: (theme: Theme) => {
    applyTheme(theme);
    try { localStorage.setItem("hghub_theme", theme); } catch { /* ignore */ }
    set({ theme });
  },
  tab: "home",
  setTab: (tab: Tab) => set({ tab, stack: [], clean: false }),
  stack: [],
  push: (pg: PageInput) => set((s) => ({
    clean: false,
    stack: [...s.stack, { ...pg, key: `p${++seq}` } as Page],
  })),
  pop: () => set((s) => ({
    clean: false,
    stack: s.stack.slice(0, -1),
  })),
  user: null,
  setUser: (user: User | null) => set({ user }),
  loginOpen: false,
  setLoginOpen: (loginOpen: boolean) => set({ loginOpen }),
  logout: async () => {
    try { await api.logout(); } catch { /* ignore */ }
    get().setUser(null);
    get().toast("已退出登录", "info");
  },
  likes: initialPersist.likes,
  favs: initialPersist.favs,
  history: initialPersist.history,
  follows: initialPersist.follows,
  isLiked: (id: number) => get().likes.includes(id),
  isFav: (id: number) => get().favs.includes(id),
  toggleLikeLocal: (id: number) => {
    let on = false;
    set((s) => {
      on = !s.likes.includes(id);
      const likes = on ? [id, ...s.likes] : s.likes.filter((x) => x !== id);
      savePersist({ likes });
      return { likes };
    });
    return on;
  },
  toggleFavLocal: (id: number) => {
    let on = false;
    set((s) => {
      on = !s.favs.includes(id);
      const favs = on ? [id, ...s.favs] : s.favs.filter((x) => x !== id);
      savePersist({ favs });
      return { favs };
    });
    return on;
  },
  toggleFollowLocal: (uid: number) => {
    let on = false;
    set((s) => {
      on = !s.follows.includes(uid);
      const follows = on ? [uid, ...s.follows] : s.follows.filter((x) => x !== uid);
      savePersist({ follows });
      return { follows };
    });
    return on;
  },
  addHistory: (id: number, ep?: number, t?: number, dur?: number) => {
    if (!id) return;
    set((s) => {
      const prev = s.history.find((x) => x.id === id);
      const epChanged = ep !== undefined && prev !== undefined && prev.ep !== ep;
      const entry: WatchProgress = {
        id,
        ep: ep ?? prev?.ep ?? 1,
        t: epChanged ? 0 : (t ?? prev?.t ?? 0),
        dur: dur ?? prev?.dur ?? 0,
        at: Date.now(),
      };
      const history = [entry, ...s.history.filter((x) => x.id !== id)].slice(0, 80);
      savePersist({ history });
      return { history };
    });
  },
  clearHistory: () => {
    savePersist({ history: [] });
    set({ history: [] });
  },
  theater: false,
  setTheater: (v) => set((s) => ({ theater: typeof v === "function" ? v(s.theater) : v })),
  fs: false,
  setFs: (v) => set((s) => {
    const next = typeof v === "function" ? v(s.fs) : v;
    if (!next) {
      invoke("set_orientation", { landscape: false }).catch(() => {});
      try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
    }
    return { fs: next };
  }),
  clean: false,
  setClean: (v) => set((s) => ({ clean: typeof v === "function" ? v(s.clean) : v })),
  muted: initialPersist.muted,
  setMuted: (v) => set((s) => {
    const muted = typeof v === "function" ? v(s.muted) : v;
    savePersist({ muted });
    return { muted };
  }),
  muteOnStartup: initialPersist.muteOnStartup,
  setMuteOnStartup: (muteOnStartup) => {
    savePersist({ muteOnStartup });
    set({ muteOnStartup });
  },
  homeMode: initialPersist.homeMode || "hall",
  setHomeMode: (homeMode: HomeMode) => {
    savePersist({ homeMode });
    set({ homeMode });
  },
  autoNext: initialPersist.autoNext !== false,
  setAutoNext: (autoNext: boolean) => {
    savePersist({ autoNext });
    set({ autoNext });
  },
  screenDim: initialPersist.screenDim || 0,
  setScreenDim: (screenDim: number) => {
    const v = Math.max(0, Math.min(0.75, screenDim));
    savePersist({ screenDim: v });
    set({ screenDim: v });
  },
  sleepTimerMinutes: null,
  sleepTimerDeadline: null,
  setSleepTimer: (m: number | null) => {
    if (m === null) {
      set({ sleepTimerMinutes: null, sleepTimerDeadline: null });
    } else if (m === -1) {
      set({ sleepTimerMinutes: -1, sleepTimerDeadline: null });
    } else {
      set({ sleepTimerMinutes: m, sleepTimerDeadline: Date.now() + m * 60 * 1000 });
    }
  },
  exportUserData: () => {
    const s = get();
    const backup = {
      version: 1,
      appName: "HGhub",
      createdAt: new Date().toISOString(),
      favs: s.favs,
      history: s.history,
      follows: s.follows,
      searchHist: s.searchHist,
    };
    return JSON.stringify(backup, null, 2);
  },
  importUserData: (raw: string | Record<string, unknown>) => {
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!data || typeof data !== "object") return { ok: false, count: 0 };
      const s = get();
      const rawFavs = Array.isArray((data as Record<string, unknown>).favs)
        ? ((data as Record<string, unknown>).favs as unknown[]).filter((x): x is number => typeof x === "number")
        : [];
      const newFavs = Array.from(new Set([...rawFavs, ...s.favs]));
      const rawFollows = Array.isArray((data as Record<string, unknown>).follows)
        ? ((data as Record<string, unknown>).follows as unknown[]).filter((x): x is number => typeof x === "number")
        : [];
      const newFollows = Array.from(new Set([...rawFollows, ...s.follows]));
      const existingHistoryMap = new Map(s.history.map((h) => [h.id, h]));
      const rawHistory = normalizeHistory((data as Record<string, unknown>).history);
      rawHistory.forEach((h) => {
        if (!existingHistoryMap.has(h.id)) {
          existingHistoryMap.set(h.id, h);
        }
      });
      const newHistory = Array.from(existingHistoryMap.values()).slice(0, 100);
      savePersist({ favs: newFavs, history: newHistory, follows: newFollows });
      set({ favs: newFavs, history: newHistory, follows: newFollows });
      return { ok: true, count: newFavs.length + newHistory.length };
    } catch {
      return { ok: false, count: 0 };
    }
  },
  volume: initialPersist.volume,
  setVolume: (v) => {
    const volume = Math.max(0, Math.min(1, v));
    const muted = volume === 0;
    savePersist({ volume, muted });
    set({ volume, muted });
  },
  searchHist: initialPersist.searchHist,
  addSearch: (q) => {
    const t = q.trim();
    if (!t) return;
    set((s) => {
      const searchHist = [t, ...s.searchHist.filter((x) => x !== t)].slice(0, 12);
      savePersist({ searchHist });
      return { searchHist };
    });
  },
  clearSearchHist: () => {
    savePersist({ searchHist: [] });
    set({ searchHist: [] });
  },
  strictSecurity: isStrictSecurity(),
  strictSecurityReady: false,
  securityPending: false,
  cliRelaxed: false,
  setStrictSecurity: async (on: boolean) => {
    if (!get().strictSecurityReady) throw new Error("安全设置尚未读取，请重新启动应用");
    set({ securityPending: true });
    try {
      const saved = await api.securitySet(on);
      setHtmlStrictSecurity(saved);
      set({ strictSecurity: saved });
    } finally {
      set({ securityPending: false });
    }
  },
  toasts: [],
  toast: (msg: string, icon?: Toast["icon"]) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, msg, icon }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 2200);
  },
})) as unknown as StoreHook;

export function AppProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(useStore.getState().theme);
    api.boot()
      .then((r) => {
        const store = useStore.getState();
        if (r.user && (r.user as User).id) store.setUser(r.user as User);
        if (typeof r.strict_security === "boolean") {
          setHtmlStrictSecurity(r.strict_security);
          useStore.setState({
            strictSecurity: r.strict_security,
            strictSecurityReady: true,
          });
        }
        useStore.setState({ cliRelaxed: !!r.cli_relaxed });
      })
      .catch(() => { /* 离线也能用 */ });
  }, []);

  return <>{children}</>;
}
