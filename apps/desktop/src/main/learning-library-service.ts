import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ApplyLearningProposalBatchInput,
  ApplyLearningProposalBatchResult,
  CreateLearningDraftInput,
  LearningItem,
  LearningItemSource,
  LearningListStatus,
  LearningItemType,
  LearningProposalAction,
  LearningProposalCandidate,
  LearningProposalField,
  LearningProposalSource,
  UpdateLearningItemInput
} from "../shared/learning-contracts";

interface LearningLibraryOptions {
  isBookAvailable?: (bookId: string) => Promise<boolean>;
}

interface ItemRow {
  id: string;
  display_form: string;
  canonical_form: string;
  item_type: LearningItemType;
  part_of_speech: string | null;
  contextual_meaning: string;
  concise_explanation: string;
  cefr: string | null;
  pronunciation: string | null;
  collocation_notes: string | null;
  status: "pending_ai" | "archived";
  version: number;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  item_id: string;
  book_id: string;
  book_title: string;
  chapter_id: string;
  chapter_title: string;
  annotation_id: string;
  annotation_text: string;
  start_offset: number;
  end_offset: number;
  source_sentence: string;
  created_at: string;
}

function normalized(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase();
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}格式錯誤`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label}格式錯誤`);
  const text = value.trim();
  return text || null;
}

const proposalFields: LearningProposalField[] = [
  "displayForm", "canonicalForm", "itemType", "partOfSpeech", "contextualMeaning",
  "conciseExplanation", "cefr", "pronunciation", "collocationNotes"
];
const fieldColumns: Record<LearningProposalField, string> = {
  displayForm: "display_form",
  canonicalForm: "canonical_form",
  itemType: "item_type",
  partOfSpeech: "part_of_speech",
  contextualMeaning: "contextual_meaning",
  conciseExplanation: "concise_explanation",
  cefr: "cefr",
  pronunciation: "pronunciation",
  collocationNotes: "collocation_notes"
};
const rowFields: Record<LearningProposalField, keyof ItemRow> = {
  displayForm: "display_form",
  canonicalForm: "canonical_form",
  itemType: "item_type",
  partOfSpeech: "part_of_speech",
  contextualMeaning: "contextual_meaning",
  conciseExplanation: "concise_explanation",
  cefr: "cefr",
  pronunciation: "pronunciation",
  collocationNotes: "collocation_notes"
};

function proposalAction(value: unknown): LearningProposalAction {
  if (value === "create" || value === "update" || value === "unchanged" ||
    value === "create-distinct-sense") return value;
  throw new Error("學習卡套用 action 無效");
}

function proposalCandidate(value: unknown): LearningProposalCandidate {
  if (!value || typeof value !== "object") throw new Error("學習卡候選格式錯誤");
  const candidate = value as Partial<LearningProposalCandidate>;
  if (candidate.itemType !== "word" && candidate.itemType !== "phrase") {
    throw new Error("學習卡候選類型格式錯誤");
  }
  if (!Array.isArray(candidate.aliases) || candidate.aliases.some((alias) =>
    typeof alias !== "string" || !alias.trim())) {
    throw new Error("學習卡候選 aliases 格式錯誤");
  }
  return {
    displayForm: requiredText(candidate.displayForm, "顯示詞形"),
    canonicalForm: normalized(requiredText(candidate.canonicalForm, "Canonical form")),
    itemType: candidate.itemType,
    aliases: [...new Set(candidate.aliases.map((alias) => normalized(alias)).filter(Boolean))],
    partOfSpeech: optionalText(candidate.partOfSpeech, "詞性"),
    contextualMeaning: requiredText(candidate.contextualMeaning, "本文語義"),
    conciseExplanation: requiredText(candidate.conciseExplanation, "簡明解釋"),
    cefr: optionalText(candidate.cefr, "CEFR"),
    pronunciation: optionalText(candidate.pronunciation, "發音"),
    collocationNotes: optionalText(candidate.collocationNotes, "搭配筆記")
  };
}

