/**
 * Filename sanitization — yt-dlp utils.sanitize_filename subset.
 */

const INSANE_FULLWIDTH: Record<string, string> = {
  '"': '\uff02',
  '*': '\uff0a',
  ':': '\uff1a',
  '<': '\uff1c',
  '>': '\uff1e',
  '?': '\uff1f',
  '|': '\uff5c',
  '/': '\u29f8',
  '\\': '\u29f9',
};

export function sanitize_filename(
  s: string,
  restricted = false,
  isId = false,
): string {
  if (s === '') return '';

  let result = '';
  for (const char of s) {
    const code = char.codePointAt(0) ?? 0;
    if (restricted && code > 127) {
      result += '_';
      continue;
    }
    if (!restricted && !isId && '"*:<>?|/\\'.includes(char)) {
      result += INSANE_FULLWIDTH[char] ?? char;
      continue;
    }
    if (char === '?' || code < 32 || code === 127) continue;
    if (char === '"') {
      result += restricted ? '' : "'";
      continue;
    }
    if (char === ':') {
      result += restricted ? '_-' : ' -';
      continue;
    }
    if ('\\/|*<>'.includes(char)) {
      result += '_';
      continue;
    }
    if (restricted && ("!&'()[]{}$;`^,#".includes(char) || /\s/.test(char))) {
      result += '_';
      continue;
    }
    result += char;
  }

  if (!isId) {
    while (result.includes('__')) result = result.replace(/__/g, '_');
    result = result.replace(/^_+|_+$/g, '');
    if (restricted && result.startsWith('-_')) result = result.slice(2);
    if (result.startsWith('-')) result = `_${result.slice(1)}`;
    result = result.replace(/^\.+/, '');
    if (!result) result = '_';
  }

  return result || '_';
}

/** Soft Windows path segment sanitize (invalid chars → _). */
export function sanitize_path_segment(part: string): string {
  return part.replace(/[/<>:"|\\?*]/g, '_').replace(/[\s.]+$/g, '_');
}
