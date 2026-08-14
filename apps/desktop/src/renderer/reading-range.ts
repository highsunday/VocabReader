import type { ReadingRange } from "../shared/library-contracts";

interface AnnotationRange {
  id: string;
  start: number;
  end: number;
  text: string;
}

interface TextRange {
  start: number;
  end: number;
}

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

export function initialReadingRange(text: string): ReadingRange {
  return { start: 0, end: text.length };
}

export function extractReadingSegment(text: string, range: ReadingRange) {
  const start = clampOffset(text, range.start);
  const end = Math.max(start, clampOffset(text, range.end));
  return text.slice(start, end).trim();
}

function escapeAnnotationText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function trimmedRange(text: string, range: ReadingRange): TextRange {
  const boundedStart = clampOffset(text, range.start);
  const boundedEnd = Math.max(boundedStart, clampOffset(text, range.end));
  const selected = text.slice(boundedStart, boundedEnd);
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  return {
    start: boundedStart + leading,
    end: Math.max(boundedStart + leading, boundedEnd - trailing)
  };
}

export function annotatedReadingSegment(
  text: string,
  range: ReadingRange,
  annotations: readonly AnnotationRange[]
) {
  const bounds = trimmedRange(text, range);
  if (bounds.start === bounds.end) return "";
  const intersections = annotations
    .map((annotation) => ({
      start: Math.max(bounds.start, annotation.start),
      end: Math.min(bounds.end, annotation.end)
    }))
    .filter((annotation) => annotation.start < annotation.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = bounds.start;
  let content = "";
  intersections.forEach((annotation, index) => {
    if (annotation.start < cursor) return;
    content += escapeAnnotationText(text.slice(cursor, annotation.start));
    content += `<reader-annotation id="A${index + 1}">`;
    content += escapeAnnotationText(text.slice(annotation.start, annotation.end));
    content += "</reader-annotation>";
    cursor = annotation.end;
  });
  content += escapeAnnotationText(text.slice(cursor, bounds.end));
  return `<reading-segment>${content}</reading-segment>`;
}

export function hasAnnotationOverlap(
  annotations: readonly AnnotationRange[],
  candidate: TextRange
) {
  return annotations.some(
    (annotation) => candidate.start < annotation.end && candidate.end > annotation.start
  );
}

export function annotationRevision(annotations: readonly AnnotationRange[]) {
  return JSON.stringify(
    [...annotations]
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map(({ id, start, end, text }) => [id, start, end, text])
  );
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

export function annotationRangeFromSelection(
  root: HTMLElement,
  selection: Selection | null
) {
  if (!selection || selection.isCollapsed || !selection.anchorNode ||
    !selection.focusNode || !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)) return null;
  const anchor = textOffsetForDomPoint(
    root,
    selection.anchorNode,
    selection.anchorOffset
  );
  const focus = textOffsetForDomPoint(
    root,
    selection.focusNode,
    selection.focusOffset
  );
  if (anchor === null || focus === null || anchor === focus) return null;
  const text = root.textContent ?? "";
  const bounds = trimmedRange(text, {
    start: Math.min(anchor, focus),
    end: Math.max(anchor, focus)
  });
  if (bounds.start === bounds.end) return null;
  return {
    ...bounds,
    text: text.slice(bounds.start, bounds.end)
  };
}

export function renderAnnotationHighlights(
  root: HTMLElement,
  annotations: readonly AnnotationRange[]
) {
  for (const highlight of Array.from(
    root.querySelectorAll("mark[data-annotation-id]")
  )) {
    highlight.replaceWith(...Array.from(highlight.childNodes));
  }
  root.normalize();
  const ordered = [...annotations].sort(
    (left, right) => right.start - left.start || right.end - left.end
  );
  for (const annotation of ordered) {
    let offset = 0;
    const targets = textNodes(root).flatMap((node) => {
      const nodeStart = offset;
      const nodeEnd = nodeStart + node.data.length;
      offset = nodeEnd;
      const start = Math.max(annotation.start, nodeStart);
      const end = Math.min(annotation.end, nodeEnd);
      return start < end
        ? [{ node, start: start - nodeStart, end: end - nodeStart }]
        : [];
    });
    for (const target of targets.reverse()) {
      const range = root.ownerDocument.createRange();
      range.setStart(target.node, target.start);
      range.setEnd(target.node, target.end);
      const mark = root.ownerDocument.createElement("mark");
      mark.className = "reader-annotation-highlight";
      mark.dataset.annotationId = annotation.id;
      range.surroundContents(mark);
    }
  }
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
  let lastReadableNode: Text | undefined;
  for (const node of nodes) {
    if (node.data.length === 0) continue;
    lastReadableNode = node;
    if (edge === "before" && remaining === node.data.length) {
      remaining = 0;
      continue;
    }
    if (remaining <= node.data.length) {
      const range = root.ownerDocument.createRange();
      if (edge === "after") {
        const end = Math.min(node.data.length, remaining || 1);
        range.setStart(node, Math.max(0, end - 1));
        range.setEnd(node, end);
      } else {
        range.setStart(node, remaining);
        range.setEnd(node, Math.min(node.data.length, remaining + 1));
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
  if (edge === "before" && lastReadableNode) {
    const range = root.ownerDocument.createRange();
    range.setStart(lastReadableNode, lastReadableNode.data.length - 1);
    range.setEnd(lastReadableNode, lastReadableNode.data.length);
    const rectangle = typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : null;
    const rootRectangle = root.getBoundingClientRect();
    return rectangle?.top === undefined
      ? 0
      : Math.max(0, rectangle.top - rootRectangle.top);
  }
  return 0;
}
