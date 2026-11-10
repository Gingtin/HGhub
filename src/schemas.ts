import { z } from "zod";
import type {
  Author,
  Comment,
  CommentPage,
  Detail,
  Episode,
  Paged,
  Pagination,
  PlayInfo,
  Post,
  RankItem,
  User,
  VideoCard,
} from "./types";

/**
 * 健壮的数值强制转换解析器
 * 防止后端返回 undefined/null/空字符串/NaN 时导致整个数据校验崩溃
 */
export const safeNumber = (defaultVal = 0) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return defaultVal;
    const num = Number(val);
    return Number.isNaN(num) ? defaultVal : num;
  }, z.number().default(defaultVal));

export const safeOptionalNumber = () =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    const num = Number(val);
    return Number.isNaN(num) ? undefined : num;
  }, z.number().optional());

export const authorSchema = z.object({
  id: safeNumber(0),
  name: z.string().default(""),
  avatar: z.string().optional(),
  followers: safeOptionalNumber(),
});

export const paginationSchema = z.object({
  page: safeNumber(1),
  pages: safeNumber(1),
  size: safeNumber(20),
  total: safeNumber(0),
});

export const videoCardSchema = z.object({
  id: safeNumber(0),
  title: z.string().default(""),
  cover: z.string().default(""),
  description: z.string().optional(),
  tags: z.array(z.string()).catch([]),
  score: safeNumber(0),
  episode_count: safeNumber(0),
  total_episodes: safeNumber(0),
  duration: z.string().optional(),
  hot: safeNumber(0),
  like_count: safeNumber(0),
  collect_count: safeNumber(0),
  comment_count: safeNumber(0),
  is_finished: z.boolean().default(false),
  is_original: safeNumber(0),
  created_at: z.string().optional(),
  last_ep_at: safeOptionalNumber(),
  new_at: safeOptionalNumber(),
  author: authorSchema.optional(),
});

export const pagedVideoCardsSchema = z.object({
  items: z.array(videoCardSchema).catch([]),
  pagination: paginationSchema.default({ page: 1, pages: 1, size: 20, total: 0 }),
});

export const episodeSchema = z.object({
  ep_num: safeNumber(1),
  title: z.string().default(""),
  duration: safeNumber(0),
  status: safeNumber(1),
});

export const detailSchema = z.object({
  id: safeNumber(0),
  title: z.string().default(""),
  description: z.string().default(""),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  tag_links: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  score: safeNumber(0),
  episode_count: safeNumber(0),
  total_episodes: safeNumber(0),
  episodes: z.array(episodeSchema).catch([]),
  counts: z.object({
    collect: safeNumber(0),
    comment: safeNumber(0),
    hot: safeNumber(0),
    like: safeNumber(0),
  }).default({ collect: 0, comment: 0, hot: 0, like: 0 }),
  author: authorSchema.extend({
    is_following: z.boolean().optional(),
    following: safeOptionalNumber(),
    like_count: safeOptionalNumber(),
  }).default({ id: 0, name: "" }),
  interaction: z.object({
    collected: z.boolean().default(false),
    liked: z.boolean().default(false),
    liked_ep: safeOptionalNumber(),
  }).optional(),
  video_url: z.string().optional(),
  video_url_hevc: z.string().optional(),
  is_finished: z.boolean().default(false),
  is_original: safeNumber(0),
  video_type: safeOptionalNumber(),
  duration: safeOptionalNumber(),
  created_at: z.string().optional(),
});

export const playInfoSchema = z.object({
  id: safeNumber(0),
  ep_num: safeNumber(1),
  duration: safeNumber(0),
  title: z.string().default(""),
  video_url: z.string().default(""),
  video_url_hevc: z.string().optional(),
  streams: z.object({
    main: z.string().optional(),
    hevc: z.string().optional(),
    preview: z.string().optional(),
  }).optional(),
});

