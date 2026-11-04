import type { ReactNode } from "react";

export type StampTone = "pass" | "fail" | "unsure" | "neutral";

export function Stamp({
  tone,
  children,
}: {
  tone: StampTone;
  children: ReactNode;
}) {
  return (
    <span className="stamp" data-tone={tone}>
      {children}
    </span>
  );
}

export function Voices() {
  return (
    <p className="voices">
      <span className="ai-mark">AI read</span>
      <span aria-hidden="true">·</span>
      <span className="voices-code">Code checked</span>
      <span aria-hidden="true">·</span>
      <span className="voices-you">You decide</span>
    </p>
  );
}

export function Scan({ label }: { label: string }) {
  return (
    <div className="scan">
      <span className="scan-label">{label}</span>
    </div>
  );
}
