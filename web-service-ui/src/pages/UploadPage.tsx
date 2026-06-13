import { createSignal, For, Show } from 'solid-js';
import { Layout, Card, Button, ErrorBox } from '@/components/Layout';
import { uploadLocalBook } from '@/lib/api';

type UploadItem = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  message?: string;
};

export function UploadPage() {
  const [items, setItems] = createSignal<UploadItem[]>([]);
  const [dragOver, setDragOver] = createSignal(false);

  function enqueueFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.(txt|epub)$/i.test(f.name));
    if (list.length === 0) {
      alert('仅支持 .txt 与 .epub 文件');
      return;
    }
    const next = list.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}`,
      file,
      status: 'pending' as const,
    }));
    setItems((prev) => [...prev, ...next]);
    void processQueue();
  }

  async function processQueue() {
    const pending = items().find((i) => i.status === 'pending');
    if (!pending) return;
    if (items().some((i) => i.status === 'uploading')) return;

    setItems((prev) =>
      prev.map((i) => (i.id === pending.id ? { ...i, status: 'uploading' } : i)),
    );
    try {
      await uploadLocalBook(pending.file);
      setItems((prev) =>
        prev.map((i) => (i.id === pending.id ? { ...i, status: 'done' } : i)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) =>
        prev.map((i) =>
          i.id === pending.id ? { ...i, status: 'error', message: msg } : i,
        ),
      );
    }
    void processQueue();
  }

  return (
    <Layout title="WiFi 传书">
      <Card class="mb-4 space-y-2 text-sm text-muted-foreground">
        <p>将图书拖拽到下方区域，或点击选择文件上传至 Reader 书架（对齐 Legado WiFi 传书）。</p>
        <p>支持格式：.txt、.epub</p>
      </Card>

      <div
        class={`rounded-xl border-2 border-dashed p-10 text-center transition ${dragOver() ? 'border-primary bg-primary/5' : 'border-border'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) enqueueFiles(e.dataTransfer.files);
        }}
      >
        <p class="mb-4 text-muted-foreground">将图书拖拽至此即可上传</p>
        <label class="inline-block cursor-pointer">
          <input
            type="file"
            class="hidden"
            multiple
            accept=".txt,.epub"
            onChange={(e) => {
              if (e.currentTarget.files?.length) enqueueFiles(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <span class="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            选择文件
          </span>
        </label>
      </div>

      <Show when={items().length > 0}>
        <ul class="mt-4 space-y-2">
          <For each={items()}>
            {(item) => (
              <li class="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span class="truncate">{item.file.name}</span>
                <span
                  class={
                    item.status === 'done'
                      ? 'web-text-success'
                      : item.status === 'error'
                        ? 'web-text-danger'
                        : 'text-muted-foreground'
                  }
                >
                  {item.status === 'uploading'
                    ? '上传中…'
                    : item.status === 'done'
                      ? '完成'
                      : item.status === 'error'
                        ? item.message ?? '失败'
                        : '等待'}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <div class="mt-4">
        <Button href="#/bookshelf" variant="ghost">
          查看书架
        </Button>
      </div>
    </Layout>
  );
}
