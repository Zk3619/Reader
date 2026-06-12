/**
 * Legado Web API 响应格式（对齐 ReturnData.kt）
 */

export interface LegadoReturnData<T = unknown> {
  isSuccess: boolean;
  errorMsg: string;
  data: T | null;
}

export function legadoOk<T>(data: T): LegadoReturnData<T> {
  return { isSuccess: true, errorMsg: '', data };
}

export function legadoErr<T = unknown>(errorMsg: string): LegadoReturnData<T> {
  return { isSuccess: false, errorMsg, data: null };
}
