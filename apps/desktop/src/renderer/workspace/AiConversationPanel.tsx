import type { ReactNode } from "react";

export function AiConversationPanel({
  collapsed,
  children
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      className={collapsed ? "assistant-panel collapsed" : "assistant-panel"}
      aria-label="AI 助教"
    >
      {children}
    </aside>
  );
}
