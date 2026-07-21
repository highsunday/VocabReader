import { describe, expect, it, vi } from "vitest";
import {
  advanceReadingRange,
  extractReadingSegment,
  initialReadingRange,
  markerTopForTextOffset,
  textOffsetAtPoint
} from "./reading-range";

function words(count: number, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

describe("reading range", () => {
  it("initializes a long chapter to the first 800 English words", () => {
    const chapter = words(1_000);

    const range = initialReadingRange(chapter);

    expect(extractReadingSegment(chapter, range).split(/\s+/)).toHaveLength(800);
    expect(extractReadingSegment(chapter, range)).toMatch(/^word1\b/);
    expect(extractReadingSegment(chapter, range)).toMatch(/\bword800$/);
  });

  it("uses the whole chapter when fewer than 800 English words are available", () => {
    const chapter = words(120);

    const range = initialReadingRange(chapter);

    expect(extractReadingSegment(chapter, range)).toBe(chapter);
  });

  it("extracts only the selected text and excludes both outside regions", () => {
    const chapter = "unread before selected words only unread after";

    expect(extractReadingSegment(chapter, { start: 14, end: 33 })).toBe(
      "selected words only"
    );
  });

  it("advances to the next adjacent range with the same approximate word count", () => {
    const chapter = words(25);
    const current = { start: 0, end: words(10).length };

    const next = advanceReadingRange(chapter, current);

    expect(extractReadingSegment(chapter, next)).toBe(
      Array.from({ length: 10 }, (_, index) => `word${index + 11}`).join(" ")
    );
  });

  it("stops at the chapter end when the remaining range is shorter", () => {
    const chapter = words(14);
    const current = { start: 0, end: words(10).length };

    const next = advanceReadingRange(chapter, current);

    expect(extractReadingSegment(chapter, next)).toBe("word11 word12 word13 word14");
    expect(next.end).toBe(chapter.length);
  });

  it("falls back to the current readable element when point APIs are unavailable", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>First line.</p><p>Second line.</p>";
    document.body.append(root);
    const second = root.querySelectorAll("p")[1];

    expect(textOffsetAtPoint(root, 0, 0, second)).toBe("First line.".length);

    root.remove();
  });

  it("places the start before its line and the end after its line", () => {
    const root = document.createElement("article");
    root.textContent = "Readable line";
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 300, 80)
    );
    const range = document.createRange();
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: vi.fn().mockReturnValue(new DOMRect(0, 20, 100, 18))
    });
    const createRange = vi.spyOn(document, "createRange").mockReturnValue(range);

    expect(markerTopForTextOffset(root, 5, "before")).toBe(10);
    expect(markerTopForTextOffset(root, 5, "after")).toBe(28);

    createRange.mockRestore();
    root.remove();
  });

  it("does not mutate independent annotation data while advancing", () => {
    const annotations = Object.freeze([
      Object.freeze({ id: "a1", start: 2, end: 8 })
    ]);
    const snapshot = JSON.stringify(annotations);

    advanceReadingRange(words(20), { start: 0, end: words(10).length });

    expect(JSON.stringify(annotations)).toBe(snapshot);
  });
});
