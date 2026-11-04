import type { ReactNode } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { Voices } from "@/components/khata";
import type { Section } from "@/features/workspace/workspace-types";

export function Icon({
  name,
}: {
  name: Section | "plus" | "bag" | "arrow" | "close";
}) {
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
    close: <path d="m6 6 12 12M18 6 6 18" />,
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
      <span>
        PocketDokani<span className="brand-period">.</span>
      </span>
    </span>
  );
}

const sections: { key: Section; label: string }[] = [
  { key: "orders", label: "Orders" },
  { key: "conversations", label: "Conversations" },
  { key: "assistant", label: "Assistant" },
  { key: "stock", label: "Stock" },
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
        <div className="app-brand">
          <Brand />
          <span className="shop-label" data-sample={judge || undefined}>
            <span className="status-dot" aria-hidden="true" />
            {judge ? (
              <span>
                Sample<span className="narrow-cut"> shop</span>
              </span>
            ) : (
              "Your shop"
            )}
          </span>
        </div>
        <div className="session-actions">
          <ThemeSwitch />
          {judge && (
            <button className="text-button" disabled={busy} onClick={onReset}>
              Reset<span className="narrow-cut"> sample</span>
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={onSignOut}>
            Sign out
          </button>
        </div>
        {busy && (
          <p className="working-status" role="status">
            <span aria-hidden="true">Working…</span>
            <span className="visually-hidden">
              Working… Please wait for this step to finish.
            </span>
          </p>
        )}
      </header>
      <div className="app-body">
        <nav className="app-nav" aria-label="Shop sections">
          {sections.map(({ key, label }) => (
            <button
              key={key}
              className="nav-tab"
              data-section={key}
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
          <button
            className="nav-tab nav-new"
            disabled={busy}
            onClick={onNewOrder}
          >
            <Icon name="plus" />
            <span>New order</span>
          </button>
          <div className="nav-voices">
            <Voices />
          </div>
        </nav>
        <main id="main-content" className="app-main" tabIndex={-1}>
          <header className="page-heading">
            <h1>{current.label}</h1>
            <button
              className="primary new-order-button"
              disabled={busy}
              onClick={onNewOrder}
            >
              <Icon name="plus" />
              New order
            </button>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
