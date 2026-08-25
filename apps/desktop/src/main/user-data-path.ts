interface ElectronUserDataApp {
  readonly isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", path: string): void;
}

export function configureDevelopmentUserDataPath(
  application: ElectronUserDataApp
): void {
  if (application.isPackaged) return;

  const userDataPath = application.getPath("userData");
  application.setPath("userData", `${userDataPath}-dev`);
}
