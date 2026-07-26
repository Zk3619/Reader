/// <reference types="@webgpu/types" />

/**
 * WebCodecs Audio / ORT 环境补充声明
 */

type AudioDecoderConfig = {
  codec: string;
  sampleRate?: number;
  numberOfChannels?: number;
  description?: BufferSource;
};

// eslint-disable-next-line no-var
declare var AudioDecoder:
  | {
      prototype: unknown;
      new (init: unknown): unknown;
      isConfigSupported(config: AudioDecoderConfig): Promise<{
        supported?: boolean;
        config?: AudioDecoderConfig;
      }>;
    }
  | undefined;

declare module 'onnxruntime-web/webgpu' {
  export const env: {
    wasm: { numThreads: number; wasmPaths?: string };
    webgpu?: Record<string, unknown>;
  };
  export class InferenceSession {
    static create(
      pathOrBuffer: string | ArrayBufferLike | Uint8Array,
      options?: Record<string, unknown>,
    ): Promise<InferenceSession>;
    readonly inputNames: string[];
    readonly outputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }
  export class Tensor {
    constructor(type: string, data: unknown, dims: number[]);
    data: unknown;
    dims: number[];
  }
}
