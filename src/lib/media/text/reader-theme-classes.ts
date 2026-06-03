/** 阅读器主题 0–6 背景/文字色（与 ReaderContent、底栏一致） */

export const READER_THEME_CLASSES: Record<number, { bg: string; text: string }> = {
  0: { bg: 'bg-[#f5f0e6]', text: 'text-[#5b4636]' },
  1: { bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]' },
  2: { bg: 'bg-[#f5e6d3]', text: 'text-[#5d4e37]' },
  3: { bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]' },
  4: { bg: 'bg-[#f3e5f5]', text: 'text-[#6a1b9a]' },
  5: { bg: 'bg-[#263238]', text: 'text-[#b0bec5]' },
  6: { bg: 'bg-[#1e1e1e]', text: 'text-[#cfcfcf]' },
};

export function readerThemeClasses(themeId: number) {
  return READER_THEME_CLASSES[themeId] ?? READER_THEME_CLASSES[0];
}
