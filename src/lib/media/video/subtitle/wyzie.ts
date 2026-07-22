/**
 * 在线字幕搜索（E3 尾）：wyzie 类 API，无 key 则隐藏入口
 */

const STORAGE_KEY = 'reader.video.wyzie.v1';

export type WyzieConfig = {
  apiKey: string;
  apiBase: string;
};

export function getWyzieConfig(): WyzieConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { apiKey: '', apiBase: 'https://api.wyzie.ru' };
    return { apiKey: '', apiBase: 'https://api.wyzie.ru', ...JSON.parse(raw) };
  } catch {
    return { apiKey: '', apiBase: 'https://api.wyzie.ru' };
  }
}

export function setWyzieConfig(patch: Partial<WyzieConfig>): WyzieConfig {
  const next = { ...getWyzieConfig(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function isWyzieConfigured(): boolean {
  return Boolean(getWyzieConfig().apiKey.trim());
}

export type WyzieSubtitleHit = {
  id: string;
  name: string;
  url: string;
  language?: string;
};

/** 按标题搜索；具体路径以 wyzie 文档为准，失败时返回空数组 */
export async function searchWyzieSubtitles(query: string): Promise<WyzieSubtitleHit[]> {
  const cfg = getWyzieConfig();
  if (!isWyzieConfigured()) throw new Error('未配置 wyzie API key');
  const q = query.trim();
  if (!q) return [];
  const url = `${cfg.apiBase.replace(/\/$/, '')}/search?query=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
  });
  if (!res.ok) throw new Error(`字幕搜索失败 HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .map((row, i) => {
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? r.title ?? `sub-${i}`);
      const subUrl = String(r.url ?? r.downloadUrl ?? '');
      if (!subUrl) return null;
      return {
        id: String(r.id ?? i),
        name,
        url: subUrl,
        language: r.language ? String(r.language) : undefined,
      };
    })
    .filter(Boolean) as WyzieSubtitleHit[];
}
