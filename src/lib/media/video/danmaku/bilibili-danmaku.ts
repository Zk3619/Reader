/**
 * B 站弹幕下载子集（E3）：分段并发拉取（参考 Bilibili-Evolved 思路）
 * 不做番剧客户端 / 视频下载；可选 Cookie
 */

const COOKIE_KEY = 'reader.video.bili.cookie.v1';

export function getBiliCookie(): string {
  try {
    return localStorage.getItem(COOKIE_KEY) || '';
  } catch {
    return '';
  }
}

export function setBiliCookie(cookie: string): void {
  try {
    localStorage.setItem(COOKIE_KEY, cookie);
  } catch {
    /* */
  }
}

async function fetchText(url: string, cookie?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    Referer: 'https://www.bilibili.com',
  };
  const c = cookie ?? getBiliCookie();
  if (c.trim()) headers.Cookie = c.trim();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/** 解析 av/BV → cid 列表（公开接口；失败时抛错） */
export async function resolveBiliCid(bvidOrAid: string): Promise<{ cid: number; title: string }[]> {
  const id = bvidOrAid.trim();
  let api: string;
  if (/^BV/i.test(id)) {
    api = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(id)}`;
  } else if (/^av/i.test(id) || /^\d+$/.test(id)) {
    const aid = id.replace(/^av/i, '');
    api = `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(aid)}`;
  } else {
    throw new Error('请输入 BV 号或 av 号');
  }
  const raw = await fetchText(api);
  const json = JSON.parse(raw) as {
    code: number;
    data?: { title?: string; pages?: Array<{ cid: number; part: string }> };
  };
  if (json.code !== 0 || !json.data?.pages?.length) {
    throw new Error('无法解析稿件分 P');
  }
  return json.data.pages.map((p) => ({
    cid: p.cid,
    title: p.part || json.data?.title || String(p.cid),
  }));
}

/**
 * 分段弹幕：旧接口 seg.so 可能需 wbi；此处用 XML 历史接口作子集兜底
 * `https://comment.bilibili.com/{cid}.xml`
 */
export async function downloadBiliDanmakuXml(cid: number): Promise<string> {
  return fetchText(`https://comment.bilibili.com/${cid}.xml`);
}

/** 并发下载多个 cid 的弹幕 XML（限制并发） */
export async function downloadBiliDanmakuXmlBatch(
  cids: number[],
  concurrency = 4,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const queue = [...cids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const cid = queue.shift();
      if (cid == null) break;
      try {
        out.set(cid, await downloadBiliDanmakuXml(cid));
      } catch {
        out.set(cid, '');
      }
    }
  });
  await Promise.all(workers);
  return out;
}
