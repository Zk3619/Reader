/**
 * 来源页 — 音乐源（UserApi / 内置平台），非 Legado book_sources
 */

import { AudioSourceSettings } from '@/components/viewer/audio/music/AudioSourceSettings';

export function SourcesMusicSourcePanel() {
  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AudioSourceSettings open inline />
    </div>
  );
}
