import { describe, expect, it, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '@/lib/platform/database';
import { migrateMediaboxV105 } from '@/lib/database/migration-v105-mediabox';
import { MediaGroupId } from '@/types/book-group';

type Row = Record<string, unknown>;

/** 轻量内存 DB，仅覆盖 v105 迁移所需 SQL */
class MemoryDatabase implements DatabaseAdapter {
  private books: Row[] = [];
  private groups: Row[] = [];
  private items: Row[] = [];
  private playlistItems: Row[] = [];
  private master: Row[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.startsWith('CREATE TABLE books')) return;
    if (s.startsWith('CREATE TABLE media_groups')) return;
    if (s.startsWith('CREATE TABLE media_group_items')) return;
    if (s.startsWith('CREATE TABLE audio_playlist_items')) return;
    if (s.startsWith('CREATE TABLE audio_playlists')) return;
    if (s.startsWith('INSERT INTO media_groups')) {
      this.groups.push({
        groupId: params[0],
        groupName: params[1] ?? 'g',
        domain: params[2] ?? 'shelf',
        listId: params[3],
      });
      return;
    }
    if (s.startsWith('INSERT INTO books')) {
      this.books.push({ bookUrl: params[0], name: params[1], group: params[2] });
      return;
    }
    if (s.startsWith('INSERT OR IGNORE INTO media_group_items')) {
      const groupId = params[0];
      const itemKind = s.includes("'book'") ? 'book' : String(params[1]);
      const itemId = s.includes("'book'") ? params[1] : params[2];
      const sortOrder = s.includes("'book'") ? 0 : Number(params[3] ?? 0);
      const createdAt = s.includes("'book'") ? params[2] : params[4];
      const exists = this.items.some(
        (r) => r.group_id === groupId && r.item_kind === itemKind && r.item_id === itemId,
      );
      if (!exists) {
        this.items.push({
          group_id: groupId,
          item_kind: itemKind,
          item_id: itemId,
          sort_order: sortOrder,
          created_at: createdAt,
        });
      }
      return;
    }
    if (s.includes('INSERT OR IGNORE INTO media_group_items') && params[1] === 'track') {
      const [groupId, , itemId, sortOrder, createdAt] = params;
      this.items.push({
        group_id: groupId,
        item_kind: 'track',
        item_id: itemId,
        sort_order: sortOrder,
        created_at: createdAt,
      });
      return;
    }
    if (s.startsWith('UPDATE books SET "group"')) {
      const clearMask = Number(params[0]);
      for (const b of this.books) {
        b.group = Number(b.group) & ~clearMask;
      }
      return;
    }
    if (s === 'DROP TABLE audio_playlist_items') {
      this.playlistItems = [];
      this.master = this.master.filter((r) => r.name !== 'audio_playlist_items');
      return;
    }
    if (s.startsWith('CREATE VIEW IF NOT EXISTS audio_playlist_items')) {
      this.master.push({ name: 'audio_playlist_items', type: 'view' });
      return;
    }
    if (s.startsWith('INSERT INTO audio_playlist_items')) {
      this.playlistItems.push({
        playlist_id: params[0],
        track_id: params[1],
        sort_order: params[2],
      });
      return;
    }
    if (s.startsWith('INSERT INTO media_group_items')) {
      this.items.push({
        group_id: params[0],
        item_kind: params[1],
        item_id: params[2],
        sort_order: params[3],
        created_at: params[4],
      });
    }
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const s = sql.trim().replace(/\s+/g, ' ');
    if (s.includes("FROM sqlite_master WHERE type='table'")) {
      const name = params[0];
      const hit =
        (name === 'books' && this.books.length >= 0) ||
        (name === 'media_groups') ||
        (name === 'media_group_items') ||
        (name === 'audio_playlist_items' && this.master.some((r) => r.name === name && r.type !== 'view')) ||
        (name === 'audio_playlist_items' && this.playlistItems.length > 0);
      return (hit ? [{ name }] : []) as T[];
    }
    if (s.includes('FROM sqlite_master WHERE name = ?') && !s.includes("type='table'")) {
      const name = params[0];
      const row = this.master.find((r) => r.name === name);
      return (row ? [{ type: row.type }] : []) as T[];
    }
    if (s.includes('SELECT groupId FROM media_groups WHERE groupId > 0 AND domain')) {
      return this.groups
        .filter((g) => Number(g.groupId) > 0 && g.domain === 'shelf')
        .map((g) => ({ groupId: g.groupId })) as T[];
    }
    if (s.includes('SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0')) {
      return this.books
        .filter((b) => Number(b.group) > 0)
        .map((b) => ({ bookUrl: b.bookUrl, groupMask: b.group })) as T[];
    }
    if (s.includes('SELECT bookUrl, "group" AS groupMask FROM books')) {
      return this.books.map((b) => ({ bookUrl: b.bookUrl, groupMask: b.group })) as T[];
    }
    if (s.includes('FROM audio_playlist_items api')) {
      return this.playlistItems
        .filter((pi) => !this.items.some((i) => i.item_id === pi.track_id && i.item_kind === 'track'))
        .map((pi) => ({
          playlist_id: pi.playlist_id,
          track_id: pi.track_id,
          sort_order: pi.sort_order,
        })) as T[];
    }
    if (s.includes('SELECT groupId FROM media_groups WHERE listId = ?')) {
      const g = this.groups.find((x) => x.listId === params[0]);
      return (g ? [{ groupId: g.groupId }] : []) as T[];
    }
    if (s.includes('SELECT group_id, item_id FROM media_group_items')) {
      return this.items
        .filter((i) => i.item_kind === 'book')
        .map((i) => ({ group_id: i.group_id, item_id: i.item_id })) as T[];
    }
    if (s.includes("SELECT type FROM sqlite_master WHERE name = 'audio_playlist_items'")) {
      const row = this.master.find((r) => r.name === 'audio_playlist_items');
      return (row ? [{ type: row.type }] : []) as T[];
    }
    if (s.includes('SELECT track_id FROM audio_playlist_items')) {
      return this.items
        .filter((i) => i.item_kind === 'track')
        .map((i) => ({ track_id: i.item_id })) as T[];
    }
    return [];
  }

  async close(): Promise<void> {
    /* noop */
  }

  seed() {
    this.master.push({ name: 'audio_playlist_items', type: 'table' });
    this.groups.push({ groupId: 2, groupName: '测试分组', domain: 'shelf' });
    this.groups.push({
      groupId: MediaGroupId.MusicRecent,
      groupName: '最近',
      domain: 'music',
      listId: 'recent',
    });
    this.books.push({ bookUrl: 'url-a', name: '书A', group: 2 });
    this.books.push({ bookUrl: 'url-b', name: '书B', group: 2 });
  }
}

