/**
 * 从 Legado / MediaBox 备份 ZIP 文本条目导入附加 JSON（无 mediabox.db / reader.db 时使用）
 */

import * as bookmarksDb from '@/lib/database/bookmarks';
import * as bookGroupsDb from '@/lib/database/book-groups';
import * as httpTtsDb from '@/lib/database/http-tts';
import * as keyboardAssistsDb from '@/lib/database/keyboard-assists';
import * as readRecordDetailsDb from '@/lib/database/read-record-details';
import * as rssStarsDb from '@/lib/database/rss-stars';
import * as searchKeywordsDb from '@/lib/database/search-keywords';
import * as serversDb from '@/lib/database/servers';
import * as subSourcesDb from '@/lib/database/sub-sources';
import * as subFeedsDb from '@/lib/database/sub-feeds';
import * as subEntriesDb from '@/lib/database/sub-entries';
import { importDictRulesFromJson } from '@/lib/book-source/import-dict-rule';
import { importTxtTocRulesFromJson } from '@/lib/book-source/import-txt-toc-rule';
import { importSelectedThemes } from '@/lib/theme/import/import-theme-batch';
import { parseThemePackJson } from '@/lib/theme/schema/validate-theme-pack';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { pickZipEntry } from '@/lib/book-source/legado-zip';
import { decryptBackupJsonIfNeeded } from '@/lib/backup/backup-aes';
import { getBackupPassword } from '@/lib/backup/backup-config-storage';
import type {
  BookGroup,
  Bookmark,
  HttpTTS,
  KeyboardAssist,
  RssStar,
  Server,
} from '@/types';
import type { ReadRecordDetail } from '@/types/read-record-detail';

function parseArray(text: string): unknown[] {
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

async function importBookmarksFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const bookmark: Bookmark = {
      time: Number(item.time ?? Date.now()),
      bookName: String(item.bookName ?? ''),
      bookAuthor: String(item.bookAuthor ?? ''),
      chapterIndex: Number(item.chapterIndex ?? 0),
      chapterPos: Number(item.chapterPos ?? 0),
      chapterName: String(item.chapterName ?? ''),
      bookText: String(item.bookText ?? ''),
      content: String(item.content ?? ''),
    };
    if (!bookmark.bookName) continue;
    await bookmarksDb.insertBookmark(bookmark);
    count += 1;
  }
  return count;
}

async function importBookGroupsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const group: BookGroup = {
      groupId: Number(item.groupId ?? item.id ?? 0),
      groupName: String(item.groupName ?? item.name ?? ''),
      cover: item.cover != null ? String(item.cover) : undefined,
      order: Number(item.order ?? 0),
      enableRefresh: item.enableRefresh !== false,
      show: item.show !== false,
      bookSort: Number(item.bookSort ?? -1),
      onlyUpdateRead: item.onlyUpdateRead === true,
    };
    if (!group.groupName && group.groupId < 0) continue;
    const existing = await bookGroupsDb.getGroupById(group.groupId);
    if (existing) await bookGroupsDb.updateGroup(group);
    else await bookGroupsDb.insertGroup(group);
    count += 1;
  }
  return count;
}

async function importSearchHistoryFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const word = String((row as Record<string, unknown>).word ?? row ?? '').trim();
    if (!word) continue;
    await searchKeywordsDb.upsertSearchKeyword(word);
    count += 1;
  }
  return count;
}

async function importHttpTtsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const tts: HttpTTS = {
      id: Number(item.id ?? 0),
      name: String(item.name ?? ''),
      url: String(item.url ?? ''),
      contentType: item.contentType != null ? String(item.contentType) : undefined,
      concurrentRate: item.concurrentRate != null ? String(item.concurrentRate) : undefined,
      loginUrl: item.loginUrl != null ? String(item.loginUrl) : undefined,
      loginUi: item.loginUi != null ? String(item.loginUi) : undefined,
      header: item.header != null ? String(item.header) : undefined,
      jsLib: item.jsLib != null ? String(item.jsLib) : undefined,
      enabledCookieJar: item.enabledCookieJar === true,
      loginCheckJs: item.loginCheckJs != null ? String(item.loginCheckJs) : undefined,
      lastUpdateTime: Number(item.lastUpdateTime ?? Date.now()),
    };
    if (!tts.name || !tts.url) continue;
    await httpTtsDb.upsertHttpTTS(tts);
    count += 1;
  }
  return count;
}

async function importKeyboardAssistsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const assist: KeyboardAssist = {
      type: Number(item.type ?? 0),
      key: String(item.key ?? ''),
      value: String(item.value ?? ''),
      serialNo: Number(item.serialNo ?? 0),
    };
    if (!assist.key) continue;
    await keyboardAssistsDb.upsertKeyboardAssist(assist);
    count += 1;
  }
  return count;
}

