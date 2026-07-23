import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CefrLevel,
  CreateLearningItemInput,
  LearningItem,
  LearningItemListInput,
  LearningItemStatus,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";

interface LearningItemRow {
  id: string;
  title: string;
  item_type: LearningItemType;
  cefr: CefrLevel;
  sense: string;
  markdown_content: string;
  status: LearningItemStatus;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
}

const itemTypes = new Set<LearningItemType>(["word", "phrase"]);
const cefrLevels = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const statuses = new Set<LearningItemStatus>(["active", "trashed"]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}格式錯誤`);
  }
  return value.trim();
}

function validateCreate(input: CreateLearningItemInput): CreateLearningItemInput {
  if (!input || typeof input !== "object") throw new Error("學習項目格式錯誤");
  if (!itemTypes.has(input.itemType)) throw new Error("學習項目類型格式錯誤");
  if (!cefrLevels.has(input.cefr)) throw new Error("CEFR 格式錯誤");
  return {
    title: requiredText(input.title, "標題"),
    itemType: input.itemType,
    cefr: input.cefr,
    sense: requiredText(input.sense, "語義"),
    markdownContent: requiredText(input.markdownContent, "Markdown 內容")
  };
}

function itemFromRow(row: LearningItemRow): LearningItem {
  return {
    id: row.id,
    title: row.title,
    itemType: row.item_type,
    cefr: row.cefr,
    sense: row.sense,
    markdownContent: row.markdown_content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at
  };
}

function cardMarkdown({
  partOfSpeech,
  pronunciation,
  meaning,
  collocations,
  examples
}: {
  partOfSpeech: string;
  pronunciation: string;
  meaning: string;
  collocations: string;
  examples: Array<[string, string]>;
}) {
  return [
    "## Meaning",
    meaning,
    "",
    `- **Part of speech:** ${partOfSpeech}`,
    `- **Pronunciation:** ${pronunciation}`,
    "",
    "## Common collocations",
    collocations,
    "",
    "## Examples",
    ...examples.flatMap(([english, translation], index) => [
      `${index + 1}. ${english}`,
      `   - ${translation}`
    ])
  ].join("\n");
}

const mockItems: CreateLearningItemInput[] = [
  {
    title: "happy",
    itemType: "word",
    cefr: "A1",
    sense: "feeling pleasure",
    markdownContent: cardMarkdown({
      partOfSpeech: "adjective",
      pronunciation: "/ˈhæp.i/",
      meaning: "快樂的；感到高興或滿足。",
      collocations: "happy childhood, happy ending, feel happy",
      examples: [
        ["She looks happy today.", "她今天看起來很開心。"],
        ["I am happy to help you.", "我很樂意幫助你。"],
        ["They had a happy childhood.", "他們有一個快樂的童年。"]
      ]
    })
  },
  {
    title: "bank",
    itemType: "word",
    cefr: "A2",
    sense: "financial institution",
    markdownContent: cardMarkdown({
      partOfSpeech: "noun",
      pronunciation: "/bæŋk/",
      meaning: "銀行；提供存款、提款與貸款等服務的金融機構。",
      collocations: "open a bank account, go to the bank, bank loan",
      examples: [
        ["I need to go to the bank after work.", "我下班後需要去銀行。"],
        ["She opened a bank account yesterday.", "她昨天開了一個銀行帳戶。"],
        ["The bank approved their loan.", "銀行核准了他們的貸款。"]
      ]
    })
  },
  {
    title: "bank",
    itemType: "word",
    cefr: "A2",
    sense: "side of a river",
    markdownContent: cardMarkdown({
      partOfSpeech: "noun",
      pronunciation: "/bæŋk/",
      meaning: "河岸；河流或湖泊邊緣的土地。",
      collocations: "river bank, steep bank, on the bank of",
      examples: [
        ["We sat on the bank and watched the river.", "我們坐在河岸邊看著河流。"],
        ["Wildflowers grew along the river bank.", "野花沿著河岸生長。"],
        ["The boat reached the opposite bank.", "小船抵達了對岸。"]
      ]
    })
  },
  {
    title: "reluctant",
    itemType: "word",
    cefr: "B2",
    sense: "unwilling or hesitant",
    markdownContent: cardMarkdown({
      partOfSpeech: "adjective",
      pronunciation: "/rɪˈlʌk.tənt/",
      meaning: "不情願的；因猶豫或不願意而不想採取行動。",
      collocations: "reluctant to admit, reluctant agreement, seem reluctant",
      examples: [
        ["He was reluctant to admit his mistake.", "他不情願承認自己的錯誤。"],
        ["She seemed reluctant to join the discussion.", "她似乎不太願意加入討論。"],
        ["They gave their reluctant approval.", "他們勉強表示同意。"]
      ]
    })
  },
  {
    title: "fastidious",
    itemType: "word",
    cefr: "C2",
    sense: "very attentive to detail",
    markdownContent: cardMarkdown({
      partOfSpeech: "adjective",
      pronunciation: "/fæˈstɪd.i.əs/",
      meaning: "一絲不苟的；對細節與整潔有極高要求的。",
      collocations: "fastidious attention, fastidious standards, fastidious about",
      examples: [
        ["She is fastidious about grammar.", "她對文法一絲不苟。"],
        ["The chef is fastidious in choosing ingredients.", "那位主廚挑選食材非常講究。"],
        ["His fastidious standards impressed the team.", "他嚴謹的標準令團隊印象深刻。"]
      ]
    })
  },
  {
    title: "wake up",
    itemType: "phrase",
    cefr: "A1",
    sense: "stop sleeping",
    markdownContent: cardMarkdown({
      partOfSpeech: "phrasal verb",
      pronunciation: "/weɪk ʌp/",
      meaning: "醒來；停止睡眠。",
      collocations: "wake up early, wake up suddenly, wake someone up",
      examples: [
        ["I usually wake up at seven.", "我通常七點醒來。"],
        ["The noise woke me up.", "那個聲音把我吵醒了。"],
        ["She woke up feeling refreshed.", "她醒來時覺得精神飽滿。"]
      ]
    })
  },
  {
    title: "figure out",
    itemType: "phrase",
    cefr: "B1",
    sense: "understand or solve",
    markdownContent: cardMarkdown({
      partOfSpeech: "phrasal verb",
      pronunciation: "/ˈfɪɡ.jɚ aʊt/",
      meaning: "弄懂；想出解決方法。",
      collocations: "figure out how, figure out a solution, can't figure out",
      examples: [
        ["I finally figured out how the lock works.", "我終於弄懂這把鎖如何運作。"],
        ["We need to figure out a solution.", "我們需要想出一個解決方法。"],
        ["She couldn't figure out the answer.", "她想不出答案。"]
      ]
    })
  },
  {
    title: "take for granted",
    itemType: "phrase",
    cefr: "B2",
    sense: "fail to appreciate",
    markdownContent: cardMarkdown({
      partOfSpeech: "idiom",
      pronunciation: "/teɪk fər ˈɡræn.tɪd/",
      meaning: "視為理所當然；因習以為常而沒有珍惜。",
      collocations: "take someone for granted, never take for granted",
      examples: [
        ["We often take clean water for granted.", "我們常把乾淨的水視為理所當然。"],
        ["Don't take your friends for granted.", "不要把朋友的付出視為理所當然。"],
        ["He had taken her support for granted.", "他一直把她的支持視為理所當然。"]
      ]
    })
  },
  {
    title: "on the verge of",
    itemType: "phrase",
    cefr: "C1",
    sense: "very close to happening",
    markdownContent: cardMarkdown({
      partOfSpeech: "prepositional phrase",
      pronunciation: "/ɑːn ðə vɝːdʒ əv/",
      meaning: "瀕臨；某件事情即將發生。",
      collocations: "on the verge of tears, on the verge of collapse",
      examples: [
        ["She was on the verge of tears.", "她幾乎要哭出來了。"],
        ["The company was on the verge of collapse.", "那家公司瀕臨倒閉。"],
        ["Scientists are on the verge of a breakthrough.", "科學家即將取得突破。"]
      ]
    })
  },
  {
    title: "for all intents and purposes",
    itemType: "phrase",
    cefr: "C2",
    sense: "in every practical sense",
    markdownContent: cardMarkdown({
      partOfSpeech: "idiom",
      pronunciation: "/fɔːr ɔːl ɪnˈtents ænd ˈpɝː.pə.sɪz/",
      meaning: "實際上；就所有實際目的而言。",
      collocations: "for all practical intents and purposes",
      examples: [
        ["For all intents and purposes, the project is finished.", "實際上，這個專案已經完成。"],
        ["The two designs are, for all intents and purposes, identical.", "實際上，這兩個設計完全相同。"],
        ["He is, for all intents and purposes, the team leader.", "實際上，他就是團隊領導者。"]
      ]
    })
  }
];

export class LocalLearningLibrary {
  #database: DatabaseSync | undefined;

  constructor(private readonly databasePath: string) {}

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
        CREATE TABLE IF NOT EXISTS learning_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning_items (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('word', 'phrase')),
          cefr TEXT NOT NULL CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
          sense TEXT NOT NULL,
          markdown_content TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'trashed')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          trashed_at TEXT
        );
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (1, CURRENT_TIMESTAMP);
      `);
      const seeded = database.prepare(
        "SELECT value FROM learning_metadata WHERE key = 'mock_seed_v1'"
      ).get() as { value: string } | undefined;
      if (!seeded) {
        const insert = database.prepare(`
          INSERT INTO learning_items (
            id, title, item_type, cefr, sense, markdown_content, status,
            created_at, updated_at, trashed_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
        `);
        mockItems.forEach((item, index) => {
          const timestamp = `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`;
          insert.run(
            `mock-learning-item-${String(index + 1).padStart(2, "0")}`,
            item.title,
            item.itemType,
            item.cefr,
            item.sense,
            item.markdownContent,
            timestamp,
            timestamp
          );
        });
        database.prepare(`
          INSERT INTO learning_metadata (key, value) VALUES ('mock_seed_v1', 'completed')
        `).run();
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

  async listItems(input: LearningItemListInput): Promise<LearningItem[]> {
    if (!input || typeof input !== "object" || !statuses.has(input.status)) {
      throw new Error("生詞庫狀態格式錯誤");
    }
    if (input.sort !== "recent" && input.sort !== "alphabetical") {
      throw new Error("生詞庫排序格式錯誤");
    }
    if (input.itemType !== undefined && !itemTypes.has(input.itemType)) {
      throw new Error("生詞庫類型篩選格式錯誤");
    }
    if (input.cefr !== undefined && !cefrLevels.has(input.cefr)) {
      throw new Error("CEFR 篩選格式錯誤");
    }
    if (input.search !== undefined && typeof input.search !== "string") {
      throw new Error("生詞庫搜尋格式錯誤");
    }

    const clauses = ["status = ?"];
    const values: Array<string> = [input.status];
    const search = input.search?.trim().toLocaleLowerCase();
    if (search) {
      clauses.push("LOWER(title) LIKE ? ESCAPE '\\'");
      values.push(`%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    }
    if (input.itemType) {
      clauses.push("item_type = ?");
      values.push(input.itemType);
    }
    if (input.cefr) {
      clauses.push("cefr = ?");
      values.push(input.cefr);
    }
    const order = input.sort === "alphabetical"
      ? "LOWER(title) ASC, sense ASC, id ASC"
      : "created_at DESC, id ASC";
    const rows = this.#open().prepare(`
      SELECT * FROM learning_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${order}
    `).all(...values) as unknown as LearningItemRow[];
    return rows.map(itemFromRow);
  }

  async getItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "學習項目");
    const row = this.#open().prepare(
      "SELECT * FROM learning_items WHERE id = ?"
    ).get(id) as LearningItemRow | undefined;
    if (!row) throw new Error("找不到學習項目");
    return itemFromRow(row);
  }

  async createItem(input: CreateLearningItemInput): Promise<LearningItem> {
    const item = validateCreate(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.#open().prepare(`
      INSERT INTO learning_items (
        id, title, item_type, cefr, sense, markdown_content, status,
        created_at, updated_at, trashed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
    `).run(
      id,
      item.title,
      item.itemType,
      item.cefr,
      item.sense,
      item.markdownContent,
      now,
      now
    );
    return this.getItem(id);
  }

  async updateItem(input: UpdateLearningItemInput): Promise<LearningItem> {
    if (!input || typeof input !== "object") throw new Error("學習項目更新格式錯誤");
    const id = requiredText(input.itemId, "學習項目");
    const item = validateCreate(input);
    const result = this.#open().prepare(`
      UPDATE learning_items SET
        title = ?, item_type = ?, cefr = ?, sense = ?, markdown_content = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      item.title,
      item.itemType,
      item.cefr,
      item.sense,
      item.markdownContent,
      new Date().toISOString(),
      id
    );
    if (result.changes !== 1) throw new Error("找不到學習項目");
    return this.getItem(id);
  }

  async trashItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "學習項目");
    const now = new Date().toISOString();
    const result = this.#open().prepare(`
      UPDATE learning_items SET status = 'trashed', trashed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
    `).run(now, now, id);
    if (result.changes !== 1) throw new Error("找不到可刪除的學習項目");
    return this.getItem(id);
  }

  async restoreItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "學習項目");
    const now = new Date().toISOString();
    const result = this.#open().prepare(`
      UPDATE learning_items SET status = 'active', trashed_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'trashed'
    `).run(now, id);
    if (result.changes !== 1) throw new Error("找不到可還原的學習項目");
    return this.getItem(id);
  }

  async emptyTrash(): Promise<{ deleted: number }> {
    const database = this.#open();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = database.prepare(
        "DELETE FROM learning_items WHERE status = 'trashed'"
      ).run();
      database.exec("COMMIT");
      return { deleted: Number(result.changes) };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
