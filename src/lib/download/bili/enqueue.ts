/**
 * 将选中条目转为 DownloadService 任务 + 旁路资源写盘
 */

import {
  classifyDownloadCategory,
  joinDownloadCategoryPath,
} from '@/lib/download/categories';
import { getDownloadService } from '@/lib/download/service';
import { ensureDirectory, resolveModuleDownloadDirectory } from '@/lib/media/media-root';
import { getBiliDownloadConfig, getBiliDownloadConfigSync } from './config';
import { bilibiliXmlBytesToAss } from './ass';
import {
  getAISummary,
  getDanmaku,
  getNfo,
  getSubtitle,
} from './extras';
import { buildPaths } from './naming';
import { getOpusImages, getOpusMarkdown } from './opus';
import { pickBestUrl } from './pcdn';
import { probePopupProvider, resolveSelectedStreams } from './select';
import { checkRefresh, getBiliRequestHeaders, isBiliLoggedIn } from './session';
import type { MediaItem, MediaNfo, PopupSelect } from './types';

export type EnqueueItemInput = {
  item: MediaItem;
  nfo: MediaNfo;
  select: PopupSelect;
};

export type EnqueueResult = {
  taskIds: string[];
  errors: string[];
};

async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const dir = path.replace(/[/\\][^/\\]+$/, '');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    /* exists */
  }
  await writeFile(path, data);
}

