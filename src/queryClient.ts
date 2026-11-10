import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 分钟内数据视为新鲜，避免频繁切 tab 重复请求
      gcTime: 5 * 60 * 1000,     // 5 分钟后未被使用的缓存自动垃圾回收，大幅降低 WebView 堆内存
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
