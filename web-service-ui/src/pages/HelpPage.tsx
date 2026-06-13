import { createResource, createSignal, For, Show, onMount } from 'solid-js';
import { Layout, Card, Button } from '@/components/Layout';

function parseHelpRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const doc = new URLSearchParams(qs).get('doc');
  return doc ?? '';
}

const HELP_DOCS: { id: string; title: string }[] = [
  { id: 'ruleHelp', title: '书源规则说明' },
  { id: 'debugHelp', title: '书源调试说明' },
  { id: 'bookSourceFieldRuleTypes', title: '书源字段规则类型' },
  { id: 'bookSourceLoginBackup', title: '书源登录与变量备份' },
  { id: 'jsHelp', title: 'JavaScript 说明' },
  { id: 'jsVariableHelp', title: 'JavaScript 变量' },
  { id: 'jsPackagesHelp', title: 'JavaScript 库' },
  { id: 'preloadJsHelp', title: '预注入 JS 机制' },
  { id: 'regexHelp', title: '正则表达式' },
  { id: 'xpathHelp', title: 'XPath 语法' },
  { id: 'replaceRuleHelp', title: '替换规则' },
  { id: 'replaceRuleFlowHelp', title: '替换规则流程与机制' },
  { id: 'rssRuleHelp', title: '订阅源规则' },
  { id: 'rssFieldRuleTypes', title: '订阅源字段规则类型' },
  { id: 'rssMechanismHelp', title: '订阅源机制详解' },
  { id: 'SourceMBookHelp', title: '书源 MBook 格式' },
  { id: 'SourceMRssHelp', title: '订阅源 MBook 格式' },
  { id: 'txtTocRuleHelp', title: 'TXT 目录规则' },
  { id: 'dictRuleHelp', title: '词典规则' },
  { id: 'readMenuHelp', title: '阅读菜单' },
  { id: 'imageLoadMechanism', title: '图片加载机制' },
  { id: 'inAppBrowserDownload', title: '内置浏览器下载机制' },
  { id: 'pullRefreshFlow', title: '下拉刷新流程与机制' },
  { id: 'networkRequestMechanism', title: '网络请求机制' },
  { id: 'networkRequestIssues', title: '网络请求问题分析' },
  { id: 'cacheExportBackup', title: '缓存与导出备份' },
  { id: 'errorHandlingMechanism', title: '错误处理机制' },
  { id: 'debugLogImprovementPlan', title: '调试日志系统规划' },
  { id: 'webDavHelp', title: 'WebDav 备份' },
  { id: 'webDavBookHelp', title: 'WebDav 书籍' },
  { id: 'httpTTSHelp', title: 'HTTP TTS' },
  { id: 'ExtensionContentType', title: '扩展 Content-Type' },
  { id: 'androidVersionRequirements', title: '安卓版本要求' },
  { id: 'appHelp', title: '应用帮助' },
  { id: 'updateLog', title: '更新日志' },
];

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/^(?:- .+$\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  html = html.replace(/\n\n/g, '</p><p>');
  return `<div class="help-md"><p>${html}</p></div>`;
}

export function HelpPage() {
  const initialDoc = parseHelpRoute();
  const [active, setActive] = createSignal(
    HELP_DOCS.some((d) => d.id === initialDoc) ? initialDoc : HELP_DOCS[0].id,
  );
  const [search, setSearch] = createSignal('');

  onMount(() => {
    const doc = parseHelpRoute();
    if (doc && HELP_DOCS.some((d) => d.id === doc)) setActive(doc);
  });

  const filteredDocs = () => {
    const q = search().trim().toLowerCase();
    if (!q) return HELP_DOCS;
    return HELP_DOCS.filter((d) => d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  };

  const [content, { refetch }] = createResource(active, async (id) => {
    const res = await fetch(`help/md/${encodeURIComponent(id)}.md`);
    if (!res.ok) throw new Error('文档加载失败');
    return res.text();
  });

  return (
    <Layout title="帮助文档">
      <div class="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card class="h-fit max-h-[80vh] overflow-y-auto p-2">
          <input
            type="search"
            class="mb-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="搜索文档…"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <ul class="space-y-0.5 text-sm">
            <For each={filteredDocs()}>
              {(doc) => (
                <li>
                  <button
                    type="button"
                    class={`w-full rounded-md px-2 py-1.5 text-left hover:bg-accent ${active() === doc.id ? 'bg-accent font-medium' : ''}`}
                    onClick={() => setActive(doc.id)}
                  >
                    {doc.title}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Card>
        <Card>
          <Show when={content.error}>
            <p class="text-sm web-text-danger">{(content.error as Error).message}</p>
            <Button class="mt-2" variant="secondary" onClick={() => refetch()}>
              重试
            </Button>
          </Show>
          <Show when={!content.loading && !content.error} fallback={<p class="text-muted-foreground">加载中…</p>}>
            <article
              class="prose prose-sm web-prose"
              innerHTML={renderMarkdown(content() ?? '')}
            />
          </Show>
        </Card>
      </div>
    </Layout>
  );
}
