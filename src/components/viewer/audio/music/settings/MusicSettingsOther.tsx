import type { Component } from 'solid-js';
import { AudioDislikePanel } from '@/components/viewer/audio/music/AudioDislikePanel';

export interface MusicSettingsOtherProps {
  embedded?: boolean;
}

export const MusicSettingsOther: Component<MusicSettingsOtherProps> = (props) => (
  <div class={props.embedded ? 'space-y-5' : 'space-y-5 p-4'}>
    {!props.embedded && (
      <div>
        <h2 class="text-sm font-medium">其他</h2>
        <p class="mt-1 text-xs text-muted-foreground">管理音乐缓存说明与不喜欢歌曲过滤规则。</p>
      </div>
    )}
    <section class="rounded-lg border p-4 text-sm">
      <h3 class="font-medium">缓存</h3>
      <p class="mt-2 text-xs text-muted-foreground">
        音乐音频、封面及其他媒体缓存由 Reader 主程序统一管理。请前往
        「设置 → 存储管理」查看占用并清理；此处不会重复提供只清理部分文件的按钮。
      </p>
      <p class="mt-2 text-xs text-muted-foreground">
        临时播放地址会按歌曲自动更新，无需手动清理。
      </p>
    </section>
    <section>
      <h3 class="mb-2 text-sm font-medium">不喜欢歌曲</h3>
      <AudioDislikePanel open inline embedded={props.embedded} />
    </section>
  </div>
);
