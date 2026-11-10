import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000, // 3 分钟内数据视为新鲜，避免频繁切 tab 重复请求
      gcTime: 15 * 60 * 1000,    // 15 分钟内存留存
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
