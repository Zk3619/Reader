/** dislike 规则管理 UI */
import { createResource, createSignal, For, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  deleteDislikeRule,
  listDislikeRules,
  saveDislikeRule,
  type AudioDislikeRule,
} from '@/lib/database/audio-library';
import { invalidateDislikeRulesCache } from '@/lib/media/audio/library/dislike-filter';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioDislikePanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioDislikePanel: Component<AudioDislikePanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [rules, { refetch }] = createResource(() => (active() ? listDislikeRules() : []));
  const [pattern, setPattern] = createSignal('');
  const [field, setField] = createSignal<AudioDislikeRule['field']>('any');

  const addRule = async () => {
    const p = pattern().trim();
    if (!p) return;
    await saveDislikeRule({ id: `dislike_${Date.now()}`, pattern: p, field: field() });
    invalidateDislikeRulesCache();
    setPattern('');
    void refetch();
  };

  return (
    <AudioPanelShell open={props.open} inline={props.inline} title="Dislike 规则" onClose={props.onClose}>
      <div class="space-y-2 border-b p-4">
        <input
          class="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="正则匹配 pattern"
          value={pattern()}
          onInput={(e) => setPattern(e.currentTarget.value)}
        />
        <select
          class="w-full rounded-md border px-3 py-2 text-sm"
          value={field()}
          onChange={(e) => setField(e.currentTarget.value as AudioDislikeRule['field'])}
        >
          <option value="any">任意字段</option>
          <option value="name">歌名</option>
          <option value="artist">歌手</option>
          <option value="source">来源</option>
        </select>
        <Button size="sm" onClick={() => void addRule()}>
          添加规则
        </Button>
      </div>
      <ul class="p-4">
        <For each={rules() ?? []}>
          {(rule) => (
            <li class="mb-2 flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>
                {rule.field}: {rule.pattern}
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
