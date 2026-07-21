import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateLearningDraftInput,
  LearningItem,
  LearningItemSource,
  LearningListStatus,
  LearningItemType,
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
          collocation_notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, '', '', NULL, NULL, NULL, 'pending_ai', ?, ?)
      `).run(itemId, annotationText, normalized(annotationText), itemType, now, now);
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
        collocation_notes = ?, updated_at = ?
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
      UPDATE learning_items SET status = 'archived', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error("找不到學習項目");
    return this.getItem(id);
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sources
    };
  }
}
