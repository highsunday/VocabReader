import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LearningLibraryWorkspace } from "./workspace/LearningLibraryWorkspace";

it("shows a real zero-item Learning Library instead of the review placeholder", () => {
  render(<LearningLibraryWorkspace />);

  expect(screen.getByRole("heading", { name: "生詞庫" })).toBeInTheDocument();
  expect(screen.getByText("0 筆學習項目")).toBeInTheDocument();
  expect(screen.queryByText("今日待複習")).not.toBeInTheDocument();
  expect(screen.queryByText("10", { exact: true })).not.toBeInTheDocument();
});
