import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("keeps chapter practice separate from spaced review", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeInTheDocument();
    expect(screen.getByText("章末選擇題", { selector: ".flow-tags span" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anki 複習/ }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Anki 複習/ }));

    expect(
      screen.getByRole("heading", { name: "Anki 式間隔複習" })
    ).toBeInTheDocument();
    expect(screen.getByText(/跨書籍與章節產生填空、造句/))
      .toBeInTheDocument();
  });

  it("adds a user message to the assistant panel", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "這句話的文法是什麼？" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.getByText("這句話的文法是什麼？")).toBeInTheDocument();
  });
});

