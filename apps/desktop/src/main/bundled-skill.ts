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

function installBundledSkill(
  runtimePath: string,
  skillName: "explain-reader-annotations" | "practice-reading-comprehension",
  markdown: string
): BundledSkillInstallResult {
  const path = join(
    runtimePath,
    `.agents/skills/${skillName}/SKILL.md`
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

export function installBundledAnnotationSkill(
  runtimePath: string,
  markdown: string
): BundledSkillInstallResult {
  return installBundledSkill(
    runtimePath,
    "explain-reader-annotations",
    markdown
  );
}

export function installBundledReadingComprehensionSkill(
  runtimePath: string,
  markdown: string
): BundledSkillInstallResult {
  return installBundledSkill(
    runtimePath,
    "practice-reading-comprehension",
    markdown
  );
}
