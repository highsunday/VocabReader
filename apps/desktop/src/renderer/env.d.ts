/// <reference types="vite/client" />

interface ReaderDesktopApi {
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}

interface Window {
  readerDesktop?: ReaderDesktopApi;
}

