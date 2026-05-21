import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export default function EmptyState({ title, description, children }: Props) {
  return (
    <div className="empty-state card stack" style={{ textAlign: "center", padding: "24px 18px" }}>
      <div className="empty-state-icon" aria-hidden>
        ◇
      </div>
      <strong style={{ color: "var(--text)", fontSize: 17 }}>{title}</strong>
      {description && <p style={{ fontSize: 14, margin: 0 }}>{description}</p>}
      {children}
    </div>
  );
}
