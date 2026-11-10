import React, { useCallback, useEffect, useRef, useState } from "react";
import Feed from "../components/Feed";
import { api, fmt, fmtTime } from "../api";
import type { Detail, RankItem, VideoCard } from "../types";
import { useStore } from "../store";
import { Masonry, RowCard } from "../components/cards";
import { Empty, Img } from "../components/ui";
import { IFireF, IGrid, IPlayF, IRefresh, ISearch, IStarF, IStarsF, Logo } from "../icons";

function rankItemToVideoCard(r: RankItem): VideoCard {
  return {
    id: r.video_id,
    title: r.title,
    cover: r.cover,
    tags: r.tags || [],
    score: r.score || 0,
    episode_count: r.episode_count || 1,
    total_episodes: r.episode_count || 1,
    hot: r.metrics?.play || r.metric_value || 0,
    like_count: r.metrics?.like || 0,
    collect_count: r.metrics?.collect || 0,
    comment_count: r.metrics?.comment || 0,
    is_finished: r.is_finished,
    is_original: 0,
  };
}

/* =========================================================================
   首页（双模设计）：
   1. 海报大厅（Hall）：继续观看横幅 + 今日热播横滑 + 猜你喜欢瀑布流 + 一键换一批
   2. 沉浸刷剧（Feed）：类似抖音上下滑切剧，自带【换一批】与【切回大厅】浮钮
   ========================================================================= */