export const rankItemSchema = z.object({
  rank: safeNumber(0),
  video_id: safeNumber(0),
  title: z.string().default(""),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  score: safeNumber(0),
  cate_name: z.string().default(""),
  episode_count: safeNumber(0),
  is_finished: z.boolean().default(false),
  metric_label: z.string().default(""),
  metric_value: safeNumber(0),
  metrics: z.object({
    collect: safeNumber(0),
    comment: safeNumber(0),
    like: safeNumber(0),
    play: safeNumber(0),
  }).default({ collect: 0, comment: 0, like: 0, play: 0 }),
});

export const postSchema = z.object({
  id: safeNumber(0),
  title: z.string().default(""),
  desc: z.string().optional(),
  content: z.string().optional(),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  hot: safeNumber(0),
  video_url: z.string().optional(),
  video_id: safeOptionalNumber(),
  author: z.object({
    id: safeNumber(0),
    name: z.string().default(""),
    avatar: z.string().optional(),
    is_following: z.boolean().optional(),
  }).optional(),
  counts: z.object({
    like: safeNumber(0),
    comment: safeNumber(0),
    collect: safeNumber(0),
    share: safeOptionalNumber(),
    hot: safeOptionalNumber(),
  }).optional(),
  created_at: z.string().optional(),
  publish_time: z.string().optional(),
});

export const pagedPostsSchema = z.object({
  items: z.array(postSchema).catch([]),
  pagination: paginationSchema.default({ page: 1, pages: 1, size: 20, total: 0 }),
});

/** 边界校验与清洗助手函数（安全兜底防崩溃） */
export function sanitizeVideoCards(data: unknown): Paged<VideoCard> {
  const parsed = pagedVideoCardsSchema.safeParse(data);
  if (parsed.success) return parsed.data as Paged<VideoCard>;
  return { items: [], pagination: { page: 1, pages: 1, size: 20, total: 0 } };
}

export function sanitizeDetail(data: unknown): Detail {
  const parsed = detailSchema.safeParse(data);
  if (parsed.success) return parsed.data as Detail;
  console.warn("sanitizeDetail parse fallback:", parsed.error, data);
  if (typeof data === "object" && data !== null) {
    return data as Detail;
  }
  return {
    id: 0,
    title: "",
    description: "",
    cover: "",
    tags: [],
    score: 0,
    episode_count: 0,
    total_episodes: 0,
    episodes: [],
    counts: { collect: 0, comment: 0, hot: 0, like: 0 },
    author: { id: 0, name: "" },
    is_finished: false,
    is_original: 0,
  };
}

export function sanitizePlayInfo(data: unknown): PlayInfo {
  const parsed = playInfoSchema.safeParse(data);
  if (parsed.success) return parsed.data as PlayInfo;
  console.warn("sanitizePlayInfo parse fallback:", parsed.error, data);
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    return {
      id: Number(d.id) || 0,
      ep_num: Number(d.ep_num) || 1,
      duration: Number(d.duration) || 0,
      title: typeof d.title === "string" ? d.title : "",
      video_url: typeof d.video_url === "string" ? d.video_url : "",
      video_url_hevc: typeof d.video_url_hevc === "string" ? d.video_url_hevc : undefined,
      streams: typeof d.streams === "object" && d.streams !== null ? (d.streams as any) : undefined,
    };
  }
  return { id: 0, ep_num: 1, duration: 0, title: "", video_url: "" };
}

export function sanitizeRankItems(data: unknown): RankItem[] {
  const schema = z.array(rankItemSchema).catch([]);
  return schema.parse(data) as RankItem[];
}

export function sanitizePosts(data: unknown): Paged<Post> {
  const parsed = pagedPostsSchema.safeParse(data);
  if (parsed.success) return parsed.data as Paged<Post>;
  return { items: [], pagination: { page: 1, pages: 1, size: 20, total: 0 } };
}
