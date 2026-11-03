import type { ReactNode } from "react";

const statuses: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "neutral" },
  packed: { label: "Packed", tone: "success" },
  booked: { label: "Booked", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  returned: { label: "Returned", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  fake: { label: "Fake courier · no parcel is sent", tone: "warning" },
  live: { label: "Live courier · Steadfast", tone: "neutral" },
  disabled: { label: "Booking disabled", tone: "neutral" },
  pass: { label: "Pass", tone: "success" },
  match: { label: "Match", tone: "success" },
  fail: { label: "Fail", tone: "danger" },
  mismatch: { label: "Mismatch", tone: "danger" },
  unsure: { label: "Unsure · review needed", tone: "warning" },
};

export function StatusBadge({ status }: { status: string }) {
  const display = statuses[status] ?? { label: status, tone: "neutral" };
  return (
    <span className="status-badge" data-tone={display.tone}>
      {display.label}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