describe('migration-v105-mediabox', () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = new MemoryDatabase();
    db.seed();
  });

  it('migrates books group bitmask to media_group_items and clears shelf bits', async () => {
    await migrateMediaboxV105(db);

    const items = await db.select<{ group_id: number; item_id: string }>(
      `SELECT group_id, item_id FROM media_group_items WHERE item_kind = 'book' ORDER BY item_id, group_id`,
    );
    expect(items).toEqual(
      expect.arrayContaining([
        { group_id: 2, item_id: 'url-a' },
        { group_id: 2, item_id: 'url-b' },
      ]),
    );

    const books = await db.select<{ bookUrl: string; groupMask: number }>(
      'SELECT bookUrl, "group" AS groupMask FROM books ORDER BY bookUrl',
    );
    expect(books[0]?.groupMask).toBe(0);
    expect(books[1]?.groupMask).toBe(0);
  });

  it('replaces audio_playlist_items table with view', async () => {
    await db.execute(
      `INSERT INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
       VALUES (?, 'track', 'track-1', 0, 1)`,
      [MediaGroupId.MusicRecent],
    );
    await db.execute(
      `INSERT INTO audio_playlist_items (playlist_id, track_id, sort_order) VALUES ('recent', 'orphan', 1)`,
    );

    await migrateMediaboxV105(db);

    const viewRows = await db.select<{ type: string }>(
      `SELECT type FROM sqlite_master WHERE name = 'audio_playlist_items'`,
    );
    expect(viewRows[0]?.type).toBe('view');
  });
});
