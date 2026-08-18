import assert from "node:assert/strict";
import { test } from "vitest";
import {
  advanceReadingRange,
  extractReadingSegment
} from "../src/renderer/reading-range";

test("Next segment advances by the current segment word count", () => {
  const text = "one two three   four five six seven";
  const current = { start: 0, end: "one two three".length };
  const next = advanceReadingRange(text, current);

  assert.equal(extractReadingSegment(text, next), "four five six");
  assert.equal(next.start, text.indexOf("four"));
});

test("Next segment clamps to the end of a chapter", () => {
  const text = "one two three four";
  const next = advanceReadingRange(text, { start: 0, end: "one two three".length });

  assert.equal(extractReadingSegment(text, next), "four");
  assert.equal(next.end, text.length);
});
