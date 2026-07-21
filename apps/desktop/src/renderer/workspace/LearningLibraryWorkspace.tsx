export function LearningLibraryWorkspace() {
  return (
    <section className="review-panel" aria-labelledby="review-title">
      <span className="eyebrow">Spaced repetition</span>
      <h1 id="review-title">Anki 式間隔複習</h1>
      <p>
        這裡只處理生詞庫中的到期項目，跨書籍與章節產生填空、造句等題目。
      </p>
      <div className="review-card">
        <strong>今日待複習</strong>
        <b>10</b>
        <span>完成回答後才會更新各項目的複習間隔。</span>
      </div>
    </section>
  );
}
