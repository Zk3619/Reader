/** SohuIE / SohuVIE — ported from yt-dlp sohu.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

export class SohuIE extends InfoExtractor {
  static IE_NAME = 'sohu';
  static _VALID_URL =
    /https?:\/\/(?:(?<mytv>my\.)tv\.sohu\.com\/.+?(?<id_mytv>\d+)\.shtml|tv\.sohu\.com\/.+?n(?<id_tv>\d+)\.shtml).*?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const fetchData = async (vidId: string, mytv: boolean) => {
      const baseDataUrl = mytv
        ? 'http://my.tv.sohu.com/play/videonew.do?vid='
        : 'http://hot.vrs.sohu.com/vrs_flash.action?vid=';
      return this._download_json<Record<string, unknown>>(
        baseDataUrl + vidId,
        videoId,
        `Downloading JSON data for ${vidId}`,
        { headers: this.geo_verification_headers() },
      );
    };

    const m = this._match_valid_url(url)!;
    const videoId = (m.groups!.id_mytv || m.groups!.id_tv)!;
    const mytv = m.groups!.mytv != null;

    const webpage = await this._download_webpage(url, videoId);
    let title = this._og_search_title(webpage) || videoId;
    title = title.replace(/( - 高清正版在线观看)? - 搜狐视频$/, '');

    const vid = this._html_search_regex(/var vid ?= ?["'](\d+)["']/, webpage, 'video path')!;
    let vidData = await fetchData(vid, mytv);

    if (vidData.play !== 1) {
      if (vidData.status === 12) {
        throw new ExtractorError(`${this.IE_NAME} said: There's something wrong in the video.`, {
          expected: true,
        });
      }
      this.raise_geo_restricted(`${this.IE_NAME} said: The video is only licensed to users in Mainland China.`);
    }

    const formatsJson: Record<string, Record<string, unknown>> = {};
    for (const formatId of ['nor', 'high', 'super', 'ori', 'h2644k', 'h2654k']) {
      const dataObj = vidData.data as Record<string, unknown> | undefined;
      let vidId = dataObj?.[`${formatId}Vid`];
      if (!vidId) continue;
      vidId = String(vidId);
      formatsJson[formatId] = vid === vidId ? vidData : await fetchData(String(vidId), mytv);
    }

    const dataBlock = (vidData.data as Record<string, unknown>) || {};
    const partCount = Number(dataBlock.totalBlocks || 1);
    const playlist: VideoInfo[] = [];

    for (let i = 0; i < partCount; i++) {
      const formats: Format[] = [];
      for (const [formatId, formatData] of Object.entries(formatsJson)) {
        const allot = String(formatData.allot || '');
        const data = (formatData.data as Record<string, unknown>) || {};
        const clipUrl =
          url_or_none((data.clipsURL as string[])?.[i]) ||
          url_or_none((data.mp4PlayUrl as string[])?.[i]);
        if (!clipUrl) throw new ExtractorError(`Unable to extract url for clip ${i}`);
        const su = (data.su as string[])?.[i];

        let videoUrl = 'newflv.sohu.ccgslb.net';
        let cdnId: string | undefined;
        let retries = 0;

        while (videoUrl.includes('newflv.sohu.ccgslb.net')) {
          const params: Record<string, string | number> = {
            prot: 9,
            file: clipUrl,
            new: su || '',
            prod: 'h5n',
            rb: 1,
          };
          if (cdnId != null) params.idc = cdnId;

          let downloadNote = `Downloading ${formatId} video URL part ${i + 1} of ${partCount}`;
          if (retries > 0) downloadNote += ` (retry #${retries})`;

          const partInfo = this._parse_json<{ url?: string; nid?: string }>(
            await this._download_webpage(
              `http://${allot}/?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`,
              videoId,
              downloadNote,
            ),
            videoId,
          );
          videoUrl = partInfo?.url || '';
          cdnId = partInfo?.nid;
          retries++;
          if (retries > 5) throw new ExtractorError('Failed to get video URL');
        }

        formats.push({
          url: videoUrl,
          format_id: formatId,
          filesize: int_or_none(try_get(data, (x) => (x.clipsBytes as number[])?.[i])) ?? undefined,
          width: int_or_none(data.width) ?? undefined,
          height: int_or_none(data.height) ?? undefined,
          fps: int_or_none(data.fps) ?? undefined,
        });
      }

      playlist.push({
        id: `${videoId}_part${i + 1}`,
        title,
        duration: ((dataBlock.clipsDuration as number[]) || [])[i],
        formats,
      });
    }

    let info: VideoInfo;
    if (playlist.length === 1) {
      info = { ...playlist[0]!, id: videoId };
    } else {
      info = {
        _type: 'multi_video',
        entries: playlist,
        id: videoId,
        title,
        duration: float_or_none(dataBlock.totalDuration) ?? undefined,
      };
    }

    let publishTime: number | null;
    if (mytv) {
      const pt = this._search_regex(/publishTime:\s*["'](\d+-\d+-\d+ \d+:\d+)["']/, webpage, 'publish time', null, false);
      publishTime = unified_timestamp(pt);
    } else {
      publishTime = unified_timestamp(vidData.tv_application_time);
    }

    const wmData = (vidData.wm_data as Record<string, unknown>) || {};
    const tagsRaw = dataBlock.tag;
    return {
      timestamp: publishTime != null ? publishTime - 8 * 3600 : undefined,
      alt_title: dataBlock.subName != null ? String(dataBlock.subName) : undefined,
      uploader: wmData.wm_username != null ? String(wmData.wm_username) : undefined,
      thumbnail: url_or_none(dataBlock.coverImg) || undefined,
      tags: tagsRaw != null ? String(tagsRaw).split(/\s+/) : undefined,
      ...info,
    };
  }
}

export class SohuVIE extends InfoExtractor {
  static IE_NAME = 'sohu:v';
  static _VALID_URL = /https?:\/\/tv\.sohu\.com\/v\/(?<id>[\w=-]+)\.html(?:$|[#?])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const encodedId = this._match_id(url);
    const path = atob(encodedId.replace(/-/g, '+').replace(/_/g, '/'));
    const subdomain = /^\d+\/n\d+\.shtml/.test(path) ? 'tv' : 'my.tv';
    return this.url_result(urljoin(`http://${subdomain}.sohu.com/`, path), 'Sohu');
  }
}
