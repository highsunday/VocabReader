import type { ReactNode } from "react";

export function PrimaryNavigation({
  collapsed,
  children
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      className={collapsed ? "sidebar collapsed" : "sidebar"}
      aria-label="主要導覽"
    >
      {children}
    </aside>
  );
}
