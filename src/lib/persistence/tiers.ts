/**
 * 统一持久化三层契约（全局）
 *
 * | 层 | 后端 | 跨重启 |
 * |----|------|--------|
 * | 长期配置 | settings.json（默认 getStorage） | 是 |
 * | 长期数据 | SQLite | 是 |
 * | 临时会话 | sessionStorage | 否 |
 *
 * 禁止：以 session.json / 裸 localStorage 作为跨重启业务权威。
 * 凭据（Cookie/CF/登录）走 cred-jar，不进 settings 明文大字段。
 */

export type PersistTier = 'settings' | 'sqlite' | 'ephemeral';

export const PERSIST_TIER = {
  /** 跨重启偏好 / 模块内导航页 / UI 配置 */
  settings: 'settings' as const,
  /** 跨重启实体与进度（队列、书进度等） */
  sqlite: 'sqlite' as const,
  /** 进程内临时（关应用丢失） */
  ephemeral: 'ephemeral' as const,
} satisfies Record<string, PersistTier>;
