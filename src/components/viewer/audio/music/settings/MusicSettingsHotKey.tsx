import { createSignal, For, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { isTauri } from '@/lib/platform/detect';
import {
  loadMusicHotkeys,
  saveAndRegisterMusicHotkeys,
  type MusicHotkeys,
} from '@/lib/media/audio/platform/music-hotkeys';
import { showAppToast } from '@/components/shared/AppToasts';

const HOTKEY_GROUPS: {
  title: string;
  actions: { key: keyof MusicHotkeys; label: string; description: string }[];
}[] = [
  {
    title: '播放控制',
    actions: [
      { key: 'play', label: '开始播放', description: '当前未播放时开始播放' },
      { key: 'pause', label: '暂停播放', description: '当前正在播放时暂停' },
      { key: 'next', label: '下一首', description: '切换到下一首歌曲' },
      { key: 'prev', label: '上一首', description: '切换到上一首歌曲' },
      { key: 'seek_forward', label: '快进 10 秒', description: '播放位置向后移动 10 秒' },
      { key: 'seek_back', label: '后退 10 秒', description: '播放位置向前移动 10 秒' },
    ],
  },
  {
    title: '音量控制',
    actions: [
      { key: 'vol_up', label: '调高音量', description: '音量增加 5%' },
      { key: 'vol_down', label: '调低音量', description: '音量减少 5%' },
      { key: 'mute', label: '切换静音', description: '在静音与原音量间切换' },
    ],
  },
  {
    title: '音乐功能',
    actions: [
      { key: 'collect', label: '收藏或取消收藏', description: '切换当前歌曲的收藏状态' },
      { key: 'lyric_toggle', label: '显示或隐藏桌面歌词', description: '切换桌面歌词窗口' },
    ],
  },
];

export const MusicSettingsHotKey: Component = () => {
  const [hotkeys, setHotkeys] = createSignal(loadMusicHotkeys());
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveAndRegisterMusicHotkeys(hotkeys());
      showAppToast({ title: '全局快捷键已应用' });
    } catch (error) {
      showAppToast({
        title: '快捷键应用失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isTauri()) {
    return <div class="p-4 text-sm text-muted-foreground">全局快捷键仅桌面端可用。</div>;
  }

  return (
    <div class="space-y-5 p-4 text-sm">
      <div>
        <h2 class="font-medium">全局快捷键</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          快捷键在 Reader 位于后台时仍可控制音乐；留空可停用对应动作。
        </p>
      </div>
      <For each={HOTKEY_GROUPS}>
        {(group) => (
          <section class="space-y-3">
            <h3 class="font-medium">{group.title}</h3>
            <div class="grid gap-3 lg:grid-cols-2">
              <For each={group.actions}>
                {(action) => (
                  <label class="space-y-1 rounded-lg border p-3">
                    <span class="block font-medium">{action.label}</span>
                    <span class="block text-xs text-muted-foreground">{action.description}</span>
                    <AppTextFieldBareInput
                      class="mt-2"
                      aria-label={`${action.label}快捷键`}
                      placeholder="未设置"
                      value={hotkeys()[action.key]}
                      onInput={(event) =>
                        setHotkeys((value) => ({
                          ...value,
                          [action.key]: event.currentTarget.value,
                        }))
                      }
                    />
                  </label>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
      <div class="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Reader 当前仅支持全局快捷键，不支持 LX 的软件内快捷键录制；也暂不提供组合键冲突检测。
        如果注册失败，请更换已被系统或其他软件占用的组合键。
      </div>
      <Button size="sm" disabled={saving()} onClick={() => void save()}>
        {saving() ? '正在应用…' : '应用全局快捷键'}
      </Button>
    </div>
  );
};
