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
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-standalone"
              checked={settings().playDetailStandalone}
              onChange={(checked) => apply({ playDetailStandalone: checked })}
            />
            <Label for="music-play-detail-standalone">独立展示</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后播放详情以全视口覆盖层展示，覆盖主壳顶栏与侧栏。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-hide-header"
              checked={settings().playDetailHideHeader}
              onChange={(checked) => apply({ playDetailHideHeader: checked })}
            />
            <Label for="music-play-detail-hide-header">隐藏顶栏</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            隐藏标题顶栏，将返回与设置按钮分布到内容顶部（对齐 LX Music 桌面端布局）。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-desktop-side-drawer"
              checked={settings().playDetailDesktopSidePaneDrawer}
              onChange={(checked) => apply({ playDetailDesktopSidePaneDrawer: checked })}
            />
            <Label for="music-play-detail-desktop-side-drawer">
              桌面端评论与播放队列使用右侧抽屉
            </Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后面板从右侧覆盖显示；关闭时使用可拖动分隔线的内嵌面板。
          </p>
        </div>
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
            切到下一行后再延迟滚动；设为 0 表示立即跟随。
          </p>
        </div>
        <div class="space-y-1">
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
          <p class="text-xs text-muted-foreground">
            开启后，手动浏览歌词时显示时间预览线，点击播放按钮跳转到对应位置。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-show-translation"
            checked={settings().showLyricTranslation !== false}
            onChange={(checked) => apply({ showLyricTranslation: checked })}
          />
          <Label for="music-play-detail-show-translation">显示翻译歌词</Label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-show-roma"
            checked={settings().showLyricRoma !== false}
            onChange={(checked) => apply({ showLyricRoma: checked })}
          />
          <Label for="music-play-detail-show-roma">显示罗马音歌词</Label>
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
        <h2 class="text-base font-semibold">歌词字体</h2>
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
