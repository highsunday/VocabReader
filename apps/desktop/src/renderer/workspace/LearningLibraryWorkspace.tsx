import { useEffect, useState } from "react";
import type {
  LearningItem,
  LearningListStatus,
  UpdateLearningItemInput
} from "../../shared/learning-contracts";

type EditFields = Omit<UpdateLearningItemInput, "itemId">;

function fieldsFor(item: LearningItem): EditFields {
  return {
    displayForm: item.displayForm,
    canonicalForm: item.canonicalForm,
    itemType: item.itemType,
    partOfSpeech: item.partOfSpeech,
    contextualMeaning: item.contextualMeaning,
    conciseExplanation: item.conciseExplanation,
    cefr: item.cefr,
    pronunciation: item.pronunciation,
    collocationNotes: item.collocationNotes
  };
}

export function LearningLibraryWorkspace({
  items = [],
  status = "active",
  selectedItem,
  isLoading = false,
  error = "",
  notice = "",
  onStatusChange,
  onSelect,
  onSave,
  onArchive
}: {
  items?: LearningItem[];
  status?: LearningListStatus;
  selectedItem?: LearningItem;
  isLoading?: boolean;
  error?: string;
  notice?: string;
  onStatusChange?: (status: LearningListStatus) => void;
  onSelect?: (item: LearningItem) => void;
  onSave?: (input: UpdateLearningItemInput) => void;
  onArchive?: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState<EditFields | undefined>();
  useEffect(() => setEditing(selectedItem ? fieldsFor(selectedItem) : undefined), [selectedItem]);

  return (
    <section className="learning-library-panel" aria-labelledby="learning-library-title">
      <span className="eyebrow">Learning library</span>
      <h1 id="learning-library-title">生詞庫</h1>
      <p>保存從閱讀標記建立的學習項目；AI 整理與間隔複習將在後續階段加入。</p>
      <div className="learning-library-toolbar">
        <strong>{items.length} 筆學習項目</strong>
        <div role="group" aria-label="生詞庫篩選">
          <button type="button" className={status === "active" ? "active" : ""}
            onClick={() => onStatusChange?.("active")}>使用中</button>
          <button type="button" className={status === "archived" ? "active" : ""}
            onClick={() => onStatusChange?.("archived")}>已封存</button>
        </div>
      </div>
      {error ? <p className="library-error" role="alert">{error}</p> : null}
      {notice ? <p className="learning-library-notice" role="status">{notice}</p> : null}
      {isLoading ? <p role="status">生詞庫載入中…</p> : null}
      {!isLoading && !items.length ? (
        <div className="learning-library-empty">
          <strong>{status === "active" ? "尚未加入學習項目" : "尚未有封存項目"}</strong>
          <span>在章節閱讀中對標記選擇「加入生詞庫」即可建立待 AI 整理項目。</span>
        </div>
      ) : null}
      <div className="learning-library-layout">
        <div className="learning-item-list" aria-label="學習項目清單">
          {items.map((item) => (
            <button key={item.id} type="button"
              className={selectedItem?.id === item.id ? "learning-item-card active" : "learning-item-card"}
              onClick={() => onSelect?.(item)}>
              <span>{item.status === "pending_ai" ? "待 AI 整理" : "已封存"}</span>
              <strong>{item.displayForm}</strong>
              <small>{item.sources[0]?.bookTitle} · {item.sources[0]?.chapterTitle}</small>
            </button>
          ))}
        </div>
        {selectedItem && editing ? (
          <form className="learning-item-detail" onSubmit={(event) => {
            event.preventDefault();
            onSave?.({ itemId: selectedItem.id, ...editing });
          }}>
            <h2>{selectedItem.displayForm}</h2>
            <label>顯示詞形<input value={editing.displayForm}
              onChange={(event) => setEditing({ ...editing, displayForm: event.target.value })} /></label>
            <label>Canonical form<input value={editing.canonicalForm}
              onChange={(event) => setEditing({ ...editing, canonicalForm: event.target.value })} /></label>
            <label>類型<select value={editing.itemType}
              onChange={(event) => setEditing({ ...editing, itemType: event.target.value as EditFields["itemType"] })}>
              <option value="word">word</option><option value="phrase">phrase</option>
            </select></label>
            <label>詞性<input value={editing.partOfSpeech ?? ""}
              onChange={(event) => setEditing({ ...editing, partOfSpeech: event.target.value || null })} /></label>
            <label>本文語義<textarea value={editing.contextualMeaning}
              onChange={(event) => setEditing({ ...editing, contextualMeaning: event.target.value })} /></label>
            <label>簡明解釋<textarea value={editing.conciseExplanation}
              onChange={(event) => setEditing({ ...editing, conciseExplanation: event.target.value })} /></label>
            <label>CEFR<input value={editing.cefr ?? ""}
              onChange={(event) => setEditing({ ...editing, cefr: event.target.value || null })} /></label>
            <label>發音文字<input value={editing.pronunciation ?? ""}
              onChange={(event) => setEditing({ ...editing, pronunciation: event.target.value || null })} /></label>
            <label>搭配／用法筆記<textarea value={editing.collocationNotes ?? ""}
              onChange={(event) => setEditing({ ...editing, collocationNotes: event.target.value || null })} /></label>
            <div className="learning-item-actions">
              <button type="submit">儲存變更</button>
              {selectedItem.status === "pending_ai" ? <button type="button" onClick={() => onArchive?.(selectedItem.id)}>封存項目</button> : null}
            </div>
            <section aria-label="來源快照"><h3>來源</h3>{selectedItem.sources.map((source) => (
              <article key={source.id} className="learning-source-card">
                <strong>{source.bookTitle}{source.bookAvailable ? "" : "（原書已刪除）"}</strong>
                <span>{source.chapterTitle}</span>
                <q>{source.annotationText}</q>
                <p>{source.sourceSentence}</p>
              </article>
            ))}</section>
          </form>
        ) : null}
      </div>
    </section>
  );
}
