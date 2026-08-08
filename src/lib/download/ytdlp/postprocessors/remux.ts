/**
 * Remux / convert helper — prefers Tauri media_convert（内置 libav 优先、外部 ffmpeg 兜底）。
 */

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';

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
 * 视频后处理经 media_convert_*：内置 ffmpeg-next 优先，外部 CLI 兜底。
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
    // 内置 libav 或外部 CLI 任一可用即可尝试（真正主路/兜底由 Rust 决定）
    const hasVideoBackend = videoBackend !== 'none';
    // 仅重编码等仍依赖外部 CLI 的路径
    const hasFfmpegCli = /ffmpeg-cli/i.test(videoBackend);

    if (options.operation === 'merge') {
      const inputs = (options.inputPaths || []).filter(Boolean);
      if (inputs.length < 2 || !options.outputPath) {
        return { ok: false, warning: '[remux] merge requires >=2 local inputPaths and outputPath' };
      }
      if (!hasVideoBackend) {
        return {
          ok: false,
          warning:
            '[remux] 无内置/外部 ffmpeg，无法合并音视频。请使用 enhanced 构建或安装 ffmpeg 并加入 PATH',
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
      // 嵌元数据：Rust 内置 libav 优先、外部 CLI 兜底
      if (!hasVideoBackend) {
        return {
          ok: false,
          warning: '[remux] 未安装 ffmpeg，已跳过写入元数据（成片可正常播放）',
        };
      }
      const inputPath =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        options.outputPath;
      try {
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
      } catch (e) {
        return {
          ok: false,
          warning: `[remux] 写入元数据失败（成片已保留）: ${(e as Error)?.message || e}`,
          outputPath: options.outputPath,
        };
      }
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
          ...downloadBinaryProxyArgs(),
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
      const inputPath =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        options.outputPath ||
        '';
      if (!inputPath || !options.outputPath) {
        return {
          ok: false,
          warning: `[remux] ${options.operation} needs inputPath + outputPath`,
        };
      }
      if (videoBackend === 'none') {
        return {
          ok: false,
          warning: `[remux] ffmpeg unavailable for ${options.operation}`,
          outputPath: options.outputPath,
        };
      }

      if (options.operation === 'split_chapters') {
        const chapters = (options.extra?.chapters as Array<{
          start_time: number;
          end_time?: number;
          title?: string;
        }>) || [];
        const { chaptersToSplitRanges } = await import('./cut-ranges');
        const ranges = chaptersToSplitRanges(
          chapters,
          typeof options.extra?.duration === 'number' ? options.extra.duration : null,
        );
        if (ranges.length < 1) {
          return { ok: false, warning: '[remux] split_chapters: no chapter ranges', outputPath: options.outputPath };
        }
        const stem = options.outputPath.replace(/\.[^.\\/]+$/, '');
        const ext = (options.outputPath.match(/\.([^.\\/]+)$/) || [, 'mp4'])[1] || 'mp4';
        const outputs: string[] = [];
        for (let i = 0; i < ranges.length; i++) {
          const r = ranges[i]!;
          const partOut = `${stem}-c${i + 1}.${ext}`;
          try {
            const result = await invoke<{ outputPath?: string }>('media_convert_cut_by_ranges', {
              inputPath,
              outputPath: partOut,
              keepRanges: [r],
              removeRanges: null,
              duration: null,
            });
            outputs.push(result?.outputPath || partOut);
          } catch (e) {
            return {
              ok: false,
              warning: `[remux] split_chapters chapter ${i + 1}: ${(e as Error).message}`,
              outputPath: options.outputPath,
            };
          }
        }
        return {
          ok: true,
          outputPath: outputs[0] || options.outputPath,
          warning: outputs.length > 1 ? `split into ${outputs.length} files` : undefined,
        };
      }

      // sponsorblock_cut
      const removeRanges = (options.extra?.removeRanges as Array<[number, number]> | undefined) || [];
      const duration =
        typeof options.extra?.duration === 'number' ? options.extra.duration : undefined;
      const keepRanges = options.extra?.keepRanges as
        | Array<{ start: number; end: number }>
        | undefined;
      try {
        const result = await invoke<{ outputPath?: string }>('media_convert_cut_by_ranges', {
          inputPath,
          outputPath: options.outputPath,
          keepRanges: keepRanges || null,
          removeRanges: keepRanges
            ? null
            : removeRanges.map(([start, end]) => ({ start, end })),
          duration: duration ?? null,
        });
        return { ok: true, outputPath: result?.outputPath || options.outputPath };
      } catch (e) {
        return {
          ok: false,
          warning: `[remux] sponsorblock_cut: ${(e as Error).message}`,
          outputPath: options.outputPath,
        };
      }
    }

    if (options.operation === 'sponsorblock') {
      return {
        ok: true,
        warning: '[remux] sponsorblock metadata handled by SponsorBlockPP',
        outputPath: options.outputPath,
      };
    }

    // remux / fixup_copy：走 media_convert_remux_copy（内置优先 → 外部兜底）
    // video_convert / fixup_stretched：仍需重编码，仅外部 CLI
    if (
      options.operation === 'video_remux' ||
      options.operation === 'video_convert' ||
      options.operation === 'fixup_copy' ||
      options.operation === 'fixup_stretched'
    ) {
      const input =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        options.outputPath ||
        '';
      const output = options.outputPath || input;
      if (!input || !output) {
        return { ok: false, warning: `[remux] ${options.operation} needs input/output` };
      }

      if (options.operation === 'video_remux' || options.operation === 'fixup_copy') {
        if (!hasVideoBackend) {
          return { ok: false, warning: `[remux] ffmpeg unavailable for ${options.operation}` };
        }
        try {
          const result = await invoke<{ outputPath?: string }>('media_convert_remux_copy', {
            inputPath: input,
            outputPath: output,
            resetTimestamps: Boolean(options.extra?.resetTimestamps),
          });
          return { ok: true, outputPath: result?.outputPath || output };
        } catch (e) {
          return {
            ok: false,
            warning: `[remux] ${options.operation}: ${(e as Error).message || e}`,
            outputPath: output,
          };
        }
      }

      if (!hasFfmpegCli) {
        return { ok: false, warning: `[remux] ffmpeg unavailable for ${options.operation}` };
      }
      const args: string[] = ['-hide_banner', '-y', '-i', input];
      if (options.operation === 'fixup_stretched') {
        const ratio = Number(options.extra?.stretched_ratio) || 1;
        args.push('-vf', `scale=iw*${ratio}:ih`, '-c:a', 'copy');
      } else {
        const target = String(options.extra?.targetExt || options.container || 'mp4').toLowerCase();
        if (target === 'avi') {
          args.push('-c:v', 'libxvid', '-vtag', 'XVID', '-c:a', 'libmp3lame');
        } else if (target === 'gif') {
          args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos', '-c:v', 'gif');
        } else if (['mp3', 'm4a', 'aac', 'opus', 'flac', 'wav'].includes(target)) {
          args.push('-vn');
          if (target === 'mp3') args.push('-c:a', 'libmp3lame');
          else if (target === 'opus') args.push('-c:a', 'libopus');
          else if (target === 'flac') args.push('-c:a', 'flac');
          else if (target === 'wav') args.push('-c:a', 'pcm_s16le');
          else args.push('-c:a', 'aac');
        } else {
          args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac');
        }
      }
      args.push(output);
      try {
        // 重编码兜底：仍走外部 ffmpeg（与外置 mpv 同属系统工具）
        await invoke('run_shell_pp', {
          command: ['ffmpeg', ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '),
        });
        return { ok: true, outputPath: output };
      } catch (e) {
        return {
          ok: false,
          warning: `[remux] ${options.operation}: ${(e as Error).message || e}`,
          outputPath: output,
        };
      }
    }

    if (options.operation === 'convert_subs') {
      const input =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        '';
      const output = options.outputPath || '';
      const target = String(options.extra?.targetExt || 'srt').toLowerCase();
      if (!input || !output) {
        return { ok: false, warning: '[remux] convert_subs needs input/output' };
      }
      // Prefer pure-TS for vtt↔srt; else ffmpeg
      try {
        const { invoke: inv } = await import('@tauri-apps/api/core');
        const bin = await inv<{ data: number[]; status?: number }>('download_binary', {
          url: input.startsWith('http') ? input : undefined,
          method: 'GET',
          headers: {},
          body: null,
          timeoutMs: 30000,
          useOkhttpUserAgent: false,
          ...downloadBinaryProxyArgs(),
        }).catch(() => null);
        let text = '';
        if (bin?.data) {
          text = new TextDecoder().decode(new Uint8Array(bin.data));
        } else {
          // read local via fetch file not available — use ffmpeg
          text = '';
        }
        if (text && /\.vtt$/i.test(input) && target === 'srt') {
          const srt = vttToSrt(text);
          await inv('write_binary_file', {
            path: output,
            data: Array.from(new TextEncoder().encode(srt)),
          });
          return { ok: true, outputPath: output };
        }
      } catch {
        /* fall through */
      }
      if (videoBackend === 'none') {
        return { ok: false, warning: '[remux] ffmpeg unavailable for convert_subs' };
      }
      try {
        await invoke('run_shell_pp', {
          command: 'ffmpeg',
          args: ['-hide_banner', '-y', '-i', input, output],
          cwd: null,
        });
        return { ok: true, outputPath: output };
      } catch (e) {
        return { ok: false, warning: `[remux] convert_subs: ${(e as Error).message}` };
      }
    }

    if (options.operation === 'convert_thumb') {
      const input =
        (options.extra?.inputPath as string) ||
        options.inputPaths?.[0] ||
        '';
      const output = options.outputPath || '';
      const target = String(options.extra?.targetExt || 'jpg').toLowerCase();
      if (!input || !output) {
        return { ok: false, warning: '[remux] convert_thumb needs input/output' };
      }
      try {
        const bin = await invoke<{ data: number[]; status: number }>('download_binary', {
          url: /^https?:/i.test(input) ? input : `file:///${input.replace(/\\/g, '/')}`,
          method: 'GET',
          headers: {},
          body: null,
          timeoutMs: 30000,
          useOkhttpUserAgent: false,
          ...downloadBinaryProxyArgs(),
        }).catch(async () => {
          // local file: read via empty download_binary may fail — use ffmpeg
          return null;
        });
        if (bin?.data?.length) {
          const converted = await invoke<{ bytes: number[]; mime?: string }>('convert_image_bytes', {
            bytes: bin.data,
            target,
          });
          await invoke('write_binary_file', { path: output, data: converted.bytes });
          return { ok: true, outputPath: output };
        }
      } catch {
        /* ffmpeg fallback */
      }
      if (videoBackend === 'none') {
        return { ok: false, warning: '[remux] convert_thumb backend unavailable' };
      }
      try {
        await invoke('run_shell_pp', {
          command: 'ffmpeg',
          args: ['-hide_banner', '-y', '-i', input, output],
          cwd: null,
        });
        return { ok: true, outputPath: output };
      } catch (e) {
        return { ok: false, warning: `[remux] convert_thumb: ${(e as Error).message}` };
      }
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

function vttToSrt(vtt: string): string {
  const lines = vtt.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let idx = 1;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const timeIdx = buf.findIndex((l) => /-->/.test(l));
    if (timeIdx < 0) {
      buf = [];
      return;
    }
    const time = buf[timeIdx]!.replace(/\./g, ',').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1,$2');
    const text = buf.slice(timeIdx + 1).join('\n').trim();
    if (text) {
      out.push(String(idx++), time, text, '');
    }
    buf = [];
  };
  for (const line of lines) {
    if (/^WEBVTT/i.test(line) || /^NOTE\b/i.test(line) || /^STYLE\b/i.test(line)) continue;
    if (!line.trim()) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join('\n');
}
