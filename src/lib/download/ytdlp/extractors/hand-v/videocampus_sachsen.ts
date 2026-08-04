// @ts-nocheck
/** VideocampusSachsenIE / ViMPPlaylistIE â€?ported from yt-dlp videocampus_sachsen.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, urlencodePostdata } from './_helpers';

const INSTANCES = [
  'bergauf.tv',
  'campus.demo.vimp.com',
  'corporate.demo.vimp.com',
  'dancehalldatabase.com',
  'drehzahl.tv',
  'educhannel.hs-gesundheit.de',
  'emedia.ls.haw-hamburg.de',
  'globale-evolution.net',
  'hohu.tv',
  'htvideos.hightechhigh.org',
  'k210039.vimp.mivitec.net',
  'media.cmslegal.com',
  'media.fh-swf.de',
  'media.hs-furtwangen.de',
  'media.hwr-berlin.de',
  'mediathek.dkfz.de',
  'mediathek.htw-berlin.de',
  'mediathek.polizei-bw.de',
  'medien.hs-merseburg.de',
  'mitmedia.manukau.ac.nz',
  'mportal.europa-uni.de',
  'pacific.demo.vimp.com',
  'slctv.com',
  'streaming.prairiesouth.ca',
  'tube.isbonline.cn',
  'univideo.uni-kassel.de',
  'ursula2.genetics.emory.edu',
  'ursulablicklevideoarchiv.com',
  'v.agrarumweltpaedagogik.at',
  'video.eplay-tv.de',
  'video.fh-dortmund.de',
  'video.hs-nb.de',
  'video.hs-offenburg.de',
  'video.hs-pforzheim.de',
  'video.hspv.nrw.de',
  'video.irtshdf.fr',
  'video.pareygo.de',
  'video.tu-dortmund.de',
  'video.tu-freiberg.de',
  'videocampus.sachsen.de',
  'videoportal.uni-freiburg.de',
  'videoportal.vm.uni-freiburg.de',
  'videos.duoc.cl',
  'videos.uni-paderborn.de',
  'vimp-bemus.udk-berlin.de',
  'vimp.aekwl.de',
  'vimp.hs-mittweida.de',
  'vimp.landesfilmdienste.de',
  'vimp.oth-regensburg.de',
  'vimp.ph-heidelberg.de',
  'vimp.sma-events.com',
  'vimp.weka-fachmedien.de',
  'vimpdesk.com',
  'webtv.univ-montp3.fr',
  'www.b-tu.de/media',
  'www.bergauf.tv',
  'www.bigcitytv.de',
  'www.cad-videos.de',
  'www.drehzahl.tv',
  'www.hohu.tv',
  'www.hsbi.de/medienportal',
  'www.logistic.tv',
  'www.orvovideo.com',
  'www.printtube.co.uk',
  'www.rwe.tv',
  'www.salzi.tv',
  'www.signtube.co.uk',
  'www.twb-power.com',
  'www.wenglor-media.com',
  'www2.univ-sba.dz',
];

const HOST_ALT = INSTANCES.map((h) => h.replace(/\./g, '\\.')).join('|');

export class VideocampusSachsenIE extends InfoExtractor {
  static IE_NAME = 'ViMP';
  static _INSTANCES = INSTANCES;
  static _VALID_URL = new RegExp(
    String.raw`https?://(?<host>${HOST_ALT})/(?:m/(?<tmp_id>[0-9a-f]+)|(?:category/)?video/(?<display_id>[\w-]+)/(?<id>[0-9a-f]{32})|media/embed.*(?:\?|&)key=(?<embed_id>[0-9a-f]{32}&?))`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups!.host!;
    let videoId = m.groups!.id;
    const tmpId = m.groups!.tmp_id;
    const displayId = m.groups!.display_id;
    const embedId = m.groups!.embed_id?.replace(/&$/, '');

    const webpage =
      (await this._download_webpage(url, videoId || tmpId, undefined, { fatal: false })) || '';

    if (!videoId) {
      videoId =
        embedId ||
        this._html_search_regex(
          new RegExp(
            String.raw`src="https?://${host.replace(/\./g, '\\.')}/media/embed.*(?:\?|&)key=([0-9a-f]+)&?`,
          ),
          webpage,
          'video_id',
        )!;
    }

    let title: string | null | undefined;
    let description: string | null | undefined;
    let thumbnail: string | null | undefined;
    if (!(displayId || tmpId)) {
      title = this._html_search_regex(
        /<video-js[^>]* data-piwik-title="([^"<]+)"/,
        webpage,
        'title',
        null,
        false,
      );
    } else {
      title = this._html_search_meta(['og:title', 'twitter:title', 'title'], webpage);
      description = this._html_search_meta(
        ['og:description', 'twitter:description', 'description'],
        webpage,
      );
      thumbnail = this._html_search_meta(['og:image', 'twitter:image'], webpage);
    }

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    try {
      const hls = await extractM3u8FormatsAndSubtitles(
        this,
        `https://${host}/media/hlsMedium/key/${videoId}/format/auto/ext/mp4/learning/0/path/m3u8`,
        videoId!,
        'hls',
      );
      formats = hls.formats;
      subtitles = hls.subtitles;
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (!/HTTP (404|500)/.test(msg) && !(e instanceof ExtractorError)) throw e;
    }

    formats.push({ url: `https://${host}/getMedium/${videoId}.mp4` });

    return {
      id: videoId!,
      title: title || videoId!,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
      display_id: displayId || undefined,
      formats,
      subtitles,
    };
  }
}

export class ViMPPlaylistIE extends InfoExtractor {
  static IE_NAME = 'ViMP:Playlist';
  static _PAGE_SIZE = 10;
  static _VALID_URL = new RegExp(
    String.raw`(?<host>https?://(?:${HOST_ALT}))/(?:(?<mode1>album)/view/aid/(?<album_id>[0-9]+)|(?<mode2>category|channel)/(?<name>[\w-]+)/(?<channel_id>[0-9]+)|(?<mode3>tag)/(?<tag_id>[0-9]+))`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups!.host!;
    const albumId = m.groups!.album_id;
    const name = m.groups!.name;
    const channelId = m.groups!.channel_id;
    const tagId = m.groups!.tag_id;
    const mode = m.groups!.mode1 || m.groups!.mode2 || m.groups!.mode3!;
    const playlistId = albumId || channelId || tagId!;

    const webpage =
      (await this._download_webpage(url, playlistId, undefined, { fatal: false })) || '';
    const title =
      this._html_search_meta('title', webpage) || htmlExtractTitle(webpage) || undefined;

    const urlPart = albumId
      ? `aid/${albumId}`
      : mode === 'category'
        ? `category/${name}/category_id/${channelId}`
        : mode === 'channel'
          ? `title/${name}/channel/${channelId}`
          : `tag/${tagId}`;

    const data: Record<string, string> = {
      'vars[mode]': mode,
      [`vars[${mode}]`]: playlistId,
      'vars[context]': albumId ? '4' : mode === 'category' ? '1' : mode === 'album' ? '3' : '0',
      'vars[context_id]': playlistId,
      'vars[layout]': 'thumb',
      'vars[per_page][thumb]': String(ViMPPlaylistIE._PAGE_SIZE),
    };

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 50; page++) {
      const pageHtml = await this._download_webpage(
        `${host}/media/ajax/component/boxList/${urlPart}`,
        playlistId,
        undefined,
        {
          query: { page: String(page), page_only: '1' },
          data: urlencodePostdata(data),
          method: 'POST',
        },
      );
      const urls = [...pageHtml.matchAll(/"([^"]*\/video\/[^"]+)"/g)].map((x) => x[1]!);
      if (!urls.length) break;
      for (const u of urls) {
        entries.push(this.url_result(host + u, 'ViMP'));
      }
      if (urls.length < ViMPPlaylistIE._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, `${mode}-${playlistId}`, title);
  }
}
