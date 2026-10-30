"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import BusinessLists, {
  type Order,
  type Payout,
  type StockItem,
} from "./business-lists";
import { api, ApiError, json } from "./api";
import DraftEditor from "./draft-editor";
import Assistant from "./assistant";

type Context = "seller" | "judge";
type Source = {
  id: string;
  sequence: number;
  filename: string;
  sha256: string;
  url: string;
  size: number;
  width: number;
  height: number;
};
type Workspace = {
  id: string;
  reference: string;
  layout: string;
  context: Context;
  created_at: string;
  seller_side: "left" | "right";
  confirmed_by: string;
  confirmed_at: string;
  sources: Source[];
};
type Pending = { key: string; file: File; url: string };

function bytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export default function WorkspaceApp({ context }: { context: Context }) {
  const judge = context === "judge";
  const base = `/api/${context}`;
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passcode, setPasscode] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [section, setSection] = useState<
    "orders" | "stock" | "conversations" | "assistant"
  >("orders");
  const [pending, setPending] = useState<Pending[]>([]);
  const [assistantVersion, setAssistantVersion] = useState(0);
  const pendingRef = useRef<Pending[]>([]);
  const nextPendingKey = useRef(0);
  const [sellerSide, setSellerSide] = useState<"left" | "right">("right");
  const [confirmed, setConfirmed] = useState(false);
  const [view, setView] = useState<Source | Pending | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (preserveSection = false) => {
      const [items, skus, orderRecords, payoutRecords] = await Promise.all([
        api<Workspace[]>(`${base}/workspaces`),
        api<StockItem[]>(`${base}/stock`),
        api<Order[]>(`${base}/orders`),
        api<Payout[]>(`${base}/payouts`),
      ]);
      setStock(skus);
      setOrders(orderRecords);
      setPayouts(payoutRecords);
      const id = new URLSearchParams(window.location.search).get("workspace");
      const selected = id
        ? items.find((item) => item.id === id) ||
          (await api<Workspace>(`${base}/workspaces/${encodeURIComponent(id)}`))
        : null;
      setWorkspaces(
        selected && !items.some((item) => item.id === selected.id)
          ? [selected, ...items]
          : items,
      );
      setActive(selected);
      if (selected && !preserveSection) setSection("conversations");
    },
    [base],
  );

  useEffect(() => {
    let stopped = false;
    api(`${base}/session`)
      .then(async () => {
        if (stopped) return;
        // Upgrade an existing screenshot-only judge session without replacing it.
        if (judge) await api(`${base}/session`, { method: "POST" });
        if (stopped) return;
        setSignedIn(true);
        await load();
      })
      .catch((cause: unknown) => {
        if (!stopped && !(cause instanceof ApiError && cause.status === 401))
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this workspace.",
          );
      })
      .finally(() => {
        if (!stopped) setReady(true);
      });
    return () => {
      stopped = true;
    };
  }, [base, judge, load]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () =>
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)),
    [],
  );

  function chooseWorkspace(workspace: Workspace | null) {
    setActive(workspace);
    setSection("conversations");
    const url = new URL(window.location.href);
    if (workspace) url.searchParams.set("workspace", workspace.id);
    else url.searchParams.delete("workspace");
    window.history.replaceState(null, "", url);
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSignedIn(false);
        setWorkspaces([]);
        setStock([]);
        setOrders([]);
        setPayouts([]);
        setActive(null);
        dialogRef.current?.close();
        setView(null);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      await api(
        `${base}/session`,
        judge ? { method: "POST" } : json("POST", { passcode }),
      );
      setPasscode("");
      setSignedIn(true);
      await load();
    });
  }

  async function openExample(reset = false) {
    await act(async () => {
      const workspace = await api<Workspace>(
        `${base}/example`,
        json("POST", {
          workspace_id: reset ? (active?.id ?? workspaces[0]?.id) : undefined,
        }),
      );
      chooseWorkspace(workspace);
      setAssistantVersion((version) => version + 1);
      await load();
      setSection(section);
      setNotice(
        reset
          ? "Your constructed example has been reset."
          : "Constructed example opened.",
      );
    });
  }

  function selectFiles(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    let message = "";
    if (pending.length + selected.length > 12)
      message = "Choose at most 12 screenshots per workspace.";
    else if (
      selected.some(
        (file) =>
          !["image/png", "image/jpeg", "image/webp"].includes(file.type),
      )
    )
      message =
        "Choose PNG, JPEG or WebP screenshots. HEIC and other formats need to be exported first.";
    else if (selected.some((file) => !file.size || file.size > 8 * 1024 * 1024))
      message = "Each screenshot must be nonempty and at most 8 MiB.";
    else if (
      [...pending.map((item) => item.file), ...selected].reduce(
        (sum, file) => sum + file.size,
        0,
      ) >
      32 * 1024 * 1024
    )
      message = "Choose at most 32 MiB in total.";
    if (fileRef.current) fileRef.current.value = "";
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setConfirmed(false);
    const additions = selected.map((file) => ({
      key: String(++nextPendingKey.current),
      file,
      url: URL.createObjectURL(file),
    }));
    setPending((items) => [...items, ...additions]);
  }

  function move(index: number, offset: number) {
    setConfirmed(false);
    setPending((items) => {
      const next = [...items];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  function discardPending() {
    pending.forEach((item) => URL.revokeObjectURL(item.url));
    setPending([]);
    setConfirmed(false);
  }

  async function importBatch(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const form = new FormData();
      pending.forEach((item) => form.append("files", item.file));
      form.set("layout", "messenger-mobile-bubbles-v1");
      form.set("seller_side", sellerSide);
      form.set("sides_confirmed", "yes");
      const workspace = await api<Workspace>(`${base}/workspaces`, {
        method: "POST",
        body: form,
      });
      setWorkspaces((items) => [workspace, ...items]);
      chooseWorkspace(workspace);
      discardPending();
      setNotice(
        "Conversation saved. The original screenshots are ready to reopen.",
      );
    });
  }

  function preview(source: Source | Pending) {
    setView(source);
    setImageFailed(false);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <header className="site-header content-grid">
        <div className="header-row">
          <a className="wordmark" href={judge ? "/judge" : "/"}>
            <span className="brand-mark" aria-hidden="true">
              ↗
            </span>
            PocketDokani
          </a>
          <span className={`context-tag ${judge ? "judge" : ""}`}>
            {judge ? "Constructed judge example" : "Private shop workspace"}
          </span>
          <a className="quiet-link" href={judge ? "/" : "/judge"}>
            {judge ? "Seller sign-in" : "Try judge example"} ↗
          </a>
        </div>
      </header>
      <main className="content-grid">
        <div className="intro">
          <p className="eyebrow">CHAT → EVIDENCE → ORDER</p>
          <h1>
            Every order starts
            <br />
            with a conversation.
          </h1>
          <p className="lead">
            Your orders, stock and original conversations, in one place.
            <br />A clear trail for the work that comes next.
          </p>
        </div>
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="message success" role="status">
            {notice}
          </div>
        )}
        {!ready ? (
          <p role="status">Opening your workspace…</p>
        ) : !signedIn ? (
          <section className="panel login-panel">
            <span className="step-number">01</span>
            <h2>{judge ? "Take a look around." : "Open your shop."}</h2>
            <p>
              {judge
                ? "Explore constructed orders, stock, payouts and screenshots. Only your own example can be reset."
                : "Enter the shop passcode to import and reopen private conversations."}
            </p>
            <form onSubmit={signIn} className="stack">
              {!judge && (
                <label>
                  Shop passcode
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    value={passcode}
                    onChange={(event) => setPasscode(event.target.value)}
                  />
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Opening…"
                  : judge
                    ? "Start judge session ↗"
                    : "Open private workspace ↗"}
              </button>
            </form>
            <p className="fine-print">
              {judge
                ? "No real customer data. Live extraction uses this session’s constructed shop."
                : "Private evidence is accessible only after seller sign-in."}
            </p>
          </section>
        ) : (
          <>
            <nav className="workspace-toolbar" aria-label="Workspace actions">
              <p>
                <span className="status-dot" />
                {judge ? "Judge session" : "Shop signed in"}
              </p>
              <div className="button-row">
                {judge && (
                  <button
                    disabled={busy}
                    onClick={() => openExample(Boolean(workspaces.length))}
                  >
                    Reset judge shop
                  </button>
                )}
                {!judge && active && (
                  <button disabled={busy} onClick={() => chooseWorkspace(null)}>
                    New import +
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api(`${base}/session`, { method: "DELETE" });
                      setSignedIn(false);
                      setActive(null);
                      setWorkspaces([]);
                      setStock([]);
                      setOrders([]);
                      setPayouts([]);
                      discardPending();
                      dialogRef.current?.close();
                      setView(null);
                    })
                  }
                >
                  Sign out
                </button>
              </div>
            </nav>
            <nav className="business-nav" aria-label="Shop sections">
              {(["orders", "stock", "conversations", "assistant"] as const).map(
                (item) => (
                  <button
                    key={item}
                    aria-current={section === item ? "page" : undefined}
                    disabled={busy}
                    onClick={() => setSection(item)}
                  >
                    {item === "orders"
                      ? "Orders"
                      : item === "stock"
                        ? "Stock"
                        : item === "assistant"
                          ? "সহকারী · Assistant"
                          : "Conversations"}
                  </button>
                ),
              )}
            </nav>
            <div hidden={section !== "assistant"}>
              <Assistant
                key={assistantVersion}
                base={base}
                busy={busy}
                act={act}
                onChange={() => load(true)}
                onDraft={async (id) => {
                  chooseWorkspace(
                    await api<Workspace>(
                      `${base}/workspaces/${encodeURIComponent(id)}`,
                    ),
                  );
                  await load();
                }}
                onRecord={(record) => {
                  setSection(record.section);
                  requestAnimationFrame(() => {
                    const element = document.getElementById(
                      `${record.kind}-${record.key}`,
                    );
                    if (element instanceof HTMLDetailsElement)
                      element.open = true;
                    element?.closest("details")?.setAttribute("open", "");
                    element?.scrollIntoView({ block: "center" });
                  });
                }}
              />
            </div>
            {section === "assistant" ? null : section !== "conversations" ? (
              <BusinessLists
                view={section}
                orders={orders}
                stock={stock}
                payouts={payouts}
                base={base}
                busy={busy}
                act={act}
                onChange={() => load(true)}
                onOpenWorkspace={(id) =>
                  act(async () =>
                    chooseWorkspace(
                      await api<Workspace>(
                        `${base}/workspaces/${encodeURIComponent(id)}`,
                      ),
                    ),
                  )
                }
              />
            ) : (
              <div className="workspace-layout">
                <section className="panel workspace-main">
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        const workspace = await api<Workspace>(
                          `${base}/order-drafts`,
                          json("POST", {
                            request_id: crypto.randomUUID(),
                            values: {
                              customer_name: null,
                              phone: null,
                              address: null,
                              customer_delivery_charge: null,
                              order_confirmed: null,
                              lines: [],
                            },
                          }),
                        );
                        chooseWorkspace(workspace);
                        await load();
                      })
                    }
                  >
                    New draft +
                  </button>
                  {active ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">
                            {active.layout === "seller-draft-v1"
                              ? "ORDER DRAFT"
                              : "SAVED CONVERSATION"}
                          </p>
                          <h2 className="reference">{active.reference}</h2>
                        </div>
                        <span className="pill">
                          {active.sources.length} originals
                        </span>
                      </div>
                      {active.layout !== "seller-draft-v1" && (
                        <>
                          <p className="coverage-note">
                            Selected screenshots only. This batch may leave out
                            parts of the conversation.
                          </p>
                          <div className="confirmation">
                            <strong>
                              Seller: {active.seller_side} bubbles
                            </strong>
                            <span>
                              Customer:{" "}
                              {active.seller_side === "right"
                                ? "left"
                                : "right"}{" "}
                              bubbles
                            </span>
                            <small>
                              Confirmed by {active.confirmed_by} ·{" "}
                              {new Date(active.confirmed_at).toLocaleString()}
                            </small>
                          </div>
                        </>
                      )}
                      <ol className="saved-sources">
                        {active.sources.map((source) => (
                          <li key={source.id} className="saved-source">
                            <button
                              className="image-button"
                              onClick={() => preview(source)}
                              aria-label={`Open original screenshot ${source.sequence}`}
                            >
                              <img
                                src={source.url}
                                alt={`Original screenshot ${source.sequence}`}
                                loading="lazy"
                              />
                            </button>
                            <div className="source-details">
                              <p className="eyebrow">
                                SCREENSHOT{" "}
                                {String(source.sequence).padStart(2, "0")}
                              </p>
                              <h3>{source.filename}</h3>
                              <p>
                                {source.width} × {source.height} ·{" "}
                                {bytes(source.size)}
                              </p>
                              <button onClick={() => preview(source)}>
                                Open original ↗
                              </button>
                              <details>
                                <summary>Original fingerprint</summary>
                                <code>{source.sha256}</code>
                              </details>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <DraftEditor
                        key={active.id}
                        base={base}
                        workspaceId={active.id}
                        stock={stock}
                        busy={busy}
                        act={act}
                        onSource={(sequence) => {
                          const source = active.sources.find(
                            (item) => item.sequence === sequence,
                          );
                          if (source) preview(source);
                        }}
                        onChange={async () =>
                          setOrders(await api<Order[]>(`${base}/orders`))
                        }
                      />
                      {judge && (
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => openExample(true)}
                        >
                          {busy ? "Resetting…" : "Reset my constructed example"}
                        </button>
                      )}
                    </>
                  ) : judge ? (
                    <div className="empty-state">
                      <span className="step-number">01</span>
                      <h2>A safe place to try it.</h2>
                      <p>
                        Open two constructed Messenger-style screenshots. The
                        seller speaks on the right. The catalogue includes
                        received and in-transit lots.
                      </p>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => openExample()}
                      >
                        {busy ? "Loading…" : "Load constructed example ↗"}
                      </button>
                    </div>
                  ) : (
                    <form className="import-form" onSubmit={importBatch}>
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">NEW CONVERSATION</p>
                          <h2>Start with the evidence.</h2>
                        </div>
                        <span className="step-number">01</span>
                      </div>
                      <p>
                        Choose screenshots from one conversation, then put them
                        in reading order.
                      </p>
                      <label className="upload-box">
                        <span className="upload-icon" aria-hidden="true">
                          ↥
                        </span>
                        <strong>Choose screenshots</strong>
                        <span>
                          PNG, JPEG or WebP · 8 MiB each
                          <br />
                          Up to 12 files, 32 MiB per batch
                        </span>
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy}
                          onChange={(event) => selectFiles(event.target.files)}
                        />
                      </label>
                      {pending.length > 0 && (
                        <>
                          <div className="section-heading">
                            <h3>Reading order</h3>
                            <span className="pill">
                              {pending.length} selected
                            </span>
                          </div>
                          <p className="fine-print">
                            Phone pickers can change selection order. Check it
                            here before saving.
                          </p>
                          <ol className="pending-sources">
                            {pending.map((item, index) => (
                              <li className="pending-source" key={item.key}>
                                <button
                                  type="button"
                                  className="image-button"
                                  onClick={() => preview(item)}
                                  aria-label={`Preview screenshot ${index + 1}`}
                                >
                                  <img
                                    src={item.url}
                                    alt={`Selected screenshot ${index + 1}`}
                                  />
                                </button>
                                <div className="pending-details">
                                  <strong>
                                    {String(index + 1).padStart(2, "0")} ·{" "}
                                    {item.file.name}
                                  </strong>
                                  <span>{bytes(item.file.size)}</span>
                                  <div className="button-row">
                                    <button
                                      type="button"
                                      disabled={busy || index === 0}
                                      onClick={() => move(index, -1)}
                                      aria-label={`Move screenshot ${index + 1} earlier`}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        busy || index === pending.length - 1
                                      }
                                      onClick={() => move(index, 1)}
                                      aria-label={`Move screenshot ${index + 1} later`}
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        URL.revokeObjectURL(item.url);
                                        setPending((items) =>
                                          items.filter(
                                            (value) => value.key !== item.key,
                                          ),
                                        );
                                        setConfirmed(false);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                          <fieldset>
                            <legend>Confirm the speaker sides</legend>
                            <p>
                              Supported layout: a one-to-one Messenger mobile
                              conversation with left and right message bubbles,
                              read from top to bottom. Other layouts need to be
                              re-captured.
                            </p>
                            <label>
                              Seller messages are on the
                              <select
                                value={sellerSide}
                                disabled={busy}
                                onChange={(event) => {
                                  setSellerSide(
                                    event.target.value as "left" | "right",
                                  );
                                  setConfirmed(false);
                                }}
                              >
                                <option value="right">
                                  Right — customer on the left
                                </option>
                                <option value="left">
                                  Left — customer on the right
                                </option>
                              </select>
                            </label>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                required
                                checked={confirmed}
                                disabled={busy}
                                onChange={(event) =>
                                  setConfirmed(event.target.checked)
                                }
                              />
                              <span>
                                I checked the previews, reading order and
                                speaker sides. These screenshots use the
                                supported layout.
                              </span>
                            </label>
                          </fieldset>
                          <p className="coverage-note">
                            This preserves the selected batch; it does not
                            establish that the whole conversation is present.
                          </p>
                          <button
                            className="primary"
                            disabled={busy || !confirmed}
                          >
                            {busy ? "Saving originals…" : "Save conversation ↗"}
                          </button>
                        </>
                      )}
                    </form>
                  )}
                </section>
                <aside className="workspace-aside stack">
                  <section className="panel compact">
                    <p className="eyebrow">YOUR TRAIL</p>
                    <h2>Conversations</h2>
                    {workspaces.length ? (
                      <ul className="workspace-list">
                        {workspaces.map((item) => (
                          <li key={item.id}>
                            <button
                              disabled={busy}
                              aria-current={
                                active?.id === item.id ? "page" : undefined
                              }
                              onClick={() => chooseWorkspace(item)}
                            >
                              <strong>{item.reference}</strong>
                              <span>
                                {item.sources.length} screenshots ·{" "}
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        Your saved conversations will appear here.
                      </p>
                    )}
                  </section>
                  <p className="aside-note">
                    ↳ Every original stays linked to its conversation. A
                    screenshot of a voice note does not provide its audio.
                  </p>
                </aside>
              </div>
            )}
          </>
        )}
        <footer>
          <span>PocketDokani</span>
          <span>From chat to parcel, with evidence.</span>
        </footer>
      </main>
      <dialog
        ref={dialogRef}
        className="source-dialog"
        onClose={() => setView(null)}
      >
        {view && (
          <>
            <div className="section-heading">
              <h2>
                {"file" in view
                  ? "Selected screenshot"
                  : `Original · screenshot ${view.sequence}`}
              </h2>
              <button onClick={() => dialogRef.current?.close()} autoFocus>
                Close ×
              </button>
            </div>
            <p>{"file" in view ? view.file.name : view.filename}</p>
            {imageFailed ? (
              <p role="alert">
                This image could not be opened. Your session may have expired;
                close this preview and sign in again.
              </p>
            ) : (
              <img
                src={view.url}
                alt="Full original conversation screenshot"
                onError={() => setImageFailed(true)}
              />
            )}
            {!("file" in view) && (
              <details>
                <summary>SHA-256 of the unchanged original</summary>
                <code>{view.sha256}</code>
              </details>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
