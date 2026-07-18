/**
 * 统一持久化管线：域注册契约
 */

export type PersistPriority = 'critical' | 'deferred';

export type PersistReason = 'change' | 'flush';

export interface PersistDomain {
  id: string;
  version: number;
  priority: PersistPriority;
  hydrate: () => Promise<void>;
  /** 变更落盘；flush 时应取消节流并同步写完 */
  persist?: (reason: PersistReason) => Promise<void>;
  /** 可选：与 persist('flush') 等价的显式入口 */
  flush?: () => Promise<void>;
  /** 备份导出：返回可 JSON 序列化的快照 */
  exportSnapshot?: () => Promise<unknown> | unknown;
  /** 备份导入 */
  importSnapshot?: (data: unknown) => Promise<void> | void;
}
