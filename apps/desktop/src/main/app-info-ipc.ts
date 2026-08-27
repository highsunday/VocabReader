interface IpcRegistrar {
  handle(channel: string, listener: () => unknown): void;
}

export function registerAppInfoIpc(
  ipc: IpcRegistrar,
  getVersion: () => string
): void {
  ipc.handle("app-info:get-version", () => getVersion());
}
