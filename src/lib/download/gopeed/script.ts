/**
 * 下载完成脚本（对齐 Gopeed ScriptConfig）
 * Tauri：经 plugin-shell 执行；非 Tauri 抛出明确错误
 */

import { isTauri } from '@/lib/platform/detect';
import type { DownloadTask } from '@/lib/download/task-model';
import { getDownloadConfig } from '@/lib/download/gopeed/config';

export type ScriptEvent = 'DOWNLOAD_DONE' | 'DOWNLOAD_ERROR';

export interface ScriptRunResult {
  path: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

function buildEnv(event: ScriptEvent, task: DownloadTask): Record<string, string> {
  return {
    READER_DOWNLOAD_EVENT: event,
    READER_DOWNLOAD_TASK_ID: task.id,
    READER_DOWNLOAD_URL: task.url,
    READER_DOWNLOAD_TITLE: task.title,
    READER_DOWNLOAD_FILEPATH: task.filepath,
    READER_DOWNLOAD_STATE: task.state,
    READER_DOWNLOAD_ERROR: task.error ?? '',
  };
}

function commandForScript(scriptPath: string): { program: string; args: string[] } {
  const lower = scriptPath.toLowerCase();
  if (lower.endsWith('.ps1')) {
    return { program: 'powershell', args: ['-ExecutionPolicy', 'Bypass', '-File', scriptPath] };
  }
  if (lower.endsWith('.bat') || lower.endsWith('.cmd')) {
    return { program: 'cmd', args: ['/c', scriptPath] };
  }
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) {
    return { program: 'bash', args: [scriptPath] };
  }
  if (lower.endsWith('.py')) {
    return { program: 'python3', args: [scriptPath] };
  }
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
    return { program: 'node', args: [scriptPath] };
  }
  return { program: scriptPath, args: [] };
}

async function runOne(scriptPath: string, event: ScriptEvent, task: DownloadTask): Promise<ScriptRunResult> {
  if (!scriptPath) {
    return { path: scriptPath, ok: false, code: null, stdout: '', stderr: '', error: 'script path is empty' };
  }
  if (!isTauri()) {
    return {
      path: scriptPath,
      ok: false,
      code: null,
      stdout: '',
      stderr: '',
      error: 'done scripts require Tauri shell plugin',
    };
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const { program, args } = commandForScript(scriptPath);
    const cmd = Command.create(program, args, {
      env: buildEnv(event, task),
    });
    const out = await cmd.execute();
    const code = out.code ?? null;
    return {
      path: scriptPath,
      ok: code === 0,
      code,
      stdout: out.stdout ?? '',
      stderr: out.stderr ?? '',
      error: code === 0 ? undefined : `exit code ${code}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      path: scriptPath,
      ok: false,
      code: null,
      stdout: '',
      stderr: '',
      error: msg,
    };
  }
}

/**
 * 执行配置中的 doneScripts（DOWNLOAD_DONE / DOWNLOAD_ERROR 共用路径列表）。
 */
export async function runDoneScripts(
  event: ScriptEvent,
  task: DownloadTask,
  paths?: string[],
): Promise<ScriptRunResult[]> {
  let list = paths;
  if (!list) {
    const cfg = await getDownloadConfig();
    list = (cfg.doneScripts || []).map((s) => s.trim()).filter(Boolean);
  }
  if (list.length === 0) return [];

  const results: ScriptRunResult[] = [];
  for (const path of list) {
    results.push(await runOne(path, event, task));
  }
  return results;
}
