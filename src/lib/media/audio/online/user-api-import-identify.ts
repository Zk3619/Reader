/**
 * 自定义音源导入识别：从脚本文本提取展示信息
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

export function identifyUserApiScriptFromText(
  script: string,
  fileName = 'online.js',
): IdentifiedUserApiScript | null {
  if (!looksLikeUserApiScript(script)) return null;
  const headerMeta = parseLxScriptHeaderMeta(script);
  const baseName = fileName.replace(/\.[^.]+$/, '') || '未命名音源';
  return {
    id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: headerMeta.name?.trim() || baseName,
    version: headerMeta.version,
    author: headerMeta.author,
    description: headerMeta.description,
    fileName,
    script,
  };
}

export async function identifyUserApiScriptsFromFiles(
  files: File[],
): Promise<IdentifiedUserApiScript[]> {
  const out: IdentifiedUserApiScript[] = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const identified = identifyUserApiScriptFromText(text, file.name);
      if (identified) out.push(identified);
    } catch {
      // skip unreadable files
    }
  }
  return out;
}
