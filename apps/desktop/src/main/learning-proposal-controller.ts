import type { CodexAppServerClient, CodexNotification } from "./codex-app-server-client";
import { LocalLearningLibrary } from "./learning-library-service";
import type { LearningItem, LearningItemType } from "../shared/learning-contracts";

type ExplanationLanguage = "source" | "zh-TW" | "en" | "ja";
type ProposalAction = "create" | "update" | "unchanged" | "create-distinct-sense";
type CandidateField = "displayForm" | "canonicalForm" | "itemType" | "partOfSpeech" | "contextualMeaning" | "conciseExplanation" | "cefr" | "pronunciation" | "collocationNotes";

export interface GenerateLearningCardsInput {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  readingSegment: string;
  explanationLanguage: ExplanationLanguage;
  sources: Array<{ annotationId: string; annotationText: string; startOffset: number; endOffset: number; sourceSentence: string }>;
}

interface Candidate {
  annotationId: string; displayForm: string; canonicalForm: string; itemType: LearningItemType;
  aliases: string[]; partOfSpeech: string | null; contextualMeaning: string; conciseExplanation: string;
  cefr: string | null; pronunciation: string | null; collocationNotes: string | null;
}

export interface LearningCardProposal {
  action: ProposalAction;
  source: GenerateLearningCardsInput["sources"][number];
  candidate: Candidate;
  existingItem: LearningItem | null;
  fieldDiffs: Array<{ field: CandidateField; from: string | null; to: string | null }>;
}

const candidateFields: CandidateField[] = ["displayForm", "canonicalForm", "itemType", "partOfSpeech", "contextualMeaning", "conciseExplanation", "cefr", "pronunciation", "collocationNotes"];
const isolationConfig = Object.freeze({ "skills.include_instructions": false, "skills.bundled.enabled": false, "features.plugins": false, "features.apps": false, "features.memories": false, web_search: "disabled" });
const structuredTurnTimeoutMs = 120_000;

