import type { ListenRepeatMode } from "../shared/listen-repeat-contracts";

export interface ParsedListenRepeatChunk {
  text: string;
  shortChunks: Array<{ text: string }>;
}

export interface ParsedListenRepeatArtifact {
  longChunks: ParsedListenRepeatChunk[];
}

interface ParseOptions {
  practiceId: string;
  mode: ListenRepeatMode;
  material: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Listen-and-repeat ${label} cannot be empty`);
  }
  return value;
}

function fencedArtifact(source: string): unknown {
  const matches = [...source.matchAll(
    /```listen-repeat-result\s*\n([\s\S]*?)\n```/g
  )];
  if (matches.length !== 1) {
    throw new Error("AI must return exactly one listen-and-repeat result");
  }
  try {
    return JSON.parse(matches[0][1]);
  } catch {
    throw new Error("Invalid AI listen-and-repeat result JSON");
  }
}

export function parseListenRepeatArtifact(
  source: string,
  options: ParseOptions
): ParsedListenRepeatArtifact {
  const value = fencedArtifact(source);
  if (!isObject(value) || value.version !== 1 ||
    value.practiceId !== options.practiceId || value.mode !== options.mode ||
    !Array.isArray(value.longChunks) || value.longChunks.length === 0 ||
    value.longChunks.length > options.material.length) {
    throw new Error("AI listen-and-repeat result is outside the requested scope");
  }

  const longChunks = value.longChunks.map((rawLong) => {
    if (!isObject(rawLong)) {
      throw new Error("Invalid AI listen-and-repeat long chunk");
    }
    const text = nonEmptyText(rawLong.text, "long chunk");
    if (options.mode === "advanced") {
      if ("shortChunks" in rawLong &&
        (!Array.isArray(rawLong.shortChunks) || rawLong.shortChunks.length > 0)) {
        throw new Error("Advanced result must not contain short chunks");
      }
      return { text, shortChunks: [] };
    }
    if (!Array.isArray(rawLong.shortChunks) || rawLong.shortChunks.length === 0 ||
      rawLong.shortChunks.length > text.length) {
      throw new Error("Progressive result requires short chunks");
    }
    const shortChunks = rawLong.shortChunks.map((rawShort) => ({
      text: nonEmptyText(
        typeof rawShort === "string"
          ? rawShort
          : isObject(rawShort) ? rawShort.text : undefined,
        "short chunk"
      )
    }));
    if (shortChunks.map(({ text: shortText }) => shortText).join("") !== text) {
      throw new Error("Short chunks do not reconstruct their long chunk exactly");
    }
    return { text, shortChunks };
  });

  if (longChunks.map(({ text }) => text).join("") !== options.material) {
    throw new Error("Long chunks do not reconstruct the material exactly");
  }
  return { longChunks };
}