export default function Home({ active, bottomInset }: { active: boolean; bottomInset: number }) {
  const { homeMode, setHomeMode, history, push, setTab, toast } = useStore();

  // -----------------------------------------------------------------------
  // 1. 海报大厅状态与数据
  // -----------------------------------------------------------------------
  const [hotVideos, setHotVideos] = useState<VideoCard[]>([]);
  const [discoverVideos, setDiscoverVideos] = useState<VideoCard[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastWatchedDetail, setLastWatchedDetail] = useState<Detail | null>(null);
  const hallLoadedRef = useRef(false);

  // 观看记录中最靠前（最近观看）的一条
  const latestWatch = history.length > 0 ? history[0] : null;

  // 加载最近观看的剧集详情
  useEffect(() => {
    let alive = true;
    if (!latestWatch?.id) {
      setLastWatchedDetail(null);
      return;
    }
    api.video(latestWatch.id)
      .then((detail) => {
        if (alive) setLastWatchedDetail(detail);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [latestWatch?.id]);

  // 加载大厅初始数据（热播 + 猜你喜欢第一批）
  const initHall = useCallback(async () => {
    try {
      // 1. 获取热播榜
      const rankRes = await api.rank("hot").catch(() => null);
      if (rankRes?.items?.length) {
        setHotVideos(rankRes.items.map(rankItemToVideoCard));
      } else {
        const feedRes = await api.feed(1, 10).catch(() => null);
        if (feedRes?.items?.length) setHotVideos(feedRes.items);
      }

      // 2. 随机抽取一个起始页（1~30），让每次打开大厅都有新鲜感
      const randomStart = Math.floor(Math.random() * 20) + 1;
      const discRes = await api.feed(randomStart, 12).catch(() => null);
      if (discRes?.items?.length) {
        setDiscoverVideos(discRes.items);
        setDiscoverPage(randomStart);
      }
    } catch {
      /* 静默失败或由错误状态展示 */
    }
  }, []);

  useEffect(() => {
    if (!hallLoadedRef.current) {
      hallLoadedRef.current = true;
      void initHall();
    }
  }, [initHall]);

  // 大厅“换一批”：从全库 670+ 页中随机抽取一页
  const handleShuffleDiscover = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 随机挑选 1 到 60 之间的页码
      const randomPage = Math.floor(Math.random() * 60) + 1;
      const res = await api.feed(randomPage, 12);
      if (res?.items?.length) {
        setDiscoverVideos(res.items);
        setDiscoverPage(randomPage);
        toast("已为您换了一批精选短剧", "ok");
      } else {
        toast("暂未获取到更多内容，请稍后再试", "info");
      }
    } catch (e) {
      toast((e as Error).message || "刷新失败", "info");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, toast]);

  // 大厅瀑布流无限滚动加载
  const handleLoadMoreDiscover = useCallback(async () => {
    if (loadingDiscover) return;
    setLoadingDiscover(true);
    try {
      const nextPage = discoverPage + 1;
      const res = await api.feed(nextPage, 12);
      const list = res?.items || [];
      if (list.length) {
        setDiscoverVideos((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...list.filter((x) => !seen.has(x.id))];
        });
        setDiscoverPage(nextPage);
      }
    } catch {
      /* 静默 */
    } finally {
      setLoadingDiscover(false);
    }
  }, [discoverPage, loadingDiscover]);

  // -----------------------------------------------------------------------
  // 2. 沉浸刷剧流状态与数据
  // -----------------------------------------------------------------------
  const [feedItems, setFeedItems] = useState<VideoCard[]>([]);
  const [feedPage, setFeedPage] = useState(1);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedDone, setFeedDone] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const feedLoadedRef = useRef(false);

  const loadFeedPage = useCallback(async (p: number, reset = false) => {
    if (feedLoading && !reset) return;
    setFeedLoading(true);
    try {
      const res = await api.feed(p, 10);
      const list = res?.items || [];
      setFeedItems((prev) => {
        if (reset) return list;
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...list.filter((x) => !seen.has(x.id))];
      });
      setFeedPage(p);
      if (!list.length || (res?.pagination && p >= res.pagination.pages)) {
        setFeedDone(true);
      }
    } catch {
      /* ignore */
    } finally {
      setFeedLoading(false);
    }
  }, [feedLoading]);

  // 沉浸流初始加载：优先随机起播页码，杜绝每次都是同一部
  useEffect(() => {
    if (homeMode === "feed" && !feedLoadedRef.current) {
      feedLoadedRef.current = true;
      const randomInitialPage = Math.floor(Math.random() * 25) + 1;
      void loadFeedPage(randomInitialPage, true);
    }
  }, [homeMode, loadFeedPage]);

  // 沉浸流换一批
  const handleShuffleFeed = useCallback(async () => {
    if (feedRefreshing) return;
    setFeedRefreshing(true);
    try {
      const randomPage = Math.floor(Math.random() * 50) + 1;
      await loadFeedPage(randomPage, true);
      toast("已为您换了一批短剧", "ok");
    } finally {
      setFeedRefreshing(false);
    }
  }, [feedRefreshing, loadFeedPage, toast]);

  // -----------------------------------------------------------------------
  // 渲染分流：沉浸流 vs 海报大厅
  // -----------------------------------------------------------------------

  // [模式 1]：沉浸全屏刷剧模式
  if (homeMode === "feed") {
    const feedIds = feedItems.map((v) => v.id);
    return (
      <div className="absolute inset-0 bg-black">
        {feedIds.length ? (
          <Feed
            videoIds={feedIds}
            mode="home"
            active={active}
            bottomInset={bottomInset}
            onNearEnd={() => {
              if (!feedLoading && !feedDone) loadFeedPage(feedPage + 1);
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="w-9 h-9 spinner" />
          </div>
        )}

        {/* 沉浸流顶部浮动药丸：切回大厅 & 换一批 */}
        <div
          className="absolute right-3.5 z-40 flex items-center gap-2 pointer-events-auto"
          style={{ top: "calc(var(--sat, 0px) + 8px)" }}
        >
          <button
            type="button"
            onClick={handleShuffleFeed}
            disabled={feedRefreshing}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-medium bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/30 hover:bg-black/80 transition-all active:scale-95 shadow-md"
            title="换一批新短剧"
          >
            <IRefresh size={13} className={feedRefreshing ? "animate-spin" : ""} />
            <span>换一批</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setHomeMode("hall");
              toast("已切回选剧大厅", "ok");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-medium bg-black/60 backdrop-blur-md text-white border border-white/15 hover:bg-black/80 transition-all active:scale-95 shadow-md"
            title="切换到海报选剧大厅"
          >
            <IGrid size={13} />
            <span>选剧大厅</span>
          </button>
        </div>
      </div>
    );
  }

  // [模式 2]：海报选剧大厅模式（默认推荐，清爽不喧闹）
  const allCardIds = [
    ...discoverVideos.map((x) => x.id),
    ...hotVideos.map((x) => x.id),
  ];

  return (
    <div className="absolute inset-0 bg-canvas flex flex-col text-on select-none">
      {/* 顶部常驻导航栏 */}
      <header
        className="shrink-0 z-20 px-4 pb-2.5 bg-canvas/80 backdrop-blur-xl border-b border-white/5 transition-all"
        style={{ paddingTop: "calc(var(--sat, 0px) + 10px)" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <div>
              <div className="text-[17px] font-bold leading-tight tracking-tight flex items-center gap-1.5">
                <span>黄果短剧</span>
                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-primary/20 text-primary border border-primary/30">
                  AI
                </span>
              </div>
              <div className="text-[10px] text-mut leading-none mt-0.5">
                3,300+ 热门剧集 · 纯净自用
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHomeMode("feed");
                toast("进入沉浸随心刷模式", "ok");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-gradient-to-r from-amber-500/20 to-primary/20 hover:from-amber-500/30 hover:to-primary/30 text-primary border border-primary/30 transition-all active:scale-95 shadow-sm"
              title="进入抖音式上下滑沉浸播放"
            >
              <IPlayF size={12} className="text-primary fill-primary" />
              <span>沉浸随心刷</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("search")}
              aria-label="搜索"
              className="w-8 h-8 rounded-full bg-s2 flex items-center justify-center text-mut hover:text-on transition-colors pressable"
            >
              <ISearch size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* 大厅滚动内容区 */}
      <main
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
            void handleLoadMoreDiscover();
          }
        }}
        className="flex-1 scroll-y px-4 pt-3.5 pb-24 max-w-4xl mx-auto w-full"
      >
        {/* ================= 1. 继续观看（上次追剧横幅卡片） ================= */}
        {latestWatch && lastWatchedDetail && (
          <section className="mb-6 a-rise">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[13px] font-bold text-on flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>继续观看</span>
              </span>
              <span className="text-[11px] text-mut">
                上次看到第 {latestWatch.ep} 集
              </span>
            </div>

            <div
              onClick={() => {
                push({
                  kind: "feed",
                  videoIds: [latestWatch.id, ...allCardIds.filter((id) => id !== latestWatch.id)],
                  index: 0,
                  title: "继续观看",
                  startEp: latestWatch.ep,
                  startTime: latestWatch.t,
                });
              }}
              className="relative overflow-hidden rounded-2xl bg-s1 p-3.5 ring-1 ring-white/10 hover:ring-primary/40 transition-all cursor-pointer group shadow-lg active:scale-[0.99]"
            >
              {/* 背景虚化光晕 */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-2xl opacity-20 scale-125 pointer-events-none"
                style={{ backgroundImage: `url(${lastWatchedDetail.cover})` }}
              />

              <div className="relative flex items-center gap-3.5">
                {/* 封面缩略图 */}
                <div className="relative w-16 h-22 rounded-xl overflow-hidden bg-black shrink-0 ring-1 ring-white/10 shadow-md">
                  <Img src={lastWatchedDetail.cover} />
                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                    <span className="w-7 h-7 rounded-full bg-primary/90 text-on-primary flex items-center justify-center shadow-md">
                      <IPlayF size={12} className="ml-0.5" />
                    </span>
                  </div>
                </div>

                {/* 剧名与进度 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-on truncate group-hover:text-primary transition-colors">
                    {lastWatchedDetail.title}
                  </div>
                  <div className="text-[11.5px] text-mut mt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-s3 text-primary text-[10.5px] font-medium border border-primary/20">
                      第 {latestWatch.ep} 集
                    </span>
                    <span>
                      {latestWatch.t > 0 ? fmtTime(latestWatch.t) : "刚开始"}
                      {latestWatch.dur > 0 && ` / ${fmtTime(latestWatch.dur)}`}
                    </span>
                  </div>

                  {/* 进度条 */}
                  <div className="mt-2.5 w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{
                        width: `${
                          latestWatch.dur > 0
                            ? Math.min(100, Math.round((latestWatch.t / latestWatch.dur) * 100))
                            : 10
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* 右侧播放胶囊 */}
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-[12px] font-bold shadow-md shrink-0 transition-transform group-hover:scale-105"
                >
                  续播
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ================= 2. 今日热播（横向卷轴） ================= */}
        {hotVideos.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400">
                  <IFireF size={16} />
                </span>
                <span className="text-[15px] font-bold text-on">今日热播</span>
                <span className="text-[11px] text-mut ml-1">大家都在看</span>
              </div>
            </div>

            <div className="scroll-x flex gap-3 pb-1 snap-x">
              {hotVideos.map((v, i) => (
                <RowCard
                  key={v.id}
                  v={v}
                  onOpen={() => {
                    push({
                      kind: "feed",
                      videoIds: hotVideos.map((x) => x.id),
                      index: i,
                      title: "今日热播",
                    });
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ================= 3. 猜你喜欢 / 发现新剧（瀑布流） ================= */}
        <section>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-primary">
                <IStarsF size={16} />
              </span>
              <span className="text-[15px] font-bold text-on">猜你喜欢</span>
              <span className="text-[11px] text-mut ml-1">全库海量随机探索</span>
            </div>

            <button
              type="button"
              onClick={handleShuffleDiscover}
              disabled={refreshing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-s2 hover:bg-s3 text-primary border border-primary/20 transition-all active:scale-95 pressable"
            >
              <IRefresh size={12} className={refreshing ? "animate-spin" : ""} />
              <span>换一批</span>
            </button>
          </div>

          {discoverVideos.length > 0 ? (
            <Masonry
              videos={discoverVideos}
              onOpen={(v) => {
                const idx = discoverVideos.findIndex((x) => x.id === v.id);
                push({
                  kind: "feed",
                  videoIds: discoverVideos.map((x) => x.id),
                  index: idx >= 0 ? idx : 0,
                  title: "猜你喜欢",
                });
              }}
            />
          ) : (
            <div className="py-12 flex items-center justify-center">
              <div className="w-8 h-8 spinner" />
            </div>
          )}

          {loadingDiscover && (
            <div className="py-6 flex items-center justify-center">
              <div className="w-6 h-6 spinner" />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