function proposalSource(value: unknown): LearningProposalSource {
  if (!value || typeof value !== "object") throw new Error("學習卡來源格式錯誤");
  const source = value as Partial<LearningProposalSource>;
  const startOffset = source.startOffset;
  const endOffset = source.endOffset;
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) ||
    (startOffset as number) < 0 || (endOffset as number) <= (startOffset as number)) {
    throw new Error("學習卡來源位置格式錯誤");
  }
  return {
    bookId: requiredText(source.bookId, "來源書籍"),
    bookTitle: requiredText(source.bookTitle, "來源書名"),
    chapterId: requiredText(source.chapterId, "來源章節"),
    chapterTitle: requiredText(source.chapterTitle, "來源章節名"),
    annotationId: requiredText(source.annotationId, "來源標記"),
    annotationText: requiredText(source.annotationText, "來源標記文字"),
    startOffset: startOffset as number,
    endOffset: endOffset as number,
    sourceSentence: requiredText(source.sourceSentence, "來源原句")
  };
}

export class LocalLearningLibrary {
  #database: DatabaseSync | undefined;

  constructor(
    private readonly databasePath: string,
    private readonly options: LearningLibraryOptions = {}
  ) {}

  #open(): DatabaseSync {
    if (this.#database) return this.#database;
    mkdirSync(dirname(this.databasePath), { recursive: true });
    const database = new DatabaseSync(this.databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning_items (
          id TEXT PRIMARY KEY,
          display_form TEXT NOT NULL,
          canonical_form TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('word', 'phrase')),
          part_of_speech TEXT,
          contextual_meaning TEXT NOT NULL,
          concise_explanation TEXT NOT NULL,
          cefr TEXT,
          pronunciation TEXT,
          collocation_notes TEXT,
          status TEXT NOT NULL CHECK (status IN ('pending_ai', 'archived')),
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning_item_sources (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL REFERENCES learning_items(id),
          book_id TEXT NOT NULL,
          book_title TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          chapter_title TEXT NOT NULL,
          annotation_id TEXT NOT NULL,
          annotation_text TEXT NOT NULL,
          start_offset INTEGER NOT NULL,
          end_offset INTEGER NOT NULL,
          source_sentence TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(book_id, chapter_id, annotation_id)
        );
        CREATE INDEX IF NOT EXISTS learning_item_sources_item_id
          ON learning_item_sources(item_id);
      `);
      database.prepare(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)"
      ).run(1, new Date().toISOString());
      const migrationTwo = database.prepare(
        "SELECT version FROM schema_migrations WHERE version = 2"
      ).get() as { version: number } | undefined;
      if (!migrationTwo) {
        try {
          database.exec(
            "ALTER TABLE learning_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
          );
        } catch (error) {
          if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
            throw error;
          }
        }
        database.exec(`
          CREATE TABLE IF NOT EXISTS learning_proposal_batches (
            batch_id TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            completed_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS learning_proposal_audit (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL REFERENCES learning_proposal_batches(batch_id),
            proposal_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('create', 'update', 'unchanged', 'create-distinct-sense')),
            item_id TEXT,
            source_annotation_id TEXT NOT NULL,
            outcome TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(batch_id, proposal_id)
          );
        `);
        database.prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)"
        ).run(2, new Date().toISOString());
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
    this.#database = database;
    return database;
  }

  async listItems(input: { status: LearningListStatus }): Promise<LearningItem[]> {
    if (input.status !== "active" && input.status !== "archived") {
      throw new Error("生詞庫篩選格式錯誤");
    }
    const status = input.status === "active" ? "pending_ai" : "archived";
    const rows = this.#open().prepare(
      "SELECT * FROM learning_items WHERE status = ? ORDER BY updated_at DESC, id DESC"
    ).all(status) as unknown as ItemRow[];
    return Promise.all(rows.map((row) => this.#toItem(row)));
  }

  async getItem(itemId: string): Promise<LearningItem> {
    const row = this.#open().prepare(
      "SELECT * FROM learning_items WHERE id = ?"
    ).get(requiredText(itemId, "學習項目")) as unknown as ItemRow | undefined;
    if (!row) throw new Error("找不到學習項目");
    return this.#toItem(row);
  }

  async findProposalCandidates(input: {
    bookId: string;
    chapterId: string;
    annotationId: string;
    canonicalForm: string;
    itemType: LearningItemType;
    aliases: string[];
    limit: number;
  }): Promise<LearningItem[]> {
    const limit = Math.max(1, Math.min(6, Math.trunc(input.limit)));
    const canonicalForms = [...new Set([
      normalized(requiredText(input.canonicalForm, "Canonical form")),
      ...input.aliases.map((alias) => normalized(alias)).filter(Boolean)
    ])];
    const placeholders = canonicalForms.map(() => "?").join(", ");
    const rows = this.#open().prepare(`
      SELECT DISTINCT learning_items.* FROM learning_items
      LEFT JOIN learning_item_sources ON learning_item_sources.item_id = learning_items.id
      WHERE (learning_item_sources.book_id = ? AND learning_item_sources.chapter_id = ?
        AND learning_item_sources.annotation_id = ?)
        OR (learning_items.item_type = ? AND learning_items.canonical_form IN (${placeholders}))
      ORDER BY learning_items.updated_at DESC, learning_items.id DESC
      LIMIT ?
    `).all(
      requiredText(input.bookId, "來源書籍"), requiredText(input.chapterId, "來源章節"),
      requiredText(input.annotationId, "來源標記"), input.itemType, ...canonicalForms, limit
    ) as unknown as ItemRow[];
    return Promise.all(rows.map((row) => this.#toItem(row)));
  }

  async createDraft(input: CreateLearningDraftInput): Promise<{ item: LearningItem; created: boolean }> {
    const bookId = requiredText(input.bookId, "來源書籍");
    const chapterId = requiredText(input.chapterId, "來源章節");
    const annotationId = requiredText(input.annotation?.id, "來源標記");
    const annotationText = requiredText(input.annotation?.text, "來源標記文字");
    if (!Number.isInteger(input.annotation?.start) || !Number.isInteger(input.annotation?.end) ||
      input.annotation.start < 0 || input.annotation.end <= input.annotation.start) {
      throw new Error("來源標記位置格式錯誤");
    }
    const database = this.#open();
    const existing = database.prepare(`
      SELECT item_id FROM learning_item_sources
      WHERE book_id = ? AND chapter_id = ? AND annotation_id = ?
    `).get(bookId, chapterId, annotationId) as { item_id: string } | undefined;
    if (existing) return { item: await this.getItem(existing.item_id), created: false };

    const now = new Date().toISOString();
    const itemId = randomUUID();
    const sourceId = randomUUID();
    const itemType: LearningItemType = /\s/.test(annotationText.trim()) ? "phrase" : "word";
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO learning_items (
          id, display_form, canonical_form, item_type, part_of_speech,
          contextual_meaning, concise_explanation, cefr, pronunciation,
          collocation_notes, status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, '', '', NULL, NULL, NULL, 'pending_ai', ?, ?, ?)
      `).run(itemId, annotationText, normalized(annotationText), itemType, 1, now, now);
      database.prepare(`
        INSERT INTO learning_item_sources (
          id, item_id, book_id, book_title, chapter_id, chapter_title, annotation_id,
          annotation_text, start_offset, end_offset, source_sentence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sourceId, itemId, bookId, requiredText(input.bookTitle, "來源書名"), chapterId,
        requiredText(input.chapterTitle, "來源章節名"), annotationId, annotationText,
        input.annotation.start, input.annotation.end,
        requiredText(input.sourceSentence, "來源原句"), now
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { item: await this.getItem(itemId), created: true };
  }

  async updateItem(input: UpdateLearningItemInput): Promise<LearningItem> {
    const itemId = requiredText(input.itemId, "學習項目");
    const displayForm = requiredText(input.displayForm, "顯示詞形");
    const canonicalForm = requiredText(input.canonicalForm, "Canonical form");
    if (input.itemType !== "word" && input.itemType !== "phrase") {
      throw new Error("學習項目類型格式錯誤");
    }
    const database = this.#open();
    const result = database.prepare(`
      UPDATE learning_items SET
        display_form = ?, canonical_form = ?, item_type = ?, part_of_speech = ?,
        contextual_meaning = ?, concise_explanation = ?, cefr = ?, pronunciation = ?,
        collocation_notes = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `).run(
      displayForm, normalized(canonicalForm), input.itemType,
      optionalText(input.partOfSpeech, "詞性"), requiredText(input.contextualMeaning, "本文語義"),
      requiredText(input.conciseExplanation, "簡明解釋"), optionalText(input.cefr, "CEFR"),
      optionalText(input.pronunciation, "發音"), optionalText(input.collocationNotes, "搭配筆記"),
      new Date().toISOString(), itemId
    );
    if (result.changes !== 1) throw new Error("找不到學習項目");
    return this.getItem(itemId);
  }

  async archiveItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "學習項目");
    const result = this.#open().prepare(`
      UPDATE learning_items SET status = 'archived', version = version + 1, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error("找不到學習項目");
    return this.getItem(id);
  }

  async applyProposalBatch(input: ApplyLearningProposalBatchInput): Promise<ApplyLearningProposalBatchResult> {
    const batchId = requiredText(input?.batchId, "學習卡 batch");
    if (!Array.isArray(input?.proposals) || !input.proposals.length) {
      throw new Error("學習卡套用 batch 格式錯誤");
    }
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const database = this.#open();
    database.exec("BEGIN IMMEDIATE");
    try {
      const prior = database.prepare(
        "SELECT request_hash, summary_json FROM learning_proposal_batches WHERE batch_id = ?"
      ).get(batchId) as { request_hash: string; summary_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new Error("學習卡 batch 重放內容不一致");
        const summary = JSON.parse(prior.summary_json) as ApplyLearningProposalBatchResult;
        database.exec("COMMIT");
        return summary;
      }

      const proposalIds = new Set<string>();
      const validated = input.proposals.map((proposal) => {
        if (!proposal || typeof proposal !== "object") throw new Error("學習卡套用提案格式錯誤");
        const proposalId = requiredText(proposal.proposalId, "學習卡提案");
        if (proposalIds.has(proposalId)) throw new Error("學習卡提案重複");
        proposalIds.add(proposalId);
        if (typeof proposal.selected !== "boolean") throw new Error("學習卡選取格式錯誤");
        const action = proposalAction(proposal.action);
        const source = proposalSource(proposal.source);
        const candidate = proposalCandidate(proposal.candidate);
        if (!Array.isArray(proposal.confirmedFields) || proposal.confirmedFields.some((field) =>
          !proposalFields.includes(field)) ||
          new Set(proposal.confirmedFields).size !== proposal.confirmedFields.length) {
          throw new Error("學習卡覆寫確認欄位無效");
        }
        const confirmedFields = proposal.confirmedFields;
        const existingItemId = proposal.existingItemId;
        if (existingItemId !== null && typeof existingItemId !== "string") {
          throw new Error("學習卡目標項目格式錯誤");
        }
        const expectedVersion = proposal.expectedVersion;
        const targetAction = action === "update" || action === "unchanged";
        if (targetAction) {
          if (!existingItemId || !Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) {
            throw new Error("學習卡目標版本格式錯誤");
          }
          if (!this.#candidateIds(database, source, candidate).has(existingItemId)) {
            throw new Error("學習卡目標不在允許候選內");
          }
        } else if (existingItemId !== null || expectedVersion !== null || confirmedFields.length) {
          throw new Error("新增提案不可指定目標或覆寫欄位");
        }
        if (action !== "update" && confirmedFields.length) {
          throw new Error("只有更新提案可確認覆寫欄位");
        }
        const sourceOwner = this.#sourceOwner(database, source);
        if (sourceOwner && sourceOwner !== existingItemId) {
          throw new Error("來源已屬於另一個學習項目");
        }
        const target = existingItemId
          ? database.prepare("SELECT * FROM learning_items WHERE id = ?").get(existingItemId) as ItemRow | undefined
          : undefined;
        if (targetAction && !target) throw new Error("找不到學習卡目標項目");
        const safeExpectedVersion = targetAction ? expectedVersion as number : null;
        if (proposal.selected && target && target.version !== safeExpectedVersion) {
          throw new Error("學習卡已更新，請重新產生提案");
        }
        return { proposalId, selected: proposal.selected, action, source, candidate, existingItemId, target, confirmedFields };
      });

      const summary: ApplyLearningProposalBatchResult = {
        batchId, created: 0, updated: 0, unchanged: 0, cancelled: 0, sourceAppended: 0,
        results: []
      };
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO learning_proposal_batches (batch_id, request_hash, summary_json, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(batchId, requestHash, "{}", now);
      for (const proposal of validated) {
        let itemId: string | null = proposal.existingItemId;
        let sourceAppended = false;
        let contentUpdated = false;
        let outcome: ApplyLearningProposalBatchResult["results"][number]["outcome"];
        if (!proposal.selected) {
          summary.cancelled += 1;
          outcome = "cancelled";
        } else if (proposal.action === "create" || proposal.action === "create-distinct-sense") {
          itemId = randomUUID();
          this.#insertItem(database, itemId, proposal.candidate, now);
          this.#insertSource(database, itemId, proposal.source, now);
          summary.created += 1;
          summary.sourceAppended += 1;
          sourceAppended = true;
          outcome = "created";
        } else {
          if (!proposal.target || !itemId) throw new Error("找不到學習卡目標項目");
          if (proposal.action === "update") {
            contentUpdated = this.#updateConfirmedFields(
              database, proposal.target, proposal.candidate, proposal.confirmedFields, now
            );
            if (contentUpdated) summary.updated += 1;
            else summary.unchanged += 1;
            outcome = contentUpdated ? "updated" : "unchanged";
          } else {
            summary.unchanged += 1;
            outcome = "unchanged";
          }
          sourceAppended = this.#appendSource(database, itemId, proposal.source, now);
          if (sourceAppended) summary.sourceAppended += 1;
        }
        summary.results.push({
          proposalId: proposal.proposalId, action: proposal.action, itemId,
          sourceAppended, contentUpdated, outcome
        });
        database.prepare(`
          INSERT INTO learning_proposal_audit (
            id, batch_id, proposal_id, action, item_id, source_annotation_id, outcome, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), batchId, proposal.proposalId, proposal.action, itemId,
          proposal.source.annotationId, outcome, now
        );
      }
      database.prepare(`
        UPDATE learning_proposal_batches SET summary_json = ? WHERE batch_id = ?
      `).run(JSON.stringify(summary), batchId);
      database.exec("COMMIT");
      return summary;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  #candidateIds(
    database: DatabaseSync, source: LearningProposalSource, candidate: LearningProposalCandidate
  ): Set<string> {
    const forms = [...new Set([candidate.canonicalForm, ...candidate.aliases])];
    const placeholders = forms.map(() => "?").join(", ");
    const rows = database.prepare(`
      SELECT DISTINCT learning_items.id FROM learning_items
      LEFT JOIN learning_item_sources ON learning_item_sources.item_id = learning_items.id
      WHERE (learning_item_sources.book_id = ? AND learning_item_sources.chapter_id = ?
        AND learning_item_sources.annotation_id = ?)
        OR (learning_items.item_type = ? AND learning_items.canonical_form IN (${placeholders}))
    `).all(
      source.bookId, source.chapterId, source.annotationId, candidate.itemType, ...forms
    ) as unknown as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  #sourceOwner(database: DatabaseSync, source: LearningProposalSource): string | undefined {
    return (database.prepare(`
      SELECT item_id FROM learning_item_sources
      WHERE book_id = ? AND chapter_id = ? AND annotation_id = ?
    `).get(source.bookId, source.chapterId, source.annotationId) as { item_id: string } | undefined)
      ?.item_id;
  }

  #insertItem(
    database: DatabaseSync, itemId: string, candidate: LearningProposalCandidate, now: string
  ): void {
    database.prepare(`
      INSERT INTO learning_items (
        id, display_form, canonical_form, item_type, part_of_speech, contextual_meaning,
        concise_explanation, cefr, pronunciation, collocation_notes, status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_ai', 1, ?, ?)
    `).run(
      itemId, candidate.displayForm, candidate.canonicalForm, candidate.itemType,
      candidate.partOfSpeech, candidate.contextualMeaning, candidate.conciseExplanation,
      candidate.cefr, candidate.pronunciation, candidate.collocationNotes, now, now
    );
  }

  #insertSource(
    database: DatabaseSync, itemId: string, source: LearningProposalSource, now: string
  ): void {
    database.prepare(`
      INSERT INTO learning_item_sources (
        id, item_id, book_id, book_title, chapter_id, chapter_title, annotation_id,
        annotation_text, start_offset, end_offset, source_sentence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), itemId, source.bookId, source.bookTitle, source.chapterId, source.chapterTitle,
      source.annotationId, source.annotationText, source.startOffset, source.endOffset,
      source.sourceSentence, now
    );
  }

  #appendSource(
    database: DatabaseSync, itemId: string, source: LearningProposalSource, now: string
  ): boolean {
    if (this.#sourceOwner(database, source)) return false;
    this.#insertSource(database, itemId, source, now);
    return true;
  }

  #updateConfirmedFields(
    database: DatabaseSync,
    target: ItemRow,
    candidate: LearningProposalCandidate,
    confirmedFields: LearningProposalField[],
    now: string
  ): boolean {
    const values: Record<LearningProposalField, string | null> = {
      displayForm: candidate.displayForm,
      canonicalForm: candidate.canonicalForm,
      itemType: candidate.itemType,
      partOfSpeech: candidate.partOfSpeech,
      contextualMeaning: candidate.contextualMeaning,
      conciseExplanation: candidate.conciseExplanation,
      cefr: candidate.cefr,
      pronunciation: candidate.pronunciation,
      collocationNotes: candidate.collocationNotes
    };
    const changed = confirmedFields.filter((field) => target[rowFields[field]] !== values[field]);
    if (!changed.length) return false;
    const assignments = changed.map((field) => `${fieldColumns[field]} = ?`).join(", ");
    const result = database.prepare(`
      UPDATE learning_items SET ${assignments}, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(...changed.map((field) => values[field]), now, target.id, target.version);
    if (result.changes !== 1) throw new Error("學習卡已更新，請重新產生提案");
    return true;
  }

  async #toItem(row: ItemRow): Promise<LearningItem> {
    const sourceRows = this.#open().prepare(`
      SELECT * FROM learning_item_sources WHERE item_id = ? ORDER BY created_at ASC, id ASC
    `).all(row.id) as unknown as SourceRow[];
    const sources = await Promise.all(sourceRows.map(async (source): Promise<LearningItemSource> => ({
      id: source.id,
      bookId: source.book_id,
      bookTitle: source.book_title,
      chapterId: source.chapter_id,
      chapterTitle: source.chapter_title,
      annotationId: source.annotation_id,
      annotationText: source.annotation_text,
      startOffset: source.start_offset,
      endOffset: source.end_offset,
      sourceSentence: source.source_sentence,
      bookAvailable: this.options.isBookAvailable
        ? await this.options.isBookAvailable(source.book_id)
        : true,
      createdAt: source.created_at
    })));
    return {
      id: row.id,
      displayForm: row.display_form,
      canonicalForm: row.canonical_form,
      itemType: row.item_type,
      partOfSpeech: row.part_of_speech,
      contextualMeaning: row.contextual_meaning,
      conciseExplanation: row.concise_explanation,
      cefr: row.cefr,
      pronunciation: row.pronunciation,
      collocationNotes: row.collocation_notes,
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sources
    };
  }
}
