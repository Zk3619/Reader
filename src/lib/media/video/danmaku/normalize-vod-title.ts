/**
 * 第三方点播片名清洗：去掉清晰度/站点/广告尾巴，便于弹幕标题匹配。
 * 播放源不必是爱优腾；匹配只依赖干净剧名 + 集数。
 */

import { getDanmuApiPrefs } from '@/lib/media/video/danmaku/danmu-api/prefs';

/** 常见片源尾巴 / 清晰度 / 语言标记 */
const NOISE_TOKEN_RE =
  /(?:超清|高清|蓝光|抢先版?|完整版|未删减|国语中字|国语|粤语|台配|中字|中配|双语|无修|内嵌|外挂|字幕组|修复版|精校|首播|独播|更新至|更至|全集|连载|完结|4K|1080[Pp]|720[Pp]|2160[Pp]|\bUHD\b|\bFHD\b|\bHD\b|\bSD\b|\bTS\b|\bTC\b|\bCAM\b|\bBDRemux\b|\bBDRip\b|\bWEB-?DL\b|\bWEBRip\b|\bHDTV\b|\bDVDRip\b|\bBluRay\b)/gi;

const SITE_OR_URL_RE =
  /https?:\/\/\S+|(?:www\.)?[a-z0-9][\w.-]*\.(?:com|net|cc|tv|xyz|top|me|cn|org|info)\b/gi;

const BRACKET_TAG_RE = /【[^】]*】|\[[^\]]*]|［[^］]*］/g;

const TRAILING_EP_RE =
  /(?:\s|[-_·•|｜])*(?:第\s*\d+\s*[集话期彈弹]|\bEP?\s*\d+\b|\bS\d{1,2}E\d{1,3}\b)\s*$/i;

export type CleanVodTitleResult = {
  /** 原始输入 */
  raw: string;
  /** 清洗后（未做映射） */
  cleaned: string;
  /** 应用 TITLE_MAPPING_TABLE 之后，供搜索用 */
  searchTitle: string;
  /** 是否发生过清洗或映射 */
  changed: boolean;
};

/** 去掉第三方站片名噪声 */
export function cleanVodTitle(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';

  s = s.replace(SITE_OR_URL_RE, ' ');
  s = s.replace(BRACKET_TAG_RE, ' ');
  // 全 xx 集 / 更新至 xx
  s = s.replace(/(?:更新至|更至|全)\s*\d+\s*[集话期]?/gi, ' ');
  s = s.replace(NOISE_TOKEN_RE, ' ');
  // 末尾集数（集名会单独传）
  s = s.replace(TRAILING_EP_RE, '');
  // 分隔符压成空格
  s = s.replace(/[_\-.|｜/\\~～]+/g, ' ');
  s = s.replace(/[（(]\s*[）)]/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  // 去掉首尾无意义符号
  s = s.replace(/^[\s·•\-_|｜]+|[\s·•\-_|｜]+$/g, '').trim();
  return s;
}

/**
 * 解析 TITLE_MAPPING_TABLE：`原名->映射名;原名2->映射名2`
 * 精确匹配优先，其次包含匹配（较长 key 优先）
 */
export function applyTitleMappingTable(
  title: string,
  mappingTable: string,
): string {
  const t = title.trim();
  if (!t || !mappingTable.trim()) return t;

  const entries: Array<{ from: string; to: string }> = [];
  for (const part of mappingTable.split(/[;\n]+/)) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^(.+?)\s*->\s*(.+)$/);
    if (!m) continue;
    const from = m[1]!.trim();
    const to = m[2]!.trim();
    if (from && to) entries.push({ from, to });
  }
  if (!entries.length) return t;

  const exact = entries.find((e) => e.from === t);
  if (exact) return exact.to;

  entries.sort((a, b) => b.from.length - a.from.length);
  for (const e of entries) {
    if (t.includes(e.from)) return e.to;
  }
  return t;
}

