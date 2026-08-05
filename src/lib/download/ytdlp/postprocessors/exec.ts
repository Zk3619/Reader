import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';

function expandExecTemplate(template: string, filepath: string, info: Record<string, unknown>): string {
  let cmd = template;
  const replacements: Record<string, string> = {
    filepath,
    title: String(info.title || ''),
    id: String(info.id || ''),
    ext: String(info.ext || ''),
    uploader: String(info.uploader || ''),
    webpage_url: String(info.webpage_url || ''),
  };
  for (const [key, value] of Object.entries(replacements)) {
    cmd = cmd.split(`%(${key})s`).join(value);
    cmd = cmd.split(`{${key}}`).join(value);
  }
  if (!cmd.includes(filepath) && !cmd.includes('{}')) cmd += ` "${filepath}"`;
  cmd = cmd.split('{}').join(`"${filepath}"`);
  return cmd;
}

export class ExecPP extends PostProcessorBase {
  name = 'Exec';

  constructor(private readonly commands: string[]) {
    super();
  }

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const filepath = ctx.filename || ctx.info._filename;
    if (!filepath) return { info: ctx.info, filename: ctx.filename };

    for (const template of this.commands) {
      const cmd = expandExecTemplate(template, filepath, ctx.info as Record<string, unknown>);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{ code?: number; stderr?: string }>('run_shell_pp', {
          command: cmd,
          timeoutMs: 120_000,
        });
        if (result?.code && result.code !== 0) {
          throw new Error(`exit ${result.code}: ${result.stderr || ''}`);
        }
      } catch (e) {
        console.warn(`[Exec] ${(e as Error).message}`);
        if (!ctx.options.ignoreerrors) throw e;
      }
    }
    return { info: ctx.info, filename: filepath };
  }
}