interface WaitingTurn {
  resolve(text: string): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 提案 schema 格式錯誤。");
  return value as Record<string, unknown>;
}
function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI 提案缺少${label}。`);
  return value.trim();
}
function nullable(value: unknown, label: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, label);
}
function typeOf(value: unknown): LearningItemType {
  if (value !== "word" && value !== "phrase") throw new Error("AI 提案類型無效。");
  return value;
}
function parseCandidate(value: unknown, sources: Map<string, GenerateLearningCardsInput["sources"][number]>): Candidate {
  const entry = record(value); const annotationId = nonEmpty(entry.annotationId, "annotationId");
  if (!sources.has(annotationId)) throw new Error("AI 提案引用區段外來源。");
  if (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== "string" || !alias.trim())) throw new Error("AI 提案 aliases 無效。");
  return { annotationId, displayForm: nonEmpty(entry.displayForm, "displayForm"), canonicalForm: nonEmpty(entry.canonicalForm, "canonicalForm"), itemType: typeOf(entry.itemType), aliases: [...new Set(entry.aliases.map((alias) => alias.trim()))], partOfSpeech: nullable(entry.partOfSpeech, "partOfSpeech"), contextualMeaning: nonEmpty(entry.contextualMeaning, "contextualMeaning"), conciseExplanation: nonEmpty(entry.conciseExplanation, "conciseExplanation"), cefr: nullable(entry.cefr, "cefr"), pronunciation: nullable(entry.pronunciation, "pronunciation"), collocationNotes: nullable(entry.collocationNotes, "collocationNotes") };
}
function parseJson(text: string): Record<string, unknown> { try { return record(JSON.parse(text)); } catch { throw new Error("AI 提案不是有效 JSON。"); } }
function schema(properties: Record<string, unknown>, required: string[]) { return { type: "object", additionalProperties: false, required, properties }; }
const candidateSchema = schema({
  candidates: { type: "array", items: schema({
    annotationId: { type: "string" }, displayForm: { type: "string" }, canonicalForm: { type: "string" }, itemType: { enum: ["word", "phrase"] }, aliases: { type: "array", items: { type: "string" } }, partOfSpeech: { type: ["string", "null"] }, contextualMeaning: { type: "string" }, conciseExplanation: { type: "string" }, cefr: { type: ["string", "null"] }, pronunciation: { type: ["string", "null"] }, collocationNotes: { type: ["string", "null"] }
  }, ["annotationId", "displayForm", "canonicalForm", "itemType", "aliases", "partOfSpeech", "contextualMeaning", "conciseExplanation", "cefr", "pronunciation", "collocationNotes"]) }
}, ["candidates"]);
const proposalSchema = schema({
  proposals: { type: "array", items: schema({ annotationId: { type: "string" }, action: { enum: ["create", "update", "unchanged", "create-distinct-sense"] }, existingItemId: { type: ["string", "null"] } }, ["annotationId", "action", "existingItemId"]) }
}, ["proposals"]);

export class LearningProposalController {
  constructor(private readonly options: { createClient(): CodexAppServerClient; library: LocalLearningLibrary; workingDirectory: string; skillPath: string; skillInstructions: string }) {}
  close() {}

  async generate(input: GenerateLearningCardsInput): Promise<{ proposals: LearningCardProposal[] }> {
    if (!input.readingSegment.trim() || !input.sources.length) throw new Error("需要非空閱讀區段與單字或片語標記。");
    const sources = new Map(input.sources.map((source) => [source.annotationId, source]));
    if (sources.size !== input.sources.length || input.sources.some((source) => !source.annotationText.trim() || /[.!?]$/u.test(source.annotationText.trim()) || source.annotationText.split(/\s+/u).length > 6)) throw new Error("沒有可接受的單字或片語標記。");
    const client = this.options.createClient();
    const completed = new Map<string, string>();
    const waiting = new Map<string, WaitingTurn>();
    const unsubscribe = client.onNotification((event) => this.#capture(event, completed, waiting));
    try {
      await client.initialize({ name: "lingoshelf-learning-proposals", title: "LingoShelf Learning Proposals", version: "1.0.0" });
      const started = await client.request("thread/start", { cwd: this.options.workingDirectory, approvalPolicy: "never", sandbox: "read-only", environments: [], dynamicTools: [], selectedCapabilityRoots: [], ephemeral: true, config: isolationConfig, developerInstructions: ["Generate structured learning-card proposals only.", "Do not use tools, files, network, databases, or skills other than the fixed App-provided skill.", this.options.skillInstructions].join("\n") });
      const threadId = record(started).thread && record(record(started).thread).id;
      if (typeof threadId !== "string") throw new Error("Codex 未回傳背景 workflow thread。");
      const candidatesText = await this.#runTurn(client, threadId, [{ type: "text", text: JSON.stringify({ task: "classify word-or-phrase annotations", explanationLanguage: input.explanationLanguage, readingSegment: input.readingSegment, sources: input.sources.map(({ annotationId, annotationText, sourceSentence }) => ({ annotationId, annotationText, sourceSentence })) }), text_elements: [] }, { type: "skill", name: "generate-learning-cards", path: this.options.skillPath }], candidateSchema, completed, waiting);
      const parsedCandidates = parseJson(candidatesText).candidates;
      if (!Array.isArray(parsedCandidates)) throw new Error("AI 提案缺少 candidates。");
      const candidates = parsedCandidates.map((candidate) => parseCandidate(candidate, sources));
      if (!candidates.length || new Set(candidates.map((candidate) => candidate.annotationId)).size !== candidates.length) throw new Error("AI 提案候選無效。");
      const choices = await Promise.all(candidates.map(async (candidate) => ({ candidate, items: await this.options.library.findProposalCandidates({ bookId: input.bookId, chapterId: input.chapterId, annotationId: candidate.annotationId, canonicalForm: candidate.canonicalForm, itemType: candidate.itemType, aliases: candidate.aliases, limit: 6 }) })));
      const proposalText = await this.#runTurn(client, threadId, [{ type: "text", text: JSON.stringify({ task: "choose only one allowed review action for every candidate", explanationLanguage: input.explanationLanguage, candidates: choices.map(({ candidate, items }) => ({ candidate, existingCandidates: items.map((item) => ({ id: item.id, displayForm: item.displayForm, canonicalForm: item.canonicalForm, itemType: item.itemType, partOfSpeech: item.partOfSpeech, contextualMeaning: item.contextualMeaning, conciseExplanation: item.conciseExplanation, cefr: item.cefr, pronunciation: item.pronunciation, collocationNotes: item.collocationNotes, sources: item.sources.map((source) => ({ annotationId: source.annotationId, bookId: source.bookId, chapterId: source.chapterId })) })) })) }), text_elements: [] }], proposalSchema, completed, waiting);
      const rawProposals = parseJson(proposalText).proposals;
      if (!Array.isArray(rawProposals) || rawProposals.length !== candidates.length) throw new Error("AI 提案數量無效。");
      const bySource = new Map(choices.map((choice) => [choice.candidate.annotationId, choice]));
      return { proposals: rawProposals.map((raw) => this.#proposal(raw, bySource, sources)) };
    } finally { unsubscribe(); client.close(); }
  }

  async #runTurn(client: CodexAppServerClient, threadId: string, input: Array<Record<string, unknown>>, outputSchema: Record<string, unknown>, completed: Map<string, string>, waiting: Map<string, WaitingTurn>) {
    const response = await client.request("turn/start", { threadId, input, outputSchema });
    const turn = record(response).turn; const turnId = turn && record(turn).id;
    if (typeof turnId !== "string") throw new Error("Codex 未回傳結構化 turn。");
    return this.#waitForTurn(client, threadId, turnId, completed, waiting);
  }
  #waitForTurn(client: CodexAppServerClient, threadId: string, turnId: string, completed: Map<string, string>, waiting: Map<string, WaitingTurn>) {
    const result = completed.get(turnId);
    if (result !== undefined) return Promise.resolve(result);
    return new Promise<string>((resolve, reject) => {
      const settle = (callback: (value: string) => void, value: string) => {
        const waiter = waiting.get(turnId);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        waiting.delete(turnId);
        callback(value);
      };
      const timer = setTimeout(() => {
        const waiter = waiting.get(turnId);
        if (!waiter) return;
        waiting.delete(turnId);
        void client.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
        waiter.reject(new Error("等待 Codex 結構化提案逾時。"));
      }, structuredTurnTimeoutMs);
      waiting.set(turnId, {
        timer,
        resolve: (text) => settle(resolve, text),
        reject: (error) => {
          clearTimeout(timer);
          waiting.delete(turnId);
          reject(error);
        }
      });
    });
  }
  #capture(event: CodexNotification, completed: Map<string, string>, waiting: Map<string, WaitingTurn>) {
    const params = event.params;
    if (!params || typeof params !== "object") return;
    if (event.method === "item/completed") {
      const value = params as { turnId?: unknown; item?: { type?: unknown; text?: unknown } };
      if (typeof value.turnId === "string" && value.item?.type === "agentMessage" && typeof value.item.text === "string") {
        completed.set(value.turnId, value.item.text);
        waiting.get(value.turnId)?.resolve(value.item.text);
      }
      return;
    }
    if (event.method === "turn/completed") {
      const value = params as { turn?: { id?: unknown; status?: unknown; error?: unknown } };
      if (typeof value.turn?.id === "string" && value.turn.status !== "completed") {
        waiting.get(value.turn.id)?.reject(new Error(typeof value.turn.error === "string" ? value.turn.error : "Codex 結構化提案未完成。"));
      }
    }
  }
  #proposal(raw: unknown, choices: Map<string, { candidate: Candidate; items: LearningItem[] }>, sources: Map<string, GenerateLearningCardsInput["sources"][number]>): LearningCardProposal {
    const entry = record(raw); const annotationId = nonEmpty(entry.annotationId, "annotationId"); const choice = choices.get(annotationId); const source = sources.get(annotationId); if (!choice || !source) throw new Error("AI 提案引用區段外來源。");
    const action = entry.action; if (action !== "create" && action !== "update" && action !== "unchanged" && action !== "create-distinct-sense") throw new Error("AI 提案 action 無效。");
    const itemId = entry.existingItemId; if (itemId !== null && typeof itemId !== "string") throw new Error("AI 提案缺少 existingItemId。");
    const existingItem = itemId === null ? null : choice.items.find((item) => item.id === itemId) ?? null;
    if ((action === "update" || action === "unchanged") && !existingItem) throw new Error("AI 提案引用未知項目。");
    if ((action === "create" || action === "create-distinct-sense") && itemId !== null) throw new Error("AI 提案 create 不可指定既有項目。");
    const fieldDiffs = candidateFields.map((field) => ({ field, from: existingItem ? existingItem[field] : null, to: choice.candidate[field] })).filter((diff) => diff.from !== diff.to);
    return { action, source, candidate: choice.candidate, existingItem, fieldDiffs };
  }
}
