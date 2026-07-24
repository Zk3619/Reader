/**
 * video_bangumi_subjects DAO（BGM 条目缓存）
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';
import type { BangumiSubject } from '@/lib/media/video/bangumi/meta/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v != null && !Array.isArray(v);
}

function subjectFromRow(row: Record<string, unknown>): BangumiSubject | null {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  let tags: string[] = [];
  try {
    const t = JSON.parse(String(row.tags_json ?? '[]')) as unknown;
    tags = Array.isArray(t) ? t.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    tags = [];
  }
  let rank = 0;
  let nsfw = false;
  let eps: number | undefined;
  try {
    const payload = JSON.parse(String(row.payload_json ?? '{}')) as unknown;
    if (isRecord(payload)) {
      if (typeof payload.rank === 'number') rank = payload.rank;
      if (payload.nsfw === true) nsfw = true;
      if (typeof payload.eps === 'number') eps = payload.eps;
      // 若 payload 已是规范化 subject
      if (typeof payload.nameCn === 'string' && typeof payload.name === 'string') {
        return {
          id,
          name: String(payload.name || row.name || ''),
          nameCn: String(payload.nameCn || row.name_cn || ''),
          summary: String(payload.summary ?? row.summary ?? ''),
          cover: String(payload.cover ?? row.cover ?? ''),
          score: Number(payload.score ?? row.score ?? 0) || 0,
          rank: Number(payload.rank ?? 0) || 0,
          votes: Number(payload.votes ?? 0) || 0,
          airDate: String(payload.airDate ?? row.air_date ?? ''),
          airWeekday: Number(payload.airWeekday ?? row.air_weekday ?? 0) || 0,
          tags: Array.isArray(payload.tags)
            ? payload.tags.map((x) => String(x)).filter(Boolean)
            : tags,
          nsfw: payload.nsfw === true,
          eps: typeof payload.eps === 'number' ? payload.eps : undefined,
        };
      }
    }
  } catch {
    /* */
  }
  return {
    id,
    name: String(row.name ?? ''),
    nameCn: String(row.name_cn ?? ''),
    cover: String(row.cover ?? ''),
    score: Number(row.score ?? 0) || 0,
    rank,
    votes: 0,
    airDate: String(row.air_date ?? ''),
    airWeekday: Number(row.air_weekday ?? 0) || 0,
    tags,
    summary: String(row.summary ?? ''),
    nsfw,
    eps,
  };
}

export async function getBangumiSubjectCached(
  id: number,
  maxAgeMs?: number,
): Promise<BangumiSubject | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.bangumiSubjects} WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows?.[0];
  if (!row) return null;
  const fetchedAt = Number(row.fetched_at ?? 0);
  if (maxAgeMs != null && maxAgeMs > 0 && Date.now() - fetchedAt > maxAgeMs) {
    return null;
  }
  return subjectFromRow(row);
}

export async function upsertBangumiSubjectCache(
  subject: BangumiSubject,
  payload?: unknown,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO ${VideoTables.bangumiSubjects}
      (id, name, name_cn, cover, score, air_date, air_weekday, tags_json, summary, payload_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, name_cn=excluded.name_cn, cover=excluded.cover,
       score=excluded.score, air_date=excluded.air_date, air_weekday=excluded.air_weekday,
       tags_json=excluded.tags_json, summary=excluded.summary,
       payload_json=excluded.payload_json, fetched_at=excluded.fetched_at`,
    [
      subject.id,
      subject.name,
      subject.nameCn,
      subject.cover || null,
      subject.score,
      subject.airDate || null,
      subject.airWeekday || 0,
      JSON.stringify(subject.tags ?? []),
      subject.summary || null,
      JSON.stringify(payload ?? subject),
      now,
    ],
  );
}
