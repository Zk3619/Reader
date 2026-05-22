export type StorageRefKind =
  | 'path'
  | 'uri'
  | 'opfs'
  | 'handle'
  | 'dir-handle'
  | 'saf-tree'
  | 'virtual';

export interface StorageRef {
  kind: StorageRefKind;
  /** path / uri / opfs 相对路径 / handle id / saf uri */
  value: string;
}

const PREFIXES: Record<StorageRefKind, string> = {
  path: 'path:',
  uri: 'uri:',
  opfs: 'opfs:',
  handle: 'handle:file:',
  'dir-handle': 'handle:dir:',
  'saf-tree': 'saf-tree:',
  virtual: 'virtual:',
};

export function formatStorageRef(ref: StorageRef): string {
  if (ref.kind === 'handle') return `${PREFIXES.handle}${ref.value}`;
  if (ref.kind === 'dir-handle') return `${PREFIXES['dir-handle']}${ref.value}`;
  if (ref.kind === 'uri') {
    return `${PREFIXES.uri}${normalizeUriStorageValue(ref.value)}`;
  }
  if (ref.kind === 'saf-tree') {
    return `${PREFIXES['saf-tree']}${ref.value}`;
  }
  return `${PREFIXES[ref.kind]}${ref.value}`;
}

/** 从 persist JSON / uri: 前缀 / 裸 content:// 提取可读的 content URI */
export function normalizeUriStorageValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { uri?: string };
      if (parsed.uri) return parsed.uri;
    } catch {
      /* ignore */
    }
  }
  if (trimmed.startsWith(PREFIXES.uri)) {
    return trimmed.slice(PREFIXES.uri.length);
  }
  return trimmed;
}

export function parseStorageRef(raw: string): StorageRef {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { uri?: string };
      if (parsed.uri) return { kind: 'uri', value: parsed.uri };
    } catch {
      /* fall through */
    }
  }
  if (trimmed.startsWith(PREFIXES.path)) {
    return { kind: 'path', value: trimmed.slice(PREFIXES.path.length) };
  }
  if (trimmed.startsWith(PREFIXES.uri)) {
    return { kind: 'uri', value: trimmed.slice(PREFIXES.uri.length) };
  }
  if (trimmed.startsWith(PREFIXES.opfs)) {
    return { kind: 'opfs', value: trimmed.slice(PREFIXES.opfs.length) };
  }
  if (trimmed.startsWith(PREFIXES['dir-handle'])) {
    return { kind: 'dir-handle', value: trimmed.slice(PREFIXES['dir-handle'].length) };
  }
  if (trimmed.startsWith(PREFIXES.handle)) {
    return { kind: 'handle', value: trimmed.slice(PREFIXES.handle.length) };
  }
  if (trimmed.startsWith(PREFIXES['saf-tree'])) {
    return { kind: 'saf-tree', value: trimmed.slice(PREFIXES['saf-tree'].length) };
  }
  if (trimmed.startsWith(PREFIXES.virtual)) {
    return { kind: 'virtual', value: trimmed.slice(PREFIXES.virtual.length) };
  }
  if (trimmed.startsWith('local::')) {
    return { kind: 'virtual', value: trimmed.slice('local::'.length) };
  }
  if (trimmed.startsWith('content://')) {
    return { kind: 'uri', value: trimmed };
  }
  return { kind: 'path', value: trimmed };
}

/** 书架/DB 使用的字符串 */
export function toBookUrl(ref: StorageRef): string {
  return formatStorageRef(ref);
}

export function bookUrlToRef(bookUrl: string): StorageRef {
  return parseStorageRef(bookUrl);
}

export function isReadableRef(ref: StorageRef): boolean {
  return ref.kind !== 'dir-handle';
}

/** materializeToManaged / persistWebBookUrl 写入 OPFS 时的 `{uuid}_` 前缀 */
const MANAGED_STORAGE_FILE_UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;

/** 从 OPFS 托管文件名还原用户可见书名（去掉导入时加的 UUID 前缀） */
export function stripManagedStorageFilePrefix(fileName: string): string {
  return fileName.replace(MANAGED_STORAGE_FILE_UUID_PREFIX, '');
}

