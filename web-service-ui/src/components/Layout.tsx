import { ParentProps } from 'solid-js';

interface LayoutProps extends ParentProps {
  title?: string;
}

export function Layout(props: LayoutProps) {
  return (
    <div class="min-h-screen bg-background text-foreground">
      <header class="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <a href="#/" class="text-lg font-semibold tracking-tight">
            Reader Web
          </a>
          <nav class="flex flex-wrap gap-2 text-sm">
            <a href="#/bookshelf" class="rounded-lg px-3 py-1.5 hover:bg-accent">
              书架
            </a>
            <a href="#/sources" class="rounded-lg px-3 py-1.5 hover:bg-accent">
              书源
            </a>
            <a href="#/backup" class="rounded-lg px-3 py-1.5 hover:bg-accent">
              备份
            </a>
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-4 py-6">
        {props.title ? <h1 class="mb-4 text-2xl font-semibold">{props.title}</h1> : null}
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

export function Button(props: ParentProps & { href?: string; onClick?: () => void; class?: string }) {
  const cls = `inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 ${props.class ?? ''}`;
  if (props.href) {
    return (
      <a href={props.href} class={cls}>
        {props.children}
      </a>
    );
  }
  return (
    <button type="button" class={cls} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function ErrorBox(props: { message: string }) {
  return (
    <div class="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      {props.message}
    </div>
  );
}

export function Loading() {
  return <p class="text-sm text-muted-foreground">加载中…</p>;
}
