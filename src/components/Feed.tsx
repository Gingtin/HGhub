import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, cover, fmt, fmtTime, hostOf, isMobile } from "../api";
import { fetchPlayInfo, fetchPostDetail, fetchVideoDetail } from "../queries";
import type { Detail, Episode, Post, VideoCard } from "../types";
import { useStore } from "../store";
import { Avatar, Img, Sheet } from "./ui";
import VideoSurface, { type VideoHandle } from "./VideoSurface";
import PlayerControls from "./PlayerControls";
import { MobileFeedMiniBar, MobileFullscreenControls } from "./MobileProgress";
import PlaybackLock from "./PlaybackLock";
import { playbackProgressStore } from "../playbackStore";
import { INITIAL_MACHINE_STATE, playerStateReducer } from "../playerStateMachine";
import { ArticlePanel, CommentsPanel, EpisodesPanel } from "./Panels";
import { pushBackHandler } from "../back";
import {
  IBack, IBoltF, IChevR, IChevronDown, IChevronUp, IClock, IClose, ICommentF, ICompress, IExpand, IFileText,
  ILink, IList, ILockF, IPauseF, IPip, IPlayF, IPlus, IRotate, ISearch, IStar, IStarF, IVol, IVolMute,
} from "../icons";

type Props = {
  videoIds: number[];
  startIndex?: number;
  title?: string;
  mode: "home" | "context";
  kind?: "video" | "post";
  active: boolean;
  bottomInset: number;
  onBack?: () => void;
  onNearEnd?: () => void;
  /** 从观看记录续播：起始集数与秒数 */
  startEp?: number;
  startTime?: number;
};

function pruneRecord<T>(record: Record<string | number, T>, keepKey: string | number, max = 20): Record<string | number, T> {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;
  const keepStr = String(keepKey);
  const next: Record<string | number, T> = {};
  const older = keys.filter((k) => k !== keepStr);
  const retain = new Set([keepStr, ...older.slice(older.length - (max - 1))]);
  for (const k of keys) {
    if (retain.has(k)) next[k] = record[k];
  }
  return next;
}

