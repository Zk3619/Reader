import { createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { initShellTheme } from '@/lib/shell-theme';
import { HomePage } from '@/pages/HomePage';
import { BookshelfPage } from '@/pages/BookshelfPage';
import { ReaderPage } from '@/pages/ReaderPage';
import { SourcesPage } from '@/pages/SourcesPage';
import { SourceEditPage } from '@/pages/SourceEditPage';
import { RssSourcesPage } from '@/pages/RssSourcesPage';
import { RssSourceEditPage } from '@/pages/RssSourceEditPage';
import { RssArticlesPage } from '@/pages/RssArticlesPage';
import { RssReadPage } from '@/pages/RssReadPage';
import { RssHistoryPage } from '@/pages/RssHistoryPage';
import { RssFavoritesPage } from '@/pages/RssFavoritesPage';
import { ReplaceRulesPage } from '@/pages/ReplaceRulesPage';
import { BackupPage } from '@/pages/BackupPage';
import { UploadPage } from '@/pages/UploadPage';
import { HelpPage } from '@/pages/HelpPage';
import { AuthPage } from '@/pages/AuthPage';

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || '';
  const path = hash.split('?')[0] ?? '';
  return path || 'home';
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());

  onMount(() => {
    initShellTheme();
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
      <Match when={route() === 'sources/edit'}>
        <SourceEditPage />
      </Match>
      <Match when={route() === 'rss'}>
        <RssSourcesPage />
      </Match>
      <Match when={route() === 'rss/edit'}>
        <RssSourceEditPage />
      </Match>
      <Match when={route() === 'rss/articles'}>
        <RssArticlesPage />
      </Match>
      <Match when={route() === 'rss/read'}>
        <RssReadPage />
      </Match>
      <Match when={route() === 'rss/history'}>
        <RssHistoryPage />
      </Match>
      <Match when={route() === 'rss/favorites'}>
        <RssFavoritesPage />
      </Match>
      <Match when={route() === 'replace'}>
        <ReplaceRulesPage />
      </Match>
      <Match when={route() === 'backup'}>
        <BackupPage />
      </Match>
      <Match when={route() === 'upload'}>
        <UploadPage />
      </Match>
      <Match when={route() === 'help'}>
        <HelpPage />
      </Match>
      <Match when={route() === 'auth'}>
        <AuthPage />
      </Match>
    </Switch>
  );
}
