export class BiliError extends Error {
  code?: number;
  constructor(message: string, opts?: { code?: number; cause?: unknown }) {
    super(message);
    this.name = 'BiliError';
    this.code = opts?.code;
    if (opts?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

export function getRandomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

export function stripControlChars(input: string, char = ''): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, char);
}

export function durationLabel(num: number): string {
  const hs = Math.floor(num / 3600);
  const mins = Math.floor((num % 3600) / 60);
  const secs = Math.round(num % 60);
  const finalHs = hs > 0 ? hs.toString().padStart(2, '0') + ':' : '';
  return `${finalHs}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function timestampLabel(ts: number, zone = 'Asia/Shanghai'): string {
  const date = new Date(ts * 1000);
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: zone,
  });
  return formatter.format(date).replace(/\//g, '-');
}

export function getPublicImages(
  data: unknown,
  prefix?: string,
): { id: string; url: string }[] {
  const images: { id: string; url: string }[] = [];
  for (const [id, url] of Object.entries((data as object) ?? {})) {
    if (
      typeof url === 'string' &&
      (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.gif'))
    ) {
      images.push({ id: prefix ? `${prefix}_${id}` : id, url });
    }
  }
  return images;
}

export function getDefaultQuality(
  ids: number[],
  preferred?: number,
): number | undefined {
  if (!ids.length) return undefined;
  if (preferred != null && ids.includes(preferred)) return preferred;
  return [...ids].sort((a, b) => b - a)[0];
}

export function sanitizeFilename(input: string): string {
  return input.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}
