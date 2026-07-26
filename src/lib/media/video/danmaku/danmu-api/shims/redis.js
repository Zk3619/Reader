/** redis stub — 内置弹幕不走本地 Redis */
export function createClient() {
  return {
    on() {},
    connect: async () => undefined,
    quit: async () => undefined,
    get: async () => null,
    set: async () => 'OK',
    ping: async () => 'PONG',
    isOpen: false,
  };
}

export default { createClient };
