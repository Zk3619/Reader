/**
 * 将音乐模块底层错误转为用户可读文案（Toast / 空态）
 * 保留简短中文业务提示；屏蔽 weapi/HTTP/堆栈等技术细节。
 */

const TECH_MARK =
  /weapi|eapi|linuxapi|返回空响应|HttpError|HTTP\s*\d|statusCode|Failed to fetch|Network Error|ECONNREFUSED|ENOTFOUND|TLS|handshake|certificate|TypeError|Cannot read propert|unexpected EOF|error sending request|at\s+async|https?:\/\//i;

function rawMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message.trim();
  if (typeof raw === 'string') return raw.trim();
  if (raw == null) return '';
  return String(raw).trim();
}

function isFriendlyChinese(msg: string): boolean {
  if (msg.length === 0 || msg.length > 80) return false;
  if (TECH_MARK.test(msg)) return false;
  // 以中文为主的业务提示
  return /[\u4e00-\u9fff]/.test(msg) && !/[={}\[\]<>]/.test(msg);
}

/** @param fallback 无法识别时的默认文案 */
export function toUserFacingMusicError(
  raw: unknown,
  fallback = '操作失败，请稍后再试',
): string {
  const msg = rawMessage(raw);
  if (!msg) return fallback;
  if (isFriendlyChinese(msg)) return msg;

  if (/NEED_LOGIN/i.test(msg)) return '需要登录后才能继续';
  if (/返回空响应|weapi|eapi|linuxapi/i.test(msg)) {
    return '音源服务暂时不可用，请稍后再试';
  }
  if (/HTTP\s*[45]\d{2}|statusCode\s*[45]\d{2}/i.test(msg)) {
    return '服务请求失败，请稍后再试';
  }
  if (
    /Failed to fetch|Network Error|ECONNREFUSED|ENOTFOUND|TLS|handshake|certificate|发送请求失败|error sending request|unexpected EOF/i.test(
      msg,
    )
  ) {
    return '网络异常，请检查网络后重试';
  }
  if (/timeout|超时/i.test(msg)) return '请求超时，请稍后再试';
  if (/不支持的|无法识别|invalid|empty|unsupported/i.test(msg)) {
    return '内容无法识别或格式不正确';
  }
  if (/脚本内容为空|所选文件为空/i.test(msg)) return '文件内容为空，请重新选择';
  if (/下载失败/i.test(msg)) return '下载失败，请稍后再试';
  if (/曲目不存在/i.test(msg)) return '找不到该曲目';
  if (/无法解析下载地址|所有下载源均失败/i.test(msg)) {
    return '暂时无法获取下载地址，请稍后再试';
  }
  if (/音乐下载已在设置中禁用/i.test(msg)) return '请先在设置中开启音乐下载';
  if (/无法连接同步服务|同步未连接|WebSocket 连接失败/i.test(msg)) {
    return '无法连接同步服务，请检查地址与网络';
  }
  if (/未配置 WebDAV|WebDAV 上无快照/i.test(msg)) return '请先完成 WebDAV 配置或确认远端已有快照';
  if (/未配置 GitHub|GitHub 上无快照|GitHub 上传失败/i.test(msg)) {
    return '请先完成 GitHub 配置或确认远端已有快照';
  }
  if (/不是 Reader 音乐备份|不支持的音乐备份|备份设置版本|缺少设置或曲库/i.test(msg)) {
    return '备份文件无效或版本不兼容';
  }

  // 含中文且无明显技术噪声时保留（截断过长）
  if (/[\u4e00-\u9fff]/.test(msg) && !TECH_MARK.test(msg)) {
    return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
  }

  return fallback;
}
