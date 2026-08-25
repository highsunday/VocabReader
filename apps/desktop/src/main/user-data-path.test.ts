import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { configureDevelopmentUserDataPath } from "./user-data-path";

describe("development user data isolation", () => {
  it("uses a dedicated profile for an unpackaged development app", () => {
    const getPath = vi.fn(() => "/profiles/vocabreader");
    const setPath = vi.fn();

    configureDevelopmentUserDataPath({
      isPackaged: false,
      getPath,
      setPath
    });

    expect(getPath).toHaveBeenCalledOnce();
    expect(getPath).toHaveBeenCalledWith("userData");
    expect(setPath).toHaveBeenCalledOnce();
    expect(setPath).toHaveBeenCalledWith(
      "userData",
      "/profiles/vocabreader-dev"
    );
  });

  it("leaves the installed app profile unchanged", () => {
    const getPath = vi.fn(() => "/profiles/vocabreader");
    const setPath = vi.fn();

    configureDevelopmentUserDataPath({
      isPackaged: true,
      getPath,
      setPath
    });

    expect(getPath).not.toHaveBeenCalled();
    expect(setPath).not.toHaveBeenCalled();
  });

  it("configures the development profile before Electron becomes ready", () => {
    const mainSource = readFileSync(
      resolve(process.cwd(), "src/main/main.ts"),
      "utf8"
    );
    const configureIndex = mainSource.indexOf(
      "configureDevelopmentUserDataPath(app);"
    );
    const readyIndex = mainSource.indexOf("app.whenReady()");

    expect(configureIndex).toBeGreaterThan(-1);
    expect(readyIndex).toBeGreaterThan(-1);
    expect(configureIndex).toBeLessThan(readyIndex);
  });

  it("does not perform file-system migration or cleanup", () => {
    const helperSource = readFileSync(
      resolve(process.cwd(), "src/main/user-data-path.ts"),
      "utf8"
    );

    expect(helperSource).not.toMatch(/node:fs|mkdir|rename|copyFile|rmSync|unlink/);
  });
});
