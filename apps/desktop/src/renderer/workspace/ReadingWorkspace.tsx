import type { ReactNode, RefObject, UIEventHandler } from "react";

export function ReadingWorkspace({
  isReader,
  contentRef,
  onScroll,
  children
}: {
  isReader: boolean;
  contentRef: RefObject<HTMLElement | null>;
  onScroll: UIEventHandler<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <main
      className={isReader ? "content reader-content" : "content"}
      ref={contentRef}
      onScroll={onScroll}
    >
      {children}
    </main>
  );
}
