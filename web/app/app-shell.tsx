import type { ReactNode } from "react";
import type { Section } from "./workspace-types";

export function Icon({ name }: { name: Section | "plus" | "bag" | "arrow" }) {
  const paths = {
    orders: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h3" />
      </>
    ),
    assistant: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </>
    ),
    stock: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10M7.5 4.5l9 5" />
      </>
    ),
    conversations: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2.2-4.4A8.5 8.5 0 1 1 21 11.5Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    bag: (
      <>
        <rect x="4" y="7" width="16" height="15" rx="3" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Brand() {
  return (
    <span className="wordmark">
      <span className="brand-mark">
        <Icon name="bag" />
      </span>
      PocketDokani<span className="brand-period">.</span>
    </span>
  );
}

const sections: { key: Section; label: string; description: string }[] = [
  {
    key: "orders",
    label: "Orders",
    description: "From draft to delivery, keep your next step in view.",
  },
  {
    key: "assistant",
    label: "Assistant",
    description:
      "Ask in Bangla or English. Answers come from your shop records.",
  },
  {
    key: "stock",
    label: "Stock",
    description: "See what is available, sold out, or on the way.",
  },
  {
    key: "conversations",
    label: "Conversations",
    description: "Review drafts and the screenshots behind your orders.",
  },
];

export default function AppShell({
  judge,
  section,
  busy,
  onNavigate,
  onNewOrder,
  onSignOut,
  onReset,
  children,
}: {
  judge: boolean;
  section: Section;
  busy: boolean;
  onNavigate: (section: Section) => void;
  onNewOrder: () => void;
  onSignOut: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const current = sections.find((item) => item.key === section)!;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <Brand />
        <span className="shop-label">
          {judge ? "Sample shop" : "Your shop"}
        </span>
        <div className="session-actions">
          {judge && (
            <button className="text-button" disabled={busy} onClick={onReset}>
              Reset sample
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-nav" aria-label="Shop sections">
          <p className="nav-caption eyebrow">YOUR WORKSPACE</p>
          {sections.map(({ key, label }) => (
            <button
              key={key}
              aria-current={section === key ? "page" : undefined}
              disabled={busy}
              onClick={() => onNavigate(key)}
            >
              <Icon name={key} />
              <span>{label}</span>
              {key === "assistant" && (
                <span className="nav-hint" lang="bn">
                  সহকারী
                </span>
              )}
            </button>
          ))}
          <div className="nav-note">
            <span className="status-dot" />
            {judge ? "Made for trying things out" : "Your decisions, your shop"}
            <p>
              {judge
                ? "Sample records. Fake courier."
                : "Review and confirm every change."}
            </p>
          </div>
        </nav>
        <main id="main-content" className="app-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {judge ? "EXPLORE POCKETDOKANI" : "LET’S GET TO WORK"}
              </p>
              <h1>{current.label}</h1>
              <p className="muted">{current.description}</p>
            </div>
            <button
              className="primary new-order-button"
              disabled={busy}
              onClick={onNewOrder}
            >
              <Icon name="plus" />
              New order
            </button>
          </div>
          {children}
          <p className="app-footnote">
            AI helps prepare the work. You confirm the details.
          </p>
        </main>
      </div>
    </div>
  );
}
