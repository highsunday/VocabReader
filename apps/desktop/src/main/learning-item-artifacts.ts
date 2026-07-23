import { randomUUID } from "node:crypto";
import type {
  CefrLevel,
  LearningItemDraft,
  LearningItemDraftBatch,
  LearningItemMatch,
  LearningItemType
} from "../shared/learning-contracts";
import type { LearningItemTarget } from "../shared/chat-contracts";

interface ParsedLearningItemArtifacts {
  text: string;
  batch?: LearningItemDraftBatch;
  invitation?: { targets: LearningItemTarget[] };
  error?: string;
}

export interface LearningItemRecheckDecision {
  draftId: string;
  decision: "create" | "existing" | "trashed";
  itemId?: string;
}

const itemTypes = new Set<LearningItemType>(["word", "phrase"]);
const cefrLevels = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("學習項目草稿格式錯誤");
  }
  return value.trim();
}

function draftFromUnknown(
  value: unknown,
  createId: () => string
): LearningItemDraft {
  if (!isObject(value) || !itemTypes.has(value.itemType as LearningItemType) ||
    !cefrLevels.has(value.cefr as CefrLevel)) {
    throw new Error("學習項目草稿格式錯誤");
  }
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    title: requiredString(value.title),
    itemType: value.itemType as LearningItemType,
    cefr: value.cefr as CefrLevel,
    sense: requiredString(value.sense),
    markdownContent: requiredString(value.markdownContent),
    state: value.state === undefined
      ? "included"
      : value.state === "included" || value.state === "excluded"
        ? value.state
        : (() => {
            throw new Error("學習項目草稿格式錯誤");
          })()
  };
}

function matchFromUnknown(
  value: unknown,
  expectedStatus: "active" | "trashed"
): LearningItemMatch {
  if (!isObject(value) || value.status !== expectedStatus) {
    throw new Error("學習項目草稿格式錯誤");
  }
  return {
    itemId: requiredString(value.itemId),
    title: requiredString(value.title),
    sense: requiredString(value.sense),
    status: expectedStatus
  };
}

export function learningItemBatchFromUnknown(
  value: unknown,
  createId: () => string = randomUUID
): LearningItemDraftBatch {
  if (!isObject(value) || !Array.isArray(value.drafts) ||
    !Array.isArray(value.existing) || !Array.isArray(value.trashed)) {
    throw new Error("學習項目草稿格式錯誤");
  }
  const status = value.status === undefined
    ? "pending"
    : value.status === "pending" || value.status === "submitted"
      ? value.status
      : (() => {
          throw new Error("學習項目草稿格式錯誤");
        })();
  const batch: LearningItemDraftBatch = {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    status,
    drafts: value.drafts.map((draft) => draftFromUnknown(draft, createId)),
    existing: value.existing.map((match) => matchFromUnknown(match, "active")),
    trashed: value.trashed.map((match) => matchFromUnknown(match, "trashed"))
  };
  if (value.submittedAt !== undefined) {
    if (typeof value.submittedAt !== "number" ||
      !Number.isFinite(value.submittedAt)) {
      throw new Error("學習項目草稿格式錯誤");
    }
    batch.submittedAt = value.submittedAt;
  }
  if (value.createdItemIds !== undefined) {
    if (!Array.isArray(value.createdItemIds) ||
      !value.createdItemIds.every((id) => typeof id === "string" && id)) {
      throw new Error("學習項目草稿格式錯誤");
    }
    batch.createdItemIds = [...value.createdItemIds];
  }
  return batch;
}

export function learningItemInvitationFromUnknown(
  value: unknown
): { targets: LearningItemTarget[] } {
  if (!isObject(value) || !Array.isArray(value.targets)) {
    throw new Error("加入生詞庫邀請格式錯誤");
  }
  return {
    targets: value.targets.map((target) => {
      if (!isObject(target)) throw new Error("加入生詞庫邀請格式錯誤");
      const title = requiredString(target.title);
      if (target.senseHint !== undefined &&
        typeof target.senseHint !== "string") {
        throw new Error("加入生詞庫邀請格式錯誤");
      }
      return {
        title,
        ...(typeof target.senseHint === "string" && target.senseHint.trim()
          ? { senseHint: target.senseHint.trim() }
          : {})
      };
    })
  };
}

function blockPattern(name: string): RegExp {
  return new RegExp("```" + name + "\\s*\\n([\\s\\S]*?)\\n```", "g");
}

function extractSingleBlock(text: string, name: string) {
  const matches = [...text.matchAll(blockPattern(name))];
  return {
    raw: matches.length === 1 ? matches[0]?.[1] : undefined,
    count: matches.length
  };
}

export function parseLearningItemArtifacts(
  sourceText: string,
  createId: () => string = randomUUID
): ParsedLearningItemArtifacts {
  const resultBlock = extractSingleBlock(sourceText, "learning-item-result");
  const invitationBlock = extractSingleBlock(
    sourceText,
    "learning-item-invitation"
  );
  const text = sourceText
    .replace(blockPattern("learning-item-result"), "")
    .replace(blockPattern("learning-item-invitation"), "")
    .trim();
  const parsed: ParsedLearningItemArtifacts = { text };

  try {
    if (resultBlock.count > 1 || invitationBlock.count > 1) {
      throw new Error("學習項目草稿格式錯誤");
    }
    if (resultBlock.raw !== undefined) {
      parsed.batch = learningItemBatchFromUnknown(
        JSON.parse(resultBlock.raw),
        createId
      );
    }
    if (invitationBlock.raw !== undefined) {
      parsed.invitation = learningItemInvitationFromUnknown(
        JSON.parse(invitationBlock.raw)
      );
    }
  } catch (error) {
    parsed.batch = undefined;
    parsed.invitation = undefined;
    parsed.error = error instanceof Error
      ? error.message
      : "學習項目草稿格式錯誤";
  }
  return parsed;
}

export function parseLearningItemRecheck(
  sourceText: string
): LearningItemRecheckDecision[] {
  const block = extractSingleBlock(sourceText, "learning-item-recheck");
  try {
    if (block.count !== 1 || block.raw === undefined) {
      throw new Error("學習項目重新檢查格式錯誤");
    }
    const value: unknown = JSON.parse(block.raw);
    if (!isObject(value) || !Array.isArray(value.decisions)) {
      throw new Error("學習項目重新檢查格式錯誤");
    }
    const draftIds = new Set<string>();
    return value.decisions.map((candidate) => {
      if (!isObject(candidate)) {
        throw new Error("學習項目重新檢查格式錯誤");
      }
      const draftId = requiredString(candidate.draftId);
      if (draftIds.has(draftId)) {
        throw new Error("學習項目重新檢查格式錯誤");
      }
      draftIds.add(draftId);
      if (candidate.decision === "create") {
        if (candidate.itemId !== undefined) {
          throw new Error("學習項目重新檢查格式錯誤");
        }
        return { draftId, decision: "create" };
      }
      if (candidate.decision !== "existing" &&
        candidate.decision !== "trashed") {
        throw new Error("學習項目重新檢查格式錯誤");
      }
      return {
        draftId,
        decision: candidate.decision,
        itemId: requiredString(candidate.itemId)
      };
    });
  } catch {
    throw new Error("學習項目重新檢查格式錯誤");
  }
}
