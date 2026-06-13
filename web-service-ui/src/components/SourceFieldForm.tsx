import { For, Show } from 'solid-js';
import { Input, TextArea, Label } from '@/components/Layout';

export interface GenericEditField {
  title: string;
  id: string;
  type: 'String' | 'Boolean' | 'Number' | 'Array';
  hint?: string;
  required?: boolean;
  array?: string[];
}

interface SourceFieldFormProps<T extends Record<string, unknown>> {
  fields: GenericEditField[];
  getValue: (field: GenericEditField) => string | number | boolean | undefined;
  onChange: (field: GenericEditField, raw: string | boolean) => void;
}

export function SourceFieldForm<T extends Record<string, unknown>>(props: SourceFieldFormProps<T>) {
  return (
    <div class="space-y-4">
      <For each={props.fields}>
      {(field) => (
        <div class="space-y-1">
          <Label hint={field.hint}>
            {field.title}
            {field.required ? ' *' : ''}
          </Label>
          <Show
            when={field.type === 'Boolean'}
            fallback={
              <Show
                when={field.type === 'Array'}
                fallback={
                  <Show
                    when={
                      field.id.includes('Js') ||
                      field.id.includes('Url') ||
                      field.id === 'header' ||
                      field.id.startsWith('rule') ||
                      field.id.includes('Html') ||
                      field.id.includes('Style')
                    }
                    fallback={
                      <Input
                        value={String(props.getValue(field) ?? '')}
                        onInput={(v) => props.onChange(field, v)}
                      />
                    }
                  >
                    <TextArea
                      value={String(props.getValue(field) ?? '')}
                      onInput={(v) => props.onChange(field, v)}
                      rows={3}
                    />
                  </Show>
                }
              >
                <select
                  class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={String(field.array?.[Number(props.getValue(field) ?? 0)] ?? '')}
                  onChange={(e) => props.onChange(field, e.currentTarget.value)}
                >
                  <For each={field.array ?? []}>{(opt) => <option value={opt}>{opt}</option>}</For>
                </select>
              </Show>
            }
          >
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(props.getValue(field))}
                onChange={(e) => props.onChange(field, e.currentTarget.checked)}
              />
              启用
            </label>
          </Show>
        </div>
      )}
    </For>
    </div>
  );
}
