import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installBundledAnnotationSkill } from "./bundled-skill";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true
  })));
});

function runtimeRoot() {
  const root = mkdtempSync(join(tmpdir(), "lingoshelf-bundled-skill-"));
  roots.push(root);
  return root;
}

describe("installBundledAnnotationSkill", () => {
  it("installs the App-bundled skill into a clean user-data runtime", () => {
    const runtimePath = runtimeRoot();

    const result = installBundledAnnotationSkill(runtimePath, "bundled-v1");

    expect(result.status).toBe("installed");
    expect(result.path).toBe(join(
      runtimePath,
      ".agents/skills/explain-reader-annotations/SKILL.md"
    ));
    expect(readFileSync(result.path, "utf8")).toBe("bundled-v1");
  });

  it("leaves an identical installed skill untouched", () => {
    const runtimePath = runtimeRoot();
    const first = installBundledAnnotationSkill(runtimePath, "bundled-v1");

    const second = installBundledAnnotationSkill(runtimePath, "bundled-v1");

    expect(first.status).toBe("installed");
    expect(second).toEqual({ path: first.path, status: "unchanged" });
  });

  it("atomically replaces an older App-installed skill", () => {
    const runtimePath = runtimeRoot();
    const first = installBundledAnnotationSkill(runtimePath, "bundled-v1");
    writeFileSync(first.path, "old-version", "utf8");

    const updated = installBundledAnnotationSkill(runtimePath, "bundled-v2");

    expect(updated).toEqual({ path: first.path, status: "updated" });
    expect(readFileSync(updated.path, "utf8")).toBe("bundled-v2");
    expect(() => readFileSync(join(dirname(updated.path), "SKILL.md.next")))
      .toThrow();
  });
});
