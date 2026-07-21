import type { ReadingRange } from "../shared/library-contracts";

const DEFAULT_READING_WORDS = 800;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function clampOffset(text: string, value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(text.length, Math.max(0, Math.trunc(value)));
}

function firstReadableOffset(text: string, offset: number) {
  let current = clampOffset(text, offset);
  while (current < text.length && /\s/u.test(text[current])) current += 1;
  return current;
}

function wordCount(text: string) {
  return Array.from(text.matchAll(WORD_PATTERN)).length;
}

function endAfterWords(text: string, start: number, desiredWords: number) {
  const content = text.slice(start);
  let end = start;
  let found = 0;
  for (const match of content.matchAll(WORD_PATTERN)) {
    end = start + (match.index ?? 0) + match[0].length;
    found += 1;
    if (found >= desiredWords) return end;
  }
  return text.length;
}

export function initialReadingRange(
  text: string,
  desiredWords = DEFAULT_READING_WORDS
): ReadingRange {
  const start = firstReadableOffset(text, 0);
  return {
    start,
    end: endAfterWords(text, start, Math.max(1, desiredWords))
  };
}

export function extractReadingSegment(text: string, range: ReadingRange) {
  const start = clampOffset(text, range.start);
  const end = Math.max(start, clampOffset(text, range.end));
  return text.slice(start, end).trim();
}

export function advanceReadingRange(
  text: string,
  current: ReadingRange
): ReadingRange {
  const currentText = extractReadingSegment(text, current);
  const desiredWords = Math.max(1, wordCount(currentText));
  const start = firstReadableOffset(text, current.end);
  return {
    start,
    end: endAfterWords(text, start, desiredWords)
  };
}

function textNodes(root: Node) {
  const ownerDocument = root.ownerDocument;
  if (!ownerDocument) return [];
  const showText = ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = ownerDocument.createTreeWalker(root, showText);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

export function textOffsetForDomPoint(
  root: HTMLElement,
  node: Node,
  localOffset = 0
) {
  let offset = 0;
  for (const textNode of textNodes(root)) {
    if (textNode === node || textNode.parentElement === node) {
      return offset + Math.min(textNode.data.length, Math.max(0, localOffset));
    }
    if (node instanceof Element && node.contains(textNode)) return offset;
    offset += textNode.data.length;
  }
  return null;
}

export function textOffsetAtPoint(
  root: HTMLElement,
  x: number,
  y: number,
  fallbackTarget?: EventTarget | null
) {
  const documentWithCaret = root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (caret && root.contains(caret.offsetNode)) {
    return textOffsetForDomPoint(root, caret.offsetNode, caret.offset);
  }
  const caretRange = documentWithCaret.caretRangeFromPoint?.(x, y);
  if (caretRange && root.contains(caretRange.startContainer)) {
    return textOffsetForDomPoint(
      root,
      caretRange.startContainer,
      caretRange.startOffset
    );
  }
  const target = root.ownerDocument.elementFromPoint?.(x, y) ?? fallbackTarget;
  const targetNode = target && typeof target === "object" && "nodeType" in target
    ? target as Node
    : null;
  return targetNode && root.contains(targetNode)
    ? textOffsetForDomPoint(root, targetNode)
    : null;
}

export function markerTopForTextOffset(
  root: HTMLElement,
  textOffset: number,
  edge: "before" | "after" = "before"
) {
  const nodes = textNodes(root);
  let remaining = Math.max(0, textOffset);
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      const range = root.ownerDocument.createRange();
      if (edge === "after" && node.data.length > 0) {
        const end = Math.min(node.data.length, remaining || 1);
        range.setStart(node, Math.max(0, end - 1));
        range.setEnd(node, end);
      } else {
        range.setStart(node, remaining);
        range.collapse(true);
      }
      const rectangle = typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : null;
      const rootRectangle = root.getBoundingClientRect();
      const boundary = edge === "after" ? rectangle?.bottom : rectangle?.top;
      return boundary === undefined
        ? 0
        : Math.max(0, boundary - rootRectangle.top);
    }
    remaining -= node.data.length;
  }
  return 0;
}
