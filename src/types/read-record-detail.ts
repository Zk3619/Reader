/** 阅读记录明细，对应 legado ReadRecordDetail.kt */
export interface ReadRecordDetail {
  deviceId: string;
  bookName: string;
  bookAuthor: string;
  date: string;
  readTime: number;
  readWords: number;
  firstReadTime: number;
  lastReadTime: number;
}
