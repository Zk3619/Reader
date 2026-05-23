import { getDatabase } from '@/lib/database/database-core';
import type { HttpTTS } from '@/types';

export async function getAllHttpTTS(): Promise<HttpTTS[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>('SELECT * FROM httpTTS ORDER BY id');
  return rows.map(mapRow);
}

export async function getHttpTTS(id: number): Promise<HttpTTS | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM httpTTS WHERE id = ?',
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertHttpTTS(tts: HttpTTS): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO httpTTS (
      id, name, url, contentType, concurrentRate, loginUrl, loginUi, header,
      jsLib, enabledCookieJar, loginCheckJs, lastUpdateTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tts.id,
      tts.name,
      tts.url,
      tts.contentType ?? null,
      tts.concurrentRate ?? '0',
      tts.loginUrl ?? null,
      tts.loginUi ?? null,
      tts.header ?? null,
      tts.jsLib ?? null,
      tts.enabledCookieJar ? 1 : 0,
      tts.loginCheckJs ?? null,
      tts.lastUpdateTime,
    ]
  );
}

export async function deleteHttpTTS(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM httpTTS WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): HttpTTS {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    url: String(row.url ?? ''),
    contentType: row.contentType ? String(row.contentType) : undefined,
    concurrentRate: row.concurrentRate ? String(row.concurrentRate) : undefined,
    loginUrl: row.loginUrl ? String(row.loginUrl) : undefined,
    loginUi: row.loginUi ? String(row.loginUi) : undefined,
    header: row.header ? String(row.header) : undefined,
    jsLib: row.jsLib ? String(row.jsLib) : undefined,
    enabledCookieJar: Boolean(row.enabledCookieJar ?? 0),
    loginCheckJs: row.loginCheckJs ? String(row.loginCheckJs) : undefined,
    lastUpdateTime: Number(row.lastUpdateTime ?? 0),
  };
}
