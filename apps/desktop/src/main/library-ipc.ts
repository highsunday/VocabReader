import type {
  ImportBookResult,
  LibraryBook
} from "../shared/library-contracts";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): unknown;
}

interface FileDialog {
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface BookLibrary {
  listBooks(): Promise<LibraryBook[]>;
  importFromPath(path: string): Promise<ImportBookResult>;
}

export function registerLibraryIpc(
  ipc: IpcRegistrar,
  dialog: FileDialog,
  library: BookLibrary
): void {
  ipc.handle("library:list", () => library.listBooks());
  ipc.handle("library:import", async () => {
    const selection = await dialog.showOpenDialog({
      title: "導入 EPUB",
      properties: ["openFile"],
      filters: [{ name: "EPUB 電子書", extensions: ["epub"] }]
    });
    const selectedPath = selection.filePaths[0];
    if (selection.canceled || !selectedPath) {
      return { status: "cancelled" } satisfies ImportBookResult;
    }
    return library.importFromPath(selectedPath);
  });
}
