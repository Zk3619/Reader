/**
 * 解析音频章节正文（兼容导出）
 */

import {
  parseAudioUrlStrings,
  parseParsedAudioUrls,
  type ParsedAudioUrl,
} from '@/lib/media/audio/parsed-audio-url';

export type { ParsedAudioUrl };
export { parseParsedAudioUrls, parseAudioUrlStrings };
