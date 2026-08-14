import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceReadingRange,
  annotatedReadingSegment,
  annotationRangeFromSelection,
  annotationRevision,
  extractReadingSegment,
  hasAnnotationOverlap,
  initialReadingRange,
  markerTopForTextOffset,
  textOffsetAtPoint
} from "./reading-range";

function words(count: number, prefix = "word") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("reading range", () => {
  it("initializes a new chapter range across the full chapter", () => {
    const chapter = words(1_000);
    const shortChapter = words(10);

    expect(initialReadingRange(chapter)).toEqual({ start: 0, end: chapter.length });
    expect(extractReadingSegment(chapter, initialReadingRange(chapter))).toBe(chapter);
    expect(initialReadingRange(shortChapter)).toEqual({
      start: 0,
      end: shortChapter.length
    });
    expect(initialReadingRange("")).toEqual({ start: 0, end: 0 });
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

  it("places START from the first selected glyph instead of the previous visual line caret", () => {
    const root = document.createElement("article");
    root.textContent = "PreviousNext";
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 300, 100)
    );
    const range = document.createRange();
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: vi.fn(() => range.collapsed
        ? new DOMRect(0, 20, 80, 18)
        : new DOMRect(0, 50, 80, 18))
    });
    const setStart = vi.spyOn(range, "setStart");
    const setEnd = vi.spyOn(range, "setEnd");
    const createRange = vi.spyOn(document, "createRange").mockReturnValue(range);
    const text = root.firstChild as Text;

    expect(markerTopForTextOffset(root, "Previous".length, "before")).toBe(40);
    expect(setStart).toHaveBeenCalledWith(text, "Previous".length);
    expect(setEnd).toHaveBeenCalledWith(text, "Previous".length + 1);

    createRange.mockRestore();
    root.remove();
  });

  it("uses the next text node when START is exactly at a DOM text boundary", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>Previous</p><p>Next</p>";
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 300, 100)
    );
    const range = document.createRange();
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: vi.fn().mockReturnValue(new DOMRect(0, 50, 80, 18))
    });
    const setStart = vi.spyOn(range, "setStart");
    const setEnd = vi.spyOn(range, "setEnd");
    const createRange = vi.spyOn(document, "createRange").mockReturnValue(range);
    const nextText = root.querySelectorAll("p")[1].firstChild as Text;

    expect(markerTopForTextOffset(root, "Previous".length, "before")).toBe(40);
    expect(setStart).toHaveBeenCalledWith(nextText, 0);
    expect(setEnd).toHaveBeenCalledWith(nextText, 1);

    createRange.mockRestore();
    root.remove();
  });

  it("safely anchors START at the last glyph when its offset is at chapter end", () => {
    const root = document.createElement("article");
    root.textContent = "Last";
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 300, 100)
    );
    const range = document.createRange();
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: vi.fn().mockReturnValue(new DOMRect(0, 50, 80, 18))
    });
    const setStart = vi.spyOn(range, "setStart");
    const setEnd = vi.spyOn(range, "setEnd");
    const createRange = vi.spyOn(document, "createRange").mockReturnValue(range);
    const text = root.firstChild as Text;

    expect(markerTopForTextOffset(root, text.length, "before")).toBe(40);
    expect(setStart).toHaveBeenCalledWith(text, text.length - 1);
    expect(setEnd).toHaveBeenCalledWith(text, text.length);

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

  it("serializes escaped reading text with inline annotations in source order", () => {
    const chapter = "Before He was reluctant & afraid to admit that <it> failed. After";
    const start = chapter.indexOf("He was");
    const end = chapter.indexOf(" After");

    expect(annotatedReadingSegment(chapter, { start, end }, [
      {
        id: "word-1",
        start: chapter.indexOf("reluctant"),
        end: chapter.indexOf("reluctant") + "reluctant".length,
        text: "reluctant"
      },
      {
        id: "sentence-1",
        start: chapter.indexOf("that <it> failed."),
        end: chapter.indexOf("that <it> failed.") + "that <it> failed.".length,
        text: "that <it> failed."
      }
    ])).toBe(
      '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation> &amp; afraid to admit <reader-annotation id="A2">that &lt;it&gt; failed.</reader-annotation></reading-segment>'
    );
  });

  it("clips annotations at START and END while excluding all outside text", () => {
    const chapter = "outside marked phrase continues outside";

    expect(annotatedReadingSegment(chapter, { start: 8, end: 21 }, [{
      id: "crossing",
      start: 0,
      end: chapter.length,
      text: chapter
    }])).toBe(
      '<reading-segment><reader-annotation id="A1">marked phrase</reader-annotation></reading-segment>'
    );
  });

  it("silently identifies exact, containing, contained and partial overlaps", () => {
    const existing = [{ id: "a1", start: 10, end: 20, text: "annotation" }];

    expect(hasAnnotationOverlap(existing, { start: 10, end: 20 })).toBe(true);
    expect(hasAnnotationOverlap(existing, { start: 5, end: 25 })).toBe(true);
    expect(hasAnnotationOverlap(existing, { start: 12, end: 18 })).toBe(true);
    expect(hasAnnotationOverlap(existing, { start: 18, end: 24 })).toBe(true);
    expect(hasAnnotationOverlap(existing, { start: 20, end: 24 })).toBe(false);
  });

  it("normalizes a reversed DOM selection and trims boundary whitespace", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>First line.</p><p>  reluctant phrase  </p>";
    document.body.append(root);
    const first = root.querySelectorAll("p")[0].firstChild as Text;
    const second = root.querySelectorAll("p")[1].firstChild as Text;
    const selection = {
      anchorNode: second,
      anchorOffset: second.data.length,
      focusNode: first,
      focusOffset: first.data.length,
      isCollapsed: false
    } as unknown as Selection;

    expect(annotationRangeFromSelection(root, selection)).toEqual({
      start: "First line.".length + 2,
      end: "First line.".length + 2 + "reluctant phrase".length,
      text: "reluctant phrase"
    });

    root.remove();
  });

  it("changes the annotation revision when an annotation is added or removed", () => {
    const first = [{ id: "a1", start: 2, end: 5, text: "one" }];
    const second = [...first, { id: "a2", start: 8, end: 11, text: "two" }];

    expect(annotationRevision(first)).not.toBe(annotationRevision(second));
    expect(annotationRevision(first)).toBe(annotationRevision([...first]));
    expect(annotationRevision([])).not.toBe(annotationRevision(first));
  });
});
