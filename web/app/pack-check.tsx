import { useEffect, useId, useState } from "react";
import { api, json } from "./api";
import type { Order } from "./business-lists";
import { EmptyState } from "./ui";

type Verdict = "pass" | "fail" | "unsure";
type BagVerdict = "match" | "mismatch" | "unsure";
type SegmentationMode = "sam" | "full_photo";

export type PackCheckSummary = {
  id: string;
  constructed?: boolean;
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
  > & { constructed?: boolean };
  photo_url: string;
  crop_urls: { label: string | null; bag: string | null };
};

function checkedAt(value: string) {
  return new Date(value).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" });
}

function Result({ check }: { check: PackCheck }) {
  const constructed = check.constructed || check.sam_path.constructed;
  return (
    <article className="pack-result stack">
      <div className="button-row">
        <strong className={`pack-verdict pack-${check.verdict}`}>
          {constructed
            ? "Constructed packing example"
            : check.override_by
              ? "Seller override · unsure check"
              : `Pack check · ${check.verdict}`}
        </strong>
        {!check.valid && (
          <span className="pill">Historical · no current authorization</span>
        )}
      </div>
      {constructed && (
        <p className="message">
          Constructed packing approval for the judge example. No model was
          called for this result. Use it to try fake courier booking.
        </p>
      )}
      <p className="muted">{checkedAt(check.created_at)} · Dhaka</p>
      <div className="button-row">
        <span className={`pack-verdict pack-${check.label_verdict}`}>
          Label · {check.label_verdict}
        </span>
        <span className={`pack-verdict pack-${check.bag_verdict}`}>
          Visible bag · {check.bag_verdict}
        </span>
      </div>
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
        <p>
          Fix the named mismatch and take a new photo. A failed check cannot be
          overridden.
        </p>
      )}
      {check.verdict === "unsure" && !check.override_by && (
        <p>
          Reshoot in good light with all label fields readable. The seller can
          review an unsure check before overriding it.
        </p>
      )}
      <ul className="pack-fields">
        {check.reasons.map((field, index) => (
          <li key={`${field.field}-${index}`}>
            <strong className={`pack-${field.verdict}`}>
              {field.field === "order_reference"
                ? "Label order number"
                : field.field.replaceAll("_", " ")}{" "}
              · {field.verdict}
            </strong>
            <p>{field.reason}</p>
            <dl className="record-amounts">
              <div>
                <dt>Written</dt>
                <dd>{field.written ?? "Missing or unreadable"}</dd>
              </div>
              <div>
                <dt>Confirmed order</dt>
                <dd>{field.expected ?? "Not recorded"}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <h3>Visible bag comparison</h3>
      <ul className="pack-fields">
        {check.bag_results.map((line) => (
          <li key={line.line_number}>
            <strong className={`pack-${line.verdict}`}>
              Line {line.line_number} · {line.verdict}
            </strong>
            <code>{line.sku}</code>
            <p>{line.reason}</p>
          </li>
        ))}
      </ul>
      <p className="muted">
        A photo check establishes nothing about sealed contents or hidden
        quantities.
      </p>
      <details>
        <summary>Original photo and comparison crops</summary>
        <div className="stack">
          <a href={check.photo_url} target="_blank" rel="noreferrer">
            Open original photo ↗
          </a>
          <img
            className="pack-photo"
            src={check.photo_url}
            alt="Original packed parcel and label"
            loading="lazy"
          />
          {(["label", "bag"] as const).map((region) => (
            <div className="stack" key={region}>
              <p>
                <strong>{region === "label" ? "Label" : "Bag"} input:</strong>{" "}
                {check.sam_path[region].path === "crop"
                  ? "SAM crop"
                  : "Full photo"}{" "}
                · {check.sam_path[region].reason}
              </p>
              {check.crop_urls[region] && (
                <a
                  href={check.crop_urls[region]!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className="pack-photo"
                    src={check.crop_urls[region]!}
                    alt={`SAM ${region} crop used for comparison`}
                    loading="lazy"
                  />
                </a>
              )}
            </div>
          ))}
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
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<PackCheck[] | null>(null);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [selectionError, setSelectionError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [segmentation, setSegmentation] = useState<SegmentationMode>("sam");
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const endpoint = `${base}/orders/${encodeURIComponent(order.id)}/pack-checks`;
  const canCheck = ["confirmed", "packed"].includes(order.status);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    api<PackCheck[]>(endpoint)
      .then((items) => {
        if (!stopped) {
          setChecks(items);
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
  }, [endpoint, open, order.updated_at]);

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
    setChecks(await api<PackCheck[]>(endpoint));
    setHistoryError("");
    await onChange();
  }

  return (
    <section className="pack-panel stack" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {order.pack_check?.constructed
          ? "Constructed packing example"
          : "Pack check"}
      </h3>
      {order.pack_check && (
        <p className={`pack-verdict pack-${order.pack_check.verdict}`}>
          {order.pack_check.constructed
            ? "Constructed approval · fake booking example"
            : `${order.pack_check.override_by ? "Seller override · unsure check" : `Latest check · ${order.pack_check.verdict}`} · label ${order.pack_check.label_verdict} · visible bag ${order.pack_check.bag_verdict}`}
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
          {canCheck ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (!pending) return;
                void act(async () => {
                  const body = new FormData();
                  body.set("photo", pending.file);
                  body.set("expected_updated_at", order.updated_at);
                  body.set("segmentation", segmentation);
                  await api<PackCheck>(endpoint, { method: "POST", body });
                  setPending(null);
                  setOverrideId(null);
                  await refresh();
                });
              }}
            >
              <p>
                Keep the entire label inside the photo, flat and in focus.
                Include label order number{" "}
                <strong>{order.label_reference}</strong>, name, all 11 phone
                digits, COD and full address. Put every visible ordered bag
                beside the parcel if it is still open.
              </p>
              <label className="stack">
                <strong>Take or choose one parcel photo</strong>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  capture="environment"
                  disabled={busy}
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
                  <img
                    className="pack-photo"
                    src={pending.url}
                    alt="Parcel photo selected for pack check"
                  />
                  <p className="muted">
                    Check the preview. Reshoot if the label is cut off, blurred
                    or covered.
                  </p>
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
                      <option value="sam">Find label and bag with SAM</option>
                      <option value="full_photo">
                        Use full photo for comparison
                      </option>
                    </select>
                  </label>
                  <button className="primary" disabled={busy} type="submit">
                    {busy ? "Checking parcel…" : "Check this photo"}
                  </button>
                </div>
              )}
            </form>
          ) : (
            <p className="muted">
              Confirm the order before taking a pack photo. New checks are
              available for confirmed or packed orders.
            </p>
          )}
          <div className="button-row">
            <h3>Check history</h3>
            <button disabled={busy} onClick={() => void act(refresh)}>
              Refresh checks
            </button>
          </div>
          {checks?.length ? (
            checks.map((check) => (
              <div className="stack" key={check.id}>
                <Result check={check} />
                {canCheck &&
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
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api(
                                `${endpoint}/${encodeURIComponent(check.id)}/override`,
                                json("POST", {
                                  expected_updated_at: order.updated_at,
                                }),
                              );
                              setOverrideId(null);
                              await refresh();
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
                      disabled={busy}
                      onClick={() => setOverrideId(check.id)}
                    >
                      I checked it myself · review override
                    </button>
                  ))}
              </div>
            ))
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
