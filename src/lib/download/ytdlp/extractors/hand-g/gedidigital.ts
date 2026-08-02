/**
 * GediDigitalIE — ported from yt-dlp gedidigital.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none } from '../../utils';
import { base_url, url_basename, urljoin } from './_helpers';

const GEDI_HOST =
  '(?:(?:espresso\\.)?repubblica|lastampa|ilsecoloxix|huffingtonpost|iltirreno|messaggeroveneto|ilpiccolo|gazzettadimantova|mattinopadova|laprovinciapavese|tribunatreviso|nuovavenezia|gazzettadimodena|lanuovaferrara|corrierealpi|lasentinella)';

export class GediDigitalIE extends InfoExtractor {
  static IE_NAME = 'gedidigital';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/video\\.${GEDI_HOST}\\.(?:it|gelocal\\.it)(?:\\/[^/]+){2,4}\\/(?<id>\\d+)(?:$|[?&].*)`,
  );

  static _sanitizeUrls(urls: string[]): string[] {
    return urls.map((e, i, arr) => {
      if (e.startsWith('//')) arr[i] = `https:${e}`;
      return arr[i]!;
    }).map((e) => urljoin(base_url(e), url_basename(e)));
  }

  static _cleanFormats(formats: Format[]): Format[] {
    const formatUrls = new Set<string>();
    const clean: Format[] = [];
    for (const f of formats) {
      if (!f.url || formatUrls.has(f.url)) continue;
      if (f.audio_ext !== 'none' && !f.acodec) continue;
      formatUrls.add(f.url);
      clean.push(f);
    }
    return clean;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const pageUrl = url.split('?')[0]!;
    const webpage = await this._download_webpage(pageUrl, videoId);
    const title =
      this._html_search_meta(['twitter:title', 'og:title'], webpage, undefined, true) || videoId;

    const playerData = [
      ...webpage.matchAll(
        /PlayerFactory\.setParam\('(?<type>format|param)',\s*'(?<name>[^']+)',\s*'(?<val>[^']+)'\);/g,
      ),
    ].map((x) => [x.groups!.type!, x.groups!.name!, x.groups!.val!] as const);

    const formats: Format[] = [];
    let duration: number | undefined;
    let thumb: string | undefined;

    for (const [t, n, v] of playerData) {
      if (t === 'format') {
        if (['video-hds-vod-ec', 'video-hls-vod-ec', 'video-viralize', 'video-youtube-pfp'].includes(n)) continue;
        if (n.endsWith('-vod-ak')) {
          formats.push(...(await this._extract_m3u8_formats(v, videoId, 'mp4', 'm3u8_native', undefined, undefined, n, undefined, false)));
        } else {
          const ext = determine_ext(v);
          if (ext === 'm3u8') {
            formats.push(
              ...(await this._extract_m3u8_formats(v, videoId, 'mp4', 'm3u8_native', undefined, undefined, n, undefined, false)),
            );
            continue;
          }
          const f: Format = { format_id: n, url: v };
          if (ext === 'mp3') {
            const abr = int_or_none(/-mp3-audio-(\d+)/.exec(v)?.[1]) ?? undefined;
            Object.assign(f, { abr, tbr: abr, acodec: ext, vcodec: 'none' });
          } else {
            const mobj = /^video-rrtv-(\d+)(?:-(\d+))?$/.exec(n);
            if (mobj) Object.assign(f, { height: Number(mobj[1]), vbr: int_or_none(mobj[2]) ?? undefined });
            if (!f.vbr) f.vbr = int_or_none(/-video-rrtv-(\d+)/.exec(v)?.[1]) ?? undefined;
          }
          formats.push(f);
        }
      } else if (t === 'param') {
        if (n === 'image_full' || n === 'image') thumb = v;
        else if (n === 'videoDuration') duration = int_or_none(v) ?? undefined;
      }
    }

    return {
      id: videoId,
      title,
      description:
        this._html_search_meta(['twitter:description', 'og:description', 'description'], webpage) ?? undefined,
      thumbnail: thumb || this._og_search_thumbnail(webpage) || undefined,
      formats: GediDigitalIE._cleanFormats(formats),
      duration,
    };
  }
}
