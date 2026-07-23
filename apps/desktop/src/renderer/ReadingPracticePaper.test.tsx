import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ReadingPracticePaper,
  ReadingPracticePaperAction
} from "./ReadingPracticePaper";

const quiz = {
  version: 1 as const,
  kind: "quiz" as const,
  quizId: "quiz-one",
  title: "A Walk in the Rain",
  cefr: "B1",
  difficultySummary: "注意因果關係與人物動機。",
  multipleChoice: [{
    id: "mc-1",
    number: 1,
    prompt: "主角為什麼停下腳步？",
    options: {
      A: "他聽見鳥叫",
      B: "他遺失雨傘",
      C: "他看見朋友",
      D: "他覺得疲倦"
    }
  }],
  openEnded: [{
    id: "open-1",
    number: 2,
    prompt: "用自己的話說明雨在文中的作用。"
  }]
};

const grade = {
  version: 1 as const,
  kind: "grade" as const,
  quizId: "quiz-one",
  multipleChoice: [{
    id: "mc-1",
    correct: false,
    correctAnswer: "C" as const,
    feedback: "文中提到他在街角認出了老朋友。"
  }],
  openEnded: [{
    id: "open-1",
    correct: true,
    assessment: "回答切題。",
    correctedAnswer: "雨讓兩人的重逢更意外，也營造懷舊氣氛。",
    feedback: "因果說明清楚，可以再引用一個細節。"
  }],
  summary: {
    score: "0/1",
    reading: "需要再注意人物行動前後的線索。",
    writing: "表達清楚，句子完整。",
    reviewPoints: ["人物動機", "因果連接詞"]
  }
};

function assistantMessage(text: string) {
  return { role: "assistant" as const, text };
}

function artifact(language: string, value: unknown) {
  return `\`\`\`${language}\n${JSON.stringify(value)}\n\`\`\``;
}