async function importRssStarsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const star: RssStar = {
      origin: String(item.origin ?? ''),
      link: String(item.link ?? ''),
      sort: String(item.sort ?? ''),
      title: String(item.title ?? ''),
      starTime: Number(item.starTime ?? Date.now()),
      pubDate: item.pubDate != null ? String(item.pubDate) : undefined,
      description: item.description != null ? String(item.description) : undefined,
      content: item.content != null ? String(item.content) : undefined,
      image: item.image != null ? String(item.image) : undefined,
      group: String(item.group ?? ''),
      type: Number(item.type ?? 0),
      durPos: Number(item.durPos ?? 0),
    };
    if (!star.origin || !star.link) continue;
    await rssStarsDb.insertRssStar(star);
    count += 1;
  }
  return count;
}

async function importReadRecordDetailsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const detail: ReadRecordDetail = {
      deviceId: String(item.deviceId ?? 'web'),
      bookName: String(item.bookName ?? ''),
      bookAuthor: String(item.bookAuthor ?? ''),
      date: String(item.date ?? new Date().toISOString().slice(0, 10)),
      readTime: Number(item.readTime ?? 0),
      readWords: Number(item.readWords ?? 0),
      firstReadTime: Number(item.firstReadTime ?? Date.now()),
      lastReadTime: Number(item.lastReadTime ?? Date.now()),
    };
    if (!detail.bookName) continue;
    await readRecordDetailsDb.upsertReadRecordDetail(detail);
    count += 1;
  }
  return count;
}

async function importServersFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const server: Server = {
      id: Number(item.id ?? 0),
      name: String(item.name ?? ''),
      type: String(item.type ?? ''),
      config: item.config != null ? String(item.config) : undefined,
      sortNumber: Number(item.sortNumber ?? 0),
    };
    if (!server.name) continue;
    await serversDb.upsertServer(server);
    count += 1;
  }
  return count;
}

async function importThemePresetsFromJson(text: string): Promise<number> {
  const parsed = JSON.parse(text) as unknown;
  const rawList = Array.isArray(parsed) ? parsed : [parsed];
  const packs: ReaderThemePackV1[] = [];
  for (const item of rawList) {
    const result = parseThemePackJson(item);
    if (result.ok && result.pack) packs.push(result.pack);
  }
  if (packs.length === 0) return 0;
  const result = await importSelectedThemes(packs, { kind: 'imported' });
  return result.inserted;
}

async function importSubSourcesFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const url = String(item.url ?? '').trim();
    if (!id || !url) continue;
    await subSourcesDb.upsertSubSource({
      id,
      url,
      title: String(item.title ?? url),
      type: (String(item.type ?? 'rss') as 'opml' | 'rss' | 'atom' | 'json'),
      category: String(item.category ?? ''),
      sortOrder:
        item.sortOrder == null && item.sort_order == null
          ? undefined
          : Number(item.sortOrder ?? item.sort_order ?? 0),
      view: Number(item.view ?? 0),
      enabled: item.enabled !== false,
      lastFetchAt: item.lastFetchAt == null ? null : Number(item.lastFetchAt),
      metaJson: String(item.metaJson ?? '{}'),
      createdAt: Number(item.createdAt ?? Date.now()),
      updatedAt: Number(item.updatedAt ?? Date.now()),
    });
    count += 1;
  }
  return count;
}

async function importSubFeedsFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const feedUrl = String(item.feedUrl ?? '').trim();
    if (!id || !feedUrl) continue;
    await subFeedsDb.upsertSubFeed({
      id,
      sourceId: item.sourceId == null ? null : String(item.sourceId),
      feedUrl,
      title: String(item.title ?? feedUrl),
      siteUrl: item.siteUrl == null ? null : String(item.siteUrl),
      description: item.description == null ? null : String(item.description),
      metaJson: String(item.metaJson ?? '{}'),
      createdAt: Number(item.createdAt ?? Date.now()),
      updatedAt: Number(item.updatedAt ?? Date.now()),
    });
    count += 1;
  }
  return count;
}

async function importSubEntriesFromJson(text: string): Promise<number> {
  let count = 0;
  for (const row of parseArray(text)) {
    const item = row as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const feedId = String(item.feedId ?? '').trim();
    if (!id || !feedId) continue;
    await subEntriesDb.upsertSubEntry({
      id,
      feedId,
      title: String(item.title ?? ''),
      url: item.url == null ? null : String(item.url),
      author: item.author == null ? null : String(item.author),
      publishedAt: item.publishedAt == null ? null : Number(item.publishedAt),
      read: item.read === true,
      starred: item.starred === true,
      content: item.content == null ? null : String(item.content),
      metaJson: String(item.metaJson ?? '{}'),
      createdAt: Number(item.createdAt ?? Date.now()),
    });
    count += 1;
  }
  return count;
}

