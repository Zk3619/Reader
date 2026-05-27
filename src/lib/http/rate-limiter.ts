/**
 * 并发速率限制器
 * 对应 legado 项目的并发速率控制
 * 
 * 格式：10/1s 表示每秒10个请求
 * 格式：5/100ms 表示每100毫秒5个请求
 */

interface RateLimiter {
  acquire(): Promise<void>;
}

/**
 * 创建速率限制器
 */
export function createRateLimiter(rate: string): RateLimiter {
  const trimmed = rate.trim();
  // Legado：纯数字表示两次请求间隔（毫秒），等价于 1/间隔
  if (/^\d+$/.test(trimmed)) {
    const intervalMs = parseInt(trimmed, 10);
    if (intervalMs > 0) {
      return new TokenBucketRateLimiter(1, intervalMs);
    }
  }

  const match = trimmed.match(/^(\d+)\/(\d+)([sm]?)$/);
  if (!match) {
    throw new Error(`无效的速率格式: ${rate}，应为 "数量/时间单位"（如 "10/1s"）或间隔毫秒数（如 "1500"）`);
  }

  const count = parseInt(match[1], 10);
  const time = parseInt(match[2], 10);
  const unit = match[3] || 's';

  // 转换为毫秒
  let intervalMs: number;
  switch (unit) {
    case 's':
      intervalMs = time * 1000;
      break;
    case 'm':
      intervalMs = time * 60 * 1000;
      break;
    default:
      intervalMs = time; // 假设是毫秒
  }

  return new TokenBucketRateLimiter(count, intervalMs);
}

/**
 * 令牌桶速率限制器
 */
class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillInterval: number;
  private readonly tokensPerRefill: number;
  private queue: Array<() => void> = [];

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.maxTokens = maxTokens;
    this.refillInterval = refillIntervalMs;
    this.tokensPerRefill = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    return new Promise<void>(resolve => {
      this.refill();
      
      if (this.tokens > 0) {
        this.tokens--;
        resolve();
      } else {
        this.queue.push(resolve);
        this.scheduleRefill();
      }
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.refillInterval) {
      const refills = Math.floor(elapsed / this.refillInterval);
      this.tokens = Math.min(this.maxTokens, this.tokens + refills * this.tokensPerRefill);
      this.lastRefill = now;
    }
  }

  private scheduleRefill(): void {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const nextRefill = this.lastRefill + this.refillInterval;
    const delay = Math.max(0, nextRefill - now);

    setTimeout(() => {
      this.refill();
      
      // 处理队列中的请求
      while (this.queue.length > 0 && this.tokens > 0) {
        this.tokens--;
        const resolve = this.queue.shift()!;
        resolve();
      }
      
      // 如果还有请求在队列中，继续调度
      if (this.queue.length > 0) {
        this.scheduleRefill();
      }
    }, delay);
  }
}
