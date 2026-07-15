import { createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  NumberField,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicLyricAlign,
} from '@/lib/media/audio/music-settings';

const ALIGN_OPTIONS: MusicLyricAlign[] = ['left', 'center', 'right'];
const ALIGN_LABELS: Record<MusicLyricAlign, string> = {
  left: '左对齐',
  center: '居中',
  right: '右对齐',
};

export const MusicSettingsPlayDetail: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-4 p-4 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">歌词对齐：</span>
        <MusicAppSelect
          value={settings().playDetailLyricAlign}
          onChange={(value) => apply({ playDetailLyricAlign: value as MusicLyricAlign })}
          options={ALIGN_OPTIONS}
          optionLabel={(value) => ALIGN_LABELS[value]}
          triggerClass="w-28"
          aria-label="播放详情歌词对齐"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">歌词字号：</span>
        <NumberField
          rawValue={settings().playDetailLyricFontSize}
          onRawValueChange={(value) => apply({ playDetailLyricFontSize: value })}
          minValue={12}
          maxValue={32}
        >
          <NumberFieldInput class="w-20" aria-label="播放详情歌词字号" />
        </NumberField>
        <span class="text-muted-foreground">px</span>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-play-detail-zoom-active-lyric-input"
          checked={settings().playDetailZoomActiveLyric}
          onChange={(checked) => apply({ playDetailZoomActiveLyric: checked })}
        />
        <Label for="music-play-detail-zoom-active-lyric-input">放大当前歌词行</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-play-detail-allow-lyric-seek-input"
          checked={settings().playDetailAllowLyricSeek}
          onChange={(checked) => apply({ playDetailAllowLyricSeek: checked })}
        />
        <Label for="music-play-detail-allow-lyric-seek-input">
          允许点击歌词跳转播放进度
        </Label>
      </div>
    </div>
  );
};
