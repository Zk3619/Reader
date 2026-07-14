/**
 * 聚合搜索相似度排序（对齐 lx-music similar + sortInsert）
 * @see lx-music-desktop src/common/utils/common.ts
 * @see lx-music-desktop src/renderer/store/search/music/action.ts handleSortList
 */

/** Levenshtein 相似度，结果越大越相似（0~1）；比较与插入用 `==` 对齐 lx */
export function similar(a: string, b: string): number {
  if (!a || !b) return 0;
  let left = a;
  let right = b;
  if (left.length > right.length) {
    const t = right;
    right = left;
    left = t;
  }
  const al = left.length;
  const bl = right.length;
  const mp: number[] = [];
  for (let i = 0; i <= bl; i++) mp[i] = i;
  for (let i = 1; i <= al; i++) {
    const ai = left.charAt(i - 1);
    let lt = mp[0]!;
    mp[0] = mp[0]! + 1;
    for (let j = 1; j <= bl; j++) {
      const tmp = Math.min(
        mp[j]! + 1,
        mp[j - 1]! + 1,
        lt + (ai == right.charAt(j - 1) ? 0 : 1),
      );
      lt = mp[j]!;
      mp[j] = tmp;
    }
  }
  return 1 - mp[bl]! / bl;
}

/** 按 num 升序二分插入（同分插到同分组最左，reverse 后保持源合并顺序） */
export function sortInsert<T>(
  arr: Array<{ num: number; data: T }>,
  data: { num: number; data: T },
): void {
  const key = data.num;
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const middle = Math.trunc((left + right) / 2);
    const mid = arr[middle]!;
    if (key == mid.num) {
      left = middle;
      break;
    } else if (key < mid.num) {
      right = middle - 1;
    } else {
      left = middle + 1;
    }
  }
  while (left > 0) {
    if (arr[left - 1]!.num != key) break;
    left -= 1;
  }
  arr.splice(left, 0, data);
}

/**
 * 歌曲聚合排序文本：对齐 lx `` `${name} ${singer}` ``。
 * 占位「未知」按空串处理，对齐源侧无歌手时 lx formatSingerName 得到的空字符串。
 */
export function aggregateSongSortText(name: string, artist: string): string {
  const singer = !artist || artist === '未知' ? '' : artist;
  return `${name} ${singer}`;
}

/**
 * 按与关键词的文本相似度重排；reverse 后相似度高的在前（对齐 lx handleSortList）
 */
export function sortByKeywordSimilarity<T>(
  list: readonly T[],
  keyword: string,
  textOf: (item: T) => string,
): T[] {
  if (!keyword || list.length <= 1) return [...list];
  const arr: Array<{ num: number; data: T }> = [];
  for (const item of list) {
    sortInsert(arr, {
      num: similar(keyword, textOf(item)),
      data: item,
    });
  }
  return arr.map((entry) => entry.data).reverse();
}
