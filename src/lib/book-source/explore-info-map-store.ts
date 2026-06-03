/** Legado 发现页 infoMap：text 输入与 button action 共享（对齐 ExploreAdapter InfoMap） */

const store = new Map<string, Record<string, string>>();

export function getExploreInfoMap(sourceUrl: string): Record<string, string> {
  let map = store.get(sourceUrl);
  if (!map) {
    map = {};
    store.set(sourceUrl, map);
  }
  return map;
}

export function setExploreInfoMapValue(sourceUrl: string, key: string, value: string): void {
  getExploreInfoMap(sourceUrl)[key] = value;
}

export function clearExploreInfoMap(sourceUrl?: string): void {
  if (!sourceUrl) {
    store.clear();
    return;
  }
  store.delete(sourceUrl);
}
