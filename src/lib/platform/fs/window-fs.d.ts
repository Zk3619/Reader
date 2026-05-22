/** File System Access API（部分 TS lib 未包含 showDirectoryPicker） */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?:
        | FileSystemHandle
        | 'desktop'
        | 'documents'
        | 'downloads'
        | 'music'
        | 'pictures'
        | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
