import { createSignal, For, ParentProps, Show } from 'solid-js';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useMediaQuery } from '@/lib/use-media-query';

interface LayoutProps extends ParentProps {
  title?: string;
}

const NAV = [
  { href: '#/', label: '首页' },
  { href: '#/bookshelf', label: '书架' },
  { href: '#/sources', label: '书源' },
  { href: '#/upload', label: '传书' },
  { href: '#/rss', label: '订阅' },
  { href: '#/replace', label: '替换' },
  { href: '#/help', label: '帮助' },
  { href: '#/backup', label: '备份' },
  { href: '#/auth', label: '认证' },
];

export function Layout(props: LayoutProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [navOpen, setNavOpen] = createSignal(false);

  const closeNav = () => setNavOpen(false);

  return (
    <div class="web-layout min-h-screen bg-background text-foreground">
      <header class="web-layout-header sticky top-0 z-30 border-b border-border backdrop-blur">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <Show when={isMobile()}>
              <Show
                when={navOpen()}
                fallback={
                  <button
                    type="button"
                    class="web-nav-toggle rounded-lg border border-border px-2.5 py-1.5 text-sm"
                    aria-label="打开导航菜单"
                    aria-expanded="false"
                    aria-controls="web-mobile-nav"
                    onClick={() => setNavOpen(true)}
                  >
                    ☰
                  </button>
                }
              >
                <button
                  type="button"
                  class="web-nav-toggle rounded-lg border border-border px-2.5 py-1.5 text-sm"
                  aria-label="关闭导航菜单"
                  aria-expanded="true"
                  aria-controls="web-mobile-nav"
                  onClick={() => setNavOpen(false)}
                >
                  ☰
                </button>
              </Show>
            </Show>
            <a href="#/" class="truncate text-lg font-semibold tracking-tight" onClick={closeNav}>
              Reader Web
            </a>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Show when={!isMobile()}>
              <nav class="flex flex-wrap justify-end gap-1 text-sm">
                <For each={NAV}>
                  {(item) => (
                    <a href={item.href} class="rounded-lg px-2.5 py-1.5 hover:bg-accent">
                      {item.label}
                    </a>
                  )}
                </For>
              </nav>
            </Show>
          </div>
        </div>
        <Show when={isMobile() && navOpen()}>
          <nav id="web-mobile-nav" class="web-mobile-nav border-t border-border px-2 py-2">
            <For each={NAV}>
              {(item) => (
                <a
                  href={item.href}
                  class="block rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
                  onClick={closeNav}
                >
                  {item.label}
                </a>
              )}
            </For>
          </nav>
        </Show>
      </header>
      <main class="web-layout-main mx-auto max-w-6xl px-4 py-4 sm:py-6">
        <Show when={props.title}>
          <h1 class="mb-4 text-xl font-semibold sm:text-2xl">{props.title}</h1>
        </Show>
        {props.children}
      </main>
    </div>
  );
}

export function Card(props: ParentProps & { class?: string }) {
  return (
    <div
      class={`rounded-xl border border-border bg-card p-4 shadow-sm ${props.class ?? ''}`}
    >
      {props.children}
    </div>
  );
}

type ButtonProps = ParentProps & {
  href?: string;
  onClick?: () => void;
  class?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
};

const BTN_VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-muted text-foreground hover:opacity-90',
  danger: 'bg-red-600 text-white hover:opacity-90',
  ghost: 'border border-border bg-transparent hover:bg-accent',
};

export function Button(props: ButtonProps) {
  const variant = () => BTN_VARIANTS[props.variant ?? 'primary'];
  const cls = () =>
    `inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${variant()} ${props.class ?? ''}`;
  if (props.href) {
    return (
      <a href={props.href} class={cls()}>
        {props.children}
      </a>
    );
  }
  return (
    <button type="button" class={cls()} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

export function ErrorBox(props: { message: string }) {
  return (
    <div class="mb-4 rounded-lg border px-4 py-3 text-sm web-alert-danger">
      {props.message}
    </div>
  );
}

export function Loading() {
  return <p class="text-sm text-muted-foreground">加载中…</p>;
}

export function Input(props: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  class?: string;
  type?: string;
  onKeyDown?: (e: KeyboardEvent) => void;
}) {
  return (
    <input
      type={props.type ?? 'text'}
      class={`w-full min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary sm:text-sm ${props.class ?? ''}`}
      value={props.value}
      placeholder={props.placeholder}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      onKeyDown={props.onKeyDown}
    />
  );
}

export function TextArea(props: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  class?: string;
  rows?: number;
}) {
  return (
    <textarea
      class={`w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-base outline-none focus:border-primary sm:text-sm ${props.class ?? ''}`}
      value={props.value}
      placeholder={props.placeholder}
      rows={props.rows ?? 4}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}

export function Label(props: ParentProps & { hint?: string }) {
  return (
    <label class="block space-y-1">
      <span class="text-sm font-medium">{props.children}</span>
      <Show when={props.hint}>
        <p class="text-xs text-muted-foreground">{props.hint}</p>
      </Show>
    </label>
  );
}
