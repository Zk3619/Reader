declare module '@ffmpeg/ffmpeg' {
  export class FFmpeg {
    load(opts?: { coreURL?: string; wasmURL?: string }): Promise<void>;
    writeFile(name: string, data: Uint8Array): Promise<void>;
    readFile(name: string): Promise<Uint8Array>;
    deleteFile(name: string): Promise<void>;
    exec(args: string[]): Promise<void>;
  }
}

declare module '@ffmpeg/util' {
  export function fetchFile(
    file: string | File | Blob,
  ): Promise<Uint8Array>;
  export function toBlobURL(
    url: string,
    mimeType: string,
  ): Promise<string>;
}
