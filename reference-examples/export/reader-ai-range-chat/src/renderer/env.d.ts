import type { ReaderDesktopApi } from "../shared/contracts";

declare global {
  interface Window {
    readerExample: ReaderDesktopApi;
  }
}

export {};
