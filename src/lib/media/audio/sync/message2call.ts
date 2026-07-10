/**
 * message2call RPC 框架（对齐 lx-music-sync-server）
 */

export type Msg2CallHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface Message2CallOptions {
  sendMessage: (data: Record<string, unknown>) => void;
  timeout?: number;
  onCallBeforeParams?: (args: unknown[]) => unknown[];
  onError?: (error: Error, path: string[], group?: string) => void;
}

export interface QueueRemote {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface Message2Call {
  call: (path: string[], ...args: unknown[]) => Promise<unknown>;
  remote: QueueRemote;
  createQueueRemote: (group: string) => QueueRemote;
  on: (path: string[], handler: Msg2CallHandler) => void;
  handleMessage: (data: Record<string, unknown>) => void;
  destroy: () => void;
}

export function createMessage2call(
  funcs: Record<string, Msg2CallHandler>,
  options: Message2CallOptions,
): Message2Call {
  const timeout = options.timeout ?? 120_000;
  let msgId = 0;
  let destroyed = false;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  const handlers = new Map<string, Msg2CallHandler>();

  const pathKey = (path: string[]) => path.join('.');

  const call = (path: string[], ...args: unknown[]) => {
    if (destroyed) return Promise.reject(new Error('disconnected'));
    const id = ++msgId;
    const params = options.onCallBeforeParams ? options.onCallBeforeParams(args) : args;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`sync call timeout: ${pathKey(path)}`));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      options.sendMessage({ id, method: pathKey(path), params });
    });
  };

  const createQueueRemote = (group: string): QueueRemote => ({
    call(method, ...args) {
      return call([group, method], ...args);
    },
  });

  return {
    call,
    remote: {
      call(method, ...args) {
        return call([method], ...args);
      },
    },
    createQueueRemote,
    on(path, handler) {
      handlers.set(pathKey(path), handler);
    },
    handleMessage(data) {
      const id = data.id as number | undefined;
      if (id != null && pending.has(id)) {
        const p = pending.get(id)!;
        clearTimeout(p.timer);
        pending.delete(id);
        if (data.error) p.reject(new Error(String(data.error)));
        else p.resolve(data.result);
        return;
      }
      const method = data.method as string | undefined;
      if (!method) return;
      const handler = handlers.get(method) ?? funcs[method];
      if (!handler) return;
      const params = (data.params as unknown[]) ?? [];
      void Promise.resolve(handler(...params))
        .then((result) => {
          if (id != null) options.sendMessage({ id, result });
        })
        .catch((err: Error) => {
          options.onError?.(err, method.split('.'), undefined);
          if (id != null) options.sendMessage({ id, error: err.message });
        });
    },
    destroy() {
      destroyed = true;
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('disconnected'));
      }
      pending.clear();
    },
  };
}
