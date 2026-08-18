import type { ReadingRange } from "../shared/contracts";

function clamp(text: string, offset: number): number {
  return Math.min(text.length, Math.max(0, Math.trunc(offset)));
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function firstReadableOffset(text: string, offset: number): number {
  let current = clamp(text, offset);
  while (current < text.length && /\s/u.test(text[current])) current += 1;
  return current;
}

function wordCount(text: string): number {
  return Array.from(text.matchAll(WORD_PATTERN)).length;
}

function endAfterWords(text: string, start: number, desiredWords: number): number {
  let end = start;
  let found = 0;
  for (const match of text.slice(start).matchAll(WORD_PATTERN)) {
    end = start + (match.index ?? 0) + match[0].length;
    found += 1;
    if (found >= desiredWords) return end;
  }
  return text.length;
}

export function initialReadingRange(text: string): ReadingRange {
  return { start: 0, end: text.length };
}

export function extractReadingSegment(
  text: string,
  range: ReadingRange
): string {
  const start = clamp(text, range.start);
  const end = Math.max(start, clamp(text, range.end));
  return text.slice(start, end).trim();
}

export function advanceReadingRange(
  text: string,
  current: ReadingRange
): ReadingRange {
  const desiredWords = Math.max(1, wordCount(extractReadingSegment(text, current)));
  const start = firstReadableOffset(text, current.end);
  return { start, end: endAfterWords(text, start, desiredWords) };
}

function textNodes(root: Node): Text[] {
  const document = root.ownerDocument;
  if (!document) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function offsetForDomPoint(
  root: HTMLElement,
  target: Node,
  localOffset: number
): number | null {
  let offset = 0;
  for (const node of textNodes(root)) {
    if (node === target) {
      return offset + Math.min(node.data.length, Math.max(0, localOffset));
    }
    offset += node.data.length;
  }
  return null;
}

export function textOffsetAtPoint(
  root: HTMLElement,
  x: number,
  y: number
): number | null {
  const document = root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = document.caretPositionFromPoint?.(x, y);
  if (caret && root.contains(caret.offsetNode)) {
    return offsetForDomPoint(root, caret.offsetNode, caret.offset);
  }
  const range = document.caretRangeFromPoint?.(x, y);
  if (range && root.contains(range.startContainer)) {
    return offsetForDomPoint(root, range.startContainer, range.startOffset);
  }
  return null;
}

export function markerTopForTextOffset(
  root: HTMLElement,
  textOffset: number,
  edge: "before" | "after" = "before"
): number {
  const nodes = textNodes(root);
  let remaining = Math.max(0, textOffset);
  for (const node of nodes) {
    if (!node.data.length) continue;
    if (remaining <= node.data.length) {
      const range = root.ownerDocument.createRange();
      const index = edge === "after"
        ? Math.min(node.data.length, Math.max(1, remaining))
        : Math.min(node.data.length - 1, remaining);
      range.setStart(node, edge === "after" ? index - 1 : index);
      range.setEnd(node, edge === "after" ? index : index + 1);
      const rectangle = range.getBoundingClientRect();
      const rootRectangle = root.getBoundingClientRect();
      return Math.max(
        0,
        (edge === "after" ? rectangle.bottom : rectangle.top) - rootRectangle.top
      );
    }
    remaining -= node.data.length;
  }
  return Math.max(0, root.scrollHeight);
}
