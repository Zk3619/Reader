/**
 * 书籍 type 位标志（与 Legado BookType 对齐）
 */

/** 更新目录失败 */
export const BOOK_TYPE_UPDATE_ERROR = 0b10000;

export function hasBookType(type: number, flag: number): boolean {
  return (type & flag) > 0;
}

export function addBookType(type: number, flag: number): number {
  return type | flag;
}

export function removeBookType(type: number, flag: number): number {
  return type & ~flag;
}
