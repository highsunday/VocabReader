import { describe, expect, it } from "vitest";
import {
  LISTEN_REPEAT_MATERIAL_LIMIT,
  countListenRepeatGraphemes,
  isListenRepeatShortChunkLength,
  validateListenRepeatMaterial
} from "../shared/listen-repeat-contracts";

describe("listen-and-repeat material contracts", () => {
  it("counts user-perceived Unicode characters consistently", () => {
    expect(countListenRepeatGraphemes("A中 e\u0301 👨‍👩‍👧‍👦\n")).toBe(7);
  });

  it("accepts 2,000 graphemes and rejects empty or 2,001 without truncation", () => {
    const maximum = "語".repeat(LISTEN_REPEAT_MATERIAL_LIMIT);
    const tooLong = `${maximum}文`;

    expect(validateListenRepeatMaterial(maximum)).toEqual({
      valid: true,
      count: 2_000
    });
    expect(validateListenRepeatMaterial(tooLong)).toEqual({
      valid: false,
      count: 2_001,
      reason: "too-long"
    });
    expect(validateListenRepeatMaterial(" \n\t")).toEqual({
      valid: false,
      count: 3,
      reason: "empty"
    });
  });

  it("allowlists the three Progressive short-chunk length preferences", () => {
    expect(["short", "medium", "long"].every(isListenRepeatShortChunkLength))
      .toBe(true);
    expect(isListenRepeatShortChunkLength("2.5 seconds")).toBe(false);
    expect(isListenRepeatShortChunkLength(undefined)).toBe(false);
  });
});
