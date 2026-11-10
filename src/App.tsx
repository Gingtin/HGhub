import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore, type Page, type Tab } from "./store";
import { isMobile, selfTest } from "./api";
import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { runBack } from "./back";
import Home from "./pages/Home";
import Feed from "./components/Feed";
import LoginModal from "./components/LoginModal";
import { ToastHost } from "./components/ui";
import { DesktopRail, DesktopTitleBar } from "./components/DesktopChrome";
import ResizeHandles from "./components/ResizeHandles";
import { tracePlayback } from "./playbackDiagnostics";
import { IGrid, IGridF, IHome, IHomeF, ISearch, IUser, IUserF, Logo } from "./icons";

/* 路由级 React.lazy 动态拆包，减小初始包体积与解析执行耗时 */
const Search = lazy(() => import("./pages/Search"));
const RankPage = lazy(() => import("./pages/Search").then((m) => ({ default: m.RankPage })));
const Category = lazy(() => import("./pages/Category"));
const ChannelPage = lazy(() => import("./pages/Category").then((m) => ({ default: m.ChannelPage })));
const Profile = lazy(() => import("./pages/Profile"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const PostsPage = lazy(() => import("./pages/Posts").then((m) => ({ default: m.PostsPage })));
const PostDetail = lazy(() => import("./pages/Posts").then((m) => ({ default: m.PostDetail })));

const PageFallback = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-bg">
    <div className="w-8 h-8 spinner" />
  </div>
);

/* ============ 底部标签栏（Android / Mobile）—— 现代毛玻璃悬浮质感 + 图标文字 ============ */
function TabBar() {
  const { tab, setTab, theme, homeMode } = useStore();
  const items: { k: Tab; label: string; icon: (on: boolean) => React.ReactNode }[] = [
    { k: "home", label: "首页", icon: (on) => on ? <IHomeF size={21} /> : <IHome size={21} strokeWidth={2} /> },
    { k: "search", label: "搜索", icon: (on) => <ISearch size={20} strokeWidth={on ? 2.4 : 1.9} /> },
    { k: "category", label: "分类", icon: (on) => on ? <IGridF size={20} /> : <IGrid size={20} strokeWidth={1.9} /> },
    { k: "profile", label: "我的", icon: (on) => on ? <IUserF size={21} /> : <IUser size={21} strokeWidth={1.9} /> },
  ];

  const overVideo = tab === "home" && homeMode === "feed";
  const lightBar = !overVideo && theme === "light";

  return (
    <nav className="hg-tabbar absolute bottom-0 inset-x-0 z-30 select-none pointer-events-none"
      style={{
        paddingBottom: "var(--sab, 0px)",
      }}>
      <div className="w-full max-w-[500px] mx-auto pointer-events-auto px-3 pb-1.5">
        <div
          className="h-[54px] rounded-2xl flex items-center px-2 transition-all duration-300"
          style={{
            background: lightBar
              ? "rgba(255, 255, 255, 0.9)"
              : overVideo
                ? "rgba(14, 16, 22, 0.78)"
                : "rgba(24, 26, 34, 0.88)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: lightBar ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.12)",
            boxShadow: lightBar
              ? "0 4px 20px rgba(0,0,0,0.06)"
              : "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}>
          {items.map(({ k, label, icon }) => {
            const on = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="flex-1 h-full flex flex-col items-center justify-center gap-0.5 pressable relative group">
                <span
                  className="transition-transform duration-200"
                  style={{
                    color: lightBar
                      ? (on ? "var(--p-primary)" : "rgba(0,0,0,.45)")
                      : (on ? "var(--p-primary, #60cdff)" : "rgba(255,255,255,.6)"),
                    transform: on ? "scale(1.08)" : "scale(1)",
                  }}>
                  {icon(on)}
                </span>
                <span
                  className="text-[11px] leading-tight font-medium transition-colors duration-200"
                  style={{
                    fontWeight: on ? 700 : 500,
                    color: lightBar
                      ? (on ? "var(--p-primary)" : "rgba(0,0,0,.5)")
                      : (on ? "#ffffff" : "rgba(255,255,255,.6)"),
                  }}>
                  {label}
                </span>
                {on && (
                  <span
                    className="absolute -bottom-0.5 w-4 h-[2.5px] rounded-full transition-all"
                    style={{ background: lightBar ? "var(--p-primary)" : "var(--p-primary, #60cdff)", boxShadow: "0 0 8px var(--p-glow)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ============ 堆栈页面 ============ */
function StackPage({ page, onBack, wide, top, bottomInset }: {
  page: Page; onBack: () => void; wide: boolean; top: boolean; bottomInset: number;
}) {
  return (
    <Suspense fallback={<PageFallback />}>
      {page.kind === "feed" && (
        <Feed videoIds={page.videoIds} startIndex={page.index} title={page.title} kind={page.feedKind || "video"}
          startEp={page.startEp} startTime={page.startTime}
          mode="context" active={top} bottomInset={bottomInset} onBack={onBack} />
      )}
      {page.kind === "channel" && <ChannelPage cate={page.cate} name={page.name} onBack={onBack} wide={wide} />}
      {page.kind === "ranks" && <RankPage onBack={onBack} wide={wide} />}
      {page.kind === "settings" && <SettingsPage onBack={onBack} wide={wide} />}
      {page.kind === "posts" && <PostsPage onBack={onBack} wide={wide} />}
      {page.kind === "post" && <PostDetail id={page.id} onBack={onBack} active={top} />}
    </Suspense>
  );
}

/* ============ 应用主体 ============ */
function AppBody() {
  const { platform, tab, setTab, stack, pop, loginOpen, setLoginOpen, fs, clean } = useStore();
  const isMobile = platform === "android" || platform === "ios";
  const mainRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(!isMobile);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth > 640));
    ro.observe(el);
    setWide(el.clientWidth > 640);
    return () => ro.disconnect();
  }, []);

  /* 全局键盘 */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (loginOpen) { if (e.key === "Escape") setLoginOpen(false); return; }
      if (e.key === "Escape") { if (stack.length) pop(); return; }
      if (e.key === "/") { e.preventDefault(); setTab("search"); return; }
      if (["1", "2", "3", "4"].includes(e.key) && !e.repeat) {
        setTab((["home", "search", "category", "profile"] as Tab[])[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [stack.length, pop, setTab, loginOpen, setLoginOpen]);

  const vis = (k: Tab) => (tab === k ? "absolute inset-0" : "absolute inset-0 invisible pointer-events-none");
  const pageActive = stack.length === 0 && !loginOpen;
  const bottomInset = isMobile ? (fs || clean ? 0 : 58) : 14;
  /* 栈页（从搜索/分类/我的进入的播放页、图文页）没有底栏，
     底部只让出安全区。之前多留了 20px，视频底边会露出一条
     「底栏」似的窄缝（底部的压暗渐变到不了屏幕最底）。 */
  const stackInset = isMobile ? 0 : 14;

  return (
    <div className={`absolute inset-0 flex bg-canvas plat-${platform}`}>
      {!isMobile && <DesktopRail collapsed={collapsed} />}
      <div ref={mainRef} className="relative flex-1 min-w-0 overflow-hidden win-main">
        <div className={vis("home")}><Home active={pageActive && tab === "home"} bottomInset={bottomInset} /></div>
        <div className={vis("search")}><Suspense fallback={<PageFallback />}><Search active={pageActive && tab === "search"} wide={wide} /></Suspense></div>
        <div className={vis("category")}><Suspense fallback={<PageFallback />}><Category wide={wide} active={pageActive && tab === "category"} /></Suspense></div>
        <div className={vis("profile")}><Suspense fallback={<PageFallback />}><Profile wide={wide} /></Suspense></div>

        {stack.map((p, i) => (
          <div key={p.key} className="absolute inset-0 z-30 bg-bg a-page-in" style={{ boxShadow: "-18px 0 40px rgba(0,0,0,.5)" }}>
            <StackPage page={p} onBack={pop} wide={wide} top={i === stack.length - 1} bottomInset={stackInset} />
          </div>
        ))}

        {isMobile && !fs && !clean && stack.length === 0 && <TabBar />}
      </div>
    </div>
  );
}

/* ============ 桌面窗口壳（Windows / macOS）============ */
function DesktopShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { theater, platform } = useStore();
  return (
    <div className={`absolute inset-0 flex flex-col bg-canvas win-root plat-${platform}`}>
      <DesktopTitleBar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="relative flex-1 min-h-0">
        <ShellInner collapsed={collapsed || theater} theater={theater} />
      </div>
      {/* 边缘缩放热区只对无边框窗口（Windows）有效，macOS 走原生窗口边框 */}
      {platform === "windows" && <ResizeHandles />}
    </div>
  );
}

function ShellInner({ collapsed, theater }: { collapsed: boolean; theater: boolean }) {
  const { stack, pop, loginOpen, setLoginOpen, tab, setTab, platform } = useStore();
  const mainRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth > 640));
    ro.observe(el);
    setWide(el.clientWidth > 640);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (loginOpen) { if (e.key === "Escape") setLoginOpen(false); return; }
      if (e.key === "Escape") { if (stack.length) pop(); return; }
      if (e.key === "/") { e.preventDefault(); setTab("search"); return; }
      if (["1", "2", "3", "4"].includes(e.key) && !e.repeat) {
        setTab((["home", "search", "category", "profile"] as Tab[])[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [stack.length, pop, setTab, loginOpen, setLoginOpen]);

  const vis = (k: Tab) => (tab === k ? "absolute inset-0" : "absolute inset-0 invisible pointer-events-none");
  const pageActive = stack.length === 0 && !loginOpen;

  return (
    <div className={`absolute inset-0 flex bg-canvas plat-${platform}`}>
      {!theater && <DesktopRail collapsed={collapsed} />}
      <div ref={mainRef} className={`relative flex-1 min-w-0 overflow-hidden win-main ${theater ? "is-theater-main" : ""}`}>
        <div className={vis("home")}><Home active={pageActive && tab === "home"} bottomInset={14} /></div>
        <div className={vis("search")}><Suspense fallback={<PageFallback />}><Search active={pageActive && tab === "search"} wide={wide} /></Suspense></div>
        <div className={vis("category")}><Suspense fallback={<PageFallback />}><Category wide={wide} active={pageActive && tab === "category"} /></Suspense></div>
        <div className={vis("profile")}><Suspense fallback={<PageFallback />}><Profile wide={wide} /></Suspense></div>
        {stack.map((p, i) => (
          <div key={p.key} className="absolute inset-0 z-30 bg-bg win-page-in" style={{ boxShadow: "-18px 0 40px rgba(0,0,0,.5)" }}>
            <StackPage page={p} onBack={pop} wide={wide} top={i === stack.length - 1} bottomInset={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ 移动端（无壳） ============ */
function MobileShell() {
  const { platform } = useStore();
  return (
    <div className={`absolute inset-0 flex flex-col bg-canvas plat-${platform}`}
      style={{ "--sat": "max(env(safe-area-inset-top), 12px)", "--sab": "max(env(safe-area-inset-bottom), 16px)" } as React.CSSProperties}>
      <div className="relative flex-1 min-h-0">
        <AppBody />
      </div>
    </div>
  );
}

/* ============ 入口 ============ */
export default function App() {
  const { platform, loginOpen, setLoginOpen, tab, setTab, stack, pop, fs, setFs } = useStore();
  useEffect(() => {
    tracePlayback("navigation.change", { tab, stack: stack.map(p => ({ page: p.kind, key: p.key })), login_open: loginOpen });
  }, [tab, stack, loginOpen]);

  /* —— 安卓硬件返回键 ——
     层级：全屏 → 面板/弹层 → 登录框 → 页面栈 → 回首页 → 退出应用。
     不注册这个监听，Tauri 会直接 webView.goBack() 或退出，表现就是「任意页面返回都回桌面」。 */
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (fs) { setFs(false); return; }                        // 沉浸全屏
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (runBack()) return;                                  // 播放器的选集/评论/图文面板
    if (loginOpen) { setLoginOpen(false); return; }
    if (stack.length) { pop(); return; }
    if (tab !== "home") { setTab("home"); return; }
    invoke("plugin:app|exit", { code: 0 }).catch(() => {});
  };

  useEffect(() => {
    if (platform !== "android") return undefined;
    let disposed = false;
    let handle: { unregister: () => Promise<void> } | null = null;
    addPluginListener("app", "back-button", () => backRef.current())
      .then((l) => { if (disposed) l.unregister().catch(() => {}); else handle = l; })
      .catch(() => { /* 非安卓宿主忽略 */ });
    return () => {
      disposed = true;
      handle?.unregister().catch(() => {});
    };
  }, [platform]);

  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const t = window.setTimeout(() => {
      selfTest().then((r) => { invoke("debug_log", { msg: r }).catch(() => {}); }).catch(() => {});
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      {isMobile ? <MobileShell /> : <DesktopShell />}
      <LoginModal />
      <ToastHost />
      {/* 登录遮罩键盘处理占位 */}
      {loginOpen && <div className="hidden" onClick={() => setLoginOpen(false)} />}
    </>
  );
}
