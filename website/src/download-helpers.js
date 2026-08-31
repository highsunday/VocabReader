export function detectPlatform({ userAgentDataPlatform = "", userAgent = "" } = {}) {
  const platform = `${userAgentDataPlatform} ${userAgent}`.toLowerCase();
  return platform.includes("mac") ? "macos" : "windows";
}

export function resolveReleaseAssets(assets = []) {
  const findUrl = (suffix) =>
    assets.find((asset) => asset?.name?.endsWith(suffix))?.browser_download_url ?? null;

  return {
    windows: findUrl("windows-x64-setup.exe"),
    macArm64: findUrl("mac-arm64.dmg"),
    macX64: findUrl("mac-x64.dmg"),
  };
}
