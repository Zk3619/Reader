/** 不喜欢歌曲规则管理 UI */
import { createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  deleteDislikeRule,
  listDislikeRules,
  saveDislikeRule,
  type AudioDislikeRule,
} from '@/lib/database/audio-library';
import {
  invalidateDislikeRulesCache,
  isValidDislikePattern,
} from '@/lib/media/audio/library/dislike-filter';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';

export interface AudioDislikePanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  embedded?: boolean;
}

const DISLIKE_FIELDS = ['any', 'name', 'artist', 'source'] as const;
const DISLIKE_FIELD_LABELS: Record<(typeof DISLIKE_FIELDS)[number], string> = {
  any: '任意字段',
  name: '歌名',
  artist: '歌手',
  source: '来源',
};

export const AudioDislikePanel: Component<AudioDislikePanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [rules, { refetch }] = createResource(() => (active() ? listDislikeRules() : []));
  const [pattern, setPattern] = createSignal('');
  const [field, setField] = createSignal<AudioDislikeRule['field']>('any');
  const patternValid = createMemo(() => {
    const value = pattern().trim();
    return !value || isValidDislikePattern(value);
  });

  const addRule = async () => {
    const p = pattern().trim();
    if (!p || !isValidDislikePattern(p)) return;
    await saveDislikeRule({ id: `dislike_${Date.now()}`, pattern: p, field: field() });
    invalidateDislikeRulesCache();
    setPattern('');
    void refetch();
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      hideHeader={props.embedded}
      title="不喜欢歌曲规则"
      onClose={props.onClose}
    >
      <div class="space-y-2 border-b p-4">
        <p class="text-xs text-muted-foreground">
          匹配到的歌曲会从音乐列表中过滤。支持正则表达式，例如“现场|伴奏”。
        </p>
        <AppTextFieldBareInput
          aria-label="歌曲匹配内容"
          placeholder="输入要过滤的名称、歌手或来源"
          value={pattern()}
          onInput={(e) => setPattern(e.currentTarget.value)}
        />
        <Show when={!patternValid()}>
          <p class="text-xs text-destructive">匹配表达式无效，请检查括号或转义字符。</p>
        </Show>
        <MusicAppSelect
          value={field()}
          onChange={(v) => setField(v as AudioDislikeRule['field'])}
          options={DISLIKE_FIELDS}
          optionLabel={(v) => DISLIKE_FIELD_LABELS[v]}
          aria-label="匹配字段"
        />
        <Button size="sm" disabled={!pattern().trim() || !patternValid()} onClick={() => void addRule()}>
          添加规则
        </Button>
      </div>
      <ul class="space-y-2 p-4">
        <For each={rules() ?? []}>
          {(rule) => (
            <li class="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
              <span class="min-w-0">
                <span class="block text-xs text-muted-foreground">
                  匹配范围：{DISLIKE_FIELD_LABELS[rule.field]}
                </span>
                <span class="mt-0.5 block break-all">{rule.pattern}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void deleteDislikeRule(rule.id).then(() => {
                    invalidateDislikeRulesCache();
                    void refetch();
                  })
                }
              >
                删除
              </Button>
            </li>
          )}
        </For>
      </ul>
    </AudioPanelShell>
  );
};
