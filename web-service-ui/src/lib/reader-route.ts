export function buildReaderHref(params: {
  bookUrl: string;
  name: string;
  author?: string;
  index?: number;
  pos?: number;
  searchBook?: boolean;
}): string {
  const qs = new URLSearchParams();
  qs.set('url', params.bookUrl);
  qs.set('name', params.name);
  qs.set('author', params.author ?? '');
  qs.set('index', String(params.index ?? 0));
  if (params.pos != null && params.pos > 0) qs.set('pos', String(params.pos));
  if (params.searchBook) qs.set('fromSearch', '1');
  return `#/reader?${qs.toString()}`;
}

export function parseReaderRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, qs = ''] = hash.split('?');
  const params = new URLSearchParams(qs);
  return {
    bookUrl: params.get('url') ?? '',
    index: Number(params.get('index') ?? '0'),
    pos: Number(params.get('pos') ?? '0'),
    name: params.get('name') ?? '',
    author: params.get('author') ?? '',
    fromSearch: params.get('fromSearch') === '1',
  };
}
