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

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

export function unitizeListenRepeatMaterial(material: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(material)]
    .map(({ segment }) => segment);
}

function resultObject(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("Invalid AI listen-and-repeat result JSON");
  }
}

function boundary(value: unknown, lowerExclusive: number, upperInclusive: number): number {
  if (!Number.isInteger(value) || (value as number) <= lowerExclusive ||
    (value as number) > upperInclusive) {
    throw new Error("Invalid AI listen-and-repeat boundary");
  }
  return value as number;
}

function interiorBoundaries(value: unknown, unitCount: number): number[] {
  if (!Array.isArray(value) || value.length > Math.max(0, unitCount - 1)) {
    throw new Error("Invalid AI listen-and-repeat boundaries");
  }
  let previousEnd = 0;
  return value.map((rawEnd) => {
    const end = boundary(rawEnd, previousEnd, unitCount - 1);
    previousEnd = end;
    return end;
  });
}

export function parseListenRepeatArtifact(
  source: string,
  options: ParseOptions
): ParsedListenRepeatArtifact {
  const value = resultObject(source);
  const allowedKeys = options.mode === "advanced"
    ? ["version", "practiceId", "mode", "longBreakEnds"]
    : ["version", "practiceId", "mode", "longBreakEnds", "shortBreakEnds"];
  if (!isObject(value) || !hasOnlyKeys(value, allowedKeys) || value.version !== 3 ||
    value.practiceId !== options.practiceId || value.mode !== options.mode) {
    throw new Error("AI listen-and-repeat result is outside the requested scope");
  }

  const units = unitizeListenRepeatMaterial(options.material);
  if (units.length === 0) {
    throw new Error("AI listen-and-repeat result is outside the requested scope");
  }
  const longBreakEnds = interiorBoundaries(value.longBreakEnds, units.length);
  const shortBreakEnds = options.mode === "progressive"
    ? interiorBoundaries(value.shortBreakEnds, units.length)
    : [];
  const longEnds = [...longBreakEnds, units.length];

  let previousLongEnd = 0;
  const longChunks = longEnds.map((endUnit) => {
    const text = units.slice(previousLongEnd, endUnit).join("");

    if (options.mode === "advanced") {
      previousLongEnd = endUnit;
      return { text, shortChunks: [] };
    }

    let previousShortEnd = previousLongEnd;
    const parentShortEnds = shortBreakEnds.filter((shortEnd) =>
      shortEnd > previousLongEnd && shortEnd < endUnit
    );
    const shortChunks = [...parentShortEnds, endUnit].map((shortEnd) => {
      const shortText = units.slice(previousShortEnd, shortEnd).join("");
      previousShortEnd = shortEnd;
      return { text: shortText };
    });
    previousLongEnd = endUnit;
    return { text, shortChunks };
  });

  if (longChunks.map(({ text }) => text).join("") !== options.material) {
    throw new Error("Long boundaries do not finish the material");
  }
  for (const longChunk of longChunks) {
    if (options.mode === "progressive" &&
      longChunk.shortChunks.map(({ text }) => text).join("") !== longChunk.text) {
      throw new Error("Short chunks do not reconstruct their long chunk exactly");
    }
  }
  return { longChunks };
}
