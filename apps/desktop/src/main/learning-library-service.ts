import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade
} from "ts-fsrs";
import type {
  CefrLevel,
  CreateLearningItemInput,
  LearningItem,
  LearningItemListInput,
  LearningItemStatus,
  LearningItemStudyStatus,
  LearningLibraryItem,
  LearningItemType,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  ConfirmReviewSessionInput,
  ConfirmReviewSessionResult,
  LearningItemReviewDetail,
  ReviewActivity,
  ReviewHistoryEntry,
  ReviewLearningProgress,
  ReviewQueueItem,
  ReviewRating,
  ReviewSummary
} from "../shared/review-contracts";
import {
  DAILY_DUE_REVIEW_COMPLETION_LIMIT,
  DAILY_NEW_ITEM_COMPLETION_LIMIT,
  REVIEW_PAPER_SIZE
} from "../shared/settings-contracts";

// Schema 4 adds persisted review answers to the append-only history.
export const MAXIMUM_COMPATIBLE_LEARNING_LIBRARY_SCHEMA_VERSION = 4;

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

interface ReviewScheduleRow {
  learning_item_id: string;
  due_at: string;
  card_json: string;
  review_count: number;
  last_reviewed_at: string;
  last_final_rating: ReviewRating;
}

interface ReviewHistoryRow {
  id: string;
  session_id: string;
  learning_item_id: string;
  reviewed_at: string;
  ai_rating: ReviewRating;
  final_rating: ReviewRating;
  answer: string | null;
  interval_seconds: number;
  next_due_at: string;
}

interface ReviewQueueRow extends LearningItemRow {
  due_at: string | null;
}

type ReviewLearningKind = "new" | "due";

interface ReviewProgressRow {
  id: string;
  learning_item_id: string;
  reviewed_at: string;
  next_due_at: string;
  final_rating: ReviewRating;
  next_card_json: string;
}

interface ReviewProgressState {
  hasCompletedNewItem: boolean;
  learningKind: ReviewLearningKind | null;
}

interface ReviewPreferences {
  dailyNewItemCompletionLimit: number;
  dailyDueReviewCompletionLimit: number;
  reviewPaperSize: number;
}

interface LocalLearningLibraryOptions {
  getReviewPreferences?(): Promise<ReviewPreferences>;
}

const itemTypes = new Set<LearningItemType>(["word", "phrase"]);
const cefrLevels = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const statuses = new Set<LearningItemStatus>(["active", "trashed"]);
const studyStatuses = new Set<LearningItemStudyStatus>([
  "new",
  "learning",
  "due",
  "scheduled"
]);
const reviewRatings = new Set<ReviewRating>([
  "forgotten",
  "hard",
  "good",
  "easy"
]);
const cefrOrder = `
  CASE cefr
    WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3
    WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
  END
`;

const reviewScheduler = fsrs({ request_retention: 0.9 });
const SOLID_RECALL_MINIMUM_STABILITY_DAYS = 30;
const SOLID_RECALL_MINIMUM_RETRIEVABILITY = 0.85;
const SOLID_RECALL_MINIMUM_SUCCESS_DAYS = 2;

function validDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label}`);
  return date;
}

function localDayRange(value: Date): [string, string] {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

function localDayKey(value: Date | string): string {
  const date = validDate(value, "date");
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function reviewProgress(
  rows: ReviewProgressRow[],
  now: Date
): {
  states: Map<string, ReviewProgressState>;
  completedNewToday: number;
  completedDueToday: number;
  newLearningCount: number;
  dueLearningCount: number;
  learningProgress: ReviewLearningProgress;
  reviewActivity: ReviewActivity;
} {
  const states = new Map<string, ReviewProgressState>();
  const [todayStartIso, tomorrowStartIso] = localDayRange(now);
  const activityPeriodDays = 30;
  const activityPeriodStart = new Date(now);
  activityPeriodStart.setHours(0, 0, 0, 0);
  activityPeriodStart.setDate(
    activityPeriodStart.getDate() - (activityPeriodDays - 1)
  );
  const activityDaily = Array.from(
    { length: activityPeriodDays },
    (_, index) => {
      const date = new Date(activityPeriodStart);
      date.setDate(date.getDate() + index);
      return {
        date: localDayKey(date),
        newCompletedCount: 0,
        dueCompletedCount: 0
      };
    }
  );
  const activityByDate = new Map(
    activityDaily.map((day) => [day.date, day])
  );
  let completedReviewCount = 0;
  let completedNewToday = 0;
  let completedDueToday = 0;
  const eventsByItem = new Map<string, ReviewProgressRow[]>();
  for (const row of rows) {
    const itemEvents = eventsByItem.get(row.learning_item_id) ?? [];
    itemEvents.push(row);
    eventsByItem.set(row.learning_item_id, itemEvents);
    const state = states.get(row.learning_item_id) ?? {
      hasCompletedNewItem: false,
      learningKind: null
    };
    const kind: ReviewLearningKind = state.hasCompletedNewItem ? "due" : "new";
    const completed = localDayKey(row.next_due_at) > localDayKey(row.reviewed_at);
    if (completed) {
      state.hasCompletedNewItem = true;
      state.learningKind = null;
      const activityDay = activityByDate.get(localDayKey(row.reviewed_at));
      if (activityDay) {
        if (kind === "new") activityDay.newCompletedCount += 1;
        else activityDay.dueCompletedCount += 1;
        completedReviewCount += 1;
      }
      if (row.reviewed_at >= todayStartIso && row.reviewed_at < tomorrowStartIso) {
        if (kind === "new") completedNewToday += 1;
        else completedDueToday += 1;
      }
    } else {
      state.learningKind = kind;
    }
    states.set(row.learning_item_id, state);
  }
  let newLearningCount = 0;
  let dueLearningCount = 0;
  for (const state of states.values()) {
    if (state.learningKind === "new") newLearningCount += 1;
    if (state.learningKind === "due") dueLearningCount += 1;
  }

  function isSolidAt(itemEvents: ReviewProgressRow[], at: Date): boolean {
    const atIso = at.toISOString();
    const eligibleEvents = itemEvents.filter((event) =>
      event.reviewed_at <= atIso
    );
    const latest = eligibleEvents.at(-1);
    if (!latest ||
      (latest.final_rating !== "good" && latest.final_rating !== "easy")) {
      return false;
    }
    const successfulDays = new Set(eligibleEvents
      .filter(({ final_rating }) =>
        final_rating === "good" || final_rating === "easy"
      )
      .map(({ reviewed_at }) => localDayKey(reviewed_at)));
    if (successfulDays.size < SOLID_RECALL_MINIMUM_SUCCESS_DAYS) return false;
    const card = cardFromJson(latest.next_card_json);
    if (card.stability < SOLID_RECALL_MINIMUM_STABILITY_DAYS) return false;
    return reviewScheduler.get_retrievability(card, at, false) >=
      SOLID_RECALL_MINIMUM_RETRIEVABILITY;
  }

  function solidCountAt(at: Date): number {
    let count = 0;
    for (const itemEvents of eventsByItem.values()) {
      if (isSolidAt(itemEvents, at)) count += 1;
    }
    return count;
  }

  const periodDays = 90;
  const periodStart = new Date(now);
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - (periodDays - 1));
  const daily = Array.from({ length: periodDays }, (_, index) => {
    const date = new Date(periodStart);
    date.setDate(date.getDate() + index);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const evaluationTime = index === periodDays - 1
      ? now
      : new Date(nextDay.getTime() - 1);
    return {
      date: localDayKey(date),
      solidItemCount: solidCountAt(evaluationTime)
    };
  });
  const solidItemCount = solidCountAt(now);
  const comparisonTime = new Date(now);
  comparisonTime.setDate(comparisonTime.getDate() - 30);
  const solidItemCountDelta30Days =
    solidItemCount - solidCountAt(comparisonTime);
  const recallPeriodStart = new Date(now);
  recallPeriodStart.setHours(0, 0, 0, 0);
  recallPeriodStart.setDate(recallPeriodStart.getDate() - 29);
  const recallPeriodStartIso = recallPeriodStart.toISOString();
  let recalledSuccessfully = 0;
  let recallReviewCount30Days = 0;
  for (const itemEvents of eventsByItem.values()) {
    itemEvents.forEach((event, index) => {
      if (index === 0 || event.reviewed_at < recallPeriodStartIso) return;
      recallReviewCount30Days += 1;
      if (event.final_rating === "good" || event.final_rating === "easy") {
        recalledSuccessfully += 1;
      }
    });
  }

  return {
    states,
    completedNewToday,
    completedDueToday,
    newLearningCount,
    dueLearningCount,
    learningProgress: {
      periodDays,
      solidItemCount,
      solidItemCountDelta30Days,
      buildingItemCount: Math.max(0, eventsByItem.size - solidItemCount),
      recallRate30Days: recallReviewCount30Days === 0
        ? null
        : Math.round(recalledSuccessfully / recallReviewCount30Days * 100),
      recallReviewCount30Days,
      daily
    },
    reviewActivity: {
      periodDays: activityPeriodDays,
      completedReviewCount,
      daily: activityDaily
    }
  };
}

function ratingForFsrs(rating: ReviewRating): Grade {
  switch (rating) {
    case "forgotten": return Rating.Again as Grade;
    case "hard": return Rating.Hard as Grade;
    case "good": return Rating.Good as Grade;
    case "easy": return Rating.Easy as Grade;
  }
}

function cardFromJson(value: string): Card {
  const parsed = JSON.parse(value) as Partial<Card> & {
    due?: string;
    last_review?: string | null;
  };
  const numericFields = [
    "stability",
    "difficulty",
    "elapsed_days",
    "scheduled_days",
    "learning_steps",
    "reps",
    "lapses",
    "state"
  ] as const;
  if (!parsed || typeof parsed !== "object" ||
    numericFields.some((field) => !Number.isFinite(parsed[field]))) {
    throw new Error("Review schedule data is corrupted");
  }
  return {
    due: validDate(parsed.due, "due date"),
    stability: parsed.stability!,
    difficulty: parsed.difficulty!,
    elapsed_days: parsed.elapsed_days!,
    scheduled_days: parsed.scheduled_days!,
    learning_steps: parsed.learning_steps!,
    reps: parsed.reps!,
    lapses: parsed.lapses!,
    state: parsed.state!,
    ...(parsed.last_review
      ? { last_review: validDate(parsed.last_review, "last review time") }
      : {})
  };
}

function cardJson(card: Card): string {
  return JSON.stringify({
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null
  });
}

function historyFromRow(row: ReviewHistoryRow): ReviewHistoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    itemId: row.learning_item_id,
    reviewedAt: row.reviewed_at,
    aiRating: row.ai_rating,
    finalRating: row.final_rating,
    answer: row.answer,
    intervalSeconds: row.interval_seconds,
    nextDueAt: row.next_due_at
  };
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function validateCreate(input: CreateLearningItemInput): CreateLearningItemInput {
  if (!input || typeof input !== "object") throw new Error("Invalid learning item");
  if (!itemTypes.has(input.itemType)) throw new Error("Invalid learning-item type");
  if (!cefrLevels.has(input.cefr)) throw new Error("Invalid CEFR level");
  return {
    title: requiredText(input.title, "title"),
    itemType: input.itemType,
    cefr: input.cefr,
    sense: requiredText(input.sense, "sense"),
    markdownContent: requiredText(input.markdownContent, "Markdown content")
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

  constructor(
    private readonly databasePath: string,
    private readonly options: LocalLearningLibraryOptions = {}
  ) {}

  close(): void {
    this.#database?.close();
    this.#database = undefined;
  }

  async backupTo(destinationPath: string): Promise<void> {
    mkdirSync(dirname(destinationPath), { recursive: true });
    await backup(this.#open(), destinationPath);
  }

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
        CREATE TABLE IF NOT EXISTS learning_review_schedules (
          learning_item_id TEXT PRIMARY KEY
            REFERENCES learning_items(id) ON DELETE CASCADE,
          due_at TEXT NOT NULL,
          card_json TEXT NOT NULL,
          review_count INTEGER NOT NULL CHECK (review_count >= 1),
          last_reviewed_at TEXT NOT NULL,
          last_final_rating TEXT NOT NULL
            CHECK (last_final_rating IN ('forgotten', 'hard', 'good', 'easy')),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS learning_review_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          learning_item_id TEXT NOT NULL
            REFERENCES learning_items(id) ON DELETE CASCADE,
          reviewed_at TEXT NOT NULL,
          ai_rating TEXT NOT NULL
            CHECK (ai_rating IN ('forgotten', 'hard', 'good', 'easy')),
          final_rating TEXT NOT NULL
            CHECK (final_rating IN ('forgotten', 'hard', 'good', 'easy')),
          answer TEXT,
          previous_card_json TEXT,
          next_card_json TEXT NOT NULL,
          interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 0),
          next_due_at TEXT NOT NULL,
          UNIQUE (session_id, learning_item_id)
        );
        CREATE INDEX IF NOT EXISTS learning_review_schedules_due_idx
          ON learning_review_schedules(due_at);
        CREATE INDEX IF NOT EXISTS learning_review_events_item_time_idx
          ON learning_review_events(learning_item_id, reviewed_at DESC);
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (1, CURRENT_TIMESTAMP);
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (2, CURRENT_TIMESTAMP);
      `);
      const reviewEventColumns = database.prepare(
        "PRAGMA table_info(learning_review_events)"
      ).all() as unknown as Array<{ name: string }>;
      if (!reviewEventColumns.some(({ name }) => name === "answer")) {
        database.exec("ALTER TABLE learning_review_events ADD COLUMN answer TEXT");
      }
      database.prepare(`
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (4, CURRENT_TIMESTAMP)
      `).run();
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

  async listItems(
    input: LearningItemListInput,
    nowInput: Date | string = new Date()
  ): Promise<LearningLibraryItem[]> {
    if (!input || typeof input !== "object" || !statuses.has(input.status)) {
      throw new Error("Invalid Learning Library status");
    }
    if (
      input.sort !== "recent" &&
      input.sort !== "alphabetical" &&
      input.sort !== "study-status" &&
      input.sort !== "next-due"
    ) {
      throw new Error("Invalid Learning Library sort order");
    }
    if (input.itemType !== undefined && !itemTypes.has(input.itemType)) {
      throw new Error("Invalid Learning Library type filter");
    }
    if (input.cefr !== undefined && !cefrLevels.has(input.cefr)) {
      throw new Error("Invalid CEFR filter");
    }
    if (input.search !== undefined && typeof input.search !== "string") {
      throw new Error("Invalid Learning Library search");
    }
    if (
      input.studyStatus !== undefined &&
      !studyStatuses.has(input.studyStatus)
    ) {
      throw new Error("Invalid study-status filter");
    }

    const clauses = ["i.status = ?"];
    const values: Array<string> = [input.status];
    const search = input.search?.trim().toLocaleLowerCase();
    if (search) {
      clauses.push("LOWER(i.title) LIKE ? ESCAPE '\\'");
      values.push(`%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    }
    if (input.itemType) {
      clauses.push("i.item_type = ?");
      values.push(input.itemType);
    }
    if (input.cefr) {
      clauses.push("i.cefr = ?");
      values.push(input.cefr);
    }
    const order = input.sort === "alphabetical"
      ? "LOWER(i.title) ASC, i.sense ASC, i.id ASC"
      : "i.created_at DESC, i.id ASC";
    const database = this.#open();
    const rows = database.prepare(`
      SELECT i.*, s.due_at
      FROM learning_items i
      LEFT JOIN learning_review_schedules s ON s.learning_item_id = i.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${order}
    `).all(...values) as unknown as ReviewQueueRow[];
    const now = validDate(nowInput, "current time");
    const nowIso = now.toISOString();
    const progressRows = database.prepare(`
      SELECT e.id, e.learning_item_id, e.reviewed_at, e.next_due_at,
        e.final_rating, e.next_card_json
      FROM learning_review_events e
      JOIN learning_items i ON i.id = e.learning_item_id
      WHERE i.status = 'active' AND e.reviewed_at <= ?
      ORDER BY e.learning_item_id ASC, e.reviewed_at ASC, e.id ASC
    `).all(nowIso) as unknown as ReviewProgressRow[];
    const progress = reviewProgress(progressRows, now);
    const libraryItems = rows.map((row): LearningLibraryItem => {
      const learningKind = progress.states.get(row.id)?.learningKind;
      const studyStatus: LearningItemStudyStatus = learningKind
        ? "learning"
        : !row.due_at
          ? "new"
          : row.due_at <= nowIso
            ? "due"
            : "scheduled";
      return {
        ...itemFromRow(row),
        studyStatus,
        nextDueAt: row.due_at
      };
    }).filter((item) =>
      !input.studyStatus || item.studyStatus === input.studyStatus
    );
    if (input.sort === "study-status") {
      const priority: Record<LearningItemStudyStatus, number> = {
        learning: 0,
        due: 1,
        new: 2,
        scheduled: 3
      };
      libraryItems.sort((left, right) =>
        priority[left.studyStatus] - priority[right.studyStatus] ||
        (left.nextDueAt ?? "").localeCompare(right.nextDueAt ?? "") ||
        left.title.localeCompare(right.title)
      );
    } else if (input.sort === "next-due") {
      libraryItems.sort((left, right) => {
        if (!left.nextDueAt && !right.nextDueAt) {
          return left.title.localeCompare(right.title);
        }
        if (!left.nextDueAt) return 1;
        if (!right.nextDueAt) return -1;
        return left.nextDueAt.localeCompare(right.nextDueAt) ||
          left.title.localeCompare(right.title);
      });
    }
    return libraryItems;
  }

  async getItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "learning item");
    const row = this.#open().prepare(
      "SELECT * FROM learning_items WHERE id = ?"
    ).get(id) as LearningItemRow | undefined;
    if (!row) throw new Error("Learning item not found");
    return itemFromRow(row);
  }

  async findDuplicateCandidates(titles: string[]): Promise<LearningItem[]> {
    if (!Array.isArray(titles)) throw new Error("Invalid candidate titles");
    const normalizedTitles = [...new Set(titles.map((title) =>
      requiredText(title, "candidate title").toLocaleLowerCase()
    ))];
    if (normalizedTitles.length === 0) return [];
    const order = new Map(normalizedTitles.map((title, index) => [title, index]));
    const placeholders = normalizedTitles.map(() => "?").join(", ");
    const rows = this.#open().prepare(`
      SELECT * FROM learning_items
      WHERE LOWER(TRIM(title)) IN (${placeholders})
    `).all(...normalizedTitles) as unknown as LearningItemRow[];
    return rows
      .map(itemFromRow)
      .sort((left, right) => {
        const titleOrder = (order.get(left.title.trim().toLocaleLowerCase()) ?? 0) -
          (order.get(right.title.trim().toLocaleLowerCase()) ?? 0);
        return titleOrder || left.sense.localeCompare(right.sense) ||
          left.id.localeCompare(right.id);
      });
  }

  async getReviewSummary(nowInput: Date | string = new Date()): Promise<ReviewSummary> {
    const now = validDate(nowInput, "current time");
    const nowIso = now.toISOString();
    const database = this.#open();
    const preferences = this.options.getReviewPreferences
      ? await this.options.getReviewPreferences()
      : {
          dailyNewItemCompletionLimit:
            DAILY_NEW_ITEM_COMPLETION_LIMIT.default,
          dailyDueReviewCompletionLimit:
            DAILY_DUE_REVIEW_COMPLETION_LIMIT.default,
          reviewPaperSize: REVIEW_PAPER_SIZE.default
        };
    const progressRows = database.prepare(`
      SELECT e.id, e.learning_item_id, e.reviewed_at, e.next_due_at,
        e.final_rating, e.next_card_json
      FROM learning_review_events e
      JOIN learning_items i ON i.id = e.learning_item_id
      WHERE i.status = 'active' AND e.reviewed_at <= ?
      ORDER BY e.learning_item_id ASC, e.reviewed_at ASC, e.id ASC
    `).all(nowIso) as unknown as ReviewProgressRow[];
    const progress = reviewProgress(progressRows, now);
    const allDueRows = database.prepare(`
      SELECT i.*, s.due_at
      FROM learning_items i
      JOIN learning_review_schedules s ON s.learning_item_id = i.id
      WHERE i.status = 'active' AND s.due_at <= ?
      ORDER BY s.due_at ASC, i.id ASC
    `).all(nowIso) as unknown as ReviewQueueRow[];
    const newRows = database.prepare(`
      SELECT i.*, NULL AS due_at
      FROM learning_items i
      LEFT JOIN learning_review_schedules s ON s.learning_item_id = i.id
      WHERE i.status = 'active' AND s.learning_item_id IS NULL
      ORDER BY ${cefrOrder} ASC, i.created_at ASC, i.id ASC
    `).all() as unknown as ReviewQueueRow[];
    const learningDueRows = allDueRows.filter((row) =>
      progress.states.get(row.id)?.learningKind
    );
    const otherDueRows = allDueRows.filter((row) =>
      !progress.states.get(row.id)?.learningKind
    );
    const dueReviewedCount = allDueRows.filter((row) =>
      progress.states.get(row.id)?.learningKind !== "new"
    ).length;
    const newCount = newRows.length;
    const newRemainingCapacity = Math.max(
      0,
      preferences.dailyNewItemCompletionLimit -
        progress.completedNewToday
    );
    const dueRemainingCapacity = Math.max(
      0,
      preferences.dailyDueReviewCompletionLimit -
        progress.completedDueToday
    );
    const eligibleLearningRows = learningDueRows.filter((row) => {
      const kind = progress.states.get(row.id)?.learningKind;
      return kind === "new"
        ? preferences.dailyNewItemCompletionLimit > 0
        : preferences.dailyDueReviewCompletionLimit > 0;
    });
    const eligibleDueRows = otherDueRows.slice(0, dueRemainingCapacity);
    const eligibleNewRows = newRows.slice(0, newRemainingCapacity);
    const selectedRows = [
      ...eligibleLearningRows,
      ...eligibleDueRows,
      ...eligibleNewRows
    ].slice(0, preferences.reviewPaperSize);
    const selectedItems: ReviewQueueItem[] = selectedRows.map((row) => {
      const learningKind = progress.states.get(row.id)?.learningKind;
      const reviewKind = learningKind ?? (row.due_at ? "due" : "new");
      return {
        ...itemFromRow(row),
        reviewKind,
        dueAt: row.due_at
      };
    });
    const nextDue = database.prepare(`
      SELECT MIN(s.due_at) AS next_due_at
      FROM learning_items i
      JOIN learning_review_schedules s ON s.learning_item_id = i.id
      WHERE i.status = 'active' AND s.due_at > ?
    `).get(nowIso) as { next_due_at: string | null };
    const totalAvailable =
      eligibleLearningRows.length +
      eligibleDueRows.length +
      eligibleNewRows.length;
    return {
      dueReviewedCount,
      newCount,
      reviewedNewTodayCount: progress.completedNewToday,
      reviewedDueTodayCount: progress.completedDueToday,
      newLearningCount: progress.newLearningCount,
      dueLearningCount: progress.dueLearningCount,
      newCompletionLimit: preferences.dailyNewItemCompletionLimit,
      dueReviewCompletionLimit: preferences.dailyDueReviewCompletionLimit,
      reviewPaperSize: preferences.reviewPaperSize,
      newRemainingCapacity,
      dueRemainingCapacity,
      backlogTotal: dueReviewedCount + newCount,
      totalAvailable,
      availableLearningCount: eligibleLearningRows.length,
      availableDueCount: eligibleDueRows.length,
      availableNewCount: eligibleNewRows.length,
      learningProgress: progress.learningProgress,
      reviewActivity: progress.reviewActivity,
      selectedItems,
      nextDueAt: nextDue.next_due_at
    };
  }

  async getItemReviewDetail(
    itemId: string,
    nowInput: Date | string = new Date()
  ): Promise<LearningItemReviewDetail> {
    const id = requiredText(itemId, "learning item");
    const now = validDate(nowInput, "current time");
    await this.getItem(id);
    const schedule = this.#open().prepare(`
      SELECT * FROM learning_review_schedules WHERE learning_item_id = ?
    `).get(id) as ReviewScheduleRow | undefined;
    const rows = this.#open().prepare(`
      SELECT id, session_id, learning_item_id, reviewed_at, ai_rating,
        final_rating, answer, interval_seconds, next_due_at
      FROM learning_review_events
      WHERE learning_item_id = ?
      ORDER BY reviewed_at DESC, id DESC
    `).all(id) as unknown as ReviewHistoryRow[];
    if (!schedule) {
      return {
        status: "new",
        lastReviewedAt: null,
        lastFinalRating: null,
        nextDueAt: null,
        reviewCount: 0,
        history: []
      };
    }
    return {
      status: schedule.due_at <= now.toISOString() ? "due" : "scheduled",
      lastReviewedAt: schedule.last_reviewed_at,
      lastFinalRating: schedule.last_final_rating,
      nextDueAt: schedule.due_at,
      reviewCount: schedule.review_count,
      history: rows.map(historyFromRow)
    };
  }

  async confirmReviewSession(
    input: ConfirmReviewSessionInput
  ): Promise<ConfirmReviewSessionResult> {
    if (!input || typeof input !== "object") throw new Error("Invalid review session");
    const sessionId = requiredText(input.sessionId, "review session");
    const reviewedAt = validDate(input.reviewedAt, "review time");
    if (!Array.isArray(input.ratings) ||
      input.ratings.length === 0 ||
      input.ratings.length > REVIEW_PAPER_SIZE.max) {
      throw new Error("Invalid review-rating count");
    }
    const ratings = input.ratings.map((rating) => {
      if (!rating || typeof rating !== "object") {
        throw new Error("Invalid review rating");
      }
      const itemId = requiredText(rating.itemId, "learning item");
      if (!reviewRatings.has(rating.aiRating) ||
        !reviewRatings.has(rating.finalRating)) {
        throw new Error("Invalid review rating");
      }
      if (rating.answer !== undefined && typeof rating.answer !== "string") {
        throw new Error("Invalid review answer");
      }
      return { ...rating, itemId, answer: rating.answer ?? "" };
    });
    if (new Set(ratings.map(({ itemId }) => itemId)).size !== ratings.length) {
      throw new Error("Review ratings contain duplicate items");
    }

    const database = this.#open();
    const reviewedAtIso = reviewedAt.toISOString();
    const pending = ratings.flatMap((rating) => {
      const row = database.prepare(`
        SELECT i.status, s.learning_item_id, s.due_at, s.card_json,
          s.review_count, s.last_reviewed_at, s.last_final_rating
        FROM learning_items i
        LEFT JOIN learning_review_schedules s ON s.learning_item_id = i.id
        WHERE i.id = ?
      `).get(rating.itemId) as (ReviewScheduleRow & {
        status: LearningItemStatus;
      }) | undefined;
      if (!row || row.status !== "active") {
        return [];
      }
      if (row.learning_item_id && row.due_at > reviewedAtIso) {
        throw new Error("The review item is not due yet");
      }
      const previousCard = row.learning_item_id
        ? cardFromJson(row.card_json)
        : createEmptyCard(reviewedAt);
      const result = reviewScheduler.next(
        previousCard,
        reviewedAt,
        ratingForFsrs(rating.finalRating)
      );
      const nextDueAt = result.card.due.toISOString();
      return [{
        rating,
        previousCardJson: row.learning_item_id ? cardJson(previousCard) : null,
        nextCardJson: cardJson(result.card),
        nextDueAt,
        intervalSeconds: Math.max(
          0,
          Math.round((result.card.due.getTime() - reviewedAt.getTime()) / 1000)
        ),
        reviewCount: row.learning_item_id ? row.review_count + 1 : 1
      }];
    });

    const entries: ReviewHistoryEntry[] = [];
    database.exec("BEGIN IMMEDIATE");
    try {
      const insertEvent = database.prepare(`
        INSERT INTO learning_review_events (
          id, session_id, learning_item_id, reviewed_at, ai_rating,
          final_rating, answer, previous_card_json, next_card_json,
          interval_seconds, next_due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const upsertSchedule = database.prepare(`
        INSERT INTO learning_review_schedules (
          learning_item_id, due_at, card_json, review_count,
          last_reviewed_at, last_final_rating, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(learning_item_id) DO UPDATE SET
          due_at = excluded.due_at,
          card_json = excluded.card_json,
          review_count = excluded.review_count,
          last_reviewed_at = excluded.last_reviewed_at,
          last_final_rating = excluded.last_final_rating,
          updated_at = excluded.updated_at
      `);
      for (const item of pending) {
        const eventId = randomUUID();
        insertEvent.run(
          eventId,
          sessionId,
          item.rating.itemId,
          reviewedAtIso,
          item.rating.aiRating,
          item.rating.finalRating,
          item.rating.answer,
          item.previousCardJson,
          item.nextCardJson,
          item.intervalSeconds,
          item.nextDueAt
        );
        upsertSchedule.run(
          item.rating.itemId,
          item.nextDueAt,
          item.nextCardJson,
          item.reviewCount,
          reviewedAtIso,
          item.rating.finalRating,
          reviewedAtIso
        );
        entries.push({
          id: eventId,
          sessionId,
          itemId: item.rating.itemId,
          reviewedAt: reviewedAtIso,
          aiRating: item.rating.aiRating,
          finalRating: item.rating.finalRating,
          answer: item.rating.answer,
          intervalSeconds: item.intervalSeconds,
          nextDueAt: item.nextDueAt
        });
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    const remaining = await this.getReviewSummary(reviewedAt);
    return {
      sessionId,
      reviewedAt: reviewedAtIso,
      entries,
      remainingAvailable: remaining.totalAvailable
    };
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

  async createItemsAtomically(
    inputs: CreateLearningItemInput[]
  ): Promise<LearningItem[]> {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new Error("Invalid learning-item batch");
    }
    const items = inputs.map(validateCreate);
    const database = this.#open();
    const insert = database.prepare(`
      INSERT INTO learning_items (
        id, title, item_type, cefr, sense, markdown_content, status,
        created_at, updated_at, trashed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
    `);
    const created: Array<{ id: string; item: CreateLearningItemInput }> = [];
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const item of items) {
        const id = randomUUID();
        const now = new Date().toISOString();
        insert.run(
          id,
          item.title,
          item.itemType,
          item.cefr,
          item.sense,
          item.markdownContent,
          now,
          now
        );
        created.push({ id, item });
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return Promise.all(created.map(({ id }) => this.getItem(id)));
  }

  async updateItem(input: UpdateLearningItemInput): Promise<LearningItem> {
    if (!input || typeof input !== "object") throw new Error("Invalid learning-item update");
    const id = requiredText(input.itemId, "learning item");
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
    if (result.changes !== 1) throw new Error("Learning item not found");
    return this.getItem(id);
  }

  async trashItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "learning item");
    const now = new Date().toISOString();
    const result = this.#open().prepare(`
      UPDATE learning_items SET status = 'trashed', trashed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
    `).run(now, now, id);
    if (result.changes !== 1) throw new Error("No deletable learning item was found");
    return this.getItem(id);
  }

  async restoreItem(itemId: string): Promise<LearningItem> {
    const id = requiredText(itemId, "learning item");
    const now = new Date().toISOString();
    const result = this.#open().prepare(`
      UPDATE learning_items SET status = 'active', trashed_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'trashed'
    `).run(now, id);
    if (result.changes !== 1) throw new Error("No restorable learning item was found");
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