export default function Feed({ videoIds, startIndex = 0, title = "", mode, kind = "video", active, bottomInset, onBack, onNearEnd, startEp, startTime }: Props) {
  const store = useStore();
  const {
    isFav, toggleFavLocal, toggleFollowLocal, muted, setMuted, volume, setVolume, toast,
    addHistory, user, setLoginOpen, autoNext, screenDim, sleepTimerMinutes, sleepTimerDeadline, setSleepTimer,
  } = store;
  const isDesktop = !isMobile;

  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<VideoHandle>(null);
  const [index, setIndex] = useState(startIndex);
  const [epMap, setEpMap] = useState<Record<number, number>>(() => (startEp ? { [videoIds[startIndex]]: startEp } : {}));
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [playUrls, setPlayUrls] = useState<Record<string, string>>({});
  const [cards] = useState<Record<number, VideoCard>>({});
  const [posts, setPosts] = useState<Record<number, Post>>({});

  const timeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [vsize, setVsize] = useState({ w: 0, h: 0 });
  const [machine, dispatchMachine] = useReducer(playerStateReducer, INITIAL_MACHINE_STATE);
  const paused = machine.status === "paused";
  const waiting = machine.status === "loading" || machine.status === "buffering";
  const err = machine.status === "error" ? (machine.error || "播放异常") : "";
  const [controlsLocked, setControlsLocked] = useState(false);

  /* 睡眠定时器倒计时监听与展示实时刷新 */
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    if (!sleepTimerDeadline || !active) return;
    const id = window.setInterval(() => {
      if (Date.now() >= sleepTimerDeadline) {
        videoRef.current?.pause();
        setSleepTimer(null);
        toast("睡眠定时已生效，已暂停播放", "info");
      } else {
        setTimerTick((t) => t + 1);
      }
    }, 10000);
    return () => window.clearInterval(id);
  }, [sleepTimerDeadline, active, setSleepTimer, toast]);

  /* 故障备用线路智能轮询切换 */
  const [switchingLine, setSwitchingLine] = useState(false);
  const handleFailoverLine = useCallback(async () => {
    if (switchingLine) return;
    setSwitchingLine(true);
    try {
      const state = await api.lineState();
      const mirrorsRes = await api.lineMirrors().catch(() => null);
      const mirrors = mirrorsRes?.items || [];
      const fixedUrls = (state.fixed || []).map((x) => x.url);
      const mirrorUrls = mirrors.map((m) => m.url);
      const allLines = Array.from(new Set([...fixedUrls, ...mirrorUrls]));
      const curIdx = allLines.findIndex((u) => u === state.base);
      const nextLine = allLines[(curIdx + 1) % allLines.length] || allLines[0];
      if (nextLine && nextLine !== state.base) {
        await api.lineSet(nextLine);
        toast(`已切换至备用线路：${hostOf(nextLine)}`, "ok");
        dispatchMachine({ type: "RETRY" });
        setPlayTry((n) => n + 1);
        videoRef.current?.reload();
      } else {
        toast("暂无其他可用备用线路", "info");
      }
    } catch (e) {
      toast((e as Error).message || "切换线路失败", "info");
    } finally {
      setSwitchingLine(false);
    }
  }, [switchingLine, toast]);
  const [rate, setRate] = useState(1);
  /* 取播放地址失败后手动重试：递增即重新触发拉取 */
  const [playTry, setPlayTry] = useState(0);
  const [panel, setPanel] = useState<"episodes" | "comments" | "article" | "detail" | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  /* 续播：拿到时长后再 seek 一次（只对进入时那一条生效） */
  const resumeRef = useRef<{ key: string; t: number } | null>(
    startTime && startTime > 1 ? { key: `${videoIds[startIndex]}:${startEp || 1}`, t: startTime } : null,
  );
  /* 观看进度：onTime 里节流写回 store，卸载时再兜一次 */
  const liveRef = useRef({ id: 0, ep: 1, dur: 0, t: 0 });
  const lastSaveRef = useRef(0);
  const theater = store.theater;
  const setTheater = store.setTheater;
  const fs = store.fs;
  const setFs = store.setFs;
  const clean = store.clean;
  const setClean = store.setClean;

  /* 追踪手机视口是否已处于物理/系统横屏状态（window.innerWidth > window.innerHeight） */
  const [vpLandscape, setVpLandscape] = useState(
    () => typeof window !== "undefined" && window.innerWidth > window.innerHeight,
  );

  /* 单击清屏 vs 双击暂停计时器 */
  const lastTapRef = useRef<{ time: number; timer: number | null }>({ time: 0, timer: null });
  const clearTapTimer = () => {
    if (lastTapRef.current.timer) {
      window.clearTimeout(lastTapRef.current.timer);
      lastTapRef.current.timer = null;
    }
  };

  /* 桌面：鼠标闲置 2.8s 自动隐藏播放器 UI（沉浸） */
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2800);
  }, []);
  useEffect(() => {
    if (!isDesktop) return undefined;
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, [isDesktop, wake]);
  useEffect(() => {
    if (paused) { setIdle(false); window.clearTimeout(idleTimer.current); }
  }, [paused]);
  const [fullscreen, setFullscreen] = useState(false);
  /* —— 移动端手势 & 竖屏横片缩放 —— */
  const [holdSpeed, setHoldSpeed] = useState(false);
  const [speedLock, setSpeedLock] = useState(false);
  const [lockArmed, setLockArmed] = useState(false);
  const holdRef = useRef(false);
  const lockArmedRef = useRef(false);
  const [scrub, setScrub] = useState<{ pct: number; target: number } | null>(null);
  const scrubTarget = useRef<number | null>(null);
  /* 竖屏下横屏视频适应模式 + 双指无级缩放/平移（记住用户偏好，适配不同屏幕比例） */
  const [portraitFit, setPortraitFit] = useState<"contain" | "cover">(() => {
    try {
      return (localStorage.getItem("hghub_fit") as "contain" | "cover") || "contain";
    } catch {
      return "contain";
    }
  });
  const updatePortraitFit = useCallback((fit: "contain" | "cover" | ((f: "contain" | "cover") => "contain" | "cover")) => {
    setPortraitFit((curr) => {
      const next = typeof fit === "function" ? fit(curr) : fit;
      try { localStorage.setItem("hghub_fit", next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0, gesturing: false });
  const pinchRef = useRef<{
    dist0: number; midX0: number; midY0: number; scale0: number; x0: number; y0: number;
  } | null>(null);
  const gesture = useRef<{
    x: number; y: number; startX: number; startY: number; t: number; timer: number | null;
    mode: "idle" | "hold" | "scrub" | "pan"; base: number; width: number; playing: boolean;
  } | null>(null);

  const curId = videoIds[index];
  const detail = details[curId];
  const curEp = epMap[curId] || 1;
  const playKey = `${curId}:${curEp}`;
  const playUrl = playUrls[playKey] || "";
  useEffect(() => { videoRef.current?.trace("page.active", { active, view: mode, video_id: curId, episode: curEp }); }, [active, mode, curId, curEp]);
  const episodes = detail?.episodes || [];
  const post = posts[curId];

  /* 观看进度：onTime 里每 5 秒落一次；手势拖动期间忽略底层 timeupdate 防止进度条回跳 */
  const onTimeTick = (t: number) => {
    timeRef.current = t;
    liveRef.current = { id: curId, ep: curEp, dur: duration, t };
    if (gesture.current?.mode !== "scrub") {
      playbackProgressStore.setTime(t);
    }
    const now = Date.now();
    if (duration > 0 && now - lastSaveRef.current > 5000) {
      lastSaveRef.current = now;
      addHistory(curId, curEp, t, duration);
    }
  };

  /* 拿到时长后再续播：只对进入时那一条生效，且不跳到片尾 */
  const onDurationTick = (d: number) => {
    setDuration(d);
    playbackProgressStore.setDuration(d);
    liveRef.current = { ...liveRef.current, dur: d };
    const r = resumeRef.current;
    if (r && r.key === playKey && r.t > 1 && (!d || r.t < d - 3)) {
      resumeRef.current = null;
      videoRef.current?.seek(r.t, "history_resume");
      timeRef.current = r.t;
      playbackProgressStore.setTime(r.t);
    }
  };

  /** 统一视图模型：短剧与吃瓜帖子共用同一套播放界面 */
  const meta = kind === "post"
    ? {
        title: post?.title || "",
        cover: post?.cover || "",
        desc: post?.content || post?.desc || "",
        author: "黄果吃瓜",
        authorId: -1,
        tags: post?.tags || [],
        score: 0,
        hot: post?.hot || 0,
        total: 1,
        like: 0,
        comment: 0,
        collect: 0,
        episodes: [] as Episode[],
      }
    : {
        title: detail?.title || cards[curId]?.title || "",
        cover: detail?.cover || cards[curId]?.cover || "",
        desc: detail?.description || "",
        author: detail?.author?.name || "黄果短剧",
        authorId: detail?.author?.id || -1,
        tags: detail?.tags || [],
        score: detail?.score || 0,
        hot: cards[curId]?.hot || 0,
        total: detail?.episodes?.length || cards[curId]?.episode_count || 0,
        like: detail?.counts?.like ?? cards[curId]?.like_count ?? 0,
        comment: detail?.counts?.comment ?? cards[curId]?.comment_count ?? 0,
        collect: detail?.counts?.collect ?? cards[curId]?.collect_count ?? 0,
        episodes: detail?.episodes || [],
      };

  const posterUrl = cover(meta.cover, 900);
  const hasVideo = kind === "video" || !!post?.video_url;
  const articleHtml = kind === "post" && !hasVideo ? (post?.content || "") : "";

  /* 分享：复制播放链接 */
  const shareLink = () => {
    const u = kind === "post" ? (posts[curId]?.video_url || meta.title) : `https://huangguoai.com/video/${curId}/`;
    navigator.clipboard?.writeText(u).then(() => toast("链接已复制", "ok")).catch(() => {});
  };

  /* 循环切换倍速：1.0x -> 1.25x -> 1.5x -> 2.0x */
  const cycleRate = () => {
    if (speedLock) {
      setSpeedLock(false);
      toast("已解除倍速锁定", "info");
      return;
    }
    const seq = [1, 1.25, 1.5, 2];
    const next = seq[(seq.indexOf(rate) + 1) % seq.length];
    setRate(next);
    videoRef.current?.rate(next);
    toast(`倍速: ${next}x`, "info");
  };

  /* 倍速：长按 / 锁定 → 2.0x，否则用基准倍速 */
  const effRate = holdSpeed || speedLock ? 2 : rate;
  /* 是否为横屏视频（16:9 等宽大于高） */
  const isLandscapeVideo = vsize.w > vsize.h && vsize.h > 0;
  /* 仅当「全屏 + 横屏视频 + 手机系统视口尚未横过来 (!vpLandscape)」时才用 CSS 旋转 90° 兜底；
     一旦系统屏幕已经横过来了 (vpLandscape === true)，不再叠加 CSS 旋转，彻底解决手机横置后视频反而竖过去的问题！ */
  const rotated = !isDesktop && fs && isLandscapeVideo && !vpLandscape;

  /* 借鉴 stclock1988/hghub-ios (PlayerView.swift keepPlayingThroughTransition)：
     iOS 在横竖屏几何旋转或全屏视图层级切换期间，系统底层 AVPlayer / WebKit 视频层可能被短暂挂起暂停。
     在过渡窗口期内分批重申 play()，确保旋转/全屏切换不中断播放。 */
  const keepPlayingTimers = useRef<number[]>([]);
  const keepPlayingThroughTransition = useCallback(() => {
    keepPlayingTimers.current.forEach((id) => window.clearTimeout(id));
    keepPlayingTimers.current = [];
    const el = videoRef.current?.el();
    const shouldPlay = el ? !el.paused : !paused;
    if (!shouldPlay) return;
    for (const delay of [50, 150, 300, 500, 800, 1200]) {
      const tid = window.setTimeout(() => {
        const v = videoRef.current?.el();
        if (v && v.paused && !v.ended) {
          videoRef.current?.play();
        }
      }, delay);
      keepPlayingTimers.current.push(tid);
    }
  }, [paused]);

  useEffect(() => () => {
    keepPlayingTimers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  /* 监听手机屏幕横竖屏变化：物理横置手机时自动进入全屏，竖回时自动退出全屏 */
  useEffect(() => {
    if (isDesktop) return undefined;
    const onViewportChange = () => {
      const isLand = window.innerWidth > window.innerHeight;
      setVpLandscape((prev) => {
        if (prev !== isLand && active) {
          setFs(isLand);
          keepPlayingThroughTransition();
        }
        return isLand;
      });
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, [isDesktop, active, setFs, keepPlayingThroughTransition]);

  /* 进入 / 退出全屏：对横屏视频直接调用原生屏幕方向切换，让手机系统界面真正横过来 */
  const enterFs = useCallback(() => {
    keepPlayingThroughTransition();
    setClean(false);
    setFs(true);
    if (isLandscapeVideo) {
      invoke("set_orientation", { landscape: true }).catch(() => {});
      try {
        (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")?.catch(() => {});
      } catch { /* ignore */ }
    }
  }, [isLandscapeVideo, setClean, setFs, keepPlayingThroughTransition]);

  const exitFs = useCallback(() => {
    keepPlayingThroughTransition();
    setClean(false);
    setFs(false);
    invoke("set_orientation", { landscape: false }).catch(() => {});
    try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
  }, [setClean, setFs, keepPlayingThroughTransition]);

  /* 全屏状态下若视频宽高刚加载出来且为横屏，自动补发一次横屏指令 */
  useEffect(() => {
    if (!isDesktop && fs && isLandscapeVideo) {
      invoke("set_orientation", { landscape: true }).catch(() => {});
    }
  }, [isDesktop, fs, isLandscapeVideo]);

  /* 全屏切换或视口旋转后校准滚动容器 scrollTop：
     - 进入全屏时非当前项已隐藏，当前项位于顶部 scrollTop = 0；
     - 退出全屏回到竖屏列表时，立即将 scrollTop 重新对齐到 index * clientHeight，防止错位到其它视频封面。 */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    if (fs) {
      el.scrollTop = 0;
      return undefined;
    }
    const syncScroll = () => {
      const box = boxRef.current;
      if (!box || fs) return;
      box.scrollTop = index * (box.clientHeight || 1);
    };
    syncScroll();
    const raf = requestAnimationFrame(syncScroll);
    const t1 = window.setTimeout(syncScroll, 120);
    const t2 = window.setTimeout(syncScroll, 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [fs, vpLandscape, index]);

  /* 滚动定位（全屏或缩放手势期间锁定索引，避免容器尺寸变化误触发翻页） */
  const onScroll = useCallback(() => {
    if (fs || pinchRef.current) return;
    const el = boxRef.current;
    if (!el) return;
    const h = el.clientHeight || 1;
    const i = Math.max(0, Math.min(videoIds.length - 1, Math.round(el.scrollTop / h)));
    setIndex((prev) => (prev === i ? prev : i));
    if (onNearEnd && i >= videoIds.length - 3) onNearEnd();
  }, [videoIds.length, onNearEnd, fs]);

  const go = useCallback((delta: number) => {
    const el = boxRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(videoIds.length - 1, index + delta));
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
  }, [index, videoIds.length]);

  /* 初始定位 */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = startIndex * (el.clientHeight || 1);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 拉详情（当前 + 邻接预取，走 TanStack Query 缓存与去重，限制最多留存 20 项） */
  useEffect(() => {
    let alive = true;
    const need = [videoIds[index], videoIds[index + 1], videoIds[index - 1]].filter(Boolean);
    need.forEach((id) => {
      if (details[id]) return;
      fetchVideoDetail(id).then((d) => { if (alive) setDetails((m) => pruneRecord({ ...m, [id]: d }, curId, 20)); }).catch(() => {});
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, videoIds]);

  /* 吃瓜帖子：直接拿帖子详情（走 Query 缓存，限制最多留存 20 项） */
  useEffect(() => {
    if (kind !== "post") return;
    let alive = true;
    [videoIds[index], videoIds[index + 1], videoIds[index - 1]].filter(Boolean).forEach((id) => {
      if (posts[id]) return;
      fetchPostDetail(id).then((p) => { if (alive) setPosts((m) => pruneRecord({ ...m, [id]: p }, curId, 20)); }).catch(() => {});
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, index, videoIds]);

  /* 拉播放地址（走 Query 缓存，限制最多留存 20 项） */
  useEffect(() => {
    if (!curId) return;
    if (playUrls[playKey]) return;
    let alive = true;
    fetchPlayInfo(curId, curEp)
      .then((info) => {
        if (!alive) return;
        if (!info?.video_url) throw new Error("暂无播放地址");
        setPlayUrls((m) => pruneRecord({ ...m, [playKey]: info.video_url }, playKey, 20));
        addHistory(curId, curEp);
      })
      .catch((e) => { if (alive) dispatchMachine({ type: "ERROR", error: (e as Error).message || "取播放地址失败" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId, curEp, playTry]);

  /* 切换条目/集数时重置播放与缩放状态 */
  useEffect(() => {
    timeRef.current = 0;
    playbackProgressStore.reset();
    setDuration(0);
    dispatchMachine({ type: "LOAD_START" });
    setDescOpen(false);
    setVsize({ w: 0, h: 0 });
    setZoom({ scale: 1, x: 0, y: 0, gesturing: false });
  }, [playKey]);

  /* 进出全屏时复位双指缩放并校准滚动条位置 */
  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0, gesturing: false });
    if (!fs && boxRef.current) {
      const el = boxRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = index * (el.clientHeight || 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs]);

  /* 音量/静音同步 */
  useEffect(() => { videoRef.current?.mute(muted); }, [muted]);
  useEffect(() => { videoRef.current?.volume(volume); }, [volume]);
  /* 倍速同步（长按 2x / 锁定 2x / 基准倍速） */
  useEffect(() => { videoRef.current?.rate(effRate); }, [effRate, playKey]);

  /* 离开播放页时把最后位置落盘并清理计时器 */
  useEffect(() => () => {
    clearTapTimer();
    const s = liveRef.current;
    if (s.id && s.dur) addHistory(s.id, s.ep, s.t, s.dur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 键盘 */
  useEffect(() => {
    if (!active || controlsLocked) return;
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (panel) { if (e.key === "Escape") setPanel(null); return; }
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); go(1); break;
        case "ArrowUp": e.preventDefault(); go(-1); break;
        case " ": e.preventDefault(); videoRef.current?.toggle(); break;
        case "ArrowLeft": e.preventDefault(); videoRef.current?.seek(Math.max(0, timeRef.current - 5), "keyboard_shortcut"); break;
        case "ArrowRight": e.preventDefault(); videoRef.current?.seek(timeRef.current + 5, "keyboard_shortcut"); break;
        case "f": case "F": toggleFull(); break;
        case "t": case "T": setTheater((v) => !v); break;
        case "m": case "M": setMuted((v) => !v); break;
        case "s": case "S": onFav(); break;
        case "c": case "C": setPanel("comments"); break;
        case "e": case "E": setPanel("episodes"); break;
        default: break;
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, controlsLocked, panel, index]);

  /* 安卓硬件返回键深度消费层级：选集面板 -> 剧情简介 -> 清屏模式 -> 全屏播放(复位横屏) -> 栈页返回 */
  useEffect(() => {
    if (!active) return undefined;
    const handleBack = () => {
      if (panel) { setPanel(null); return true; }
      if (descOpen) { setDescOpen(false); return true; }
      if (clean) { setClean(false); return true; }
      if (fs) { exitFs(); return true; }
      if (mode === "context" && onBack) { onBack(); return true; }
      return false;
    };
    return pushBackHandler(handleBack);
  }, [active, panel, descOpen, clean, fs, exitFs, mode, onBack]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFull = () => {
    const el = boxRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };

  /* —— 双指捏合缩放 & 平移（Pinch-to-Zoom & Pan） —— */
  const cancelSingleGesture = () => {
    clearTapTimer();
    const g = gesture.current;
    if (g?.timer) window.clearTimeout(g.timer);
    gesture.current = null;
    if (holdRef.current) {
      holdRef.current = false;
      setHoldSpeed(false);
    }
    lockArmedRef.current = false;
    setLockArmed(false);
    setScrub(null);
    scrubTarget.current = null;
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDesktop || controlsLocked) return;
    if (e.touches.length === 2) {
      cancelSingleGesture();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist0 = Math.max(12, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
      const midX0 = (t0.clientX + t1.clientX) / 2;
      const midY0 = (t0.clientY + t1.clientY) / 2;
      pinchRef.current = {
        dist0,
        midX0,
        midY0,
        scale0: zoom.scale,
        x0: zoom.x,
        y0: zoom.y,
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDesktop || controlsLocked) return;
    if (e.touches.length === 2 && pinchRef.current) {
      const p = pinchRef.current;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.max(12, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const nextScale = Math.max(0.85, Math.min(3.5, p.scale0 * (dist / p.dist0)));
      const rawDx = midX - p.midX0;
      const rawDy = midY - p.midY0;
      const dx = rotated ? rawDy : rawDx;
      const dy = rotated ? -rawDx : rawDy;
      const maxX = Math.max(0, (nextScale - 1) * window.innerWidth * 0.55);
      const maxY = Math.max(0, (nextScale - 1) * window.innerHeight * 0.55);
      const nextX = Math.max(-maxX, Math.min(maxX, p.x0 + dx));
      const nextY = Math.max(-maxY, Math.min(maxY, p.y0 + dy));
      setZoom({ scale: nextScale, x: nextX, y: nextY, gesturing: true });
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDesktop) return;
    if (pinchRef.current && e.touches.length < 2) {
      pinchRef.current = null;
      setZoom((prev) =>
        prev.scale < 1.08
          ? { scale: 1, x: 0, y: 0, gesturing: false }
          : { ...prev, gesturing: false },
      );
    }
  };

  /* —— 长按 2x（上滑锁定） / 横拖定位 / 单击清屏 / 双击暂停 —— */
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDesktop || controlsLocked || !active || !e.isPrimary || pinchRef.current || gesture.current || e.button !== 0) return;
    const el = e.currentTarget;
    const span = rotated ? (el.clientHeight || window.innerHeight || 1) : (el.clientWidth || 1);
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const g = {
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
      t: Date.now(), base: timeRef.current, width: span,
      playing: videoRef.current?.el()?.paused === false,
      mode: "idle" as "idle" | "hold" | "scrub" | "pan",
      timer: window.setTimeout(() => {
        const cur = gesture.current;
        if (!cur || cur.mode !== "idle" || pinchRef.current) return;
        clearTapTimer();
        cur.mode = "hold";
        holdRef.current = true;
        setHoldSpeed(true);
        setLockArmed(false);
        lockArmedRef.current = false;
        try { navigator.vibrate?.(25); } catch { /* ignore */ }
      }, 380) as unknown as number,
    };
    gesture.current = g;
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinchRef.current) {
      cancelSingleGesture();
      return;
    }
    const g = gesture.current;
    if (!g || isDesktop || !e.isPrimary) return;
    const rawDx = e.clientX - g.x;
    const rawDy = e.clientY - g.y;
    const dx = rotated ? rawDy : rawDx;
    const dy = rotated ? -rawDx : rawDy;

    /* 长按中：上滑 64px 进入「松开即锁定」 */
    if (g.mode === "hold") {
      const upDist = rotated ? (e.clientX - g.startX) : (g.startY - e.clientY);
      const armed = upDist > 64;
      if (armed !== lockArmedRef.current) {
        lockArmedRef.current = armed;
        setLockArmed(armed);
      }
      return;
    }

    if (g.mode === "idle") {
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        clearTapTimer();
        if (g.timer) window.clearTimeout(g.timer);
        g.mode = "scrub";
      } else if (Math.abs(dy) > 16) {
        clearTapTimer();
        if (g.timer) window.clearTimeout(g.timer);
        g.mode = "pan";
      }
      return;
    }

    if (g.mode === "scrub") {
      const total = duration || 0;
      if (!total) return;
      const target = Math.max(0, Math.min(total - 0.2, g.base + (dx / g.width) * total));
      scrubTarget.current = target;
      setScrub({ pct: (target / total) * 100, target });
    }
  };

  const onUp = (e?: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pinchRef.current) return;
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.timer) window.clearTimeout(g.timer);

    if (g.mode === "hold") {
      holdRef.current = false;
      setHoldSpeed(false);
      if (!cancelled && lockArmedRef.current) {
        setSpeedLock(true);
        toast("已锁定 2.0x 倍速 · 点顶部标签解除", "info");
      }
      lockArmedRef.current = false;
      setLockArmed(false);
      return;
    }
    if (g.mode === "scrub") {
      const target = scrubTarget.current;
      setScrub(null);
      scrubTarget.current = null;
      if (!cancelled && target != null) {
        timeRef.current = target;
        playbackProgressStore.setTime(target);
        videoRef.current?.seek(target, "mobile_gesture");
      }
      if (g.playing && active) videoRef.current?.play();
      return;
    }

    if (cancelled || g.mode !== "idle") return;
    const moveDist = e ? Math.hypot(e.clientX - g.x, e.clientY - g.y) : 0;
    if (Date.now() - g.t < 320 && moveDist < 16) {
      // 若处于清屏模式，单击屏幕任意位置优先退出清屏
      if (clean) {
        setClean(false);
        return;
      }
      // 单击屏幕画面：直接切换 播放 / 暂停（主流短剧与短视频通用交互，响应即时）
      videoRef.current?.toggle();
    }
  };

  useEffect(() => {
    if (!active || controlsLocked) onUp(undefined, true);
    // Cancel pending gestures when the page is hidden or controls are locked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, controlsLocked]);

  useEffect(() => () => {
    if (gesture.current?.timer) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
  }, [playKey]);

  const lockControls = () => { setPanel(null); setControlsLocked(true); };

  /* 长按倍速 / 双指缩放 / 全屏期间禁止外层列表原生滚动 */
  useEffect(() => {
    if (isDesktop) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;
    const fn = (e: TouchEvent) => {
      if (holdRef.current || pinchRef.current || fs || e.touches.length >= 2) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", fn, { passive: false });
    return () => el.removeEventListener("touchmove", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, videoIds.length, fs]);

  const togglePip = async () => {
    try {
      const v = videoRef.current?.el();
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v && document.pictureInPictureEnabled) await v.requestPictureInPicture();
      else toast("当前环境不支持画中画", "info");
    } catch { toast("画中画开启失败", "info"); }
  };

  const requireLogin = () => { if (!user) { setLoginOpen(true); return false; } return true; };

  const onFav = () => {
    if (!curId) return;
    const on = toggleFavLocal(curId);
    toast(on ? "已收藏" : "已取消收藏", on ? "star" : "info");
    if (requireLogin()) { if (kind === "post") api.postCollect(curId, on).catch(() => {}); else api.collect(curId, on).catch(() => {}); }
  };

  const onFollow = () => {
    const uid = meta.authorId > 0 ? meta.authorId : undefined;
    if (!uid) return;
    const on = toggleFollowLocal(uid);
    toast(on ? `已关注 ${detail?.author?.name}` : "已取消关注", on ? "ok" : "info");
    if (requireLogin()) api.follow(uid, on).catch(() => {});
  };

  const pickEp = (ep: number) => {
    setEpMap((m) => ({ ...m, [curId]: ep }));
    setPanel(null);
  };

  if (!videoIds.length) {
    return <div className="absolute inset-0 bg-black flex items-center justify-center"><div className="w-9 h-9 spinner" /></div>;
  }

  const effectiveFit: "contain" | "cover" = isDesktop
    ? "contain"
    : isLandscapeVideo
      ? (fs || vpLandscape ? "contain" : portraitFit)
      : (vpLandscape ? "contain" : portraitFit);

  return (
    <div
      className={`hg-player-ui absolute inset-0 overflow-hidden bg-black player-root ${controlsLocked ? "is-locked" : ""} ${isDesktop ? "player-surface" : ""} ${theater ? "is-theater" : ""} ${isDesktop && idle ? "is-idle" : ""}`}
      onPointerMove={() => { if (isDesktop) wake(); }}>
      <div className="absolute inset-0" inert={controlsLocked}>
      {/* 氛围背景（全屏时隐藏，避免透出封面底图） */}
      {!fs && (
        <div className="absolute inset-0 scale-110 blur-3xl opacity-25 pointer-events-none">
          {posterUrl && <img src={posterUrl} alt="" className="w-full h-full object-cover" />}
        </div>
      )}

      <div ref={boxRef} onScroll={onScroll}
        className={`absolute inset-y-0 left-0 no-bar ${fs ? "overflow-hidden" : "overflow-y-scroll snap-y snap-mandatory overscroll-y-contain"}`}
        style={{ right: isDesktop && panel ? 372 : 0, transition: "right .3s cubic-bezier(.2,0,0,1)" }}>
        {videoIds.map((vid, i) => {
          const isActive = i === index;
          const isNear = Math.abs(i - index) <= 2;
          if (!isNear) {
            return (
              <section
                key={vid}
                style={!isActive && fs ? { display: "none" } : undefined}
                className="relative w-full h-full snap-start snap-always"
              />
            );
          }
          return (
            <section
              key={vid}
              style={!isActive && fs ? { display: "none" } : undefined}
              className={`relative w-full h-full snap-start snap-always ${fs && isActive ? "" : "overflow-hidden"}`}>
              {isActive && playUrl ? (
                <div className={rotated ? "fs-landscape" : (!isDesktop && fs ? "fs-immersive" : "absolute inset-0")}>
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ touchAction: fs || zoom.scale > 1.05 ? "none" : "pan-y" }}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={(e) => onUp(e, false)}
                    onPointerCancel={(e) => onUp(e, true)}
                    onLostPointerCapture={(e) => onUp(e, true)}>
                    <VideoSurface
                      ref={videoRef}
                      src={playUrl}
                      poster={fs ? undefined : posterUrl}
                      autoPlay
                      active={active}
                      diagnosticContext={{ active, view: mode, kind, video_id: curId, episode: curEp }}
                      muted={muted}
                      volume={volume}
                      rate={effRate}
                      fit={effectiveFit}
                      scale={zoom.scale}
                      panX={zoom.x}
                      panY={zoom.y}
                      isGesturing={zoom.gesturing}
                      onClick={() => { if (isDesktop) videoRef.current?.toggle(); }}
                      onTime={onTimeTick}
                      onDuration={onDurationTick}
                      onSize={(w, h) => setVsize({ w, h })}
                      onPlaying={() => dispatchMachine({ type: "PLAYING" })}
                      onPause={() => dispatchMachine({ type: "PAUSE" })}
                      onWaiting={() => dispatchMachine({ type: "WAITING" })}
                      onEnded={() => {
                        if (sleepTimerMinutes === -1) {
                          videoRef.current?.pause();
                          setSleepTimer(null);
                          toast("睡眠定时：本集已播完，已暂停播放", "info");
                          return;
                        }
                        if (autoNext) {
                          const next = episodes.find((e) => e.ep_num === curEp + 1);
                          if (next) {
                            pickEp(next.ep_num);
                          } else if (index < videoIds.length - 1) {
                            go(1);
                            toast("当前剧集已完结，为您播放下一部", "info");
                          } else {
                            toast("全剧已播完", "info");
                          }
                        }
                      }}
                      onError={(m) => dispatchMachine({ type: "ERROR", error: m })}
                    />
                  </div>

                  {/* 横拖定位浮层 */}
                  {!isDesktop && scrub && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none" style={{ background: "rgba(0,0,0,.25)" }}>
                      <span className="text-[26px] font-bold hg-ink tabular-nums hg-ov-shadow">{fmtTime(scrub.target)}</span>
                      <span className="text-[11px] hg-ink-4 mt-1 tabular-nums">/ {fmtTime(duration)}</span>
                      <div className="mt-4 w-[62%] h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.25)" }}>
                        <div className="h-full bg-white" style={{ width: `${scrub.pct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* 暂停 / 缓冲 / 报错恢复 */}
                  {paused && !err && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        videoRef.current?.play();
                      }}
                    >
                      <span className="w-[72px] h-[72px] rounded-full flex items-center justify-center backdrop-blur-md pressable shadow-2xl transition-transform a-scale-in active:scale-90"
                        style={{ background: "rgba(0,0,0,.62)", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.25), 0 8px 32px rgba(0,0,0,.6)" }}>
                        <IPlayF size={34} className="text-white ml-1 drop-shadow" />
                      </span>
                    </div>
                  )}
                  {waiting && !err && !paused && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><div className="w-9 h-9 spinner" /></div>
                  )}
                  {err && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center">
                      <div className="rounded-xl p-5 flex flex-col items-center gap-3 text-[13px] hg-ink-2" style={{ background: "rgba(0,0,0,.78)" }}>
                        <span>视频暂时无法加载</span>
                        <span className="text-[10.5px] hg-ink-4 max-w-[240px] text-center break-all">{err}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <button className="px-4 py-1.5 rounded-full hg-chip-strong hg-link text-[12.5px] font-semibold pressable"
                            onClick={() => { dispatchMachine({ type: "RETRY" }); videoRef.current?.reload(); }}>
                            重新加载
                          </button>
                          <button className="px-3.5 py-1.5 rounded-full bg-primary/25 text-primary border border-primary/35 text-[12.5px] font-semibold pressable hover:bg-primary/35 disabled:opacity-60"
                            disabled={switchingLine}
                            onClick={handleFailoverLine}>
                            {switchingLine ? "切线中…" : "换线重试"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 移动端：倍速状态 / 锁定提示 */}
                  {!isDesktop && (!clean || holdSpeed) && (holdSpeed || speedLock || rate !== 1) && (
                    <button
                      onClick={() => {
                        if (speedLock) { setSpeedLock(false); toast("已解除倍速锁定", "info"); }
                        else if (rate !== 1 && !holdSpeed) setRate(1);
                      }}
                      className={`absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 h-8 rounded-full backdrop-blur-md text-[12px] font-bold elev-2 pressable ${speedLock ? "bg-primary text-on-primary" : "hg-chip hg-gold"}`}
                      style={{ top: rotated || vpLandscape ? 14 : "calc(var(--sat, 0px) + 54px)" }}>
                      <IBoltF size={13} />
                      {effRate}x {speedLock ? "已锁定 · 点按解除" : holdSpeed ? "倍速中 · 松开恢复" : "倍速"}
                    </button>
                  )}
                  {!isDesktop && holdSpeed && (
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 h-10 rounded-xl backdrop-blur-md elev-2 transition-all duration-200 ${lockArmed ? "bg-primary text-on-primary scale-110" : "hg-chip-strong hg-ink-2"}`}
                      style={{ top: "38%" }}>
                      <ILockF size={16} />
                      <span className="text-[12.5px] font-bold">{lockArmed ? "松开锁定 2.0x" : "上滑到此锁定倍速"}</span>
                    </div>
                  )}

                  {/* 移动端：沉浸全屏控制栏（清屏 clean 模式下隐藏，单击屏幕可呼出/隐藏） */}
                  {!isDesktop && fs && !clean && !controlsLocked && (
                    <>
                      <div className="absolute right-4 z-40 flex items-center gap-2"
                        style={{ top: rotated || vpLandscape ? 14 : "calc(var(--sat, 0px) + 8px)" }}>
                        <button onClick={lockControls} aria-label="锁定播放控制" title="锁定播放控制" aria-pressed={false}
                          className="hg-chip-strong w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center pressable elev-1">
                          <ILockF size={17} />
                        </button>
                        <button onClick={exitFs} aria-label="退出全屏"
                          className="hg-chip-strong w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center pressable elev-1">
                          <ICompress size={18} />
                        </button>
                      </div>
                      {zoom.scale > 1.05 && (
                        <button
                          onClick={() => setZoom({ scale: 1, x: 0, y: 0, gesturing: false })}
                          className="hg-chip-strong absolute left-4 z-40 px-3 h-8 rounded-full backdrop-blur-md text-[11.5px] font-semibold flex items-center gap-1 pressable elev-1"
                          style={{ top: rotated || vpLandscape ? 14 : "calc(var(--sat, 0px) + 8px)" }}>
                          还原画面 ({zoom.scale.toFixed(1)}x)
                        </button>
                      )}
                      <MobileFullscreenControls
                        rotated={rotated}
                        vpLandscape={vpLandscape}
                        duration={duration}
                        paused={paused}
                        rate={rate}
                        effRate={effRate}
                        speedLock={speedLock}
                        setSpeedLock={setSpeedLock}
                        setRate={setRate}
                        onTogglePlay={() => videoRef.current?.toggle()}
                        onSeek={(target) => {
                          dispatchMachine({ type: "SEEKING", target });
                          timeRef.current = target;
                          playbackProgressStore.setTime(target);
                          videoRef.current?.seek(target, "mobile_bar");
                        }}
                        onTrace={(event, data) => videoRef.current?.trace(event, data)}
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0">
                  <Img src={cards[vid]?.cover || posts[vid]?.cover || details[vid]?.cover || (isActive ? detail?.cover : "") || ""} eager={Math.abs(i - index) <= 1} />
                  <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.25)" }} />
                </div>
              )}

              {/* 取不到播放地址时播放器不会创建，错误提示要放在播放器外面，否则只会停在封面 */}
              {isActive && kind === "video" && !playUrl && !!err && (
                <div className="absolute inset-0 z-30 flex items-center justify-center">
                  <div className="rounded-xl p-5 flex flex-col items-center gap-3 text-[13px] hg-ink-2" style={{ background: "rgba(0,0,0,.78)" }}>
                    <span>视频暂时无法加载</span>
                    <span className="text-[10.5px] hg-ink-4 max-w-[240px] text-center break-all">{err}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button className="px-4 py-1.5 rounded-full hg-chip-strong hg-link text-[12.5px] font-semibold pressable"
                        onClick={() => { dispatchMachine({ type: "RETRY" }); setPlayTry((n) => n + 1); }}>
                        重新加载
                      </button>
                      <button className="px-3.5 py-1.5 rounded-full bg-primary/25 text-primary border border-primary/35 text-[12.5px] font-semibold pressable hover:bg-primary/35 disabled:opacity-60"
                        disabled={switchingLine}
                        onClick={handleFailoverLine}>
                        {switchingLine ? "切线中…" : "换线重试"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 图文帖：没有视频就给个正文入口 */}
              {isActive && kind === "post" && !!post && !post.video_url && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <button type="button" onClick={() => setPanel("article")}
                    className="flex items-center gap-2 h-11 px-5 rounded-full text-[13.5px] font-semibold pressable elev-3"
                    style={{ background: "rgba(255,255,255,.94)", color: "#0b0e15" }}>
                    <IFileText size={17} />查看图文详情
                  </button>
                </div>
              )}

              {/* 渐变压暗，保证文字可读（清屏模式下不加压暗遮罩，只显示纯视频内容） */}
              {!fs && !clean && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(0deg, rgba(8,11,15,.86) 0, rgba(11,14,20,.18) 26%, transparent 48%)" }} />
              )}

              {/* 竖屏下观看横屏视频：快捷「放大铺满 / 完整显示 / 全屏横屏」与双指缩放复位胶囊 */}
              {isActive && !fs && !clean && !isDesktop && (isLandscapeVideo || zoom.scale > 1.05) && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2"
                  style={{ top: "64%" }}>
                  {isLandscapeVideo && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (zoom.scale > 1.05) {
                            setZoom({ scale: 1, x: 0, y: 0, gesturing: false });
                            updatePortraitFit("contain");
                          } else {
                            updatePortraitFit((f) => (f === "contain" ? "cover" : "contain"));
                          }
                        }}
                        className="hg-chip-strong backdrop-blur-md px-3 h-7 rounded-full text-[11.5px] font-semibold flex items-center gap-1.5 pressable elev-1">
                        {zoom.scale > 1.05
                          ? `还原缩放 (${zoom.scale.toFixed(1)}x)`
                          : portraitFit === "contain"
                            ? "放大铺满"
                            : "完整适应"}
                      </button>
                      <button
                        type="button"
                        onClick={enterFs}
                        className="hg-chip-strong backdrop-blur-md px-3 h-7 rounded-full text-[11.5px] font-semibold flex items-center gap-1 pressable elev-1">
                        <IExpand size={12} />横屏全屏
                      </button>
                    </>
                  )}
                  {!isLandscapeVideo && zoom.scale > 1.05 && (
                    <button
                      type="button"
                      onClick={() => setZoom({ scale: 1, x: 0, y: 0, gesturing: false })}
                      className="hg-chip-strong backdrop-blur-md px-3 h-7 rounded-full text-[11.5px] font-semibold flex items-center gap-1 pressable elev-1">
                      还原画面 ({zoom.scale.toFixed(1)}x)
                    </button>
                  )}
                </div>
              )}

              {/* 顶部 (桌面) */}
              {isActive && !fs && !clean && mode === "context" && isDesktop && (
                <div className="desktop-context-header">
                  <button onClick={onBack} aria-label="返回"><IBack size={17} /></button>
                  <span>{title}</span>
                  <small>{index + 1} / {videoIds.length}</small>
                </div>
              )}

              {/* 右侧操作栏（桌面） */}
              {isActive && !fs && isDesktop && (
              <div className="absolute z-20 flex flex-col items-center desktop-social">
                <div className="desktop-browse-inline">
                  <button onClick={() => go(-1)} disabled={index === 0} aria-label="上一个" title="上一个 ↑">
                    <IChevronUp size={19} strokeWidth={1.8} />
                  </button>
                  <button onClick={() => go(1)} disabled={index >= videoIds.length - 1} aria-label="下一个" title="下一个 ↓">
                    <IChevronDown size={19} strokeWidth={1.8} />
                  </button>
                  <small>{String(index + 1).padStart(2, "0")} / {String(videoIds.length).padStart(2, "0")}</small>
                </div>

                {kind === "video" && (
                  <>
                    <button onClick={() => setPanel("episodes")} className="flex flex-col items-center gap-1 pressable" aria-label="选集">
                      <IList size={26} className="text-white tsh" />
                      <span className="text-[10.5px] text-white/90">选集</span>
                    </button>

                    <button onClick={onFav} className="flex flex-col items-center gap-1 pressable" aria-pressed={isFav(curId)} aria-label="追剧">
                      {isFav(curId) ? <IStarF size={27} className="hg-gold" /> : <IStar size={27} className="hg-ink hg-ov-shadow" />}
                      <span className="text-[10.5px] text-white/90">{isFav(curId) ? "已追" : "追剧"}</span>
                    </button>
                  </>
                )}

                <button onClick={shareLink} className="flex flex-col items-center gap-1 pressable">
                  <ILink size={25} className="text-white tsh" />
                  <span className="text-[10.5px] text-white/90">分享</span>
                </button>
              </div>
              )}

              {/* 桌面：左下信息 */}
              {isActive && !fs && isDesktop && (
              <div className="desktop-video-meta">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-white tsh truncate">@{meta.author}</span>
                  {episodes.length > 0 && (
                    <span className="shrink-0 px-1.5 py-px rounded-md text-[10px] font-bold text-white"
                      style={{ background: "rgba(255,255,255,.16)" }}>
                      第 {curEp}/{episodes.length} 集
                    </span>
                  )}
                  {!!meta.score && (
                    <span className="shrink-0 text-[11px] font-bold hg-gold hg-ov-shadow">{meta.score.toFixed(1)} 分</span>
                  )}
                </div>

                <p className="mt-1 text-[13.5px] leading-snug hg-ink-2 hg-ov-shadow clamp-2">{meta.title}</p>

                {/* 描述（单行，点开展开） */}
                <button onClick={() => setDescOpen((v) => !v)} className="mt-1 text-left w-full pressable group">
                  <p className={`text-[11.5px] leading-relaxed hg-ink-4 ${descOpen ? "" : "clamp-1"}`}>
                    {meta.desc || "暂无简介"}
                  </p>
                  <span className="text-[10.5px] hg-link font-semibold">{descOpen ? "收起" : "展开简介"}</span>
                </button>
              </div>
              )}

              {/* 移动端沉浸交互浮层（居中列自适应宽屏/平板，控件贴合视频画面） */}
              {isActive && !fs && !clean && !isDesktop && (
                <div className="absolute inset-0 pointer-events-none z-20 flex justify-center">
                  <div className="relative w-full max-w-[560px] h-full pointer-events-none">
                    {/* 上下文顶部返回条 */}
                    {mode === "context" && (
                      <div className="absolute inset-x-0 z-20 flex items-center gap-2 px-3 pointer-events-auto"
                        style={{ top: "calc(var(--sat, 0px) + 8px)", paddingRight: 100 }}>
                        <button onClick={onBack} aria-label="返回"
                          className="w-9 h-9 rounded-full flex items-center justify-center pressable elev-2 backdrop-blur-md"
                          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}>
                          <IBack size={20} className="text-white" />
                        </button>
                        <span className="text-[14.5px] font-semibold text-white hg-ov-shadow truncate">{title}</span>
                        <span className="ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white/90 backdrop-blur-md"
                          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}>
                          {index + 1} / {videoIds.length}
                        </span>
                      </div>
                    )}

                    {/* 右侧实用看剧操作栏（美观、实用、无社交干扰） */}
                    <div className="absolute right-3.5 z-20 flex flex-col items-center gap-[15px] pointer-events-auto"
                      style={{ bottom: `calc(var(--sab, 0px) + ${bottomInset + 56}px)` }}>
                      {/* 播放 / 暂停 快捷控制 */}
                      <button
                        onClick={() => videoRef.current?.toggle()}
                        className="flex flex-col items-center gap-1 pressable"
                        aria-label={paused ? "播放" : "暂停"}
                      >
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                          style={{
                            background: paused ? "rgba(96, 205, 255, 0.28)" : "rgba(18, 20, 26, 0.55)",
                            border: paused ? "1px solid rgba(96, 205, 255, 0.55)" : "1px solid rgba(255, 255, 255, 0.16)",
                            boxShadow: paused ? "0 0 16px rgba(96, 205, 255, 0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
                          }}>
                          {paused ? (
                            <IPlayF size={22} className="text-primary ml-0.5 drop-shadow" />
                          ) : (
                            <IPauseF size={20} className="text-white drop-shadow" />
                          )}
                        </div>
                        <span className={`text-[10.5px] font-semibold hg-ov-shadow ${paused ? "text-primary font-bold" : "hg-ink-2"}`}>
                          {paused ? "播放" : "暂停"}
                        </span>
                      </button>

                      {/* 选集 */}
                      {episodes.length > 0 && (
                        <button onClick={() => setPanel("episodes")} className="flex flex-col items-center gap-1 pressable" aria-label="选集">
                          <div className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                            style={{
                              background: "rgba(18, 20, 26, 0.55)",
                              border: "1px solid rgba(255, 255, 255, 0.16)",
                            }}>
                            <IList size={22} className="text-white drop-shadow" />
                          </div>
                          <span className="text-[10.5px] font-semibold hg-ink-2 hg-ov-shadow tabular-nums">第{curEp}集</span>
                        </button>
                      )}

                      {/* 快捷倍速切换（点按即切 1.0x -> 1.25x -> 1.5x -> 2.0x） */}
                      <button onClick={cycleRate} className="flex flex-col items-center gap-1 pressable" aria-label="切换倍速">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                          style={{
                            background: effRate !== 1 ? "rgba(96, 205, 255, 0.22)" : "rgba(18, 20, 26, 0.55)",
                            border: effRate !== 1 ? "1px solid rgba(96, 205, 255, 0.5)" : "1px solid rgba(255, 255, 255, 0.16)",
                            boxShadow: effRate !== 1 ? "0 0 14px rgba(96, 205, 255, 0.35)" : "0 2px 8px rgba(0,0,0,0.3)",
                          }}>
                          <IBoltF size={20} className={effRate !== 1 ? "text-primary" : "text-white drop-shadow"} />
                        </div>
                        <span className={`text-[10.5px] font-bold hg-ov-shadow tabular-nums ${effRate !== 1 ? "text-primary" : "hg-ink-2"}`}>
                          {effRate}x
                        </span>
                      </button>

                      {/* 追剧 / 收藏 */}
                      <button onClick={onFav} className="flex flex-col items-center gap-1 pressable" aria-pressed={isFav(curId)} aria-label="追剧收藏">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                          style={{
                            background: isFav(curId) ? "rgba(243, 201, 105, 0.22)" : "rgba(18, 20, 26, 0.55)",
                            border: isFav(curId) ? "1px solid rgba(243, 201, 105, 0.5)" : "1px solid rgba(255, 255, 255, 0.16)",
                            boxShadow: isFav(curId) ? "0 0 14px rgba(243, 201, 105, 0.35)" : "0 2px 8px rgba(0,0,0,0.3)",
                          }}>
                          {isFav(curId) ? <IStarF size={22} className="hg-gold" /> : <IStar size={22} className="hg-ink hg-ov-shadow" />}
                        </div>
                        <span className={`text-[10.5px] font-semibold hg-ov-shadow ${isFav(curId) ? "hg-gold" : "hg-ink-2"}`}>
                          {isFav(curId) ? "已追" : "追剧"}
                        </span>
                      </button>

                      {/* 画中画小窗 */}
                      <button onClick={togglePip} className="flex flex-col items-center gap-1 pressable" aria-label="画中画小窗">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                          style={{
                            background: "rgba(18, 20, 26, 0.55)",
                            border: "1px solid rgba(255, 255, 255, 0.16)",
                          }}>
                          <IPip size={21} className="text-white drop-shadow" />
                        </div>
                        <span className="text-[10.5px] font-semibold hg-ink-2 hg-ov-shadow">画中画</span>
                      </button>

                      {/* 横竖全屏切换 */}
                      <button onClick={enterFs} className="flex flex-col items-center gap-1 pressable" aria-label="全屏观看">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
                          style={{
                            background: "rgba(18, 20, 26, 0.55)",
                            border: "1px solid rgba(255, 255, 255, 0.16)",
                          }}>
                          <IExpand size={21} className="text-white drop-shadow" />
                        </div>
                        <span className="text-[10.5px] font-semibold hg-ink-2 hg-ov-shadow">全屏</span>
                      </button>
                    </div>

                    {/* 移动端左下信息 + 进度条 */}
                    <div className="absolute inset-x-0 z-20 pointer-events-auto" style={{ bottom: `calc(var(--sab, 0px) + ${bottomInset}px)` }}>
                      <div className="absolute inset-x-0 bottom-0 h-[220px] pointer-events-none"
                        style={{ background: "linear-gradient(0deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.45) 50%, transparent 100%)" }} />
                      
                      <div className="relative px-4 pb-1" style={{ paddingRight: 68 }}>
                        {/* 选集胶囊芯片 + 评分 */}
                        <div className="flex items-center gap-2 mb-2">
                          {episodes.length > 0 && (
                            <button
                              onClick={() => setPanel("episodes")}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold text-white/95 backdrop-blur-md pressable transition-all"
                              style={{
                                background: "rgba(255, 255, 255, 0.16)",
                                border: "1px solid rgba(255, 255, 255, 0.22)",
                                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                              }}>
                              <IList size={13} className="text-primary" />
                              <span>选集 · 第 {curEp}/{episodes.length} 集</span>
                              <IChevR size={12} className="opacity-70" />
                            </button>
                          )}
                          {meta.score > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold hg-gold"
                              style={{ background: "rgba(243, 201, 105, 0.18)", border: "1px solid rgba(243, 201, 105, 0.3)" }}>
                              ★ {meta.score.toFixed(1)}
                            </span>
                          )}

                          {/* 画面比例切换（原比例 / 全屏填充） */}
                          <button
                            type="button"
                            onClick={() => {
                              const next = portraitFit === "contain" ? "cover" : "contain";
                              updatePortraitFit(next);
                              toast(next === "cover" ? "已切换至全屏填充" : "已切换至原始比例", "info");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white/95 backdrop-blur-md pressable transition-all"
                            style={{
                              background: portraitFit === "cover" ? "rgba(96, 205, 255, 0.22)" : "rgba(255, 255, 255, 0.14)",
                              border: portraitFit === "cover" ? "1px solid rgba(96, 205, 255, 0.45)" : "1px solid rgba(255, 255, 255, 0.2)",
                              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                            }}
                            title="切换画面比例（原画完整 / 满屏铺满）">
                            <ICompress size={12} className={portraitFit === "cover" ? "text-primary" : "text-white/80"} />
                            <span>{portraitFit === "cover" ? "满屏" : "原画"}</span>
                          </button>
                        </div>

                        {/* 标题 */}
                        <h2 className="text-[14.5px] font-semibold leading-snug text-white/95 hg-ov-shadow clamp-2 mb-1.5">
                          {meta.title}
                        </h2>

                        {/* 简介（点按可展开） */}
                        {meta.desc && (
                          <button onClick={() => setDescOpen((v) => !v)} className="text-left w-full pressable">
                            <p className={`text-[11.5px] leading-relaxed text-white/70 hg-ov-shadow ${descOpen ? "" : "clamp-1"}`}>
                              {meta.desc}
                            </p>
                          </button>
                        )}
                      </div>

                      {/* 底部播放进度条与控制 */}
                      <div className="relative pb-1">
                        <MobileFeedMiniBar
                          duration={duration}
                          rotated={rotated}
                          paused={paused}
                          onTogglePlay={() => videoRef.current?.toggle()}
                          onSeek={(target) => {
                            dispatchMachine({ type: "SEEKING", target });
                            timeRef.current = target;
                            playbackProgressStore.setTime(target);
                            videoRef.current?.seek(target, "mobile_bar");
                          }}
                          onTrace={(event, data) => videoRef.current?.trace(event, data)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* 桌面控制条 */}
      {isDesktop && (
        <PlayerControls
          paused={paused} duration={duration} rate={rate}
          muted={muted} volume={volume} theater={theater} fullscreen={fullscreen}
          visible={active && !idle}
          seekEnabled={active && !controlsLocked}
          seekKey={playKey}
          nextDisabled={!episodes.some((e) => e.ep_num === curEp + 1) && index >= videoIds.length - 1}
          nextTitle={episodes.some((e) => e.ep_num === curEp + 1) ? "下一集 E" : "下一部 ↓"}
          onToggle={() => videoRef.current?.toggle()}
          onSeek={(t, source) => {
            videoRef.current?.seek(t, source);
            timeRef.current = t;
            playbackProgressStore.setTime(t);
          }}
          onSeekInteraction={(phase, input, target, pointerTarget) => videoRef.current?.trace(`seek.input.${phase}`, { input, target, pointer_target: pointerTarget })}
          onRate={(r) => { setRate(r); videoRef.current?.rate(r); }}
          onMute={() => setMuted((m) => !m)}
          onVolume={(v) => setVolume(v)}
          onPip={togglePip}
          onLock={lockControls}
          onTheater={() => setTheater((v) => !v)}
          onFullscreen={toggleFull}
          onNext={() => {
            const nx = episodes.find((e) => e.ep_num === curEp + 1);
            if (nx) pickEp(nx.ep_num);
            else go(1);
          }}
        />
      )}

      {/* 选集 / 评论：桌面停靠在右侧（画面让位），移动端底部弹层 */}
      {isDesktop ? (
        <div className={`desktop-dock-panel ${panel ? "is-open" : ""}`}>
          <div className="desktop-dock-inner">
            {panel === "episodes" ? (
              <EpisodesPanel videoId={curId} episodes={episodes} current={curEp} onPick={pickEp} onClose={() => setPanel(null)} />
            ) : panel === "comments" ? (
              <CommentsPanel videoId={curId} ep={curEp} total={meta.comment} kind={kind} onClose={() => setPanel(null)} />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* 评论：移动端底部弹层（右侧操作栏「评论」入口） */}
          <Sheet open={panel === "comments"} onClose={() => setPanel(null)}>
            <div className="flex flex-col" style={{ height: "72vh" }}>
              <CommentsPanel videoId={curId} ep={curEp} total={meta.comment} kind={kind} onClose={() => setPanel(null)} />
            </div>
          </Sheet>

          {/* 吃瓜图文正文 */}
          <Sheet open={panel === "article"} onClose={() => setPanel(null)}>
            <div className="flex flex-col" style={{ height: "78vh" }}>
              <ArticlePanel title={meta.title} html={articleHtml} cover={meta.cover} hot={post?.hot} onClose={() => setPanel(null)} />
            </div>
          </Sheet>

          <Sheet open={panel === "detail" || panel === "episodes"} onClose={() => setPanel(null)}>
            <div className="flex flex-col" style={{ height: "72vh" }}>
              {/* 双栏抽屉：详情 / 选集 */}
              <div className="shrink-0 flex items-center gap-2 px-4 pb-2">
                <div className="flex flex-1 bg-s3 rounded-(--r-ctl) p-1">
                  {([["detail", "详情"], ["episodes", "选集"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setPanel(k)}
                      className={`flex-1 h-8 rounded-(--r-ctl) text-[12px] font-semibold pressable ${panel === k ? "text-on-sec" : "text-mut"}`}
                      style={panel === k ? { background: "var(--p-sec)", color: "var(--p-primary)" } : undefined}>{l}</button>
                  ))}
                </div>
                <button onClick={() => setPanel(null)} aria-label="关闭"
                  className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-mut pressable">
                  <IClose size={14} />
                </button>
              </div>

              <div className="flex-1 min-h-0">
                {panel === "episodes" ? (
                  <EpisodesPanel bare videoId={curId} episodes={episodes} current={curEp} onPick={pickEp} onClose={() => setPanel(null)} />
                ) : (
                  <div className="h-full scroll-y px-4 pb-5">
                    {/* 封面 / 标题 / 评分 / 数据 */}
                    <div className="flex gap-3">
                      <div className="relative w-[84px] shrink-0 rounded-(--r-sm) overflow-hidden bg-s3" style={{ aspectRatio: "3 / 4" }}>
                        <Img src={meta.cover} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-bold text-on leading-snug clamp-2">{meta.title}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {!!meta.score && <span className="text-[12px] font-bold text-amber">{meta.score.toFixed(1)} 分</span>}
                          {episodes.length > 0 && <span className="text-[10.5px] text-mut">共 {episodes.length} 集</span>}
                        </div>
                        <div className="flex gap-4 mt-2 text-[11px] text-mut">
                          <span>热度 {fmt(meta.hot)}</span>
                          <span>追剧 {fmt(meta.collect)}</span>
                          <span>全 {episodes.length || meta.total} 集</span>
                        </div>
                      </div>
                    </div>

                    {/* 作者 + 关注 */}
                    <div className="mt-4 flex items-center gap-2.5 rounded-(--r-md) bg-s2 p-2.5">
                      <Avatar size={34} name={meta.author} hue={220} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-on truncate">{meta.author}</div>
                        <div className="text-[10px] text-mut">作者</div>
                      </div>
                      {meta.authorId > 0 && (
                        <button onClick={onFollow}
                          className={`h-7 px-3 rounded-full text-[11px] font-semibold pressable ${store.follows.includes(meta.authorId) ? "bg-s3 text-mut" : "bg-primary text-on-primary"}`}>
                          {store.follows.includes(meta.authorId) ? "已关注" : "+ 关注"}
                        </button>
                      )}
                    </div>

                    {/* 简介 */}
                    <div className="mt-4">
                      <div className="text-[11px] font-semibold text-dim mb-1.5">简介</div>
                      <p className="text-[11.5px] leading-relaxed text-mut whitespace-pre-wrap">{meta.desc || "暂无简介"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Sheet>
        </>
      )}
      </div>
      {/* 夜间护眼微光遮罩 */}
      {screenDim > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-[35] bg-black transition-opacity"
          style={{ opacity: screenDim }}
        />
      )}
      {!isDesktop && !fs && !clean && !controlsLocked && active && (
        <div className="absolute right-3 z-40 flex items-center gap-2" style={{ top: "calc(var(--sat, 0px) + 6px)" }}>
          {/* 睡眠定时倒计时胶囊 */}
          {sleepTimerDeadline && (
            <button
              onClick={() => { setSleepTimer(null); toast("已取消睡眠定时", "ok"); }}
              className="hg-chip px-2.5 h-9 rounded-full flex items-center gap-1 pressable elev-1 text-[11px] font-bold text-amber-300"
              title="点击取消睡眠定时">
              <IClock size={13} />
              <span>{Math.max(1, Math.ceil((sleepTimerDeadline - Date.now()) / 60000))}m</span>
            </button>
          )}
          {sleepTimerMinutes === -1 && (
            <button
              onClick={() => { setSleepTimer(null); toast("已取消睡眠定时", "ok"); }}
              className="hg-chip px-2.5 h-9 rounded-full flex items-center gap-1 pressable elev-1 text-[11px] font-bold text-amber-300"
              title="点击取消睡眠定时">
              <IClock size={13} />
              <span>播完停</span>
            </button>
          )}
          <button onClick={() => setMuted(m => !m)} aria-label={muted ? "取消静音" : "静音"}
            className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1">
            {muted ? <IVolMute size={17} /> : <IVol size={17} />}
          </button>
          <button onClick={lockControls} aria-label="锁定播放控制" title="锁定播放控制" aria-pressed={false}
            className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1"><ILockF size={17} /></button>
          <button onClick={() => store.setTab("search")} aria-label="搜索"
            className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1"><ISearch size={18} /></button>
        </div>
      )}
      {controlsLocked && <PlaybackLock active={active} onUnlock={() => { setControlsLocked(false); wake(); }} />}
    </div>
  );
}
