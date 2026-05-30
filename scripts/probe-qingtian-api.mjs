/**
 * 本地诊断：聚合 /catalog + /content（需 QT_EMAIL / QT_PASSWORD）
 */
function utf8FromBase64(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}
function resolveItemId(itemId) {
  const trimmed = String(itemId ?? '').trim();
  if (!trimmed.startsWith('eyJ')) return trimmed;
  try {
    const inner = utf8FromBase64(trimmed);
    if (!inner.trimStart().startsWith('{')) return trimmed;
    const parsed = JSON.parse(inner);
    let comicId = '';
    for (const key of ['baseUrl', 'bookurl', 'url', 'tocUrl']) {
      const m = String(parsed[key] ?? '').match(/comic_id=(\d+)/);
      if (m?.[1]) {
        comicId = m[1];
        break;
      }
    }
    if (!comicId || !/comic_id=&|comic_id=\u0026/.test(inner)) return inner;
    return inner
      .replace(/comic_id=&/g, `comic_id=${comicId}&`)
      .replace(/comic_id=\u0026/g, `comic_id=${comicId}\u0026`);
  } catch {
    return trimmed;
  }
}

const EMAIL = process.env.QT_EMAIL ?? '';
const PASSWORD = process.env.QT_PASSWORD ?? '';
if (!EMAIL || !PASSWORD) {
  console.error('Set QT_EMAIL and QT_PASSWORD');
  process.exit(1);
}

const book_id =
  'eyJuYW1lIjoi55yf5a6e5ri45oiPIiwidCI6InNlYXJjaCIsInVybCI6Imh0dHBzOi8vYXBpLWNkbi5rYWltYW5odWEuY29tL2NvbWljLWFwaS92Mi9jb21pYy9nZXRjb21pY2RhdGE_Y29taWNfaWQ9MTA2NjYzXHUwMDI2Y2xpZW50LXR5cGU9YW5kcm9pZFx1MDAyNnByb2R1Y3RuYW1lPXFtbWhcdTAwMjZjbGllbnQtY2hhbm5lbD14aWFvbWlcdTAwMjZwbGF0Zm9ybW5hbWU9YW5kcm9pZFx1MDAyNmNsaWVudC12ZXJzaW9nPTEuNC44LHtcIm1ldGhvZFwiOlwiR0VUXCIsXCJoZWFkZXJzXCI6e1wiVXNlci1BZ2VudFwiOlwib2todHRwLzQuOS4xXCIsXCJtLXJlcXVlc3QtaWRcIjpcIjBkMjgxMTJiYTZjOGE4YWM1MGI4ZWE3NTI5ZTQzYzU1XCJ9fSIsInZhcmlhYmxlIjoiIn0';

const login = await fetch('https://v1.gyks.cf/login_api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ register_email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const cookie = `qttoken=${login.key}; deviceId=${process.env.QT_DEVICE || 'reader_probe_device'};`;

const catalog = await fetch(
  `https://v1.gyks.cf/catalog?book_id=${encodeURIComponent(book_id)}&source=${encodeURIComponent('全面漫画')}&tab=${encodeURIComponent('漫画')}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      html: '',
      variable: '{"custom":""}',
      tone_id: '4',
      version: '4.11.5.1',
    }),
  },
).then((r) => r.json());

if (!catalog.data?.[0]?.item_id) {
  console.log('catalog empty', catalog);
  process.exit(1);
}

const rawItemId = catalog.data[0].item_id;
const resolvedItemId = resolveItemId(rawItemId);
console.log('item_id', { rawLen: rawItemId.length, resolvedLen: resolvedItemId.length, resolvedStartsWithBrace: resolvedItemId.startsWith('{') });

const content = await fetch('https://v1.gyks.cf/content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({
    html: '',
    item_id: resolvedItemId,
    source: '全面漫画',
    tab: '漫画',
    tone_id: '4',
    variable: '{"custom":""}',
    version: '4.11.5.1',
  }),
}).then((r) => r.text());

console.log('content', content.slice(0, 600));
