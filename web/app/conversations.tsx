"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import DraftEditor from "./draft-editor";
import type { StockItem } from "./business-lists";
import type { Source, Workspace } from "./workspace-types";

type Pending = { key: string; file: File; url: string };

function bytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export default function Conversations({
  base,
  judge,
  busy,
  active,
  workspaces,
  stock,
  act,
  setError,
  setNotice,
  onChoose,
  onImported,
  onChange,
  onExample,
  onReset,
  onDirtyChange,
}: {
  base: string;
  judge: boolean;
  busy: boolean;
  active: Workspace | null;
  workspaces: Workspace[];
  stock: StockItem[];
  act: (action: () => Promise<void>) => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  onChoose: (workspace: Workspace | null) => void;
  onImported: (workspace: Workspace) => Promise<void>;
  onChange: () => Promise<void>;
  onExample: () => void;
  onReset: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const nextPendingKey = useRef(0);
  const [sellerSide, setSellerSide] = useState<"left" | "right">("right");
  const [confirmed, setConfirmed] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [view, setView] = useState<Source | Pending | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );
  useEffect(() => {
    onDirtyChange(editorDirty || pending.length > 0);
  }, [editorDirty, pending.length, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!pending.length) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [pending.length]);

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
      discardPending();
      await onImported(workspace);
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
      <div className="workspace-layout">
        <section className="panel workspace-main">
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
                <span className="pill">{active.sources.length} originals</span>
              </div>
              {active.sources.length > 0 && (
                <details>
                  <summary>
                    Source screenshots · {active.sources.length} originals
                  </summary>
                  <div className="stack">
                    {active.layout !== "seller-draft-v1" && (
                      <>
                        <p className="coverage-note">
                          Selected screenshots only. This batch may leave out
                          parts of the conversation.
                        </p>
                        <div className="confirmation">
                          <strong>Seller: {active.seller_side} bubbles</strong>
                          <span>
                            Customer:{" "}
                            {active.seller_side === "right" ? "left" : "right"}{" "}
                            bubbles
                          </span>
                          <small>
                            Confirmed by {active.confirmed_by} ·{" "}
                            {new Date(active.confirmed_at).toLocaleString(
                              "en-BD",
                              { timeZone: "Asia/Dhaka" },
                            )}{" "}
                            · Dhaka
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
                  </div>
                </details>
              )}
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
                onChange={onChange}
                onDirtyChange={setEditorDirty}
              />
              {judge && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => onReset()}
                >
                  {busy ? "Resetting…" : "Reset sample shop"}
                </button>
              )}
            </>
          ) : judge ? (
            <div className="empty-state">
              <span className="step-number">01</span>
              <h2>A safe place to try it.</h2>
              <p>
                Open two constructed Messenger-style screenshots. The seller
                speaks on the right. The catalogue includes received and
                in-transit lots.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => onExample()}
              >
                {busy ? "Loading…" : "Open sample screenshots ↗"}
              </button>
            </div>
          ) : (
            <form className="import-form" onSubmit={importBatch}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SCREENSHOT IMPORT</p>
                  <h2>Start an order from a chat.</h2>
                </div>
                <span className="step-number">01</span>
              </div>
              <p>
                Choose screenshots from one conversation, then put them in
                reading order.
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
                    <span className="pill">{pending.length} selected</span>
                  </div>
                  <p className="fine-print">
                    Phone pickers can change selection order. Check it here
                    before saving.
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
                              disabled={busy || index === pending.length - 1}
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
                      conversation with left and right message bubbles, read
                      from top to bottom. Other layouts need to be re-captured.
                    </p>
                    <label>
                      Seller messages are on the
                      <select
                        value={sellerSide}
                        disabled={busy}
                        onChange={(event) => {
                          setSellerSide(event.target.value as "left" | "right");
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
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      <span>
                        I checked the previews, reading order and speaker sides.
                        These screenshots use the supported layout.
                      </span>
                    </label>
                  </fieldset>
                  <p className="coverage-note">
                    This preserves the selected batch; it does not establish
                    that the whole conversation is present.
                  </p>
                  <button className="primary" disabled={busy || !confirmed}>
                    {busy
                      ? "Saving screenshots…"
                      : "Save screenshots & review ↗"}
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
                      aria-current={active?.id === item.id ? "page" : undefined}
                      onClick={() => onChoose(item)}
                    >
                      <strong>{item.reference}</strong>
                      <span>
                        {item.sources.length} screenshots ·{" "}
                        {new Date(item.created_at).toLocaleDateString("en-BD", {
                          timeZone: "Asia/Dhaka",
                        })}
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
            ↳ Every original stays linked to its conversation. A screenshot of a
            voice note does not provide its audio.
          </p>
        </aside>
      </div>
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
