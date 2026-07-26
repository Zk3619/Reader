/**
 * LX 歌单分类健康度：连续空结果降权隐藏（localStorage）
 * 用于过滤「接口仍返回但长期无内容」的标签，避免下拉里一堆无效分类。
 */

const STORAGE_KEY = 'reader_music_songlist_tag_health_v1';
/** 连续空结果达到此次数后隐藏 */
const HIDE_AFTER_EMPTY = 2;
/** 隐藏后多久重新放回试探（毫秒） */
const HIDE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TagHealthEntry = {
  emptyStreak: number;
  hiddenUntil?: number;
  updatedAt: number;
};

type TagHealthMap = Record<string, TagHealthEntry>;

function healthKey(source: string, tagId: string): string {
  return `${source}::${tagId}`;
}

function readMap(): TagHealthMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TagHealthMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: TagHealthMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function isHidden(entry: TagHealthEntry | undefined, now = Date.now()): boolean {
  if (!entry?.hiddenUntil) return false;
  return entry.hiddenUntil > now;
}

/** 某分类首页拉到列表 → 清除空 streak / 隐藏 */
export function recordSongListTagSuccess(source: string, tagId: string | null): void {
  if (!tagId) return;
  const key = healthKey(source, tagId);
  const map = readMap();
  if (!map[key]) return;
  delete map[key];
  writeMap(map);
}

/**
 * 某分类首页确认空结果（非限流）→ 累加 streak，达到阈值则隐藏一段时间
 */
export function recordSongListTagEmpty(source: string, tagId: string | null): void {
  if (!tagId) return;
  const now = Date.now();
  const key = healthKey(source, tagId);
  const map = readMap();
  const prev = map[key];
  if (isHidden(prev, now)) return;

  const emptyStreak = (prev?.emptyStreak ?? 0) + 1;
  const next: TagHealthEntry = {
    emptyStreak,
    updatedAt: now,
  };
  if (emptyStreak >= HIDE_AFTER_EMPTY) {
    next.hiddenUntil = now + HIDE_TTL_MS;
  }
  map[key] = next;
  writeMap(map);
}

/** 是否应在标签选择器中隐藏 */
export function isSongListTagDemoted(source: string, tagId: string): boolean {
  const entry = readMap()[healthKey(source, tagId)];
  return isHidden(entry);
}

/** 过滤掉已降权的标签（空分组一并去掉） */
export function filterDemotedSongListTags<
  T extends { id: string },
  G extends { list: T[] },
>(source: string, groups: G[]): G[] {
  return groups
    .map((g) => ({
      ...g,
      list: g.list.filter((t) => !isSongListTagDemoted(source, t.id)),
    }))
    .filter((g) => g.list.length > 0) as G[];
}

export function filterDemotedSongListHotTags<T extends { id: string }>(
  source: string,
  tags: T[],
): T[] {
  return tags.filter((t) => !isSongListTagDemoted(source, t.id));
}
