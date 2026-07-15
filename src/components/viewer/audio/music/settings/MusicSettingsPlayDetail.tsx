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
    <div class="space-y-5 p-4 text-sm">
      <section class="space-y-4">
        <h2 class="text-base font-semibold">播放详情页设置</h2>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-zoom-active-lyric-input"
            checked={settings().playDetailZoomActiveLyric}
            onChange={(checked) => apply({ playDetailZoomActiveLyric: checked })}
          />
          <Label for="music-play-detail-zoom-active-lyric-input">
            缩放当前正在播放的歌词
          </Label>
        </div>
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">延迟歌词滚动：</span>
            <NumberField
              rawValue={settings().playDetailLyricScrollDelayMs}
              onRawValueChange={(value) => apply({ playDetailLyricScrollDelayMs: value })}
              minValue={0}
              maxValue={5000}
              step={100}
            >
              <NumberFieldInput class="w-24" aria-label="延迟歌词滚动毫秒" />
            </NumberField>
            <span class="text-muted-foreground">毫秒</span>
          </div>
          <p class="text-xs text-muted-foreground">
            Reader 使用数字延迟保留更精细的控制；设为 0 表示关闭延迟歌词滚动。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-allow-lyric-seek-input"
            checked={settings().playDetailAllowLyricSeek}
            onChange={(checked) => apply({ playDetailAllowLyricSeek: checked })}
          />
          <Label for="music-play-detail-allow-lyric-seek-input">
            允许通过拖拽歌词调整播放进度
          </Label>
        </div>
      </section>

      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">歌词对齐方式</h2>
        <div class="flex flex-wrap items-center gap-2">
          <MusicAppSelect
            value={settings().playDetailLyricAlign}
            onChange={(value) =>
              apply({ playDetailLyricAlign: value as MusicLyricAlign })
            }
            options={ALIGN_OPTIONS}
            optionLabel={(value) => ALIGN_LABELS[value]}
            triggerClass="w-28"
            aria-label="播放详情歌词对齐"
          />
        </div>
      </section>

      <section class="space-y-3 border-t pt-4">
        <h2 class="text-base font-semibold">Reader 扩展 · 歌词字体</h2>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词字体大小：</span>
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
      </section>
    </div>
  );
};
