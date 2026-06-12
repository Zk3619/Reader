import { For } from 'solid-js';
import { Layout, Card, Button } from '@/components/Layout';

const links = [
  { href: '#/bookshelf', title: '书架', desc: '浏览本机书架，继续阅读' },
  { href: '#/sources', title: '书源', desc: '查看已导入的书源列表' },
  { href: '#/backup', title: '备份', desc: '下载 Reader 数据备份包' },
  { href: '/api', title: 'API 说明', desc: 'Legado 兼容 REST 接口文档（JSON）', external: true },
];

export function HomePage() {
  return (
    <Layout>
      <section class="mb-8 space-y-2 text-center">
        <h1 class="text-3xl font-bold tracking-tight">Reader Web 服务</h1>
        <p class="text-muted-foreground">清风不识字，何故乱翻书</p>
      </section>
      <div class="grid gap-4 sm:grid-cols-2">
        <For each={links}>
          {(item) => (
            <Card>
              <h2 class="mb-1 text-lg font-semibold">{item.title}</h2>
              <p class="mb-4 text-sm text-muted-foreground">{item.desc}</p>
              {item.external ? (
                <Button href={item.href} class="w-full sm:w-auto">
                  打开
                </Button>
              ) : (
                <Button href={item.href} class="w-full sm:w-auto">
                  进入
                </Button>
              )}
            </Card>
          )}
        </For>
      </div>
    </Layout>
  );
}