export async function enqueueBiliItems(
  inputs: EnqueueItemInput[],
  opts?: { seriesNfo?: MediaNfo },
): Promise<EnqueueResult> {
  await getBiliDownloadConfig();
  if (isBiliLoggedIn()) {
    try {
      await checkRefresh();
    } catch {
      /* continue */
    }
  }

  const cfg = getBiliDownloadConfigSync();
  const root = await resolveModuleDownloadDirectory('download');
  const service = getDownloadService();
  const headers = getBiliRequestHeaders();
  const taskIds: string[] = [];
  const errors: string[] = [];
  const downtime = Math.floor(Date.now() / 1000);

  for (const input of inputs) {
    try {
      const { item, select } = input;
      const nfo = input.nfo;
      const taskType = select.media.audioVideo
        ? 'audioVideo'
        : select.media.audio
          ? 'audio'
          : 'video';
      const paths = buildPaths({
        item,
        nfo: opts?.seriesNfo ?? nfo,
        taskType,
        res: select.res,
        abr: select.abr,
        enc: select.enc,
        fmt: select.fmt,
        index: item.index,
        downtime,
      });
      const category = classifyDownloadCategory({
        fileName: paths.file,
        title: item.title,
        url: item.url,
        engine: 'ytdlp',
        mediaHint:
          item.type === 'music' || item.type === 'musicList' || item.type === 'userAudio'
            ? 'audio'
            : item.type === 'opus' || item.type === 'opusList' || item.type === 'userOpus'
              ? 'document'
              : taskType === 'audio'
                ? 'audio'
                : 'video',
      });
      const categoryRoot = joinDownloadCategoryPath(root, category);
      await ensureDirectory(categoryRoot);
      const baseDir = paths.relativeDir
        ? `${categoryRoot}/${paths.relativeDir}`.replace(/\\/g, '/')
        : categoryRoot.replace(/\\/g, '/');
      await ensureDirectory(baseDir);
      const fileBase = `${baseDir}/${paths.file}`;

      const needsStream =
        select.media.video || select.media.audio || select.media.audioVideo;
      if (needsStream && item.type !== 'opus') {
        const provider = await probePopupProvider(item, nfo, select.fmt);
        const streams = resolveSelectedStreams(provider, select);
        const videoUrl = streams.videoUrl
          ? pickBestUrl(
              [
                streams.videoUrl,
                ...(provider.video?.find((v) => v.id === streams.res)
                  ?.backupUrl ??
                  provider.video?.find((v) => v.id === streams.res)
                    ?.backup_url ??
                  []),
              ].filter(Boolean) as string[],
              cfg.blockPcdn,
            )
          : '';
        const audioUrl = streams.audioUrl
          ? pickBestUrl(
              [
                streams.audioUrl,
                ...(provider.audio?.find((a) => a.id === streams.abr)
                  ?.backupUrl ??
                  provider.audio?.find((a) => a.id === streams.abr)
                    ?.backup_url ??
                  []),
              ].filter(Boolean) as string[],
              cfg.blockPcdn,
            )
          : '';

        const requestedFormats: Array<Record<string, unknown>> = [];
        const videoStream = provider.video?.find((v) => v.id === streams.res);
        const audioStream = provider.audio?.find((a) => a.id === streams.abr);
        if (
          (select.media.video || select.media.audioVideo) &&
          videoUrl
        ) {
          requestedFormats.push({
            format_id: `dash-video-${streams.res ?? select.res ?? 0}`,
            url: videoUrl,
            ext: 'mp4',
            protocol: 'https',
            vcodec: 'avc1',
            acodec: 'none',
            filesize: videoStream?.size || undefined,
            http_headers: headers,
          });
        }
        if (
          (select.media.audio || select.media.audioVideo) &&
          audioUrl
        ) {
          const abrId = Number(streams.abr ?? select.abr ?? 0);
          const { biliAudioContainerMeta } = await import(
            '@/lib/download/ytdlp/extractors/bilibili-shared'
          );
          const meta = biliAudioContainerMeta(abrId);
          requestedFormats.push({
            format_id: `dash-audio-${abrId}`,
            url: audioUrl,
            ext: meta.ext,
            protocol: 'https',
            vcodec: 'none',
            acodec: meta.acodec,
            format_note: meta.format_note,
            filesize: audioStream?.size || undefined,
            http_headers: headers,
          });
        }
        // 纯视频无音频轨（FLV/MP4 合流）
        if (
          !requestedFormats.length &&
          videoUrl &&
          (select.media.video || select.media.audioVideo)
        ) {
          requestedFormats.push({
            format_id: `http-${streams.res ?? 0}`,
            url: videoUrl,
            ext: select.fmt === 'flv' ? 'flv' : 'mp4',
            protocol: 'https',
            filesize: videoStream?.size || undefined,
            http_headers: headers,
          });
        }

        if (requestedFormats.length) {
          const task = await service.createTask({
            url: item.url,
            title: item.title,
            engine: 'ytdlp',
            filepath: fileBase,
            autoStart: cfg.autoDownload,
            meta: {
              protocol: 'ytdlp',
              skipExtract: true,
              formatId: requestedFormats.map((f) => f.format_id).join('+'),
              requestedFormats,
              http_headers: headers,
              title: item.title,
              description: item.desc,
              uploader: nfo.upper?.name,
              embedMetadata: cfg.addMetadata === true,
              bili: {
                mediaType: item.type,
                aid: item.aid,
                cid: item.cid,
                bvid: item.bvid,
                epid: item.epid,
                ssid: item.ssid,
                sid: item.sid,
              },
            },
          });
          taskIds.push(task.id);
        }
      }

      // 封面
      for (const thumbId of select.thumb) {
        const thumb = nfo.thumbs.find((t) => t.id === thumbId);
        if (!thumb?.url) continue;
        const task = await service.createTask({
          url: thumb.url,
          title: `${item.title}-cover-${thumbId}`,
          engine: 'gopeed',
          filepath: `${fileBase}.${thumbId}.jpg`,
          autoStart: cfg.autoDownload,
          meta: { protocol: 'http', http_headers: headers, biliExtra: 'thumb' },
        });
        taskIds.push(task.id);
      }

      // 弹幕
      if (select.danmaku.live || select.danmaku.history) {
        try {
          const xml = await getDanmaku(
            () => undefined,
            item,
            select.danmaku.history || false,
          );
          const xmlPath = `${fileBase}.danmaku.xml`;
          await writeBytes(xmlPath, xml);
          if (cfg.convertDanmaku) {
            await writeBytes(`${fileBase}.danmaku.ass`, bilibiliXmlBytesToAss(xml));
          }
        } catch (e) {
          errors.push(
            `${item.title} 弹幕: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // 字幕
      if (select.misc.subtitles) {
        try {
          const srt = await getSubtitle(item, { name: select.misc.subtitles });
          if (srt !== -1 && srt instanceof Uint8Array) {
            await writeBytes(
              `${fileBase}.${select.misc.subtitles}.srt`,
              srt,
            );
          }
        } catch (e) {
          errors.push(
            `${item.title} 字幕: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // NFO
      if (select.nfo.single || select.nfo.album) {
        try {
          if (select.nfo.single) {
            const bytes = await getNfo(item, nfo, 'nfo');
            await writeBytes(`${fileBase}.nfo`, bytes);
          }
          if (select.nfo.album) {
            const bytes = await getNfo(item, nfo, 'album');
            await writeBytes(`${baseDir}/tvshow.nfo`, bytes);
          }
        } catch (e) {
          errors.push(
            `${item.title} NFO: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // AI
      if (select.misc.aiSummary) {
        try {
          const md = await getAISummary(item);
          if (md !== -1 && md !== true && md !== false) {
            await writeBytes(`${fileBase}.ai.md`, md);
          }
        } catch (e) {
          errors.push(
            `${item.title} AI: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // Opus
      if (item.opid && (select.misc.opusContent || select.misc.opusImages)) {
        if (select.misc.opusContent) {
          try {
            const md = await getOpusMarkdown(item.opid);
            await writeBytes(
              `${fileBase}.md`,
              new TextEncoder().encode(md),
            );
          } catch (e) {
            errors.push(
              `${item.title} 图文: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        if (select.misc.opusImages) {
          try {
            const imgs = await getOpusImages(item.opid);
            for (let i = 0; i < imgs.length; i++) {
              const u = imgs[i]!;
              const ext = u.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
              const task = await service.createTask({
                url: u,
                title: `${item.title}-img-${i}`,
                engine: 'gopeed',
                filepath: `${fileBase}.${i}.${ext}`,
                autoStart: cfg.autoDownload,
                meta: { protocol: 'http', http_headers: headers, biliExtra: 'opusImage' },
              });
              taskIds.push(task.id);
            }
          } catch (e) {
            errors.push(
              `${item.title} 图文图片: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    } catch (e) {
      errors.push(
        `${input.item.title}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { taskIds, errors };
}
