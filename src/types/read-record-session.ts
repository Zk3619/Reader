/** 阅读会话，对应 legado ReadRecordSession.kt */
export interface ReadRecordSession {
  id?: number;
  deviceId: string;
  bookName: string;
  bookAuthor: string;
  startTime: number;
  endTime: number;
  words: number;
}
