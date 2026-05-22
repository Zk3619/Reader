/** webkitdirectory 降级：内存目录树（只读） */
const legacyDirs = new Map<string, { rootName: string; files: File[] }>();

export function putLegacyDirectory(id: string, files: File[]): void {
  const rootName = files[0]?.webkitRelativePath.split('/')[0] || 'folder';
  legacyDirs.set(id, { rootName, files });
}

export function getLegacyDirectory(id: string) {
  return legacyDirs.get(id);
}

export function listLegacyDirectoryEntries(
  id: string,
  relativePath: string,
): Array<{ name: string; path: string; isDirectory: boolean }> {
  const dir = legacyDirs.get(id);
  if (!dir) return [];
  const prefix = relativePath
    ? `${dir.rootName}/${relativePath.replace(/^\/+|\/+$/g, '')}/`
    : `${dir.rootName}/`;
  const names = new Set<string>();
  const out: Array<{ name: string; path: string; isDirectory: boolean }> = [];

  for (const file of dir.files) {
    const rel = file.webkitRelativePath;
    if (!rel.startsWith(prefix) && relativePath) continue;
    const rest = relativePath ? rel.slice(prefix.length) : rel.slice(dir.rootName.length + 1);
    const segment = rest.split('/')[0];
    if (!segment) continue;
    const key = relativePath ? `${relativePath}/${segment}` : segment;
    if (names.has(key)) continue;
    names.add(key);
    const isDirectory = rest.includes('/');
    out.push({
      name: segment,
      path: key,
      isDirectory,
    });
  }
  return out;
}