/** SAF documentId 形态的文件名（非用户可见名） */
export function looksLikeAndroidDocumentId(name: string): boolean {
  const s = name.trim();
  return (
    /primary[%_:]/i.test(s) ||
    s.includes('%2F') ||
    s.includes('%2f') ||
    s.includes('_2F') ||
    s.includes('_2f')
  );
}

export function decodeAndroidDocumentFileName(uriOrSegment: string): string | null {
  const bare = normalizeUriStorageValue(uriOrSegment);
  const segment = bare.replace(/\\/g, '/').split('/').pop() || bare;
  if (!/primary[%_]/i.test(segment) && !segment.includes('%2F') && !segment.includes('_2F')) {
    return null;
  }
  try {
    const normalized = segment.includes('%') ? segment : segment.replace(/_/g, '%');
    const decoded = decodeURIComponent(normalized);
    const parts = decoded.split(/[/\\]/).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && /\.\w{2,5}$/i.test(part) && !/^primary:?$/i.test(part)) {
        return part;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 得到用于复制/导入的显示文件名（优先 picker 的 name，拒绝 documentId）
 */
export function resolveHumanFileName(candidate: string, sourceBookUrl?: string): string {
  const trimmed = candidate.trim();
  if (trimmed && !looksLikeAndroidDocumentId(trimmed)) {
    return trimmed;
  }
  if (sourceBookUrl) {
    const fromUrl = displayFileNameFromBookUrl(sourceBookUrl);
    if (fromUrl && !looksLikeAndroidDocumentId(fromUrl)) return fromUrl;
    const decoded = decodeAndroidDocumentFileName(sourceBookUrl);
    if (decoded) return decoded;
  }
  const decoded = decodeAndroidDocumentFileName(trimmed);
  if (decoded) return decoded;
  return trimmed || 'book.dat';
}

/** 从 bookUrl / StorageRef 字符串解析用于导入、展示的文件名 */
export function displayFileNameFromBookUrl(bookUrl: string): string {
  const ref = parseStorageRef(bookUrl);
  if (ref.kind === 'opfs') {
    const segment = ref.value.split('/').filter(Boolean).pop() || ref.value;
    return stripManagedStorageFilePrefix(segment);
  }
  if (ref.kind === 'uri') {
    const decoded = decodeAndroidDocumentFileName(ref.value);
    if (decoded) return decoded;
    const parts = ref.value.replace(/\\/g, '/').split('/');
    return stripManagedStorageFilePrefix(parts[parts.length - 1] || ref.value);
  }
  if (ref.kind === 'path') {
    const parts = ref.value.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || ref.value;
  }
  const tail = bookUrl.replace(/\\/g, '/').split('/').pop() || bookUrl;
  return stripManagedStorageFilePrefix(tail);
}

/** 从 SAF 树 URI 或 persist JSON 解析人类可读路径（如 Download/books） */
export function safTreeHumanLabel(raw: string): string {
  const trimmed = raw.trim();
  let uri = trimmed;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { uri?: string };
      if (parsed.uri) uri = parsed.uri;
    } catch {
      /* 非 JSON，按 URI 处理 */
    }
  }
  const treeMatch = uri.match(/\/tree\/([^/]+)/);
  if (treeMatch) {
    try {
      const decoded = decodeURIComponent(treeMatch[1]);
      const pathPart = decoded.includes(':') ? decoded.split(':').slice(1).join('/') : decoded;
      return pathPart || '已选文件夹（SAF）';
    } catch {
      return treeMatch[1];
    }
  }
  return '已选文件夹（SAF）';
}

export function refDisplayLabel(ref: StorageRef): string {
  const v = ref.value;
  if (ref.kind === 'path' || ref.kind === 'uri') {
    const parts = v.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || v;
  }
  if (ref.kind === 'opfs') {
    const segment = v.split('/').pop() || v;
    return stripManagedStorageFilePrefix(segment);
  }
  if (ref.kind === 'handle' || ref.kind === 'virtual') return v.slice(0, 8) + '…';
  if (ref.kind === 'dir-handle') return '已选文件夹（句柄）';
  if (ref.kind === 'saf-tree') return safTreeHumanLabel(v);
  return v;
}
