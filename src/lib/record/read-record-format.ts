/** 阅读记录展示用时长与相对时间格式化 */

export function formatReadDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 秒';
  if (seconds < 60) return `${Math.round(seconds)} 秒`;

  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days} 天 ${remainHours} 小时` : `${days} 天`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 上次阅读时间的相对展示（今天 / 昨天 / N 天前） */
export function formatRelativeLastRead(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const now = Date.now();
  const diffMs = now - ms;
  if (diffMs < 60_000) return '刚刚';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;

  const todayStart = startOfLocalDay(now);
  const targetStart = startOfLocalDay(ms);
  const dayDiff = Math.round((todayStart - targetStart) / 86_400_000);

  if (dayDiff === 0) return `今天 ${formatClock(ms)}`;
  if (dayDiff === 1) return `昨天 ${formatClock(ms)}`;
  if (dayDiff < 7) return `${dayDiff} 天前`;

  const d = new Date(ms);
  const y = d.getFullYear();
  const M = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const currentYear = new Date(now).getFullYear();
  return currentYear === y ? `${M}-${day} ${formatClock(ms)}` : `${y}-${M}-${day}`;
}

/** ISO 本地日期键 yyyy-MM-dd */
export function formatDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const M = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${M}-${day}`;
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 友好日期（今天 / 昨天 / 前天 / M月d日 周X） */
export function formatFriendlyDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) return dateKey;

  const target = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetStart = new Date(target);
  targetStart.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - targetStart.getTime()) / 86_400_000);

  if (dayDiff === 0) return '今天';
  if (dayDiff === 1) return '昨天';
  if (dayDiff === 2) return '前天';

  const weekday = WEEKDAY_ZH[target.getDay()] ?? '';
  return `${m}月${day}日 周${weekday}`;
}

/** 完整日期时间 yyyy-MM-dd HH:mm */
export function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--';
  const d = new Date(ms);
  const y = d.getFullYear();
  const M = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${M}-${day} ${formatClock(ms)}`;
}
