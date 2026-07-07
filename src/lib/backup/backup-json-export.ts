/**
 * 备份 ZIP 内 Legado 兼容 JSON 条目收集
 */

import * as bookmarksDb from '@/lib/database/bookmarks';
import * as bookGroupsDb from '@/lib/database/book-groups';
import * as booksDb from '@/lib/database/books';
import * as dictRulesDb from '@/lib/database/dict-rules';
import * as httpTtsDb from '@/lib/database/http-tts';
import * as keyboardAssistsDb from '@/lib/database/keyboard-assists';
import * as readRecordDetailsDb from '@/lib/database/read-record-details';
import * as readRecordsDb from '@/lib/database/read-records';
import * as replaceDb from '@/lib/database/replace-rules';
import * as rssDb from '@/lib/database/rss-sources';
import * as rssStarsDb from '@/lib/database/rss-stars';
import * as searchKeywordsDb from '@/lib/database/search-keywords';
import * as serversDb from '@/lib/database/servers';
import * as sourcesDb from '@/lib/database/sources';
import * as txtTocRulesDb from '@/lib/database/txt-toc-rules';
import type { BackupItemInfo } from '@/lib/database/reader-backup';
import { backupAesEncrypt } from '@/lib/backup/backup-aes';

export interface BackupJsonBundle {
  entries: Record<string, string>;
  items: BackupItemInfo[];
}

export interface CollectBackupJsonOptions {
  selected?: Set<string>;
  backupPassword?: string;
}

function item(
  fileName: string,
  displayName: string,
  description: string,
  data: unknown,
): { entry?: [string, string]; info?: BackupItemInfo } {
  if (Array.isArray(data) ? data.length === 0 : data == null) return {};
  const text = JSON.stringify(data, null, 2);
  return {
    entry: [fileName, text],
    info: {
      fileName,
      displayName,
      description,
      count: Array.isArray(data) ? data.length : 1,
      size: text.length,
    },
  };
}

export async function collectBackupJsonBundle(
  options: CollectBackupJsonOptions = {},
): Promise<BackupJsonBundle> {
  const selected = options.selected;
  const shouldInclude = (fileName: string) => !selected || selected.has(fileName);
  const password = options.backupPassword ?? '';
  const [
    books,
    sources,
    rssSources,
    rules,
    records,
    bookmarks,
    groups,
    searchKeywords,
    txtTocRules,
    dictRules,
    httpTts,
    keyboardAssists,
    rssStars,
    readRecordDetails,
    servers,
  ] = await Promise.all([
    booksDb.getAllBooks(),
    sourcesDb.getAllSources(),
    rssDb.getAllRssSources(),
    replaceDb.getAllReplaceRules(),
    readRecordsDb.getAllReadRecords(),
    bookmarksDb.getAllBookmarks(),
    bookGroupsDb.getAllGroups(),
    searchKeywordsDb.getAllSearchKeywords(),
    txtTocRulesDb.getAllTxtTocRules(),
    dictRulesDb.getAllDictRules(),
    httpTtsDb.getAllHttpTTS(),
    keyboardAssistsDb.getAllKeyboardAssists(),
    rssStarsDb.getAllRssStars(),
    readRecordDetailsDb.getAllReadRecordDetails(),
    serversDb.getAllServers(),
  ]);

  const entries: Record<string, string> = {};
  const items: BackupItemInfo[] = [];

  const push = (result: { entry?: [string, string]; info?: BackupItemInfo }) => {
    if (!result.entry || !shouldInclude(result.entry[0])) return;
    let text = result.entry[1];
    if (result.entry[0] === 'servers.json' && password) {
      text = backupAesEncrypt(text, password);
    }
    entries[result.entry[0]] = text;
    if (result.info) items.push(result.info);
  };

  push(item('bookshelf.json', '书架', '书架书籍列表', books));
  push(item('bookSource.json', '书源', '书源规则', sources));
  push(item('rssSources.json', 'RSS', 'RSS 订阅源', rssSources));
  push(item('replaceRule.json', '替换规则', '替换净化规则', rules));
  push(item('readRecord.json', '阅读记录', '阅读记录汇总', records));
  push(item('bookmark.json', '书签', '阅读书签', bookmarks));
  push(item('bookGroup.json', '书籍分组', '书架分组', groups));
  push(item('searchHistory.json', '搜索历史', '搜索关键词', searchKeywords));
  push(item('txtTocRule.json', 'TXT 目录规则', 'TXT 目录识别规则', txtTocRules));
  push(item('dictRule.json', '词典规则', '词典规则', dictRules));
  push(item('httpTTS.json', 'HTTP TTS', '在线朗读引擎', httpTts));
  push(item('keyboardAssists.json', '键盘辅助', '键盘辅助规则', keyboardAssists));
  push(item('rssStar.json', 'RSS 收藏', 'RSS 收藏文章', rssStars));
  push(item('readRecordDetail.json', '阅读记录详情', '阅读记录明细', readRecordDetails));
  push(item('servers.json', '服务器', 'WebDAV 等服务器配置', servers));

  return { entries, items };
}
