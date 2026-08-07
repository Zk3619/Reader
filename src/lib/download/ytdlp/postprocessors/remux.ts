/**
 * Remux / convert helper — prefers Tauri media_convert commands when available.
 */

export interface RemuxOptions {
  inputPaths?: string[];
  outputPath?: string;
  /** merge | extract_audio | embed_subs | embed_metadata | sponsorblock */
  operation: string;
  audioFormat?: string;
  container?: string;
  extra?: Record<string, unknown>;
}

export interface RemuxResult {
  ok: boolean;
  outputPath?: string;
  warning?: string;
  bytes?: number[];
  mime?: string;
}

/**
 * Invoke native remux when running under Tauri.
 * merge 使用系统 ffmpeg（media_convert_merge_files）。
 */
export async function remux(options: RemuxOptions): Promise<RemuxResult> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const caps = await invoke<{
      videoBackend?: string;
      video_backend?: string;
      audioBackend?: string;
      audio_backend?: string;
    }>('media_convert_probe').catch(() => null);

    if (!caps) {
      return {
        ok: false,
        warning: `[remux] media_convert_probe unavailable; skipped ${options.operation}`,
      };
    }

    const videoBackend = caps.videoBackend || caps.video_backend || 'none';
    const audioBackend = caps.audioBackend || caps.audio_backend || 'none';

    if (options.operation === 'merge') {
      const inputs = (options.inputPaths || []).filter(Boolean);
      if (inputs.length < 2 || !options.outputPath) {
        return { ok: false, warning: '[remux] merge requires >=2 local inputPaths and outputPath' };
      }
      if (videoBackend === 'none') {
        return {
          ok: false,
          warning: '[remux] 系统未检测到 ffmpeg，无法合并音视频。请安装 ffmpeg 并加入 PATH',
        };
      }
      const result = await invoke<{ outputPath?: string }>('media_convert_merge_files', {
        inputs,
        outputPath: options.outputPath,
        container: options.container,
      });
      return { ok: true, outputPath: result?.outputPath || options.outputPath };
    }

    if (options.operation === 'extract_audio' && options.extra?.inputBytes) {
      const target = options.audioFormat || 'm4a';
      if (audioBackend === 'none') {
        return {
          ok: false,
          warning: '[remux] audio convert backend unavailable',
        };
      }
      const result = await invoke<{ bytes: number[]; mime: string }>('convert_audio_bytes', {
        bytes: options.extra.inputBytes,
        target,
      });
      return {
        ok: true,
        bytes: result.bytes,
        mime: result.mime,
        outputPath: options.outputPath,
      };
    }

    if (options.operation === 'embed_subs') {
      const subPath =
        (options.extra?.subtitlePath as string) ||
        (options.inputPaths || []).find((p) => /\.(vtt|srt|ass)$/i.test(p || '')) ||
        '';
      const mediaPath =
        (options.extra?.inputPath as string) ||
        (options.inputPaths || []).find((p) => !/\.(vtt|srt|ass)$/i.test(p || '')) ||
        options.outputPath ||
        '';
      if (!subPath || !mediaPath || !options.outputPath) {
        return { ok: false, warning: '[remux] embed_subs needs media + subtitle + outputPath' };
      }
      const result = await invoke<{ outputPath?: string }>('media_convert_embed_subs', {
        inputPath: mediaPath,
        subtitlePath: subPath,
        outputPath: options.outputPath,
      });
      return { ok: true, outputPath: result?.outputPath || options.outputPath };
    }

    if (options.operation === 'embed_metadata') {
      if (!options.outputPath) {
        return { ok: false, warning: '[remux] embed_metadata needs outputPath' };
      }
      const inputPath =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        options.outputPath;
      const result = await invoke<{ outputPath?: string }>('media_convert_embed_metadata', {
        inputPath,
        outputPath: options.outputPath,
        metadata: {
          title: String(options.extra?.title || ''),
          description: String(options.extra?.description || ''),
          artist: String(options.extra?.uploader || options.extra?.artist || ''),
        },
      });
      return { ok: true, outputPath: result?.outputPath || options.outputPath };
    }

    if (options.operation === 'embed_thumbnail') {
      const thumbUrl = String(options.extra?.thumbnailUrl || '');
      const inputPath =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        options.outputPath ||
        '';
      if (!thumbUrl || !inputPath || !options.outputPath) {
        return { ok: false, warning: '[remux] embed_thumbnail needs thumbnailUrl + input + output' };
      }
      if (videoBackend === 'none') {
        return { ok: false, warning: '[remux] ffmpeg unavailable for embed_thumbnail' };
      }
      // Download thumb then attach via ffmpeg (media_convert_embed_metadata-like path)
      try {
        const bin = await invoke<{ data: number[]; status: number }>('download_binary', {
          url: thumbUrl,
          method: 'GET',
          headers: {},
          body: null,
          timeoutMs: 30000,
          useOkhttpUserAgent: false,
          proxy: null,
        });
        if (bin.status >= 400) {
          return { ok: false, warning: `[remux] thumbnail HTTP ${bin.status}` };
        }
        const thumbPath = `${options.outputPath}.thumb.jpg`;
        await invoke('write_binary_file', { path: thumbPath, data: bin.data });
        const result = await invoke<{ outputPath?: string }>('media_convert_merge_files', {
          inputs: [inputPath, thumbPath],
          outputPath: options.outputPath,
          container: 'mp4',
        }).catch(() => null);
        // Best-effort: if merge-with-thumb unsupported, keep original
        return {
          ok: !!result,
          outputPath: result?.outputPath || options.outputPath,
          warning: result ? undefined : '[remux] embed_thumbnail best-effort skipped (no dedicated ffmpeg attach)',
        };
      } catch (e) {
        return { ok: false, warning: `[remux] embed_thumbnail: ${(e as Error).message}` };
      }
    }

    if (options.operation === 'fixup_m3u8' || options.operation === 'fixup_m4a') {
      const input = options.inputPaths?.[0] || options.outputPath;
      const output = options.outputPath || input;
      if (!input || !output) {
        return { ok: false, warning: `[remux] ${options.operation} needs input/output` };
      }
      if (videoBackend === 'none') {
        return { ok: false, warning: `[remux] ffmpeg unavailable for ${options.operation}` };
      }
      try {
        const r = await invoke<{ outputPath?: string }>('media_convert_fetch_url', {
          url: input.startsWith('http') ? input : `file:${input}`,
          outputPath: output,
          headers: null,
        }).catch(async () => {
          return invoke<{ outputPath?: string }>('media_convert_merge_files', {
            inputs: [input],
            outputPath: output,
            container: options.operation === 'fixup_m4a' ? 'm4a' : 'mp4',
          });
        });
        return { ok: true, outputPath: r?.outputPath || output };
      } catch (e) {
        return { ok: false, warning: `[remux] ${options.operation}: ${(e as Error).message}` };
      }
    }

    if (options.operation === 'sponsorblock_cut' || options.operation === 'split_chapters') {
      return {
        ok: false,
        warning: `[remux] ${options.operation} requires ffmpeg filter graph — chapters attached to info; cut deferred to external tool`,
        outputPath: options.outputPath,
      };
    }

    if (options.operation === 'sponsorblock') {
      return {
        ok: true,
        warning: '[remux] sponsorblock metadata handled by SponsorBlockPP',
        outputPath: options.outputPath,
      };
    }

    return {
      ok: false,
      warning: `[remux] operation ${options.operation} not wired yet`,
      outputPath: options.outputPath,
    };
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    return { ok: false, warning: `[remux] ${msg}` };
  }
}
