import { appDialogScrollBodySpaceY2 } from '@/lib/ui/viewport-classes';
/**
 * ?? URL ???????
 * ?? legado showAddBookByUrlAlert / BookshelfViewModel.addBookByUrl?
 * ????????????.txt / .epub ???????
 */

import { createSignal, Show } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';
import { addBooksByUrl } from '@/lib/bookshelf/add-books-by-url';
import { bookshelfStore } from '@/stores/bookshelf';
import { cn } from '@/lib/utils';

export interface AddBookByUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddBookByUrlDialog(props: AddBookByUrlDialogProps) {
  const [url, setUrl] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);
  const [progress, setProgress] = createSignal<{ current: number; total: number } | null>(null);

  const handleImport = async () => {
    const urlValue = url().trim();
    if (!urlValue) {
      return;
    }

    setIsImporting(true);
    setProgress(null);
    try {
      const groupId = bookshelfStore.state.currentGroup;
      const assignGroup = groupId >= 0 ? groupId : undefined;

      const result = await addBooksByUrl(urlValue, {
        groupId: assignGroup,
        onProgress: (p) => setProgress(p),
      });

      const { success, failed, skipped, errors } = result;

      if (success > 0) {
        showAppToast({
          title: failed > 0 ? '??????' : '????',
          description:
            failed > 0
              ? `?? ${success} ??????? ${skipped} ????? ${failed} ?`
              : skipped > 0 && success === skipped
                ? `${success} ?????`
                : `??? ${success - skipped} ?${skipped > 0 ? `?${skipped} ?????` : ''}`,
          variant: failed > 0 ? 'default' : 'success',
        });
        setUrl('');
        props.onOpenChange(false);
        window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
      } else {
        const detail =
          errors[0] ??
          (failed > 0 ? '??????' : '?????????? URL ????');
        showAppToast({
          title: '????',
          description: detail,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AddBookByUrl] ????:', error);
      showAppToast({
        title: '????',
        description: error instanceof Error ? error.message : '????',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
      }
    } catch {
      showAppToast({
        title: '???????',
        description: '????? URL',
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isImporting()) return;
      setUrl('');
      setProgress(null);
    }
    props.onOpenChange(open);
  };

  const progressLabel = () => {
    const p = progress();
    if (!p) return null;
    return `???? (${p.current}/${p.total})`;
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange} modal={true}>
      <AppDialogContent class={cn(isImporting() && 'dialog-importing')}>
        <AppDialogHeader>
          <AppDialogTitle>??????</AppDialogTitle>
          <AppDialogDescription>
            ???????????????????????????? .txt / .epub
            ?????????? URL???????
            <code class="mx-0.5 rounded bg-muted px-1 text-xs">, {'{'}&quot;origin&quot;:&quot;??URL&quot;{'}'}</code>
            ?????
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY2}>
          <div class="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 px-2"
              disabled={isImporting()}
              onClick={() => void handlePaste()}
            >
              ??????
            </Button>
          </div>
          <TextField>
            <TextFieldTextArea
              placeholder={'https://example.com/book/123\nhttps://cdn.example.com/book.epub'}
              value={url()}
              onInput={(e: Event) => setUrl((e.currentTarget as HTMLTextAreaElement).value)}
              rows={6}
              disabled={isImporting()}
              class="resize-none font-mono text-sm"
            />
          </TextField>
          <Show when={progressLabel()}>
            <p class="text-xs text-muted-foreground">{progressLabel()}</p>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setUrl('');
              props.onOpenChange(false);
            }}
            disabled={isImporting()}
          >
            ??
          </Button>
          <Button onClick={() => void handleImport()} disabled={!url().trim() || isImporting()}>
            {isImporting() ? progressLabel() ?? '????' : '??'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
