import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";
import { AiConversationPanel } from "./workspace/AiConversationPanel";
import { LearningLibraryWorkspace } from "./workspace/LearningLibraryWorkspace";
import { PrimaryNavigation } from "./workspace/PrimaryNavigation";
import { ReadingWorkspace } from "./workspace/ReadingWorkspace";

it("exposes and composes the four Renderer workspace boundaries", () => {
  expect(PrimaryNavigation).toBeTypeOf("function");
  expect(ReadingWorkspace).toBeTypeOf("function");
  expect(LearningLibraryWorkspace).toBeTypeOf("function");
  expect(AiConversationPanel).toBeTypeOf("function");

  render(<App />);
  expect(screen.getByLabelText("主要導覽")).toBeInTheDocument();
  expect(screen.getByLabelText("AI 助教")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /生詞庫/i }));
  expect(screen.getByRole("heading", { name: "生詞庫" })).toBeInTheDocument();
});
