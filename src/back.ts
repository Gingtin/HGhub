/** 全局返回拦截：支持按栈顶优先消费（面板、浮层、全屏优先，未消费则走导航栈）。 */
export type Handler = () => boolean;

const handlers: Handler[] = [];

/** 压入一个返回拦截器，返回清理函数 */
export function pushBackHandler(h: Handler): () => void {
  handlers.push(h);
  return () => {
    const idx = handlers.lastIndexOf(h);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

/** 兼容旧代码单个 handler 设置 */
export function setBackHandler(h: Handler | null) {
  if (!h) {
    handlers.length = 0;
    return;
  }
  handlers.push(h);
}

/** 返回 true 表示已被消费（不再退栈） */
export function runBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i]()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}