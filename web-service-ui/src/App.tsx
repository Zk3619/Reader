import { createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { HomePage } from '@/pages/HomePage';
import { BookshelfPage } from '@/pages/BookshelfPage';
import { ReaderPage } from '@/pages/ReaderPage';
import { SourcesPage } from '@/pages/SourcesPage';
import { BackupPage } from '@/pages/BackupPage';

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || '';
  const path = hash.split('?')[0] ?? '';
  return path || 'home';
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());

  onMount(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    onCleanup(() => window.removeEventListener('hashchange', onHash));
  });

  return (
    <Switch>
      <Match when={route() === 'home' || route() === ''}>
        <HomePage />
      </Match>
      <Match when={route() === 'bookshelf'}>
        <BookshelfPage />
      </Match>
      <Match when={route() === 'reader'}>
        <ReaderPage />
      </Match>
      <Match when={route() === 'sources'}>
        <SourcesPage />
      </Match>
      <Match when={route() === 'backup'}>
        <BackupPage />
      </Match>
    </Switch>
  );
}
