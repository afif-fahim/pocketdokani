import { useEffect, useId, useState, type CSSProperties } from "react";
import { api, ApiOutcomeUnknownError, json } from "@/lib/api";
import type { Order } from "@/features/orders/business-lists";
import { ImagePreviewButton } from "@/components/image-viewer";
import { EmptyState } from "@/components/ui";
import { Scan, Stamp, type StampTone } from "@/components/khata";
import {
  hasPendingAction,
  pendingActionKey,
  readPendingAction,
  writePendingAction,
} from "@/lib/pending-actions";

type Verdict = "pass" | "fail" | "unsure";
type BagVerdict = "match" | "mismatch" | "unsure";
type SegmentationMode = "sam" | "full_photo";
type PendingCheck =
  { kind: "check"; ids: string[] } | { kind: "override"; id: string };

export function hasPendingPackAction(base: string, orderId: string): boolean {
  return hasPendingAction(pendingActionKey("pack", base, orderId));
}

export type PackCheckSummary = {
  id: string;
  verdict: Verdict;
  label_verdict: Verdict;
  bag_verdict: BagVerdict;
  override_by: string | null;
  override_at: string | null;
};

type PackCheck = PackCheckSummary & {
  order_id: string;
  created_at: string;
  order_updated_at: string;
  valid: boolean;
  reasons: {
    field: string;
    verdict: Verdict;
    reason: string;
    written: string | null;
    expected: string | null;
  }[];
  bag_results: {
    line_number: number;
    sku: string;
    verdict: BagVerdict;
    reason: string;
  }[];
  sam_path: Record<
    "label" | "bag",
    { path: "crop" | "full_photo"; reason: string }
  >;
  photo_url: string;
  crop_urls: { label: string | null; bag: string | null };
};

function checkedAt(value: string) {
  return new Date(value).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
}

function PackPhoto({
  src,
  alt,
  label,
  loading,
}: {
  src: string;
  alt: string;
  label?: string;
  loading?: "lazy";
}) {
  return (
    <ImagePreviewButton
      className="image-preview-thumbnail"
      src={src}
      alt={alt}
      aria-label={label}
    >
      {label && <span>{label}</span>}
      <img className="pack-photo" src={src} alt={alt} loading={loading} />
    </ImagePreviewButton>
  );
}

const VERDICT_MARK: Record<Verdict | BagVerdict, string> = {
  pass: "✓",
  match: "✓",
  fail: "✗",
  mismatch: "✗",
  unsure: "?",
};

function VerdictMark({ verdict }: { verdict: Verdict | BagVerdict }) {
  return (
    <span className={`pack-mark pack-${verdict}`}>
      <span aria-hidden="true">{VERDICT_MARK[verdict]}</span>
      <span className="pack-mark-word">{verdict}</span>
    </span>
  );
}

function verdictStamp(check: PackCheck): { tone: StampTone; text: string } {
  if (check.override_by) return { tone: "neutral", text: "Seller checked" };
  return { tone: check.verdict, text: check.verdict };
}

const FIELD_NAMES: Record<string, string> = {
  order_reference: "Label order number",
  cod_amount: "COD amount",
  cod: "COD amount",
  phone: "Phone",
  customer_name: "Customer name",
  address: "Address",
};

