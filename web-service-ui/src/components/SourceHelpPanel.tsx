import { For } from 'solid-js';

const BOOK_LINKS = [
  { href: '#/help?doc=appHelp', label: 'APP 帮助文档' },
  { href: '#/help?doc=ruleHelp', label: '书源制作教程' },
  { href: '#/help?doc=debugHelp', label: '书源调试说明' },
  { href: '#/help?doc=jsHelp', label: 'JavaScript 说明' },
  { href: '#/help?doc=xpathHelp', label: 'XPath 语法' },
  { href: '#/help?doc=regexHelp', label: '正则表达式' },
  { href: '#/help?doc=txtTocRuleHelp', label: 'txt 目录正则说明' },
  { href: '#/help?doc=httpTTSHelp', label: '在线朗读规则' },
  { href: '#/help?doc=webDavBookHelp', label: 'WebDav 书籍教程' },
  { href: '#/help?doc=webDavHelp', label: 'WebDav 备份教程' },
  { href: '#/help?doc=书源字段规则类型', label: '书源字段规则类型' },
  { href: 'https://regexr-cn.com/', label: '正则在线验证', external: true },
];

const RSS_LINKS = [
  { href: '#/help?doc=rssRuleHelp', label: '订阅源规则' },
  { href: '#/help?doc=订阅源机制详解', label: '订阅源机制详解' },
  { href: '#/help?doc=订阅源字段规则类型', label: '订阅源字段规则类型' },
  { href: '#/help?doc=debugHelp', label: '调试说明' },
  { href: '#/help?doc=jsHelp', label: 'JavaScript 说明' },
  { href: '#/help?doc=regexHelp', label: '正则表达式' },
  { href: 'https://regexr-cn.com/', label: '正则在线验证', external: true },
];

interface SourceHelpPanelProps {
  kind: 'book' | 'rss';
}

export function SourceHelpPanel(props: SourceHelpPanelProps) {
  const links = () => (props.kind === 'book' ? BOOK_LINKS : RSS_LINKS);
  return (
    <div class="space-y-2 text-sm">
      <p class="text-muted-foreground">编写规则时可参考以下文档：</p>
      <ul class="space-y-1">
        <For each={links()}>
          {(item) => (
            <li>
              <a
                href={item.href}
                class="text-primary hover:underline"
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
              >
                {item.label}
              </a>
            </li>
          )}
        </For>
      </ul>
      <div class="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p><code>^$()[]{}.?+*|</code> 正则特殊符号需转义</p>
        <p><code>(?s)</code> 跨行 · <code>(?m)</code> 逐行 · <code>(?i)</code> 忽略大小写</p>
      </div>
    </div>
  );
}
