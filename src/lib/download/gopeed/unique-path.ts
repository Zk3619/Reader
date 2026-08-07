/**
 * Ensure destination filepath does not clobber an existing file (Gopeed CheckDuplicateAndRename).
 * Sync check via plugin-fs when available; otherwise returns path unchanged (Rust engine still uniquifies).
 */

export function nextUniqueCandidate(filepath: string, index: number): string {
  const m = filepath.match(/^(.*?)(\.[^./\\]+)?$/);
  const stem = m?.[1] ?? filepath;
  const ext = m?.[2] ?? '';
  return `${stem} (${index})${ext}`;
}

/** Pure: given existing paths set, return unique name. */
export function uniquifyAgainstSet(filepath: string, existing: Set<string>): string {
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const taken = new Set([...existing].map(norm));
  if (!taken.has(norm(filepath))) return filepath;
  for (let i = 1; i < 10_000; i++) {
    const cand = nextUniqueCandidate(filepath, i);
    if (!taken.has(norm(cand))) return cand;
  }
  return filepath;
}

/**
 * Async unique path using Tauri fs exists. Falls back to filepath if fs unavailable.
 */
export async function ensureUniqueFilepath(filepath: string): Promise<string> {
  if (!filepath) return filepath;
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(filepath))) return filepath;
    for (let i = 1; i < 10_000; i++) {
      const cand = nextUniqueCandidate(filepath, i);
      if (!(await exists(cand))) return cand;
    }
  } catch {
    /* non-tauri or fs error — Rust resolve_dest_path still guards engine creates */
  }
  return filepath;
}
