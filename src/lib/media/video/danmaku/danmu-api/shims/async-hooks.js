/**
 * AsyncLocalStorage stub（浏览器 / Tauri webview 无 node:async_hooks）
 */
export class AsyncLocalStorage {
  #store = undefined;

  run(store, callback, ...args) {
    const prev = this.#store;
    this.#store = store;
    try {
      return callback(...args);
    } finally {
      this.#store = prev;
    }
  }

  getStore() {
    return this.#store;
  }

  enterWith(store) {
    this.#store = store;
  }

  disable() {
    this.#store = undefined;
  }
}

export default { AsyncLocalStorage };
