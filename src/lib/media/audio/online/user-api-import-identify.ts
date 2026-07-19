/**
 * 自定义音源导入识别：从脚本文本提取展示信息
 * 支持原始 JS，以及 JSON 字符串 / `{ script }` / 数组形式的代码导入
 */

import {
  isHandlerOnlyUserApiScript,
  isLxUserApiScript,
  parseLxScriptHeaderMeta,
} from '@/lib/media/audio/online/lx-user-api-shim';

export interface IdentifiedUserApiScript {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  fileName: string;
  script: string;
}

function looksLikeUserApiScript(script: string): boolean {
  const trimmed = script.trim();
  if (!trimmed) return false;
  if (/@name\s+\S/.test(trimmed)) return true;
  if (/\blx_setup\b/.test(trimmed)) return true;
  if (/globalThis[\.\[]\s*['"]?lx['"]?\s*\]?/.test(trimmed)) return true;
  if (/\blx\.(on|send|request)\b/.test(trimmed)) return true;
  if (isHandlerOnlyUserApiScript(trimmed)) return true;
  // 非空且可被 LX 运行时接受的脚本，至少应像一份 JS 源码
  return isLxUserApiScript(trimmed) && /(?:function|const|let|var|=>|module\.exports)\b/.test(trimmed);
}

function pendingId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toIdentified(script: string, fileName: string): IdentifiedUserApiScript | null {
  if (!looksLikeUserApiScript(script)) return null;
  const headerMeta = parseLxScriptHeaderMeta(script);
  const baseName = fileName.replace(/\.[^.]+$/, '') || '未命名音源';
  return {
    id: pendingId(),
    name: headerMeta.name?.trim() || baseName,
    version: headerMeta.version,
    author: headerMeta.author,
    description: headerMeta.description,
    fileName,
    script,
  };
}

/** 尝试把粘贴的 JSON 解成脚本文本列表（失败则当作普通脚本文本） */
function expandImportPayload(raw: string): Array<{ script: string; fileName: string }> {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const tryParseJson = (): unknown | undefined => {
    if (
      !(
        trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        trimmed.startsWith('"')
      )
    ) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  };

  const parsed = tryParseJson();
  if (parsed === undefined) {
    return [{ script: raw, fileName: 'pasted.js' }];
  }

  if (typeof parsed === 'string') {
    return [{ script: parsed, fileName: 'pasted.js' }];
  }

  if (Array.isArray(parsed)) {
    const out: Array<{ script: string; fileName: string }> = [];
    parsed.forEach((item, index) => {
      if (typeof item === 'string') {
        out.push({ script: item, fileName: `pasted-${index + 1}.js` });
        return;
      }
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const script =
          typeof row.script === 'string'
            ? row.script
            : typeof row.code === 'string'
              ? row.code
              : typeof row.source === 'string'
                ? row.source
                : '';
        if (!script.trim()) return;
        const fileName =
          (typeof row.fileName === 'string' && row.fileName) ||
          (typeof row.name === 'string' && `${row.name}.js`) ||
          `pasted-${index + 1}.js`;
        out.push({ script, fileName });
      }
    });
    return out.length > 0 ? out : [{ script: raw, fileName: 'pasted.js' }];
  }

  if (parsed && typeof parsed === 'object') {
    const row = parsed as Record<string, unknown>;
    const script =
      typeof row.script === 'string'
        ? row.script
        : typeof row.code === 'string'
          ? row.code
          : typeof row.source === 'string'
            ? row.source
            : '';
    if (script.trim()) {
      const fileName =
        (typeof row.fileName === 'string' && row.fileName) ||
        (typeof row.name === 'string' && `${row.name}.js`) ||
        'pasted.js';
      return [{ script, fileName }];
    }
  }

  return [{ script: raw, fileName: 'pasted.js' }];
}

export function identifyUserApiScriptFromText(
  script: string,
  fileName = 'online.js',
): IdentifiedUserApiScript | null {
  return toIdentified(script, fileName);
}

/** 代码导入：支持原始 JS 或 JSON 包装的单份/多份脚本 */
export function identifyUserApiScriptsFromCode(raw: string): IdentifiedUserApiScript[] {
  const payloads = expandImportPayload(raw);
  const out: IdentifiedUserApiScript[] = [];
  for (const item of payloads) {
    const identified = toIdentified(item.script, item.fileName);
    if (identified) out.push(identified);
  }
  return out;
}

export async function identifyUserApiScriptsFromFiles(
  files: File[],
): Promise<IdentifiedUserApiScript[]> {
  const out: IdentifiedUserApiScript[] = [];
  for (const file of files) {
    try {
      const text = await file.text();
      // 本地 .json 也可走代码导入同一套解包逻辑
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        out.push(...identifyUserApiScriptsFromCode(text));
        continue;
      }
      const identified = identifyUserApiScriptFromText(text, file.name);
      if (identified) out.push(identified);
    } catch {
      // skip unreadable files
    }
  }
  return out;
}
