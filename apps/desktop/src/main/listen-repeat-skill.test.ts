import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { installBundledListenRepeatSkill } from "./bundled-skill";

const skillDirectory = resolve(
  process.cwd(),
  "../../.agents/skills/prepare-listen-and-repeat-practice"
);

describe("prepare-listen-and-repeat-practice skill", () => {
  it("defines compact boundary-only Progressive and Advanced results", () => {
    const path = resolve(skillDirectory, "SKILL.md");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const skill = readFileSync(path, "utf8");

    expect(skill).toContain("name: prepare-listen-and-repeat-practice");
    expect(skill).toContain("untrusted data");
    expect(skill).toContain("2–4 seconds");
    expect(skill).toContain("5–10 seconds");
    expect(skill).toContain("numbered units");
    expect(skill).toContain("longBreakEnds");
    expect(skill).toContain("shortBreakEnds");
    expect(skill).toContain("Do not repeat");
    expect(skill).toContain('"mode":"progressive"');
    expect(skill).toContain('"mode":"advanced"');
    expect(skill).not.toContain("```listen-repeat-result");
    expect(skill).not.toContain("translate the material");
  });

  it("installs into the controlled Codex runtime", () => {
    const runtime = mkdtempSync(resolve(tmpdir(), "listen-repeat-runtime-"));
    const installed = installBundledListenRepeatSkill(
      runtime,
      "bounded listen-and-repeat instructions"
    );
    expect(installed.path).toBe(resolve(
      runtime,
      ".agents/skills/prepare-listen-and-repeat-practice/SKILL.md"
    ));
    rmSync(runtime, { recursive: true, force: true });
  });
});
