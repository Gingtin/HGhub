import React from "react";
import { fmt } from "../api";
import type { VideoCard } from "../types";
import { IPlayF, IStarF } from "../icons";
import { Img } from "./ui";

/* ——— 瀑布流卡片 ——— */
export function WaterfallCard({ v, onOpen }: { v: VideoCard; onOpen: () => void }) {
  const ratio = 1.34;
  return (
    <button
      onClick={onOpen}
      className="group relative w-full overflow-hidden text-left bg-s1 pressable block rounded-2xl ring-1 ring-white/10 shadow-md transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
      style={{ paddingTop: `${ratio * 100}%` }}
    >
      <Img src={v.cover} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

      {/* 状态角标 */}
      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9.5px] font-bold brand-grad text-white shadow-sm ring-1 ring-white/20">
        {v.is_finished ? "已完结" : `更新至${v.episode_count}集`}
      </span>

      {/* 评分或热度 */}
      {v.score > 0 ? (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-[9.5px] font-bold text-amber-300 ring-1 ring-amber-400/30 shadow-xs">
          <IStarF size={9} className="text-amber-300" />
          <span>{v.score.toFixed(1)}</span>
        </span>
      ) : (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-black/55 backdrop-blur-md text-[9.5px] font-semibold text-white/90 ring-1 ring-white/10">
          <IPlayF size={9} />
          <span>{fmt(v.hot)}</span>
        </span>
      )}

      {/* 底部剧名与分类/热度 */}
      <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none">
        <div className="text-[12.5px] font-semibold text-white leading-snug clamp-2 drop-shadow-sm group-hover:text-primary transition-colors">
          {v.title}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10.5px] text-white/70">
          <span className="truncate max-w-[65%] text-white/60">
            {v.tags?.[0] || v.author?.name || "精选短剧"}
          </span>
          <span className="flex items-center gap-0.5 text-white/85 font-medium shrink-0">
            <IPlayF size={9} className="text-primary" />
            <span>{fmt(v.hot)}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

/* ——— 近无缝瀑布流 ——— */
export function Masonry({ videos, onOpen, wide = false, gap = "gap-2.5" }: {
  videos: VideoCard[]; onOpen: (v: VideoCard) => void; wide?: boolean; gap?: string;
}) {
  const mb = "mb-2.5";
  return (
    <div className={`${wide ? "columns-3 xl:columns-4" : "columns-2"} ${gap} [column-fill:balance]`}>
      {videos.map((v) => (
        <div key={v.id} className={`break-inside-avoid ${mb}`}>
          <WaterfallCard v={v} onOpen={() => onOpen(v)} />
        </div>
      ))}
    </div>
  );
}

/* ——— 分类/热播横向卡片 ——— */
export function RowCard({ v, onOpen, rank }: { v: VideoCard; onOpen: () => void; rank?: number }) {
  const rankClass =
    rank === 1
      ? "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-black shadow-md shadow-amber-500/30 ring-1 ring-amber-200/50"
      : rank === 2
      ? "bg-gradient-to-br from-slate-100 via-zinc-200 to-zinc-400 text-black shadow-md shadow-zinc-300/30 ring-1 ring-white/50"
      : rank === 3
      ? "bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 text-white shadow-sm ring-1 ring-amber-400/30"
      : "bg-black/60 backdrop-blur-md text-white/90 ring-1 ring-white/15";

  return (
    <button onClick={onOpen} className="w-[118px] shrink-0 text-left snap-start pressable group active:scale-[0.98] transition-transform">
      <div className="relative w-full rounded-2xl overflow-hidden bg-s1 ring-1 ring-white/10 shadow-md" style={{ paddingTop: "135%" }}>
        <Img src={v.cover} />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/35 to-transparent pointer-events-none" />
        
        {rank !== undefined ? (
          <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums ${rankClass}`}>
            TOP {rank}
          </span>
        ) : (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold brand-grad text-white">
            {v.is_finished ? "完结" : `${v.episode_count}集`}
          </span>
        )}

        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 text-[9.5px] font-semibold text-white/90 drop-shadow">
          <IPlayF size={8.5} className="text-primary" />
          {fmt(v.hot)}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-medium text-on clamp-1 leading-tight group-hover:text-primary transition-colors">
        {v.title}
      </div>
      <div className="text-[10px] text-mut clamp-1 mt-0.5">
        {v.score > 0 ? `${v.score.toFixed(1)}分 · ` : ""}{v.tags?.slice(0, 2).join(" · ") || "短剧"}
      </div>
    </button>
  );
}

/* ——— 骨架卡片 ——— */
export function SkeletonWaterfallCard() {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-s2/60 ring-1 ring-white/5 animate-pulse mb-2.5" style={{ paddingTop: "134%" }}>
      <div className="absolute inset-0 p-3 flex flex-col justify-end">
        <div className="w-4/5 h-3.5 bg-white/10 rounded-md mb-2" />
        <div className="w-2/5 h-2.5 bg-white/5 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonRowCard() {
  return (
    <div className="w-[118px] shrink-0 text-left snap-start animate-pulse">
      <div className="w-full rounded-2xl bg-s2/60 ring-1 ring-white/5" style={{ paddingTop: "135%" }} />
      <div className="mt-2 w-4/5 h-3 bg-white/10 rounded-md" />
      <div className="mt-1 w-1/2 h-2.5 bg-white/5 rounded-md" />
    </div>
  );
}

/* ——— 排行榜条目 ——— */
export function RankRow({ item, onOpen, metricMax }: {
  item: { rank: number; video_id: number; title: string; cover: string; tags: string[]; score: number; metric_value: number; metric_label: string };
  onOpen: () => void; metricMax: number;
}) {
  const i = item.rank - 1;
  const rankBadgeClass =
    i === 0 ? "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-black font-black shadow-md shadow-amber-500/30 ring-1 ring-amber-200/50" :
    i === 1 ? "bg-gradient-to-br from-slate-100 via-zinc-300 to-zinc-400 text-black font-black shadow-md shadow-zinc-400/20 ring-1 ring-white/50" :
    i === 2 ? "bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 text-white font-black shadow-sm ring-1 ring-amber-400/30" :
    "bg-s4/80 text-dim font-bold";

  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left mb-2 pressable a-rise ring-1 ring-white/5 transition-all ${
        i < 3 ? "bg-s3/85" : "bg-s2/70"
      }`}
      style={{ animationDelay: `${Math.min(i * 35, 300)}ms` }}
    >
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] shrink-0 tabular-nums ${rankBadgeClass}`}>
        {item.rank}
      </span>
      <div className="relative w-[52px] h-[70px] rounded-lg overflow-hidden bg-s3 shrink-0 ring-1 ring-white/10 shadow-xs">
        <Img src={item.cover} />
        {item.score > 0 && (
          <span className="absolute bottom-1 right-1 px-1 rounded bg-black/60 backdrop-blur-xs text-[9px] font-bold text-amber-300">
            {item.score.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-on clamp-2 leading-snug">{item.title}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-mut truncate">{item.tags?.slice(0, 2).join(" · ") || "短剧"}</span>
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary ml-auto">{fmt(item.metric_value)}</span>
        </div>
        <div className="mt-1.5 h-[3.5px] rounded-full bg-s4/80 overflow-hidden">
          <div
            className="h-full rounded-full brand-grad"
            style={{ width: `${Math.max(6, Math.round((item.metric_value / Math.max(1, metricMax)) * 100))}%` }}
          />
        </div>
      </div>
    </button>
  );
}
