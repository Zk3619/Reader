/**
 * DateRange — yt-dlp utils.DateRange subset (YYYYMMDD / today / yesterday / now±Nd).
 */

export type Ymd = string; // YYYYMMDD

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatYmd(d: Date): Ymd {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

/** Parse YYYYMMDD or relative (today|yesterday|now)(-N(day|week|month|year)s?)? */
export function dateFromStr(dateStr: string): Ymd {
  const s = String(dateStr || '').trim();
  if (/^\d{8}$/.test(s)) return s;

  const rel =
    /^(now|today|yesterday)(?:-(\d+)(day|week|month|year)s?)?$/i.exec(s);
  if (!rel) {
    throw new Error(`Invalid date format "${dateStr}"`);
  }

  const base = new Date();
  // Use UTC date parts for stable YYYYMMDD
  let y = base.getUTCFullYear();
  let m = base.getUTCMonth();
  let day = base.getUTCDate();
  const kind = rel[1]!.toLowerCase();
  if (kind === 'yesterday') day -= 1;

  const amount = rel[2] ? Number(rel[2]) : 0;
  const unit = (rel[3] || 'day').toLowerCase();
  if (amount) {
    if (unit.startsWith('day')) day -= amount;
    else if (unit.startsWith('week')) day -= amount * 7;
    else if (unit.startsWith('month')) m -= amount;
    else if (unit.startsWith('year')) y -= amount;
  }

  const out = new Date(Date.UTC(y, m, day));
  return formatYmd(out);
}

export class DateRange {
  start: Ymd;
  end: Ymd;

  constructor(start?: string | null, end?: string | null) {
    this.start = start != null && start !== '' ? dateFromStr(start) : '00000101';
    this.end = end != null && end !== '' ? dateFromStr(end) : '99991231';
    if (this.start > this.end) {
      throw new Error(`Date range start ${this.start} must be before end ${this.end}`);
    }
  }

  static day(day: string): DateRange {
    const d = dateFromStr(day);
    return new DateRange(d, d);
  }

  /** upload_date YYYYMMDD or Date-like string */
  contains(date: string | Ymd): boolean {
    let ymd: string;
    try {
      ymd = /^\d{8}$/.test(String(date)) ? String(date) : dateFromStr(String(date));
    } catch {
      return false;
    }
    return this.start <= ymd && ymd <= this.end;
  }

  toString(): string {
    return `${this.start} - ${this.end}`;
  }
}

/** Parse daterange param: DateRange | [start,end] | {start,end} | "START:END" */
export function resolveDateRange(raw: unknown): DateRange | null {
  if (raw == null || raw === false) return null;
  if (raw instanceof DateRange) return raw;
  if (typeof raw === 'string') {
    const parts = raw.split(':');
    if (parts.length === 2) return new DateRange(parts[0] || null, parts[1] || null);
    return DateRange.day(raw);
  }
  if (Array.isArray(raw) && raw.length >= 1) {
    return new DateRange(
      raw[0] != null ? String(raw[0]) : null,
      raw[1] != null ? String(raw[1]) : null,
    );
  }
  if (typeof raw === 'object') {
    const o = raw as { start?: string; end?: string };
    return new DateRange(o.start ?? null, o.end ?? null);
  }
  return null;
}
