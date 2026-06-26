/**
 * 选区朗读辅助（对标 Legado contentSelectSpeakMod）
 */

import { plainTextForAloud } from '@/lib/media/text/read-aloud';
import {
  findParagraphIndexInFilteredList,
  getFilteredAloudParagraphs,
} from '@/lib/media/text/read-aloud-paragraphs';

export function getSelectionPlainText(): string {
  if (typeof window === 'undefined') return '';
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  return plainTextForAloud(sel.toString());
}

export function findParagraphIndexForSelection(
  chapterHtml: string,
  selectedText: string,
): number {
  const paragraphs = getFilteredAloudParagraphs(chapterHtml);
  return findParagraphIndexInFilteredList(paragraphs, selectedText.slice(0, 80));
}

export type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function getSelectionClientRect(): SelectionRect | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}
