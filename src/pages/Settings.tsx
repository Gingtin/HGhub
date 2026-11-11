import { useEffect, useState, type ReactNode } from "react";
import { api, APP_VERSION, hostOf, logLine, platform, type UpdateInfo } from "../api";
import { useStore } from "../store";
import { Modal, Toggle } from "../components/ui";
import LinePicker from "../components/LinePicker";
import { copyPlaybackLog, initPlaybackLog, setPlaybackLog, usePlaybackLog } from "../playbackDiagnostics";
import { IBack, IBoltF, IBroom, IChevR, IClock, IGrid, IInfo, ILink, ILockF, IMoon, IPlayF, IRefresh, ISettings, IStarF, ISun, IVolMute } from "../icons";

/* 独立设置页：线路 / 外观 / 播放 / 本地数据 / 清理缓存 / 网络诊断 / 关于
   入口：Windows 侧栏「设置」、Android「我的」右上角齿轮 */
export default function Settings({ onBack, wide }: { onBack: () => void; wide: boolean }) {
  const {
    theme, setTheme, favs, history, muteOnStartup, setMuteOnStartup, homeMode, setHomeMode,
    strictSecurity, strictSecurityReady, securityPending, cliRelaxed, setStrictSecurity, toast,
    autoNext, setAutoNext, screenDim, setScreenDim, sleepTimerMinutes, sleepTimerDeadline, setSleepTimer,
    exportUserData, importUserData,
  } = useStore();
  const [about, setAbout] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [lineOpen, setLineOpen] = useState(false);
  const [lineBase, setLineBase] = useState("");
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const playbackLog = usePlaybackLog();
  const [copyingLog, setCopyingLog] = useState(false);

  const readLine = () => {
    api.lineState().then((s) => setLineBase(s.base)).catch(() => {});
  };
  useEffect(readLine, []);
  useEffect(() => { void initPlaybackLog(); }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const info = await api.checkUpdate();
      if (info.has_update) setUpdate(info);
      else toast(`已是最新版本 v${info.current}`, "ok");
    } catch (e) {
      toast((e as Error).message || "检查更新失败", "info");
    } finally {
      setChecking(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <>
      <div className="text-[10.5px] font-semibold text-dim tracking-wide px-1 mt-4 mb-1.5">{title}</div>
      <div className="rounded-(--r-md) bg-s2 divide-y divide-s3">{children}</div>
    </>
  );

  return (
    <div className="absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 relative overflow-hidden bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(90% 120% at 100% 0%, var(--p-pc) 0%, transparent 60%)", opacity: 0.32 }} />
        <div className="relative px-3 pt-2 pb-4">
          <button onClick={onBack} aria-label="返回" className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><IBack size={20} /></button>
          <div className="px-2 mt-1 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-(--r-sm) bg-pc text-on-pc flex items-center justify-center"><ISettings size={20} strokeWidth={1.7} /></span>
                <span className="text-[24px] font-bold tracking-wide text-on">设置</span>
              </div>
              <div className="text-[11px] text-mut mt-1">外观 · 播放 · 本地数据 · 诊断</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y px-4 pt-1 pb-10">
        <div className={wide ? "max-w-[720px] mx-auto" : ""}>
          <Section title="外观">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary">{theme === "dark" ? <IMoon size={16} /> : <ISun size={16} />}</span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">深色外观</div>
                <div className="text-[10.5px] text-mut">跟随设计稿的 Fluent 深色</div>
              </div>
              <Toggle on={theme === "dark"} onChange={(on) => setTheme(on ? "dark" : "light")} label="深色外观" />
            </div>
          </Section>

          {platform === "android" && (
            <Section title="屏幕与显示优化">
              <div className="px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-mint" />
                  <span className="text-[12.5px] font-bold text-on">显示优化与硬件加速已就绪</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2.5 text-[10.5px]">
                  <div className="p-2 rounded-lg bg-s3/60 border border-white/5">
                    <div className="text-dim">色彩模式</div>
                    <div className="font-semibold text-on mt-0.5">AMOLED 纯黑深色</div>
                  </div>
                  <div className="p-2 rounded-lg bg-s3/60 border border-white/5">
                    <div className="text-dim">刷新率</div>
                    <div className="font-semibold text-primary mt-0.5">120Hz LTPO 动态高刷</div>
                  </div>
                  <div className="p-2 rounded-lg bg-s3/60 border border-white/5">
                    <div className="text-dim">屏幕适配</div>
                    <div className="font-semibold text-on mt-0.5">全面屏与安全区自适应</div>
                  </div>
                  <div className="p-2 rounded-lg bg-s3/60 border border-white/5">
                    <div className="text-dim">解码加速</div>
                    <div className="font-semibold text-amber-300 mt-0.5">硬件多媒体硬解加速</div>
                  </div>
                </div>

                {/* 夜间微光护眼调光滑杆 */}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-on">夜间微光护眼调光</span>
                    <span className="text-[11px] font-bold text-primary tabular-nums">
                      {screenDim === 0 ? "原生亮度" : `已压暗 ${Math.round(screenDim * 100)}%`}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-mut mb-2 leading-relaxed">
                    在系统最低亮度基础上进一步压暗，暗光环境下观看柔和舒适不刺眼，纯黑像素关闭降低功耗。
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.65"
                    step="0.05"
                    value={screenDim}
                    onChange={(e) => setScreenDim(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-s3 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </Section>
          )}

          <Section title="首页与播放">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IGrid size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on font-medium">首页展示模式</div>
                <div className="text-[10.5px] text-mut mt-0.5">
                  {homeMode === "hall" ? "海报大厅（海报网格与猜你喜欢瀑布流）" : "全屏沉浸（上下滑动流式播放）"}
                </div>
              </div>
              <div className="flex bg-s3 rounded-xl p-0.5 border border-white/5 shrink-0">
                <button
                  type="button"
                  onClick={() => { setHomeMode("hall"); toast("已切换为海报大厅模式", "ok"); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${homeMode === "hall" ? "bg-primary text-on-primary shadow-xs" : "text-mut hover:text-on"}`}
                >
                  海报大厅
                </button>
                <button
                  type="button"
                  onClick={() => { setHomeMode("feed"); toast("已切换为全屏沉浸模式", "ok"); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${homeMode === "feed" ? "bg-primary text-on-primary shadow-xs" : "text-mut hover:text-on"}`}
                >
                  全屏沉浸
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IPlayF size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on font-medium">自动连播下一集</div>
                <div className="text-[10.5px] text-mut mt-0.5">每集播完后自动无缝切入下一集，连贯追剧免去手动选集</div>
              </div>
              <Toggle on={autoNext} onChange={setAutoNext} label="自动连播下一集" />
            </div>

            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IVolMute size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">启动时静音</div>
                <div className="text-[10.5px] text-mut">默认开启，每次启动均静音；关闭后记住上次静音状态。下次启动生效。</div>
              </div>
              <Toggle on={muteOnStartup} onChange={setMuteOnStartup} label="启动时静音" />
            </div>

            <div className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IClock size={16} /></span>
                  <div>
                    <div className="text-[12.5px] text-on font-medium">睡眠定时关闭</div>
                    <div className="text-[10.5px] text-mut mt-0.5">
                      {sleepTimerMinutes === null
                        ? "未开启 · 适合睡前观看，时间到自动暂停播放并省电"
                        : sleepTimerMinutes === -1
                        ? "已开启：当前集数播放完毕后自动暂停"
                        : `已开启：将在约 ${Math.max(1, Math.ceil(((sleepTimerDeadline || 0) - Date.now()) / 60000))} 分钟后暂停`}
                    </div>
                  </div>
                </div>
                {sleepTimerMinutes !== null && (
                  <button
                    type="button"
                    onClick={() => { setSleepTimer(null); toast("已取消睡眠定时", "ok"); }}
                    className="px-2.5 py-1 rounded-full bg-danger/20 text-danger text-[11px] font-semibold pressable shrink-0"
                  >
                    取消定时
                  </button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1.5 mt-1">
                {[
                  { label: "关闭", val: null },
                  { label: "15分", val: 15 },
                  { label: "30分", val: 30 },
                  { label: "45分", val: 45 },
                  { label: "60分", val: 60 },
                  { label: "本集完", val: -1 },
                ].map((item) => {
                  const active = sleepTimerMinutes === item.val;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setSleepTimer(item.val);
                        toast(item.val ? `已设置睡眠定时：${item.label}` : "已关闭睡眠定时", "ok");
                      }}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all pressable ${
                        active ? "bg-primary text-on-primary shadow-xs" : "bg-s3 text-mut hover:text-on"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="本地数据">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-amber-300"><IStarF size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">追剧收藏</div>
                <div className="text-[10.5px] text-mut">{favs.length} 部收藏 · {history.length} 条观看记录</div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILink size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on font-medium">数据备份与迁移</div>
                <div className="text-[10.5px] text-mut mt-0.5">将追剧收藏与观看进度导出为 JSON 离线备份，换机无缝恢复</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const json = exportUserData();
                    try {
                      await navigator.clipboard?.writeText(json);
                      toast("备份数据已复制到剪贴板", "ok");
                    } catch {
                      toast("请在弹窗中复制备份数据", "info");
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-s3 hover:bg-s4 text-primary text-[11px] font-semibold pressable"
                >
                  导出备份
                </button>
                <button
                  type="button"
                  onClick={() => { setImportText(""); setImportOpen(true); }}
                  className="px-2.5 py-1 rounded-lg bg-s3 hover:bg-s4 text-on/80 text-[11px] font-semibold pressable"
                >
                  导入恢复
                </button>
              </div>
            </div>
            <button onClick={() => setClearOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IBroom size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">清理缓存</div>
                <div className="text-[10.5px] text-mut">封面 / 播放缓存与本地记录</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="网络">
            <button onClick={() => setLineOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IBoltF size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">线路</div>
                <div className="text-[10.5px] text-mut truncate">{lineBase ? hostOf(lineBase) : "固定线路 1（默认）"}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILockF size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">严格安全模式</div>
                <div className="text-[10.5px] text-mut">
                  {cliRelaxed
                    ? "已由启动参数 --no-strict 切换为兼容模式；可手动重新开启"
                    : "默认开启，防上游投毒与内网探测；若导致正文或特殊代理异常可关闭（或用 --no-strict 启动）"}
                </div>
              </div>
              <Toggle
                on={strictSecurity}
                disabled={!strictSecurityReady || securityPending}
                onChange={(on) => {
                  void setStrictSecurity(on).then(() => {
                    toast(on ? "已开启严格安全模式" : "已切换为兼容模式（关闭激进清洗与守卫）", "info");
                  }).catch(() => toast("安全设置保存失败，已保持原模式", "info"));
                }}
                label="严格安全模式"
              />
            </div>
            {/* 打不开时先点这里：把 DNS / 代理 / HTTP 结果复制给维护者 */}
            <button onClick={async () => {
              try {
                const text = JSON.stringify(await api.netDiag(), null, 2);
                logLine(`[net_diag] ${text}`);
                await navigator.clipboard?.writeText(text);
                toast("网络诊断结果已复制", "ok");
              } catch (e) {
                toast((e as Error).message || "诊断失败", "info");
              }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILink size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">网络诊断</div>
                <div className="text-[10.5px] text-mut">检测 DNS / 系统代理 / 官网连通性</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="播放诊断">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IInfo size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">播放诊断日志</div>
                <div className="text-[10.5px] text-mut">记录点击、拖动、切页和缓冲过程；复现问题后可关闭并复制日志</div>
                {playbackLog.error && <div role="alert" className="text-[10.5px] text-danger">{playbackLog.error}</div>}
              </div>
              <Toggle label="播放诊断日志" on={playbackLog.enabled} disabled={!playbackLog.ready || playbackLog.pending}
                onChange={(on) => { void setPlaybackLog(on).then(() => toast(on ? "已开启播放诊断，请复现问题" : "已关闭播放诊断，已有日志保留", "ok")).catch(() => toast("日志设置保存失败，请重试", "info")); }} />
            </div>
            <button disabled={!playbackLog.ready || playbackLog.pending || copyingLog} onClick={async () => {
              setCopyingLog(true);
              try { await copyPlaybackLog(); toast("播放诊断日志已复制", "ok"); }
              catch (e) { toast((e as Error).message || "复制日志失败", "info"); }
              finally { setCopyingLog(false); }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILink size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">{copyingLog ? "正在复制…" : "复制播放诊断日志"}</div>
                <div className="text-[10.5px] text-mut break-all">{playbackLog.path || "日志仅保存在本机"}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="其他">
            <button onClick={checkUpdate} disabled={checking} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IRefresh size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">检查更新</div>
                <div className="text-[10.5px] text-mut">{checking ? "检查中…" : `当前 v${APP_VERSION} · 对比 GitHub Release`}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
            <button onClick={() => setAbout(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IInfo size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">关于 HGhub</div>
                <div className="text-[10.5px] text-mut">版本 {APP_VERSION} · 仅限非商业使用</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <div className="text-center text-[10px] text-dim mt-5">HGhub {APP_VERSION} · {platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows"} 客户端</div>
        </div>
      </div>

      <LinePicker open={lineOpen} onClose={() => { setLineOpen(false); readLine(); }} />

      <Modal open={about} onClose={() => setAbout(false)} width={392}>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-(--r-sm) brand-grad glow-neon flex items-center justify-center text-on-primary text-[17px] font-black">H</span>
            <div>
              <div className="text-[16px] font-bold text-on leading-tight">HGhub</div>
              <div className="text-[11px] text-mut mt-0.5">黄果短剧 · 第三方客户端 v{APP_VERSION}</div>
            </div>
          </div>

          <p className="text-[12px] text-on/70 leading-relaxed mt-4">
            基于 Rust + Tauri 2 构建的跨平台客户端，支持 Windows、macOS、Android 与 Linux。
            界面遵循 Fluent 设计语言，播放器采用沉浸式竖屏信息流。
          </p>

          <div className="mt-4 rounded-(--r-sm) bg-s3/60 p-3 text-[11px] text-mut leading-relaxed">
            本项目仅供学习与交流，所有内容均来自上游站点，客户端不存储、不分发任何视频内容。
            请于 24 小时内删除相关资源，并支持正版。
          </div>

          <div className="mt-4 divide-y divide-s3">
            <button onClick={() => { navigator.clipboard?.writeText("https://github.com/Minireel/HGhub").then(() => toast("仓库地址已复制", "ok")).catch(() => {}); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">github.com/Minireel/HGhub</span>
              <span className="ml-auto text-[10.5px] text-primary">复制</span>
            </button>
            <button onClick={() => { navigator.clipboard?.writeText("https://huangguoai.com").then(() => toast("站点地址已复制", "ok")).catch(() => {}); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">huangguoai.com</span>
              <span className="ml-auto text-[10.5px] text-primary">复制</span>
            </button>
            <div className="flex items-center gap-2 py-2.5">
              <IInfo size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">PolyForm Noncommercial 1.0.0</span>
              <span className="ml-auto text-[10.5px] text-mut">仅限非商业</span>
            </div>
          </div>

          <button onClick={() => setAbout(false)} className="mt-4 w-full h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on pressable">知道了</button>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} width={330}>
        <div className="p-5">
          <div className="text-[14.5px] font-bold text-on">清理缓存</div>
          <p className="text-[12px] text-mut leading-relaxed mt-2">
            只清除封面与播放列表缓存（解密图 / m3u8）。收藏、观看记录、搜索历史与登录状态都会保留。
          </p>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setClearOpen(false)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on/80 pressable">取消</button>
            <button disabled={clearing} onClick={async () => {
              setClearing(true);
              try { await api.clearCache(); } catch { /* 忽略 */ }
              setClearing(false);
              setClearOpen(false);
              toast("缓存已清理", "ok");
            }} className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[12.5px] font-semibold text-on-primary pressable disabled:opacity-60">
              {clearing ? "清理中…" : "确定清理"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} width={350}>
        <div className="p-5">
          <div className="text-[14.5px] font-bold text-on">导入数据恢复</div>
          <p className="text-[11.5px] text-mut mt-1 leading-relaxed">
            请粘贴先前导出的备份 JSON 内容。导入时会自动合并去重，保留已有追剧记录。
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='粘贴导出的备份内容 {"version":1, "favs":[...], ...}'
            rows={5}
            className="w-full mt-3 p-2.5 rounded-xl bg-s3/80 border border-white/10 text-[11px] text-on placeholder-dim outline-none font-mono"
          />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setImportOpen(false)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[12px] text-on/80 pressable">取消</button>
            <button
              onClick={() => {
                if (!importText.trim()) { toast("请先粘贴备份内容", "info"); return; }
                const res = importUserData(importText);
                if (res.ok) {
                  setImportOpen(false);
                  toast(`成功恢复并合并 ${res.count} 条记录`, "ok");
                } else {
                  toast("备份数据解析失败，请检查格式", "info");
                }
              }}
              className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[12px] font-bold text-on-primary pressable"
            >
              确定导入
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!update?.has_update} onClose={() => setUpdate(null)} width={392}>
        <div className="p-5">
          <div className="text-[15px] font-bold text-on">发现新版本</div>
          <p className="text-[11.5px] text-mut mt-1.5">
            v{update?.current} → <b className="text-on">v{update?.latest}</b>
            {update?.published_at ? ` · ${update.published_at.slice(0, 10)}` : ""}
          </p>
          {!!update?.notes && (
            <div className="mt-3 max-h-[180px] scroll-y rounded-(--r-sm) bg-s2 p-3 text-[11px] text-mut whitespace-pre-wrap leading-relaxed">{update.notes}</div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setUpdate(null)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on/80 pressable">稍后</button>
            <button onClick={() => {
              if (!update) return;
              api.openUrl(update.url).catch(() => {
                navigator.clipboard?.writeText(update.url).then(() => toast("下载地址已复制", "ok")).catch(() => {});
              });
            }} className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[12.5px] font-semibold text-on-primary pressable">前往下载</button>
          </div>
          <div className="text-[10px] text-dim mt-2.5 break-all">{update?.url}</div>
        </div>
      </Modal>
    </div>
  );
}