describe("ReadingPracticePaper", () => {
  it("renders a chat artifact action with title, question count and grading state", () => {
    const { rerender } = render(
      <ReadingPracticePaperAction quiz={quiz} onOpen={vi.fn()} />
    );

    const action = screen.getByRole("button", {
      name: "開啟試卷：A Walk in the Rain"
    });
    expect(action).toHaveTextContent("A Walk in the Rain");
    expect(action).toHaveTextContent("2 題");
    expect(action).toHaveTextContent("開始作答");
    expect(action).toHaveAttribute("aria-expanded", "false");

    rerender(
      <ReadingPracticePaperAction
        quiz={quiz}
        grade={grade}
        onOpen={vi.fn()}
      />
    );
    expect(action).toHaveTextContent("0/1");
    expect(action).toHaveTextContent("查看紅筆批改");
  });

  it("supports A-D selection, open-ended input and one complete submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <ReadingPracticePaper
        open
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByRole("region", { name: "A Walk in the Rain" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "提交試卷" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("還有 2 題未作答")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "A 他聽見鳥叫" }));
    fireEvent.change(screen.getByLabelText("第 2 題回答"), {
      target: { value: "雨讓重逢更有戲劇性。" }
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      "$submit-reading-practice",
      "Quiz ID: quiz-one",
      "",
      "Multiple-choice answers:",
      "mc-1 (Question 1): A",
      "",
      "Open-ended answers:",
      "open-1 (Question 2):",
      "雨讓重逢更有戲劇性。"
    ].join("\n")));
    expect(await screen.findByText("AI 正在紅筆批改…")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "A 他聽見鳥叫" })).toBeDisabled();
  });

  it("tracks completion with a compact accessible progress overview", () => {
    render(
      <ReadingPracticePaper
        open
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const progress = screen.getByRole("progressbar", {
      name: "試卷作答進度"
    });
    expect(progress).toHaveAttribute("max", "2");
    expect(progress).toHaveAttribute("value", "0");
    expect(screen.getByText("已完成 0 / 2")).toBeInTheDocument();

    const choice = screen.getByRole("radio", { name: "C 他看見朋友" });
    expect(choice.closest(".paper-question")).toHaveAttribute(
      "data-answered",
      "false"
    );
    fireEvent.click(choice);
    expect(progress).toHaveAttribute("value", "1");
    expect(screen.getByText("已完成 1 / 2")).toBeInTheDocument();
    expect(choice.closest(".paper-question")).toHaveAttribute(
      "data-answered",
      "true"
    );

    fireEvent.change(screen.getByLabelText("第 2 題回答"), {
      target: { value: "雨讓重逢更有戲劇性。" }
    });
    expect(progress).toHaveAttribute("value", "2");
    expect(screen.getByText("已完成 2 / 2")).toBeInTheDocument();
  });

  it("keeps secondary metadata folded and groups narrow answer choices", () => {
    render(
      <ReadingPracticePaper
        open
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("2 題")).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
    const focus = screen.getByText("本卷重點").closest("details");
    expect(focus).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("本卷重點"));
    expect(focus).toHaveAttribute("open");
    expect(screen.getByText("注意因果關係與人物動機。"))
      .toBeInTheDocument();
    expect(screen.getByRole("group", { name: "第 1 題選項" }))
      .toBeInTheDocument();
  });

  it("keeps answer choices in one vertical column at every paper width", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/renderer/styles.css"),
      "utf8"
    );

    expect(styles).toContain("container-name: reading-paper");
    expect(styles).toMatch(
      /\.paper-options\s*\{[\s\S]*?grid-template-columns:\s*1fr/
    );
    expect(styles).not.toMatch(
      /@container reading-paper \(min-width: 460px\)\s*\{[\s\S]*?\.paper-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/
    );
    expect(styles).toMatch(
      /\.paper-option\s*\{[\s\S]*?min-height:\s*48px/
    );
    expect(styles).toContain(".paper-option:has(input:focus-visible)");
  });

  it("renders matching AI grading as red pen annotations and a final review", () => {
    render(
      <ReadingPracticePaper
        open
        messages={[
          assistantMessage(artifact("reading-practice-quiz", quiz)),
          assistantMessage(artifact("reading-practice-grade", grade))
        ]}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("AI 紅筆批改")).toBeInTheDocument();
    expect(screen.getByText("✕ 正解 C")).toHaveClass("incorrect");
    expect(screen.getByText("文中提到他在街角認出了老朋友。"))
      .toBeInTheDocument();
    expect(screen.getByText("修正版")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    const summary = screen.getByText("批改總結").closest("details");
    expect(summary).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("批改總結"));
    expect(summary).toHaveAttribute("open");
    expect(screen.getByText("因果連接詞")).toBeInTheDocument();
  });

  it("renders as a collapsible chat artifact and folds with Escape", () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(
      <ReadingPracticePaper
        open={false}
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={onOpen}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", {
      name: "開啟試卷：A Walk in the Rain"
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "開啟試卷：A Walk in the Rain"
    }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "A Walk in the Rain" }))
      .not.toBeInTheDocument();

    rerender(
      <ReadingPracticePaper
        open
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole("region", { name: "A Walk in the Rain" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起試卷" }))
      .toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses normal inline layout without a floating stage", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ReadingPracticePaper
        open
        messages={[assistantMessage(artifact("reading-practice-quiz", quiz))]}
        onOpen={vi.fn()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    const paper = screen.getByRole("region", { name: "A Walk in the Rain" });
    expect(container.querySelector(".reading-practice-stage")).toBeNull();
    fireEvent.mouseDown(paper);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps in-progress answers when the paper is closed and reopened", () => {
    const props = {
      messages: [assistantMessage(artifact("reading-practice-quiz", quiz))],
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onSubmit: vi.fn()
    };
    const { rerender } = render(
      <ReadingPracticePaper open {...props} />
    );

    fireEvent.click(screen.getByRole("radio", { name: "C 他看見朋友" }));
    fireEvent.change(screen.getByLabelText("第 2 題回答"), {
      target: { value: "雨營造懷舊氣氛。" }
    });
    rerender(<ReadingPracticePaper open={false} {...props} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "開啟試卷：A Walk in the Rain"
    })).toBeInTheDocument();

    rerender(<ReadingPracticePaper open {...props} />);
    expect(screen.getByRole("radio", { name: "C 他看見朋友" }))
      .toBeChecked();
    expect(screen.getByLabelText("第 2 題回答"))
      .toHaveValue("雨營造懷舊氣氛。");
  });
});