/** 清洗 + 读取偏好中的映射表，得到最终搜索剧名 */
export function prepareVodSearchTitle(
  raw: string,
  opts?: { mappingTable?: string; skipClean?: boolean },
): CleanVodTitleResult {
  const rawTrim = String(raw || '').trim();
  const cleaned = opts?.skipClean ? rawTrim : cleanVodTitle(rawTrim);
  const mapping =
    opts?.mappingTable ?? getDanmuApiPrefs().titleMappingTable ?? '';
  const searchTitle = applyTitleMappingTable(cleaned || rawTrim, mapping);
  return {
    raw: rawTrim,
    cleaned: cleaned || rawTrim,
    searchTitle: searchTitle || cleaned || rawTrim,
    changed:
      (cleaned || rawTrim) !== rawTrim ||
      (searchTitle || cleaned) !== (cleaned || rawTrim),
  };
}

/** 会话内手动匹配覆盖（按 vod_id / 片名键）；启动后可 hydrate 自 DB */
type MatchOverride = {
  title: string;
  /** 1-based 集号；缺省则仍用自动解析 */
  episodeNo?: number;
  skipClean?: boolean;
};

const overrideByKey = new Map<string, MatchOverride>();

export function danmakuOverrideKey(opts: {
  vodId?: string | number | null;
  vodName?: string | null;
  siteKey?: string | null;
}): string {
  const id = opts.vodId != null && String(opts.vodId).trim() !== ''
    ? String(opts.vodId)
    : '';
  if (id) return `${opts.siteKey || ''}|id:${id}`;
  return `${opts.siteKey || ''}|name:${(opts.vodName || '').trim()}`;
}

export function setDanmakuMatchOverride(
  key: string,
  override: MatchOverride | null,
): void {
  if (!key) return;
  if (!override || !override.title.trim()) {
    overrideByKey.delete(key);
    void import('@/lib/database/video-danmaku-cache')
      .then((m) => m.deleteVideoDanmakuOverride(key))
      .catch(() => undefined);
    return;
  }
  const next: MatchOverride = {
    title: override.title.trim(),
    episodeNo:
      typeof override.episodeNo === 'number' && override.episodeNo > 0
        ? Math.floor(override.episodeNo)
        : undefined,
    skipClean: override.skipClean,
  };
  overrideByKey.set(key, next);
  void import('@/lib/database/video-danmaku-cache')
    .then((m) =>
      m.upsertVideoDanmakuOverride({
        vodKey: key,
        title: next.title,
        episodeNo: next.episodeNo ?? null,
        skipClean: next.skipClean,
      }),
    )
    .catch(() => undefined);
}

export function getDanmakuMatchOverride(key: string): MatchOverride | null {
  return overrideByKey.get(key) ?? null;
}

export function clearDanmakuMatchOverride(key?: string): void {
  if (key) {
    overrideByKey.delete(key);
    void import('@/lib/database/video-danmaku-cache')
      .then((m) => m.deleteVideoDanmakuOverride(key))
      .catch(() => undefined);
  } else {
    overrideByKey.clear();
  }
}

/** 从 DB 灌入内存 Map（App 启动 / DB 就绪后调用） */
export async function hydrateDanmakuMatchOverrides(): Promise<number> {
  try {
    const { listVideoDanmakuOverrides } = await import(
      '@/lib/database/video-danmaku-cache'
    );
    const rows = await listVideoDanmakuOverrides();
    for (const r of rows) {
      if (!r.vodKey || !r.title.trim()) continue;
      overrideByKey.set(r.vodKey, {
        title: r.title.trim(),
        episodeNo:
          typeof r.episodeNo === 'number' && r.episodeNo > 0
            ? r.episodeNo
            : undefined,
        skipClean: r.skipClean,
      });
    }
    return rows.length;
  } catch {
    return 0;
  }
}
