interface DataRestoreRestartOptions {
  developmentServerUrl: string | undefined;
  reloadWindows(): void;
  relaunch(): void;
  exit(): void;
  defer(callback: () => void): void;
}

export function restartAfterDataRestore(
  options: DataRestoreRestartOptions
): void {
  if (options.developmentServerUrl) {
    options.defer(options.reloadWindows);
    return;
  }

  options.relaunch();
  options.defer(options.exit);
}
