import type {
  DataBackupPreview,
  ExportDataBackupResult,
  SelectDataBackupResult
} from "../shared/data-backup-contracts";

interface IpcRegistrar {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): unknown;
}

interface DataBackupDialog {
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(options: {
    title: string;
    properties: ["openFile"];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface DataBackupOperations {
  exportToPath(path: string): Promise<ExportDataBackupResult>;
  selectBackupFromPath(path: string): Promise<DataBackupPreview>;
  cancelRestore(token: string): Promise<void>;
  restoreBackup(token: string): Promise<void>;
}

function restoreToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9-]{8,100}$/.test(value)
  ) {
    throw new Error("Invalid data restore request");
  }
  return value;
}

export function registerDataBackupIpc(
  ipc: IpcRegistrar,
  dialog: DataBackupDialog,
  service: DataBackupOperations,
  defaultFileName: string
): void {
  ipc.handle("data-backup:export", async () => {
    const selection = await dialog.showSaveDialog({
      title: "Export VocabReader Data Backup",
      defaultPath: defaultFileName,
      filters: [{ name: "VocabReader Data Backup", extensions: ["zip"] }]
    });
    if (selection.canceled || !selection.filePath) {
      return { status: "cancelled" } satisfies ExportDataBackupResult;
    }
    const destinationPath = selection.filePath.toLowerCase().endsWith(".zip")
      ? selection.filePath
      : `${selection.filePath}.zip`;
    return service.exportToPath(destinationPath);
  });

  ipc.handle("data-backup:select", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Import VocabReader Data Backup",
      properties: ["openFile"],
      filters: [{ name: "VocabReader Data Backup", extensions: ["zip"] }]
    });
    const selectedPath = selection.filePaths[0];
    if (selection.canceled || !selectedPath) {
      return { status: "cancelled" } satisfies SelectDataBackupResult;
    }
    return {
      status: "ready",
      preview: await service.selectBackupFromPath(selectedPath)
    } satisfies SelectDataBackupResult;
  });

  ipc.handle("data-backup:cancel-restore", (_event, rawToken) =>
    service.cancelRestore(restoreToken(rawToken))
  );
  ipc.handle("data-backup:restore", (_event, rawToken) =>
    service.restoreBackup(restoreToken(rawToken))
  );
}
