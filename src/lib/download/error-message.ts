/**
 * 下载错误文案：面向用户的短描述（列表不展示技术细节，改走通知）。
 */

function rawErrorText(raw: unknown): string {
  if (raw instanceof Error) return raw.message || String(raw);
  return String(raw || '').trim();
}

/** 已格式化过的用户文案（createTask → UI 二次 format 时保持幂等） */
const FORMATTED_USER_MSG =
  /^(资源不存在或链接已失效|没有访问权限|断点续传不被支持|抖音需要浏览器 Cookie|网络连接失败|当前地区或语言版本无法观看|未能解析到可下载的视频地址|安全连接失败|任务已取消|下载失败，请稍后重试|该站点需要增强 TLS|需要完成 Cloudflare)/;

export function formatDownloadErrorForUser(raw: unknown): string {
  const msg = rawErrorText(raw).trim();
  if (!msg) return '下载失败，请稍后重试';
  if (FORMATTED_USER_MSG.test(msg)) return msg;

  const lower = msg.toLowerCase();

  if (/404|not\s*found|状态异常:\s*404/i.test(msg)) {
    return '资源不存在或链接已失效（404）';
  }
  // CF 须先于泛化 403：否则 Just a moment / Cloudflare 验证 会被吃成「访问权限」
  if (/Cloudflare 验证|cf_clearance|Just a moment|challenge-platform|cf-chl/i.test(msg)) {
    return '需要完成 Cloudflare 人机验证后重试';
  }
  if (/403|forbidden|拒绝访问/i.test(msg)) {
    return '没有访问权限（可能需要登录或更换地区）';
  }
  if (/416|range\s*not\s*satisfiable|状态异常:\s*416/i.test(msg)) {
    return '断点续传不被支持，请删除任务后重新下载';
  }
  if (/fresh cookies|cookiesfrombrowser|s_v_web_id|anti-bot|empty detail|douyin returned empty/i.test(msg)) {
    return '抖音需要浏览器 Cookie（设置 cookiesfrombrowser），或先在浏览器打开该视频后再试';
  }
  if (/timed?\s*out|超时|10060|connection.*reset|连接失败|failed to (connect|fetch)|network|dns|name.?resolv|无法连接|error sending request|请求发送失败/i.test(lower)) {
    return '网络连接失败，请检查代理或网络后重试';
  }
  // 勿用裸 `geo` / `地区`：会把 geo-utils、更换地区、二次 format 误判成地区锁
  if (
    /\bgeo[-\s_]?restrict|\bgeoblock|\bgeo[-\s]?blocked\b|地区受限|地区限制|版权.*过期|broadcast rights|not available in this (?:country|region|language)/i.test(
      msg,
    )
  ) {
    return '当前地区或语言版本无法观看该节目';
  }
  if (/需要 JA3|VITE_YTDLP_TLS_IMPERSONATE|tls.?impersonate/i.test(msg)) {
    return '该站点需要增强 TLS（JA3）。请使用 enhanced 构建，或开启 VITE_YTDLP_TLS_IMPERSONATE';
  }
  if (/未解析到可下载|no media|no formats|does not contain a video/i.test(msg)) {
    return '未能解析到可下载的视频地址';
  }
  if (/certificate|ssl|tls|handshake/i.test(lower) && !/impersonate|JA3/i.test(msg)) {
    return '安全连接失败，请检查网络或代理设置';
  }
  if (/paused|已取消|cancel/i.test(lower)) {
    return '任务已取消';
  }

  const oneLine = msg.replace(/\s+/g, ' ');
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}

/** 创建前探测失败时的标题 */
export function formatDownloadCreateFailureTitle(raw: unknown): string {
  const msg = rawErrorText(raw).trim();
  if (/404|not\s*found/i.test(msg)) return '无法添加任务';
  if (/timed?\s*out|连接|network|10060/i.test(msg)) return '无法连接目标地址';
  return '无法添加下载任务';
}

/**
 * 下载模块错误统一打到控制台（保留原始 Error / 堆栈），并返回用户可见文案。
 */
export function logDownloadError(context: string, raw: unknown, extra?: Record<string, unknown>): string {
  const userMsg = formatDownloadErrorForUser(raw);
  const detail = rawErrorText(raw) || userMsg;
  if (raw instanceof Error) {
    console.error(`[download] ${context}: ${detail}`, raw, extra ?? '');
  } else {
    console.error(`[download] ${context}: ${detail}`, extra ?? '');
  }
  return userMsg;
}
