import hostFixesScript from '../../../src-tauri/scripts/inner_web_host_fixes.txt?raw';

export const INNER_WEB_HOST_FIXES_SCRIPT = hostFixesScript.trim();

export function buildInnerWebHostFixesScriptTag(): string {
  return `<script>${INNER_WEB_HOST_FIXES_SCRIPT}</script>`;
}
