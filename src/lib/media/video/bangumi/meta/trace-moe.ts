/**
 * trace.moe 以图搜番
 */

export type TraceMoeResult = {
  title: string;
  anilistId?: number;
  bgmId?: number;
  similarity: number;
  episode?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function searchTraceMoe(file: File): Promise<TraceMoeResult> {
  const form = new FormData();
  form.append('image', file);
  const r2 = await fetch('https://api.trace.moe/search?anilistInfo=1', {
    method: 'POST',
    body: form,
  });
  if (!r2.ok) throw new Error(`trace.moe HTTP ${r2.status}`);
  return parseTraceMoe(await r2.json());
}

function parseTraceMoe(data: unknown): TraceMoeResult {
  if (!isRecord(data) || !Array.isArray(data.result) || !data.result.length) {
    return { title: '', similarity: 0 };
  }
  const top = data.result[0];
  if (!isRecord(top)) return { title: '', similarity: 0 };
  const anilist = isRecord(top.anilist) ? top.anilist : {};
  const titles = isRecord(anilist.title) ? anilist.title : {};
  const title = String(
    titles.native || titles.romaji || titles.english || top.filename || '',
  ).trim();
  return {
    title,
    anilistId: Number(anilist.id) || undefined,
    similarity: Number(top.similarity) || 0,
    episode: Number(top.episode) || undefined,
  };
}
