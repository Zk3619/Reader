/**
 * Remux / convert helper — prefers Tauri media_convert commands when available.
 */

export interface RemuxOptions {
  inputPaths?: string[];
  outputPath?: string;
  /** merge | extract_audio | embed_subs | embed_metadata | sponsorblock */
  operation: string;
  audioFormat?: string;
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
 * Invoke native remux when running under Tauri; otherwise no-op with warning.
 * Current Reader media_convert exposes image/audio byte conversion + probe — not full ffmpeg mux.
 * We attempt best-effort audio convert and document video merge as deferred.
 */
export async function remux(options: RemuxOptions): Promise<RemuxResult> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const caps = await invoke<{
      video_backend?: string;
      audio_backend?: string;
      audio_formats?: string[];
    }>('media_convert_probe').catch(() => null);

    if (!caps) {
      return {
        ok: false,
        warning: `[remux] media_convert_probe unavailable; skipped ${options.operation}`,
      };
    }

    if (options.operation === 'extract_audio' && options.extra?.inputBytes) {
      const target = options.audioFormat || 'm4a';
      if (caps.audio_backend === 'none') {
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

    if (caps.video_backend === 'none' || !caps.video_backend) {
      console.warn(
        `[ytdlp/remux] video remux not available (operation=${options.operation}); no-op`,
      );
      return {
        ok: false,
        warning: `[remux] video backend none — skipped ${options.operation}`,
        outputPath: options.outputPath,
      };
    }

    // Future: invoke a dedicated media_convert_remux command when shipped
    return {
      ok: false,
      warning: `[remux] operation ${options.operation} not wired yet`,
    };
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.warn(`[ytdlp/remux] ${options.operation} failed: ${msg}`);
    return { ok: false, warning: msg };
  }
}
