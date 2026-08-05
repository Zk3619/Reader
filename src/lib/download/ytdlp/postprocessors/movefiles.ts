import type { PostProcessorContext, PostProcessorResult } from '../types';
import { PostProcessorBase } from './base';

export class MoveFilesAfterDownloadPP extends PostProcessorBase {
  name = 'MoveFiles';

  async run(ctx: PostProcessorContext): Promise<PostProcessorResult> {
    const source = ctx.filename || ctx.info._filename;
    if (!source) return { info: ctx.info, filename: ctx.filename };

    const finalDir = String(ctx.info.__finaldir || ctx.options.paths?.home || '').trim();
    if (!finalDir) return { info: ctx.info, filename: source };

    const baseName = source.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'download';
    const target = `${finalDir.replace(/[\\/]+$/, '')}/${baseName}`;

    if (source === target) return { info: ctx.info, filename: source };

    try {
      const { mkdir, rename, exists, remove } = await import('@tauri-apps/plugin-fs');
      await mkdir(finalDir, { recursive: true });
      if (await exists(target)) {
        if (ctx.options.overwrites) {
          await remove(target);
        } else {
          console.warn(`[MoveFiles] target exists, skip: ${target}`);
          return { info: ctx.info, filename: source };
        }
      }
      await rename(source, target);
      ctx.info._filename = target;
      return { info: ctx.info, filename: target };
    } catch (e) {
      console.warn(`[MoveFiles] ${(e as Error).message}`);
      return { info: ctx.info, filename: source };
    }
  }
}