export async function importExtraBackupJsonEntries(
  text: Record<string, string>,
  selected?: Set<string>,
): Promise<string[]> {
  const summary: string[] = [];
  const include = (fileName: string) => !selected || selected.has(fileName);

  const bookmarkJson = include('bookmark.json') ? pickZipEntry(text, ['bookmark.json']) : null;
  if (bookmarkJson) {
    const n = await importBookmarksFromJson(bookmarkJson);
    if (n > 0) summary.push(`书签 ${n} 条`);
  }

  const groupJson = include('bookGroup.json')
    ? pickZipEntry(text, ['bookgroup.json', 'book_group.json'])
    : null;
  if (groupJson) {
    const n = await importBookGroupsFromJson(groupJson);
    if (n > 0) summary.push(`书籍分组 ${n} 组`);
  }

  const searchJson = include('searchHistory.json')
    ? pickZipEntry(text, ['searchhistory.json', 'search_history.json'])
    : null;
  if (searchJson) {
    const n = await importSearchHistoryFromJson(searchJson);
    if (n > 0) summary.push(`搜索历史 ${n} 条`);
  }

  const txtTocJson = include('txtTocRule.json')
    ? pickZipEntry(text, ['txttocrule.json', 'txt_toc_rule.json'])
    : null;
  if (txtTocJson) {
    const n = await importTxtTocRulesFromJson(txtTocJson);
    if (n > 0) summary.push(`TXT 目录规则 ${n} 条`);
  }

  const dictJson = include('dictRule.json')
    ? pickZipEntry(text, ['dictrule.json', 'dict_rule.json'])
    : null;
  if (dictJson) {
    const n = await importDictRulesFromJson(dictJson);
    if (n > 0) summary.push(`词典规则 ${n} 条`);
  }

  const httpTtsJson = include('httpTTS.json')
    ? pickZipEntry(text, ['httptts.json', 'http_tts.json'])
    : null;
  if (httpTtsJson) {
    const n = await importHttpTtsFromJson(httpTtsJson);
    if (n > 0) summary.push(`HTTP TTS ${n} 条`);
  }

  const keyboardJson = include('keyboardAssists.json')
    ? pickZipEntry(text, ['keyboardassists.json', 'keyboard_assists.json'])
    : null;
  if (keyboardJson) {
    const n = await importKeyboardAssistsFromJson(keyboardJson);
    if (n > 0) summary.push(`键盘辅助 ${n} 条`);
  }

  const rssStarJson = include('rssStar.json')
    ? pickZipEntry(text, ['rssstar.json', 'rss_star.json'])
    : null;
  if (rssStarJson) {
    const n = await importRssStarsFromJson(rssStarJson);
    if (n > 0) summary.push(`RSS 收藏 ${n} 条`);
  }

  const recordDetailJson = include('readRecordDetail.json')
    ? pickZipEntry(text, ['readrecorddetail.json', 'read_record_detail.json'])
    : null;
  if (recordDetailJson) {
    const n = await importReadRecordDetailsFromJson(recordDetailJson);
    if (n > 0) summary.push(`阅读记录详情 ${n} 条`);
  }

  const serversJson = include('servers.json') ? pickZipEntry(text, ['servers.json']) : null;
  if (serversJson) {
    const password = await getBackupPassword();
    const decrypted = decryptBackupJsonIfNeeded(serversJson, password);
    const n = await importServersFromJson(decrypted);
    if (n > 0) summary.push(`服务器配置 ${n} 条`);
  }

  const themePresetsJson = include('themePresets.json')
    ? pickZipEntry(text, ['themepresets.json', 'theme_presets.json', 'themePresets.json'])
    : null;
  if (themePresetsJson) {
    const n = await importThemePresetsFromJson(themePresetsJson);
    if (n > 0) summary.push(`主题预设 ${n} 个`);
  }

  const subSourcesJson = include('subSources.json')
    ? pickZipEntry(text, ['subsources.json', 'sub_sources.json'])
    : null;
  if (subSourcesJson) {
    const n = await importSubSourcesFromJson(subSourcesJson);
    if (n > 0) summary.push(`新订阅源 ${n} 条`);
  }

  const subFeedsJson = include('subFeeds.json')
    ? pickZipEntry(text, ['subfeeds.json', 'sub_feeds.json'])
    : null;
  if (subFeedsJson) {
    const n = await importSubFeedsFromJson(subFeedsJson);
    if (n > 0) summary.push(`新订阅 Feed ${n} 条`);
  }

  const subEntriesJson = include('subEntries.json')
    ? pickZipEntry(text, ['subentries.json', 'sub_entries.json'])
    : null;
  if (subEntriesJson) {
    const n = await importSubEntriesFromJson(subEntriesJson);
    if (n > 0) summary.push(`新订阅条目 ${n} 条`);
  }

  return summary;
}
