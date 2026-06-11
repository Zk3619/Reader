import type { RssSource } from '@/types';

export function splitRssSourceGroups(raw?: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinRssSourceGroups(groups: string[]): string | undefined {
  const unique = [...new Set(groups.map((g) => g.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(',') : undefined;
}

export function addRssGroupsToSource(source: RssSource, groups: string): RssSource {
  const toAdd = splitRssSourceGroups(groups);
  const merged = [...new Set([...splitRssSourceGroups(source.sourceGroup), ...toAdd])];
  return { ...source, sourceGroup: joinRssSourceGroups(merged) };
}

export function removeRssGroupsFromSource(source: RssSource, groups: string): RssSource {
  const toRemove = new Set(splitRssSourceGroups(groups));
  const filtered = splitRssSourceGroups(source.sourceGroup).filter((g) => !toRemove.has(g));
  return { ...source, sourceGroup: joinRssSourceGroups(filtered) };
}

export function collectRssSourceGroupNames(sources: RssSource[]): string[] {
  const set = new Set<string>();
  for (const source of sources) {
    for (const g of splitRssSourceGroups(source.sourceGroup)) {
      set.add(g);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
