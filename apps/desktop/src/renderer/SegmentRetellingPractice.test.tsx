import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentRetellingPractice } from "./SegmentRetellingPractice";

const task = {
  version: 1,
  kind: "task",
  practiceId: "retelling-one",
  title: "Retell this passage",
  answerLanguage: "English",
  answerInstruction: "請使用英文表達原意或復述。"
};

const firstGrade = {
  version: 1,
  kind: "grade",
  practiceId: "retelling-one",
  attempt: 1,
  feedback: {
    strengths: ["有抓到作者支持長期投資。"],
    contentCorrections: ["作者沒有主張忽略風險。"],
    omissions: ["遺漏複利的因果關係。"],
    languageImprovements: ["react emotionally 更自然。"]
  },
  foundationalRevision: "The author supports long-term investing because returns compound.",
  foundationalChanges: {
    content: ["修正作者對風險的立場。"],
    language: ["改用 supports long-term investing。"]
  },
  nextStepRevision: "The author supports long-term investing because returns compound over time, but emotional reactions can interrupt the process.",
  addedDetails: ["加入情緒反應會中斷複利。"],
  scores: {
    accuracy: { score: 4, reason: "主旨正確。" },
    completeness: { score: 3, reason: "遺漏一項因果。" },
    expression: { score: 4, reason: "大致清楚。" },
    total: 11
  }
};

const secondGrade = {
  ...firstGrade,
  attempt: 2,
  feedback: { ...firstGrade.feedback, omissions: [] },
  scores: {
    accuracy: { score: 5, reason: "內容正確。" },
    completeness: { score: 4, reason: "大多完整。" },
    expression: { score: 5, reason: "自然清楚。" },
    total: 14
  },
  comparison: {
    summary: "第二次修正誤解並補回關鍵因果。",
    accuracyDelta: 1,
    completenessDelta: 1,
    expressionDelta: 1,
    totalDelta: 3
  }
};

function artifact(language: string, value: unknown) {
  return `\`\`\`${language}\n${JSON.stringify(value)}\n\`\`\``;
}

function messages(...values: Array<[string, unknown]>) {
  return values.map(([language, value]) => ({
    role: "assistant" as const,
    text: artifact(language, value)
  }));
}

describe("SegmentRetellingPractice", () => {
  it("renders a collapsible paper-style action and one freeform answer box", () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <SegmentRetellingPractice
        open={false}
        messages={messages(["reading-retelling-task", task])}
        onOpen={onOpen}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Open retelling practice: Retell this passage"
    }));
    expect(onOpen).toHaveBeenCalledOnce();

    rerender(
      <SegmentRetellingPractice
        open
        messages={messages(["reading-retelling-task", task])}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    const paper = screen.getByRole("region", { name: "Retell this passage" });
    expect(paper).toHaveClass("reading-practice-paper");
    expect(paper).toHaveClass("segment-retelling-practice");
    expect(screen.getByText("請使用英文表達原意或復述。"))
      .toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByText(/main point/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/supporting detail/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/word limit/i)).not.toBeInTheDocument();
  });

  it("submits one non-empty answer and locks it while AI grades", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <SegmentRetellingPractice
        open
        messages={messages(["reading-retelling-task", task])}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const submit = screen.getByRole("button", { name: "Submit retelling" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Retelling attempt 1"), {
      target: { value: "The author believes long-term investing compounds." }
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      "$submit-segment-retelling",
      "Practice ID: retelling-one",
      "Attempt: 1",
      "Answer language: English",
      "",
      "Learner retelling:",
      "The author believes long-term investing compounds."
    ].join("\n")));
    expect(await screen.findByText("AI is grading…")).toBeInTheDocument();
    expect(screen.getByLabelText("Retelling attempt 1")).toBeDisabled();
  });

  it("shows feedback, two revisions and the three-part score in teaching order", () => {
    render(
      <SegmentRetellingPractice
        open
        messages={messages(
          ["reading-retelling-task", task],
          ["reading-retelling-grade", firstGrade]
        )}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const paper = screen.getByRole("region", { name: "Retell this passage" });
    const feedback = within(paper).getByRole("heading", { name: "Feedback" });
    const foundation = within(paper).getByRole("heading", {
      name: "Foundational revision"
    });
    const nextStep = within(paper).getByRole("heading", {
      name: "Next-step revision"
    });
    const score = within(paper).getByRole("heading", { name: "Score" });
    expect(feedback.compareDocumentPosition(foundation) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foundation.compareDocumentPosition(nextStep) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nextStep.compareDocumentPosition(score) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("作者沒有主張忽略風險。"))
      .toBeInTheDocument();
    expect(screen.getByText(firstGrade.foundationalRevision))
      .toBeInTheDocument();
    expect(screen.getByText(firstGrade.nextStepRevision)).toBeInTheDocument();
    expect(screen.getByText("11 / 15")).toBeInTheDocument();
    expect(screen.getByText("Accuracy").closest("article"))
      .toHaveTextContent("4 / 5");
    expect(screen.getByText("Completeness").closest("article"))
      .toHaveTextContent("3 / 5");
    expect(screen.getByText("Expression").closest("article"))
      .toHaveTextContent("4 / 5");
  });

  it("starts one blank second attempt while keeping the first result", () => {
    render(
      <SegmentRetellingPractice
        open
        messages={messages(
          ["reading-retelling-task", task],
          ["reading-retelling-grade", firstGrade]
        )}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retell again" }));
    expect(screen.getByText("11 / 15")).toBeInTheDocument();
    expect(screen.getByLabelText("Retelling attempt 2")).toHaveValue("");
    expect(screen.getByLabelText("Retelling attempt 2")).not
      .toHaveValue(firstGrade.foundationalRevision);
  });

  it("keeps an unfinished draft when folded and submits the second attempt as attempt 2", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const props = {
      messages: messages(
        ["reading-retelling-task", task],
        ["reading-retelling-grade", firstGrade]
      ),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onSubmit
    };
    const { rerender } = render(
      <SegmentRetellingPractice open {...props} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Retell again" }));
    fireEvent.change(screen.getByLabelText("Retelling attempt 2"), {
      target: { value: "My improved second retelling." }
    });

    rerender(<SegmentRetellingPractice open={false} {...props} />);
    expect(screen.queryByLabelText("Retelling attempt 2")).not
      .toBeInTheDocument();
    rerender(<SegmentRetellingPractice open {...props} />);
    expect(screen.getByLabelText("Retelling attempt 2"))
      .toHaveValue("My improved second retelling.");
    fireEvent.click(screen.getByRole("button", { name: "Submit retelling" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      "$submit-segment-retelling",
      "Practice ID: retelling-one",
      "Attempt: 2",
      "Answer language: English",
      "",
      "Learner retelling:",
      "My improved second retelling."
    ].join("\n")));
  });

  it("compares the second result and never offers a third attempt", () => {
    render(
      <SegmentRetellingPractice
        open
        messages={messages(
          ["reading-retelling-task", task],
          ["reading-retelling-grade", firstGrade],
          ["reading-retelling-grade", secondGrade]
        )}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Attempt comparison")).toBeInTheDocument();
    expect(screen.getByText(secondGrade.comparison.summary)).toBeInTheDocument();
    expect(screen.getByText("+3 total")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retell again" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retelling attempt 3"))
      .not.toBeInTheDocument();
  });
});
