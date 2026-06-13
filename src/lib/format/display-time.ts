/**
 * 将 Unix 时间戳或常见日期字符串格式化为界面展示用时间。
 * 无法识别为有效时间时返回空字符串（调用方应隐藏更新时间区域）。
 */

function formatDateFromMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  if (y < 1970 || y > 2100) return '';
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${M}-${day} ${h}:${m}`;
}

/** 是否像已格式化的日期/时间文案（非纯数字时间戳） */
function looksLikeFormattedDateTime(s: string): boolean {
  if (/[年月日]/.test(s)) return true;
  if (/^\d+$/.test(s)) return false;
  return /\d{4}[-/.年]\d{1,2}/.test(s) || /\d{1,2}:\d{2}/.test(s);
}

/**
 * 尝试格式化为展示用更新时间；无效则返回 ''（不展示）。
 */
export function tryFormatDisplayUpdateTime(raw: string | number | undefined | null): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '--' || s === '未知') return '';

  if (looksLikeFormattedDateTime(s)) {
    return s;
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    return '';
  }

  let ms = Number(s);
  if (!Number.isFinite(ms)) return '';

  if (ms > 0 && ms < 1e12) {
    ms *= 1000;
  }

  return formatDateFromMs(ms);
}

/** 将展示用更新时间或时间戳解析为毫秒；无法解析时返回 null */
export function parseUpdateTimeToMs(raw: string | number | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '--' || s === '未知') return null;

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    let ms = Number(s);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    if (ms < 1e12) ms *= 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 1970 || y > 2100) return null;
    return ms;
  }

  const normalized = s
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-');
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const y = new Date(parsed).getFullYear();
  if (y < 1970 || y > 2100) return null;
  return parsed;
}

