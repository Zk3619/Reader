import { describe, expect, it } from 'vitest';
import {
  LEGADO_TO_READER,
  mapLegadoTableToReader,
  mapReaderTableToLegado,
} from '@/lib/database/core/legado-table-map';
import { ReaderTables } from '@/lib/database/table-names';

describe('legado-table-map', () => {
  it('maps core Legado tables to reader_*', () => {
    expect(mapLegadoTableToReader('books')).toBe(ReaderTables.books);
    expect(mapLegadoTableToReader('book_sources')).toBe(ReaderTables.bookSources);
    expect(mapLegadoTableToReader('book_groups')).toBe(ReaderTables.bookGroups);
    expect(mapLegadoTableToReader('search_keywords')).toBe(ReaderTables.searchKeywords);
  });

  it('round-trips reader → legado', () => {
    expect(mapReaderTableToLegado(ReaderTables.books)).toBe('books');
    expect(mapReaderTableToLegado(ReaderTables.bookGroups)).toBe('book_groups');
  });

  it('does not map audio/video/shell tables', () => {
    expect(mapLegadoTableToReader('audio_tracks')).toBeNull();
    expect(mapLegadoTableToReader('video_sources')).toBeNull();
    expect(LEGADO_TO_READER.media_groups).toBeUndefined();
  });
});
