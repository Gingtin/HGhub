import { queryClient } from "./queryClient";
import { api } from "./api";
import type { Detail, PlayInfo, Post, RankItem, VideoCard, Paged } from "./types";

export const queryKeys = {
  feed: (page: number) => ["feed", page] as const,
  category: (cate: string, page: number) => ["category", cate, page] as const,
  rank: (kind: string) => ["rank", kind] as const,
  search: (q: string, page: number) => ["search", q, page] as const,
  posts: (page: number) => ["posts", page] as const,
  post: (id: number) => ["post", id] as const,
  video: (id: number) => ["video", id] as const,
  play: (id: number, ep: number) => ["play", id, ep] as const,
};

/** 详情缓存与 SWR 去重获取 */
export async function fetchVideoDetail(id: number): Promise<Detail> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.video(id),
    queryFn: () => api.video(id),
    staleTime: 5 * 60 * 1000,
  });
}

/** 播放链接缓存获取 */
export async function fetchPlayInfo(id: number, ep: number): Promise<PlayInfo> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.play(id, ep),
    queryFn: () => api.play(id, ep),
    staleTime: 5 * 60 * 1000,
  });
}

/** 预取邻近视频详情 */
export function prefetchVideoDetail(id: number): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.video(id),
    queryFn: () => api.video(id),
    staleTime: 5 * 60 * 1000,
  });
}

/** 吃瓜帖子缓存获取 */
export async function fetchPostDetail(id: number): Promise<Post> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.post(id),
    queryFn: () => api.post(id),
    staleTime: 5 * 60 * 1000,
  });
}

/** 预取帖子详情 */
export function prefetchPostDetail(id: number): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.post(id),
    queryFn: () => api.post(id),
    staleTime: 5 * 60 * 1000,
  });
}

/** 排行榜数据缓存 */
export async function fetchRanks(kind: "hot" | "recommend" | "potential"): Promise<RankItem[]> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.rank(kind),
    queryFn: async () => (await api.rank(kind)).items,
    staleTime: 3 * 60 * 1000,
  });
}
