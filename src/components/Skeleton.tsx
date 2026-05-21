import type { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

export function Skeleton({ className, style, "aria-label": ariaLabel = "Loading" }: Props) {
  return <div className={`skeleton ${className ?? ""}`.trim()} style={style} aria-label={ariaLabel} aria-busy="true" />;
}
