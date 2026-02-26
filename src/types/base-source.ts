/**
 * 基础书源接口
 * 对应 legado 项目的 BaseSource.kt
 */

/**
 * 基础书源接口（所有书源类型共享的字段）
 */
export interface BaseSource {
  /** 并发率 */
  concurrentRate?: string;
  /** 登录地址 */
  loginUrl?: string;
  /** 登录UI */
  loginUi?: string;
  /** 请求头 */
  header?: string;
  /** 启用 CookieJar */
  enabledCookieJar?: boolean;
  /** JS库 */
  jsLib?: string;
}
