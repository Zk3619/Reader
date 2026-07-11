/** dislike 规则管理 UI */
import { createResource, createSignal, For, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  deleteDislikeRule,
  listDislikeRules,
  saveDislikeRule,
  type AudioDislikeRule,
} from '@/lib/database/audio-library';
import { invalidateDislikeRulesCache } from '@/lib/media/audio/library/dislike-filter';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';

export interface AudioDislikePanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
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
        <AppTextFieldBareInput
          placeholder="正则匹配 pattern"
          value={pattern()}
          onInput={(e) => setPattern(e.currentTarget.value)}
        />
        <MusicAppSelect
          value={field()}
          onChange={(v) => setField(v as AudioDislikeRule['field'])}
          options={DISLIKE_FIELDS}
          optionLabel={(v) => DISLIKE_FIELD_LABELS[v]}
          aria-label="匹配字段"
        />
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
