declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null;

  export interface Statement {
    bind(values?: SqlValue[]): Statement;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export class Database {
    run(sql: string, params?: SqlValue[]): Database;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    [key: string]: unknown;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
    [key: string]: unknown;
  }

  export default function initSqlJs(
    config?: Record<string, unknown>,
  ): Promise<SqlJsStatic>;
}

/** BarcodeDetector（部分 Chromium；用于二维码扫描） */
interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(
    image: ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  ): Promise<Array<{ rawValue?: string }>>;
}

declare module '@corvu/resizable' {
  import type { Component, ValidComponent } from 'solid-js';

  export type DynamicProps<T extends ValidComponent, P> = P & Record<string, unknown>;
  export type HandleProps<T extends ValidComponent = 'button'> = Record<string, unknown>;
  export type RootProps<T extends ValidComponent = 'div'> = Record<string, unknown>;

  interface ResizablePrimitiveComponent extends Component<Record<string, unknown>> {
    Panel: Component<Record<string, unknown>>;
    Handle: Component<Record<string, unknown>>;
  }

  const ResizablePrimitive: ResizablePrimitiveComponent;
  export default ResizablePrimitive;
}