function fieldName(field: string) {
  if (FIELD_NAMES[field]) return FIELD_NAMES[field];
  const words = field.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SEVERITY: Record<Verdict | BagVerdict, number> = {
  fail: 0,
  mismatch: 0,
  unsure: 1,
  pass: 2,
  match: 2,
};

function worstFirst<T extends { verdict: Verdict | BagVerdict }>(items: T[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        SEVERITY[a.item.verdict] - SEVERITY[b.item.verdict] ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

function Result({ check, latest }: { check: PackCheck; latest: boolean }) {
  const stamp = verdictStamp(check);
  const bagFirst = SEVERITY[check.bag_verdict] < SEVERITY[check.label_verdict];
  const bagBase = bagFirst ? 0 : check.reasons.length;
  const labelBase = bagFirst ? check.bag_results.length + 1 : 0;
  const bagSection = (
    <section className="stack" aria-label="Visible bag comparison">
      <h3>Visible bag</h3>
      <ul className="pack-fields">
        <li
          className="pack-row pack-bag"
          data-verdict={check.bag_verdict}
          style={{ "--i": bagBase } as CSSProperties}
        >
          <strong className="pack-field-name">Visible bag</strong>
          <p className="pack-reason">
            A photo check establishes nothing about sealed contents or hidden
            quantities.
          </p>
          <VerdictMark verdict={check.bag_verdict} />
        </li>
        {worstFirst(check.bag_results).map((line, index) => (
          <li
            key={line.line_number}
            className="pack-row pack-bag"
            data-verdict={line.verdict}
            style={{ "--i": bagBase + 1 + index } as CSSProperties}
          >
            <strong className="pack-field-name">Line {line.line_number}</strong>
            <code className="pack-record">{line.sku}</code>
            <VerdictMark verdict={line.verdict} />
            <p className="pack-reason">{line.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <article
      className="pack-result tag stack"
      data-verdict={check.override_by ? "override" : check.verdict}
    >
      <header className="pack-slip-head">
        <Stamp tone={stamp.tone}>{stamp.text}</Stamp>
        <div className="stack">
          <strong className="pack-slip-title">
            {check.override_by
              ? "Seller override · unsure check"
              : `Pack check · ${check.verdict}`}
          </strong>
          <p className="muted">{checkedAt(check.created_at)} · Dhaka</p>
          {!check.valid && (
            <span className="pill">Historical · no current authorization</span>
          )}
        </div>
      </header>
      {check.override_by && (
        <p className="message">
          Seller override recorded
          {check.override_at
            ? ` at ${checkedAt(check.override_at)} (Dhaka)`
            : ""}
          . The model verdict remains unsure.
        </p>
      )}
      {check.verdict === "fail" && (
        <p className="message error">
          Fix the named mismatch and take a new photo. A failed check cannot be
          overridden.
        </p>
      )}
      {check.verdict === "unsure" && !check.override_by && (
        <p className="message warning">
          Reshoot in good light with all label fields readable. The seller can
          review an unsure check before overriding it.
        </p>
      )}
      {check.valid && (check.verdict === "pass" || check.override_by) && (
        <p className="message success">
          This order is ready for courier booking. Review its COD and confirm
          the booking above.
        </p>
      )}
      {latest && (
        <p className="muted pack-blind">
          Spark reads the label without seeing the order. Code then compares.
        </p>
      )}
      <div className="tag-tear" />
      {bagFirst && bagSection}
      <ul className="pack-fields">
        {worstFirst(check.reasons).map((field, index) => (
          <li
            key={`${field.field}-${index}`}
            className="pack-row"
            data-verdict={field.verdict}
            style={{ "--i": labelBase + index } as CSSProperties}
          >
            <strong className="pack-field-name">
              {fieldName(field.field)}
            </strong>
            <div className="pack-cell">
              <span className="pack-cell-label">Written on label</span>
              <span className="ai-mark pack-written">
                {field.written ?? "Missing or unreadable"}
              </span>
            </div>
            <div className="pack-cell">
              <span className="pack-cell-label">Confirmed order</span>
              <code className="pack-record">
                {field.expected ?? "Not recorded"}
              </code>
            </div>
            <VerdictMark verdict={field.verdict} />
            <p className="pack-reason">{field.reason}</p>
          </li>
        ))}
      </ul>
      {!bagFirst && bagSection}
      <details>
        <summary>Original photo and comparison crops</summary>
        <div className="stack">
          <PackPhoto
            src={check.photo_url}
            alt="Original packed parcel and label"
            label="Open original photo"
            loading="lazy"
          />
          {(["label", "bag"] as const).map((region) => {
            const cropUrl = check.crop_urls[region];
            const fellBack = check.sam_path[region].path !== "crop";
            return (
              <div className="stack" key={region}>
                <p data-fallback={fellBack || undefined}>
                  <strong>{region === "label" ? "Label" : "Bag"} input:</strong>{" "}
                  {fellBack ? "Full photo" : "SAM crop"} ·{" "}
                  {check.sam_path[region].reason}
                </p>
                {cropUrl && (
                  <PackPhoto
                    src={cropUrl}
                    alt={`SAM ${region} crop used for comparison`}
                    loading="lazy"
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}

export default function PackCheckPanel({
  order,
  base,
  busy,
  act,
  onChange,
  initialOpen = false,
  onPendingChange,
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
  initialOpen?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const headingId = useId();
  const [open, setOpen] = useState(initialOpen);
  const [checks, setChecks] = useState<PackCheck[] | null>(null);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [selectionError, setSelectionError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [segmentation, setSegmentation] = useState<SegmentationMode>("sam");
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [models, setModels] = useState<boolean | null>(null);
  const endpoint = `${base}/orders/${encodeURIComponent(order.id)}/pack-checks`;
  const canCheck = ["confirmed", "packed"].includes(order.status);
  const pendingKey = pendingActionKey("pack", base, order.id);
  const [uncertain, setUncertain] = useState(() =>
    readPendingAction<PendingCheck>(pendingKey),
  );

  function remember(value: PendingCheck | null) {
    setUncertain(value);
    onPendingChange?.(Boolean(value));
    writePendingAction(pendingKey, value);
  }

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    Promise.all([
      api<PackCheck[]>(endpoint),
      api<{ model_calls_enabled: boolean }>(`${base}/session`),
    ])
      .then(([items, session]) => {
        if (!stopped) {
          setChecks(items);
          setModels(session.model_calls_enabled);
          setHistoryError("");
        }
      })
      .catch((cause: unknown) => {
        if (!stopped)
          setHistoryError(
            cause instanceof Error
              ? cause.message
              : "Could not load pack-check history.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [base, endpoint, open, order.updated_at]);

  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.url);
    },
    [pending],
  );

  function choose(file: File | undefined) {
    setSelectionError("");
    setPending(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setSelectionError(
        "Choose a PNG, JPEG or WebP photo. Export HEIC to JPEG first.",
      );
      return;
    }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      setSelectionError("Choose a nonempty photo of at most 8 MiB.");
      return;
    }
    setPending({ file, url: URL.createObjectURL(file) });
  }

  async function refresh() {
    const [items, session] = await Promise.all([
      api<PackCheck[]>(endpoint),
      api<{ model_calls_enabled: boolean }>(`${base}/session`),
    ]);
    setChecks(items);
    setModels(session.model_calls_enabled);
    setHistoryError("");
    // A successful state read permits an explicit retry even when the earlier
    // request never reached the server. The order-version claim rejects a late
    // competing check/override; this read never resubmits either action.
    remember(null);
    try {
      await onChange();
    } catch (cause) {
      remember(uncertain);
      throw cause;
    }
  }

  async function checkParcel() {
    if (uncertain || !checks || !pending) return;
    const operation: PendingCheck = {
      kind: "check",
      ids: checks.map((check) => check.id),
    };
    await act(async () => {
      remember(operation);
      try {
        const body = new FormData();
        body.set("expected_updated_at", order.updated_at);
        body.set("photo", pending.file);
        body.set("segmentation", segmentation);
        await api<PackCheck>(endpoint, { method: "POST", body });
        remember(null);
        setPending(null);
        setOverrideId(null);
        await refresh();
      } catch (cause) {
        if (!(cause instanceof ApiOutcomeUnknownError)) remember(null);
        throw cause;
      }
    });
  }

  return (
    <section className="pack-panel stack" aria-labelledby={headingId}>
      <h3 id={headingId}>Pack check</h3>
      {order.pack_check && (
        <p
          className={`pack-verdict pack-${order.pack_check.verdict}`}
          data-override={order.pack_check.override_by ? "" : undefined}
        >
          {`${order.pack_check.override_by ? "Seller override · unsure check" : `Latest check · ${order.pack_check.verdict}`} · label ${order.pack_check.label_verdict} · visible bag ${order.pack_check.bag_verdict}`}
        </p>
      )}
      <button
        disabled={busy}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            setPending(null);
            setOverrideId(null);
          } else {
            setChecks(null);
            setOpen(true);
          }
        }}
      >
        {open
          ? "Close pack check"
          : canCheck
            ? "Check packed parcel"
            : "View pack-check history"}
      </button>
      {open && (
        <>
          {historyError && (
            <p className="message error" role="alert">
              {historyError} Choose Refresh checks to try again.
            </p>
          )}
          {uncertain && !busy && (
            <div className="message" role="status">
              <p>
                The last pack action may still be running or may already be
                saved. Refresh checks to find its result before starting another
                action. Keep this panel open to retain your selected photo.
              </p>
              <button disabled={busy} onClick={() => void act(refresh)}>
                Check pack action
              </button>
            </div>
          )}
          {canCheck ? (
            <>
              {base === "/api/judge" && (
                <section
                  className="pack-examples stack"
                  aria-label="Example parcel images"
                >
                  <p>
                    <strong>Need a parcel photo to try?</strong> Download a
                    generated label and bag image for this order, then upload it
                    below. Meta models analyze the image and determine the
                    result.
                  </p>
                  <div className="pack-example-links">
                    <a
                      href={`${endpoint}/sample-photo?scenario=correct`}
                      download
                    >
                      Matching label
                    </a>
                    <a
                      href={`${endpoint}/sample-photo?scenario=wrong-cod`}
                      download
                    >
                      Wrong COD on label
                    </a>
                    <a
                      href={`${endpoint}/sample-photo?scenario=unreadable`}
                      download
                    >
                      Unreadable label
                    </a>
                  </div>
                </section>
              )}
              {models === false && (
                <p className="message">
                  Live Meta photo analysis is unavailable in this server
                  configuration. Your order is unchanged. Try again when model
                  processing is enabled.
                </p>
              )}
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void checkParcel();
                }}
              >
                <p>
                  Keep the entire label inside the photo, flat and in focus.
                  Must be visible:
                </p>
                <ul className="pack-checklist">
                  <li>
                    Label order number <code>{order.label_reference}</code>
                  </li>
                  <li>Name</li>
                  <li>
                    {base === "/api/judge" && order.phone === "01X-EXAMPLE"
                      ? "Synthetic phone marker 01X-EXAMPLE"
                      : "All 11 phone digits"}
                  </li>
                  <li>COD</li>
                  <li>Full address</li>
                  <li>
                    Every visible ordered bag beside the parcel, if it is still
                    open
                  </li>
                </ul>
                <label className="pack-drop">
                  <strong>
                    Live Meta check · take or choose one parcel photo
                  </strong>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    capture="environment"
                    disabled={busy || models !== true || Boolean(uncertain)}
                    onChange={(event) => {
                      choose(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <span className="muted">
                    PNG, JPEG or WebP · up to 8 MiB and 20 megapixels. The
                    original is kept privately.
                  </span>
                </label>
                {selectionError && (
                  <p className="message error" role="alert">
                    {selectionError}
                  </p>
                )}
                {pending && (
                  <div className="stack">
                    <div className="pack-print">
                      <PackPhoto
                        src={pending.url}
                        alt="Parcel photo selected for pack check"
                      />
                      {busy && <Scan label="Reading the photo" />}
                    </div>
                    {busy && (
                      <ol className="pack-pipeline" aria-label="Check pipeline">
                        <li>SAM 3.1 looks for label and bag</li>
                        <li>Muse Spark reads the label blind</li>
                        <li>Code compares</li>
                      </ol>
                    )}
                    <p className="muted">
                      Check the preview. Reshoot if the label is cut off,
                      blurred or covered.
                    </p>
                    <details>
                      <summary>Photo analysis options</summary>
                      <label className="stack">
                        <span>Photo comparison method</span>
                        <select
                          disabled={busy}
                          value={segmentation}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "sam" || value === "full_photo")
                              setSegmentation(value);
                          }}
                        >
                          <option value="sam">
                            Find label and bag with SAM
                          </option>
                          <option value="full_photo">
                            Use full photo for comparison
                          </option>
                        </select>
                      </label>
                    </details>
                    <button
                      className="primary"
                      disabled={
                        busy || !checks || models !== true || Boolean(uncertain)
                      }
                      type="submit"
                    >
                      {busy ? "Checking parcel…" : "Check this photo"}
                    </button>
                  </div>
                )}
              </form>
            </>
          ) : (
            <p className="muted">
              Confirm the order before taking a pack photo. New checks are
              available for confirmed or packed orders.
            </p>
          )}
          <div className="button-row pack-history-head">
            <h3>Check history</h3>
            <button disabled={busy} onClick={() => void act(refresh)}>
              Refresh checks
            </button>
          </div>
          {checks?.length ? (
            checks.map((check, index) => {
              const override =
                canCheck &&
                check.valid &&
                check.verdict === "unsure" &&
                !check.override_by &&
                (overrideId === check.id ? (
                  <div className="stack">
                    <p>
                      I have personally checked this parcel against the
                      confirmed order with label order number{" "}
                      {order.label_reference}. Record my seller override and
                      mark the order packed?
                    </p>
                    <div className="button-row">
                      <button
                        disabled={busy || Boolean(uncertain)}
                        onClick={() =>
                          void act(async () => {
                            remember({ kind: "override", id: check.id });
                            try {
                              await api(
                                `${endpoint}/${encodeURIComponent(check.id)}/override`,
                                json("POST", {
                                  expected_updated_at: order.updated_at,
                                }),
                              );
                              remember(null);
                              setOverrideId(null);
                              await refresh();
                            } catch (cause) {
                              if (!(cause instanceof ApiOutcomeUnknownError))
                                remember(null);
                              throw cause;
                            }
                          })
                        }
                      >
                        Confirm seller override
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setOverrideId(null)}
                      >
                        Cancel override
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    disabled={busy || Boolean(uncertain)}
                    onClick={() => setOverrideId(check.id)}
                  >
                    I checked it myself · review override
                  </button>
                ));
              const stamp = verdictStamp(check);
              return index === 0 ? (
                <div className="stack" key={check.id}>
                  <Result check={check} latest />
                  {override}
                </div>
              ) : (
                <details className="pack-earlier" key={check.id}>
                  <summary>
                    <span className={`pack-earlier-verdict pack-${stamp.tone}`}>
                      {stamp.text}
                    </span>
                    <span>{checkedAt(check.created_at)}</span>
                    <span className="pack-earlier-sub">
                      label {check.label_verdict} · bag {check.bag_verdict}
                    </span>
                  </summary>
                  <div className="stack">
                    <Result check={check} latest={false} />
                    {override}
                  </div>
                </details>
              );
            })
          ) : checks ? (
            <EmptyState title="No pack checks yet">
              {canCheck
                ? "Choose a clear parcel photo above to compare its label and visible bag with this order."
                : "Confirm the order before starting a pack check."}
            </EmptyState>
          ) : !historyError ? (
            <p className="muted" role="status">
              Loading check history…
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
