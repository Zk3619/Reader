/**
 * AnvatoIE — aligned with yt-dlp anvato.py (main video API path)
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, join_nonempty, unsmuggle_url } from '../../utils';
import { anvatoAdstAuth, md5Hex, stripJsonp } from './helpers';

const API_BASE_URL = 'https://tkx.mp.lura.live/rest/v2';
const AUTH_KEY = new Uint8Array([0x31, 0xc2, 0x42, 0x84, 0x9e, 0x73, 0xa0, 0xce]);

const ANVACK_TABLE: Record<string, string> = {
  'X8POa4zpGZMmeiq0wqiO8IP5rMqQM9VN': 'Dn5vOY9ooDw7VSl9qztjZI5o0g08mA0z',
  nbcu_nbcd_desktop_web_prod_93d8ead38ce2024f8f544b78306fbd15895ae5e6:
    'NNemUkySjxLyPTKvZRiGntBIjEyK8uqicjMakIaQ',
};

const MCP_TO_ACCESS_KEY: Record<string, string> = {
  qa: 'anvato_mcpqa_demo_web_stage_18b55e00db5a13faa8d03ae6e41f6f5bcb15b922',
  lin: 'anvato_mcp_lin_web_prod_4c36fbfd4d8d8ecae6488656e21ac6d1ac972749',
  univison: 'anvato_mcp_univision_web_prod_37fe34850c99a3b5cdb71dab10a417dd5cdecafa',
  uni: 'anvato_mcp_univision_web_prod_37fe34850c99a3b5cdb71dab10a417dd5cdecafa',
  hearst: 'anvato_mcp_hearst_web_prod_5356c3de0fc7c90a3727b4863ca7fec3a4524a99',
  cbs: 'anvato_mcp_cbs_web_prod_02f26581ff80e5bda7aad28226a8d369037f2cbe',
};

export class AnvatoIE extends InfoExtractor {
  static IE_NAME = 'anvato';
  static _VALID_URL = /anvato:(?<access_key_or_mcp>[^:]+):(?<id>\d+)/;

  private async serverTime(accessKey: string, videoId: string): Promise<number> {
    const data = await this._download_json<{ server_time?: number }>(
      `${API_BASE_URL}/server_time`,
      videoId,
      'Fetching server time',
      { query: { anvack: accessKey }, fatal: false },
    );
    return int_or_none(data.server_time) ?? Math.trunc(Date.now() / 1000);
  }

  private async getVideoJson(
    accessKey: string,
    videoId: string,
    extractedToken?: string,
  ): Promise<Record<string, unknown>> {
    const videoDataUrl = `${API_BASE_URL}/mcp/video/${videoId}?anvack=${accessKey}`;
    const serverTime = await this.serverTime(accessKey, videoId);
    const inputData = `${serverTime}~${md5Hex(videoDataUrl)}~${md5Hex(String(serverTime))}`;
    const query = {
      'X-Anvato-Adst-Auth': anvatoAdstAuth(inputData, AUTH_KEY),
      rtyp: 'fp',
    };
    const anvrid = md5Hex(String(Date.now() * Math.random())).slice(0, 30);
    const api: Record<string, string> = { anvrid, anvts: String(serverTime) };
    if (extractedToken) api.anvstk2 = extractedToken;
    else if (ANVACK_TABLE[accessKey]) {
      api.anvstk = md5Hex(`${accessKey}|${anvrid}|${serverTime}|${ANVACK_TABLE[accessKey]}`);
    } else api.anvstk2 = 'default';

    return this._download_json<Record<string, unknown>>(
      videoDataUrl,
      videoId,
      undefined,
      {
        query,
        method: 'POST',
        data: JSON.stringify({ api }),
        headers: { 'Content-Type': 'application/json' },
      },
    ).then((raw) => {
      if (typeof raw === 'string') return JSON.parse(stripJsonp(raw)) as Record<string, unknown>;
      return raw;
    });
  }

  private async getAnvatoVideos(
    accessKey: string,
    videoId: string,
    token?: string,
  ): Promise<VideoInfo> {
    const videoData = await this.getVideoJson(accessKey, videoId, token);
    const formats: Format[] = [];

    for (const publishedUrl of (videoData.published_urls as Record<string, unknown>[]) || []) {
      let videoUrl = publishedUrl.embed_url != null ? String(publishedUrl.embed_url) : '';
      if (!videoUrl) continue;
      const mediaFormat = publishedUrl.format != null ? String(publishedUrl.format) : '';
      const ext = determine_ext(videoUrl);
      const tbr = int_or_none(publishedUrl.kbps);

      if (ext === 'smil' || mediaFormat === 'smil') continue;

      if (mediaFormat === 'vtt') continue;

      if (mediaFormat === 'm3u8-variant' || ext === 'm3u8' || mediaFormat === 'm3u8') {
        if (mediaFormat === 'm3u8' && tbr != null) {
          formats.push({ url: videoUrl, format_id: `hls-${tbr}`, ext: 'mp4', tbr: tbr ?? undefined });
          continue;
        }
        const manifestJson = await this._download_json<Record<string, unknown>>(
          videoUrl,
          videoId,
          'Downloading manifest JSON',
          { fatal: false },
        );
        if (manifestJson?.master_m3u8) videoUrl = String(manifestJson.master_m3u8);
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
        continue;
      }

      const fmt: Format = {
        url: videoUrl,
        format_id: join_nonempty('http', publishedUrl.cdn_name != null ? String(publishedUrl.cdn_name) : '').toLowerCase(),
        tbr: tbr ?? undefined,
      };
      if (ext === 'mp3' || mediaFormat === 'mp3') fmt.vcodec = 'none';
      else {
        fmt.width = int_or_none(publishedUrl.width) ?? undefined;
        fmt.height = int_or_none(publishedUrl.height) ?? undefined;
      }
      formats.push(fmt);
    }

    const tags = videoData.def_tags != null ? String(videoData.def_tags).split(',') : undefined;
    return {
      id: videoId,
      formats,
      title: videoData.def_title != null ? String(videoData.def_title) : videoId,
      description: videoData.def_description != null ? String(videoData.def_description) : null,
      tags,
      categories: videoData.categories as string[] | undefined,
      thumbnail:
        (videoData.src_image_url != null ? String(videoData.src_image_url) : undefined) ||
        (videoData.thumbnail != null ? String(videoData.thumbnail) : undefined),
      timestamp: int_or_none(videoData.ts_published ?? videoData.ts_added),
      uploader: videoData.mcp_id != null ? String(videoData.mcp_id) : undefined,
      duration: int_or_none(videoData.duration),
      extractor: 'anvato',
      extractor_key: 'Anvato',
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggled] = unsmuggle_url(url);
    const m = this._match_valid_url(cleanUrl)!;
    let accessKey = m.groups?.access_key_or_mcp ?? m[1] ?? '';
    const videoId = m.groups?.id ?? m[2] ?? '';
    if (!ANVACK_TABLE[accessKey]) {
      accessKey = MCP_TO_ACCESS_KEY[accessKey.toLowerCase()] || accessKey;
    }
    return this.getAnvatoVideos(accessKey, videoId, smuggled.token as string | undefined);
  }
}
