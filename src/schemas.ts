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

export const authorSchema = z.object({
  id: z.coerce.number().default(0),
  name: z.string().default(""),
  avatar: z.string().optional(),
  followers: z.coerce.number().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().default(1),
  pages: z.coerce.number().default(1),
  size: z.coerce.number().default(20),
  total: z.coerce.number().default(0),
});

export const videoCardSchema = z.object({
  id: z.coerce.number(),
  title: z.string().default(""),
  cover: z.string().default(""),
  description: z.string().optional(),
  tags: z.array(z.string()).catch([]),
  score: z.coerce.number().default(0),
  episode_count: z.coerce.number().default(0),
  total_episodes: z.coerce.number().default(0),
  duration: z.string().optional(),
  hot: z.coerce.number().default(0),
  like_count: z.coerce.number().default(0),
  collect_count: z.coerce.number().default(0),
  comment_count: z.coerce.number().default(0),
  is_finished: z.boolean().default(false),
  is_original: z.coerce.number().default(0),
  created_at: z.string().optional(),
  last_ep_at: z.coerce.number().optional(),
  new_at: z.coerce.number().optional(),
  author: authorSchema.optional(),
});

export const pagedVideoCardsSchema = z.object({
  items: z.array(videoCardSchema).catch([]),
  pagination: paginationSchema.default({ page: 1, pages: 1, size: 20, total: 0 }),
});

export const episodeSchema = z.object({
  ep_num: z.coerce.number(),
  title: z.string().default(""),
  duration: z.coerce.number().default(0),
  status: z.coerce.number().default(1),
});

export const detailSchema = z.object({
  id: z.coerce.number(),
  title: z.string().default(""),
  description: z.string().default(""),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  tag_links: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  score: z.coerce.number().default(0),
  episode_count: z.coerce.number().default(0),
  total_episodes: z.coerce.number().default(0),
  episodes: z.array(episodeSchema).catch([]),
  counts: z.object({
    collect: z.coerce.number().default(0),
    comment: z.coerce.number().default(0),
    hot: z.coerce.number().default(0),
    like: z.coerce.number().default(0),
  }).default({ collect: 0, comment: 0, hot: 0, like: 0 }),
  author: authorSchema.extend({
    is_following: z.boolean().optional(),
    following: z.coerce.number().optional(),
    like_count: z.coerce.number().optional(),
  }).default({ id: 0, name: "" }),
  interaction: z.object({
    collected: z.boolean().default(false),
    liked: z.boolean().default(false),
    liked_ep: z.coerce.number().optional(),
  }).optional(),
  video_url: z.string().optional(),
  video_url_hevc: z.string().optional(),
  is_finished: z.boolean().default(false),
  is_original: z.coerce.number().default(0),
  video_type: z.coerce.number().optional(),
  duration: z.coerce.number().optional(),
  created_at: z.string().optional(),
});

export const playInfoSchema = z.object({
  id: z.coerce.number(),
  ep_num: z.coerce.number(),
  duration: z.coerce.number().default(0),
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
  rank: z.coerce.number().default(0),
  video_id: z.coerce.number().default(0),
  title: z.string().default(""),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  score: z.coerce.number().default(0),
  cate_name: z.string().default(""),
  episode_count: z.coerce.number().default(0),
  is_finished: z.boolean().default(false),
  metric_label: z.string().default(""),
  metric_value: z.coerce.number().default(0),
  metrics: z.object({
    collect: z.coerce.number().default(0),
    comment: z.coerce.number().default(0),
    like: z.coerce.number().default(0),
    play: z.coerce.number().default(0),
  }).default({ collect: 0, comment: 0, like: 0, play: 0 }),
});

export const postSchema = z.object({
  id: z.coerce.number(),
  title: z.string().default(""),
  desc: z.string().optional(),
  content: z.string().optional(),
  cover: z.string().default(""),
  tags: z.array(z.string()).catch([]),
  hot: z.coerce.number().default(0),
  video_url: z.string().optional(),
  video_id: z.coerce.number().optional(),
  author: z.object({
    id: z.coerce.number().default(0),
    name: z.string().default(""),
    avatar: z.string().optional(),
    is_following: z.boolean().optional(),
  }).optional(),
  counts: z.object({
    like: z.coerce.number().default(0),
    comment: z.coerce.number().default(0),
    collect: z.coerce.number().default(0),
    share: z.coerce.number().optional(),
    hot: z.coerce.number().optional(),
  }).optional(),
  created_at: z.string().optional(),
  publish_time: z.string().optional(),
});

export const pagedPostsSchema = z.object({
  items: z.array(postSchema).catch([]),
  pagination: paginationSchema.default({ page: 1, pages: 1, size: 20, total: 0 }),
});

/** 边界校验与清洗助手函数 */
export function sanitizeVideoCards(data: unknown): Paged<VideoCard> {
  const parsed = pagedVideoCardsSchema.safeParse(data);
  if (parsed.success) return parsed.data as Paged<VideoCard>;
  return { items: [], pagination: { page: 1, pages: 1, size: 20, total: 0 } };
}

export function sanitizeDetail(data: unknown): Detail {
  return detailSchema.parse(data) as Detail;
}

export function sanitizePlayInfo(data: unknown): PlayInfo {
  return playInfoSchema.parse(data) as PlayInfo;
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
