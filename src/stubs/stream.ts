/**
 * 浏览器占位：替代 Node `stream`，避免 Vite externalized 警告与客户端访问崩溃。
 */
export class Stream {
  pipe() {
    return this;
  }
  on() {
    return this;
  }
  once() {
    return this;
  }
  emit() {
    return false;
  }
}

export class Readable extends Stream {}
export class Writable extends Stream {}
export class Duplex extends Stream {}
export class Transform extends Stream {}
export class PassThrough extends Stream {}

export default { Stream, Readable, Writable, Duplex, Transform, PassThrough };
