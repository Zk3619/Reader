import { createSignal, For, onMount, Show } from 'solid-js';
import { Layout, Card, Button } from '@/components/Layout';
import { ApiConnectionPanel } from '@/components/ApiConnectionPanel';
import { loadRecentReading, recentReadingHref } from '@/lib/recent-reading';

const links = [
  { href: '#/bookshelf', title: '书架', desc: '浏览本机书架，搜索、继续阅读' },
  { href: '#/sources', title: '书源', desc: '写源、WebSocket 调试、导入导出' },
  { href: '#/upload', title: 'WiFi 传书', desc: '拖拽上传 txt/epub 到书架' },
  { href: '#/rss', title: '订阅源', desc: '管理订阅源、阅读文章、收藏与记录' },
  { href: '#/replace', title: '替换规则', desc: '编辑与测试正文替换净化规则' },
  { href: '#/help', title: '帮助文档', desc: '书源规则、调试、JS 等说明' },
  { href: '#/backup', title: '备份', desc: '下载 Reader 数据备份包' },
  { href: '#/auth', title: 'Web 认证', desc: '填写 Token 以访问受保护的 Web 服务' },
  { href: '/api', title: 'API 说明', desc: 'Legado 兼容 REST 接口文档（JSON）', external: true },
];

export function HomePage() {
  const [recent, setRecent] = createSignal(loadRecentReading());

  onMount(() => {
    setRecent(loadRecentReading());
  });

  return (
    <Layout>
      <section class="mb-8 space-y-2 text-center">
        <h1 class="text-3xl font-bold tracking-tight">Reader Web 服务</h1>
        <p class="text-muted-foreground">昨日邻家乞新火，晓窗分与读书灯</p>
      </section>

      <Show when={recent()}>
        {(r) => (
          <Card class="mb-6 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5">
            <div class="min-w-0">
              <p class="text-sm text-muted-foreground">最近阅读</p>
              <p class="truncate font-medium">{r().name}</p>
              <Show when={r().chapterTitle}>
                <p class="truncate text-xs text-muted-foreground">读到：{r().chapterTitle}</p>
              </Show>
            </div>
            <Button href={recentReadingHref(r())}>继续阅读</Button>
          </Card>
        )}
      </Show>

      <Card class="mb-6">
        <ApiConnectionPanel />
      </Card>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={links}>
          {(item) => (
            <Card>
              <h2 class="mb-1 text-lg font-semibold">{item.title}</h2>
              <p class="mb-4 text-sm text-muted-foreground">{item.desc}</p>
              <Button href={item.href} class="w-full sm:w-auto">
                {item.external ? '打开' : '进入'}
              </Button>
            </Card>
          )}
        </For>
      </div>
    </Layout>
  );
}
