import type {
  SentencePracticeExample,
  SentencePracticeFeedback,
  SentencePracticeIssue,
  SentencePracticeItem
} from "../shared/sentence-practice-contracts";

export type SentencePracticeResult =
  | { status: "needs-revision"; issues: SentencePracticeIssue[] }
  | { status: "completed"; feedback: SentencePracticeFeedback };

const issueKinds = new Set(["missing", "wrong-sense", "unnatural-form"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function containsExactUsage(text: string, usage: string) {
  const normalizedText = text.toLowerCase();
  const normalizedUsage = usage.toLowerCase();
  let start = normalizedText.indexOf(normalizedUsage);
  while (start >= 0) {
    const before = text[start - 1] ?? "";
    const after = text[start + usage.length] ?? "";
    if (!/[\p{L}\p{N}_]/u.test(before) &&
      !/[\p{L}\p{N}_]/u.test(after)) {
      return true;
    }
    start = normalizedText.indexOf(normalizedUsage, start + normalizedUsage.length);
  }
  return false;
}

function fencedResult(source: string): unknown {
  const matches = [...source.matchAll(
    /```sentence-practice-result\s*\n([\s\S]*?)\n```/g
  )];
  if (matches.length !== 1) throw new Error("Invalid AI sentence-practice result");
  try {
    return JSON.parse(matches[0][1]);
  } catch {
    throw new Error("Invalid AI sentence-practice result JSON");
  }
}

function fencedExamples(source: string): unknown {
  const matches = [...source.matchAll(
    /```sentence-practice-examples\s*\n([\s\S]*?)\n```/g
  )];
  if (matches.length !== 1) {
    throw new Error("Invalid AI sentence-practice examples result");
  }
  try {
    return JSON.parse(matches[0][1]);
  } catch {
    throw new Error("Invalid AI sentence-practice examples JSON");
  }
}

function parseExampleUsages(
  value: unknown,
  items: SentencePracticeItem[],
  itemsById: Map<string, SentencePracticeItem>
) {
  if (!Array.isArray(value) || value.length !== items.length) {
    throw new Error("AI sentence-practice example is outside this session scope");
  }
  const seen = new Set<string>();
  const usages = value.map((usage) => {
    if (!isObject(usage) || !nonEmpty(usage.itemId) ||
      !nonEmpty(usage.title) || !nonEmpty(usage.usage)) {
      throw new Error("Invalid AI sentence-practice example usage");
    }
    const item = itemsById.get(usage.itemId);
    if (!item || item.title !== usage.title || seen.has(usage.itemId)) {
      throw new Error(
        "AI sentence-practice example usage is outside this session scope"
      );
    }
    seen.add(usage.itemId);
    return {
      itemId: usage.itemId,
      title: usage.title,
      usage: usage.usage.trim()
    };
  });
  if (seen.size !== items.length) {
    throw new Error("AI sentence-practice example is outside this session scope");
  }
  return usages;
}

export function parseSentencePracticeExamples(
  source: string,
  sessionId: string,
  items: SentencePracticeItem[]
): SentencePracticeExample[] {
  const value = fencedExamples(source);
  if (!isObject(value) || value.sessionId !== sessionId ||
    !Array.isArray(value.examples) || value.examples.length !== 3) {
    throw new Error("AI must return exactly three sentence-practice examples");
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const seenTexts = new Set<string>();
  return value.examples.map((example) => {
    if (!isObject(example) || !nonEmpty(example.text)) {
      throw new Error("Invalid AI sentence-practice example");
    }
    const normalizedText = example.text.trim().replace(/\s+/g, " ")
      .toLowerCase();
    if (seenTexts.has(normalizedText)) {
      throw new Error("AI sentence-practice examples must be different");
    }
    seenTexts.add(normalizedText);
    const text = example.text.trim();
    const usages = parseExampleUsages(example.usages, items, itemsById);
    if (usages.some(({ usage }) => !containsExactUsage(text, usage))) {
      throw new Error(
        "AI sentence-practice example usages must quote text from the example"
      );
    }
    return { text, usages };
  });
}

function parseRevision(
  value: Record<string, unknown>,
  itemsById: Map<string, SentencePracticeItem>
): SentencePracticeResult {
  if (!Array.isArray(value.issues) || value.issues.length === 0 ||
    "revisedText" in value || "changes" in value || "usages" in value) {
    throw new Error("Invalid AI sentence-practice revision result");
  }
  const seen = new Set<string>();
  const issues = value.issues.map((issue): SentencePracticeIssue => {
    if (!isObject(issue) || !nonEmpty(issue.itemId) ||
      !nonEmpty(issue.title) || !issueKinds.has(issue.kind as string) ||
      !nonEmpty(issue.message)) {
      throw new Error("Invalid AI sentence-practice issue");
    }
    const item = itemsById.get(issue.itemId);
    if (!item || item.title !== issue.title || seen.has(issue.itemId)) {
      throw new Error("AI sentence-practice issue is outside this session");
    }
    seen.add(issue.itemId);
    return {
      itemId: issue.itemId,
      title: issue.title,
      kind: issue.kind as SentencePracticeIssue["kind"],
      message: issue.message
    };
  });
  return { status: "needs-revision", issues };
}

function parsePairs(
  value: unknown,
  label: string
): Array<{ original: string; revised: string; explanation: string }> {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid AI sentence-practice ${label}`);
  }
  return value.map((entry) => {
    if (!isObject(entry) || !nonEmpty(entry.original) ||
      !nonEmpty(entry.revised) || !nonEmpty(entry.explanation)) {
      throw new Error(`Invalid AI sentence-practice ${label}`);
    }
    return {
      original: entry.original,
      revised: entry.revised,
      explanation: entry.explanation
    };
  });
}

function parseCompleted(
  value: Record<string, unknown>,
  items: SentencePracticeItem[],
  itemsById: Map<string, SentencePracticeItem>
): SentencePracticeResult {
  if (!nonEmpty(value.revisedText) || !Array.isArray(value.usages) ||
    value.usages.length !== items.length || "issues" in value) {
    throw new Error("AI feedback does not cover the full practice scope");
  }
  const changes = parsePairs(value.changes, "changes");
  if (!Array.isArray(value.conversationalSuggestions)) {
    throw new Error("Invalid AI sentence-practice conversational suggestions");
  }
  const conversationalSuggestions = value.conversationalSuggestions.map(
    (entry) => {
      if (!isObject(entry) || !nonEmpty(entry.original) ||
        !nonEmpty(entry.suggested) || !nonEmpty(entry.explanation)) {
        throw new Error(
          "Invalid AI sentence-practice conversational suggestions"
        );
      }
      return {
        original: entry.original,
        suggested: entry.suggested,
        explanation: entry.explanation
      };
    }
  );
  const seen = new Set<string>();
  const usages = value.usages.map((usage) => {
    if (!isObject(usage) || !nonEmpty(usage.itemId) ||
      !nonEmpty(usage.title) || !nonEmpty(usage.usage)) {
      throw new Error("Invalid AI sentence-practice usage");
    }
    const item = itemsById.get(usage.itemId);
    if (!item || item.title !== usage.title || seen.has(usage.itemId)) {
      throw new Error("AI sentence-practice usage is outside this session");
    }
    seen.add(usage.itemId);
    return {
      itemId: usage.itemId,
      title: usage.title,
      usage: usage.usage
    };
  });
  if (seen.size !== items.length) {
    throw new Error("AI feedback does not cover the full practice scope");
  }
  return {
    status: "completed",
    feedback: {
      revisedText: value.revisedText,
      changes,
      conversationalSuggestions,
      usages
    }
  };
}

export function parseSentencePracticeResult(
  source: string,
  sessionId: string,
  items: SentencePracticeItem[]
): SentencePracticeResult {
  const value = fencedResult(source);
  if (!isObject(value) || value.sessionId !== sessionId ||
    (value.status !== "needs-revision" && value.status !== "completed")) {
    throw new Error("Invalid AI sentence-practice result scope");
  }
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return value.status === "needs-revision"
    ? parseRevision(value, itemsById)
    : parseCompleted(value, items, itemsById);
}
