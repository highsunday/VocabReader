import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

export interface BundledSkillInstallResult {
  path: string;
  status: "installed" | "unchanged" | "updated";
}

export function installBundledAnnotationSkill(
  runtimePath: string,
  markdown: string
): BundledSkillInstallResult {
  const path = join(
    runtimePath,
    ".agents/skills/explain-reader-annotations/SKILL.md"
  );
  const existed = existsSync(path);
  if (existed && readFileSync(path, "utf8") === markdown) {
    return { path, status: "unchanged" };
  }

  mkdirSync(dirname(path), { recursive: true });
  const nextPath = `${path}.next`;
  writeFileSync(nextPath, markdown, "utf8");
  renameSync(nextPath, path);
  return { path, status: existed ? "updated" : "installed" };
}
