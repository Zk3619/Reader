import { For, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { NewBookSource } from '@/types';

export interface ImportSourceSelectDialogProps {
  open: boolean;
  loading: boolean;
  sources: NewBookSource[];
  selectedUrls: Set<string>;
  /** 内嵌页会话时须高于 .reader-inner-web-layer（如 z-[160]） */
  portalZClass?: string;
  onOpenChange: (open: boolean) => void;
  onToggle: (sourceUrl: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onConfirm: () => void;
}

export function ImportSourceSelectDialog(props: ImportSourceSelectDialogProps) {
  const allSelected = () =>
    props.sources.length > 0 && props.selectedUrls.size === props.sources.length;
  const selectedCountText = () => `(${props.selectedUrls.size}/${props.sources.length})`;

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>识别导入书源</AppDialogTitle>
          <AppDialogDescription>
            识别完成后可勾选需要导入的书源，点击确认才会真正导入。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <Show
            when={!props.loading}
            fallback={
              <div class="flex min-h-40 items-center justify-center rounded-lg border border-border/50 bg-muted/20">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            }
          >
            <Show
              when={props.sources.length > 0}
              fallback={<p class="text-sm text-muted-foreground">未识别到有效书源</p>}
            >
              <div class="space-y-3">
                <For each={props.sources}>
                  {(source, index) => {
                    const checkboxId = `import-source-${index()}`;
                    return (
                    <div class="flex cursor-pointer items-start gap-2 rounded-md border border-border/70 p-3 hover:bg-muted/40">
                      <Checkbox
                        id={checkboxId}
                        checked={props.selectedUrls.has(source.sourceUrl)}
                        onChange={(checked) => props.onToggle(source.sourceUrl, !!checked)}
                      />
                      <div class="min-w-0 flex-1">
                        <Label for={checkboxId} class="block cursor-pointer truncate text-sm font-medium">
                          {source.sourceName}
                        </Label>
                        <Label for={checkboxId} class="block cursor-pointer truncate text-xs text-muted-foreground">
                          {source.sourceUrl}
                        </Label>
                      </div>
                    </div>
                  )}}
                </For>
              </div>
            </Show>
          </Show>
        </div>
        <AppDialogFooter class="w-full justify-start items-center gap-2 sm:justify-start!">
          <Button variant="outline" onClick={props.onSelectAllToggle} disabled={props.loading || props.sources.length === 0}>
            {allSelected() ? '取消选中' : '全选'} {selectedCountText()}
          </Button>
          <Button variant="outline" onClick={props.onInvertSelect} disabled={props.loading || props.sources.length === 0}>
            反选
          </Button>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
              取消
            </Button>
            <Button
              onClick={props.onConfirm}
              disabled={props.loading || props.selectedUrls.size === 0}
            >
              确定
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
