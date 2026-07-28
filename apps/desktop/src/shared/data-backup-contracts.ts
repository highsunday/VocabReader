export interface DataBackupCounts {
  books: number;
  activeLearningItems: number;
  trashedLearningItems: number;
}

export interface DataBackupPreview extends DataBackupCounts {
  token: string;
  createdAt: string;
  appVersion: string;
}

export type ExportDataBackupResult =
  | { status: "cancelled" }
  | { status: "exported"; fileName: string };

export type SelectDataBackupResult =
  | { status: "cancelled" }
  | { status: "ready"; preview: DataBackupPreview };

export interface DataBackupDesktopApi {
  exportBackup(): Promise<ExportDataBackupResult>;
  selectBackup(): Promise<SelectDataBackupResult>;
  cancelRestore(token: string): Promise<void>;
  restoreBackup(token: string): Promise<void>;
}
