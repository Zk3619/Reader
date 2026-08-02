/** TelegramEmbedIE — ported from yt-dlp telegram.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, get_element_by_class, parse_duration, parse_qs, unified_timestamp, update_url_query } from '../../utils';
import { urlBasename } from './_helpers';

function formatField(obj: Record<string, unknown>, key: string, template: string): string | undefined {
  const val = obj[key];
  if (val == null || val === '') return undefined;
  return template.replace('%s', String(val));
}

export class TelegramEmbedIE extends InfoExtractor {
  static IE_NAME = 'telegram:embed';
  static _VALID_URL = /https?:\/\/t\.me\/(?<channel_id>[^/]+)\/(?<id>\d+)/;

  protected _yesPlaylist(playlistId: string | null, videoId: string): boolean {
    if (this.params.noplaylist) return false;
    return !!playlistId && playlistId !== videoId;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channelId = m.groups!.channel_id!;
    const msgId = m.groups!.id!;
    const embed = await this._download_webpage(url, msgId, 'Downloading embed frame', { query: { embed: '1', single: '' } });

    const cleanText = (cls: string, html: string): string | null => {
      const text = clean_html(get_element_by_class(cls, html) || '');
      return text ? text.replace(/\n/g, ' ') : null;
    };

    const description = cleanText('tgme_widget_message_text', embed);
    const message = {
      title: description || '',
      description: description ?? undefined,
      channel: cleanText('tgme_widget_message_author', embed) ?? undefined,
      channel_id: channelId,
      timestamp: unified_timestamp(this._search_regex(/<time[^>]*datetime="([^"]*)"/, embed, 'timestamp', null, false)) ?? undefined,
    };

    const videos: VideoInfo[] = [];
    for (const block of embed.match(/<a class="tgme_widget_message_video_player[\s\S]*?<\/time>/g) || []) {
      const videoUrl = this._search_regex(/<video[^>]+src="([^"]+)"/, block, 'video URL', null, false);
      const webpageUrl = this._search_regex(
        /<a class="tgme_widget_message_video_player[^>]+href="([^"]+)"/,
        block,
        'webpage URL',
        null,
        false,
      );
      if (!videoUrl || !webpageUrl) continue;
      const formats: Format[] = [{ url: videoUrl, ext: 'mp4', format_id: 'mp4' }];
      videos.push({
        id: urlBasename(webpageUrl),
        webpage_url: update_url_query(webpageUrl, { single: 'true' }),
        duration: parse_duration(this._search_regex(/<time[^>]+duration[^>]*>([\d:]+)<\/time>/, block, 'duration', null, false)) ?? undefined,
        thumbnail:
          this._search_regex(/tgme_widget_message_video_thumb"[^>]+background-image:url\('([^']+)'\)/, block, 'thumbnail', null, false) ??
          undefined,
        formats,
        ...message,
      });
    }

    const qs = parse_qs(url.split('?')[1] || '');
    const playlistId = videos.length > 1 && !('single' in qs) ? `${channelId}-${msgId}` : null;

    if (this._yesPlaylist(playlistId, msgId)) {
      return this.playlist_result(
        videos,
        playlistId!,
        formatField(message, 'channel', `%s ${msgId}`),
        description ?? undefined,
      );
    }
    return videos.find((v) => v.id === msgId) || videos[0]!;
  }
}
