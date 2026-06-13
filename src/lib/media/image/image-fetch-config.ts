/**
 * 漫画阅读器插图网络参数（比正文 inline 更宽松，大图/慢源更易超时）
 */

/** 单次 HTTP 超时（毫秒） */
export const MANGA_IMAGE_FETCH_TIMEOUT_MS = 60_000;

/** 失败后额外重试次数（不含首次，共 1 + N 次请求） */
export const MANGA_IMAGE_DEFAULT_RETRIES = 5;

/** 重试间隔基数（毫秒），实际指数退避 */
export const MANGA_IMAGE_RETRY_DELAY_MS = 1_500;
