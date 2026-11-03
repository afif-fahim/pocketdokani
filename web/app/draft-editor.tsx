import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, json } from "./api";
import type { StockItem } from "./business-lists";
import { money } from "./format";
import { StatusBadge } from "./ui";

type Evidence = {
  value: string | null;
  quote?: string;
  screenshot_index?: number | null;
  voice_note_id?: string | null;
  issue?: string | null;
  edited?: boolean;
};
type Line = {
  sku: Evidence;
  quantity: Evidence;
  unit_price: Evidence;
  line_discount: Evidence;
};
type Content = {
  customer_name: Evidence;
  phone: Evidence;
  address: Evidence;
  customer_delivery_charge: Evidence;
  order_confirmed: Evidence;
  lines: Line[];
};
type Draft = {
  revision: number;
  content: Content;
  verified_prior_payment: string;
  payment_verified: boolean;
  status: string;
  order_reference: string | null;
};
type Note = { id: string; transcript: string };
type LineValues = { [K in keyof Line]: string } & {
  source_line: number | null;
};
type Values = {
  customer_name: string;
  phone: string;
  address: string;
  customer_delivery_charge: string;
  order_confirmed: string;
  lines: LineValues[];
};
const emptyLine = (): LineValues => ({
  sku: "",
  quantity: "",
  unit_price: "",
  line_discount: "",
  source_line: null,
});
const normalize = (value: string) =>
  value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
function cents(value: string): number | null {
  const normalized = normalize(value);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const result = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(result) && result <= 99999999999999
    ? result
    : null;
}
function unpack(content: Content): Values {
  return {
    customer_name: content.customer_name.value || "",
    phone: content.phone.value || "",
    address: content.address.value || "",
    customer_delivery_charge: content.customer_delivery_charge.value || "",
    order_confirmed: content.order_confirmed.value || "",
    lines: content.lines.map(
      (line, index) =>
        ({
          ...Object.fromEntries(
            Object.entries(line).map(([key, field]) => [
              key,
              field.value || "",
            ]),
          ),
          source_line: index,
        }) as LineValues,
    ),
  };
}

export default function DraftEditor({
  base,
  workspaceId,
  stock,
  busy,
  act,
  onSource,
  onChange,
  onDirtyChange,
}: {
  base: string;
  workspaceId: string;
  stock: StockItem[];
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onSource: (sequence: number) => void;
  onChange: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const path = `${base}/workspaces/${workspaceId}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [payment, setPayment] = useState("0");
  const [verified, setVerified] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [success, setSuccess] = useState("");
  const voiceDialog = useRef<HTMLDialogElement>(null);
  const [voiceSource, setVoiceSource] = useState<Note | null>(null);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function accept(record: Draft) {
    setDraft(record);
    setValues(unpack(record.content));
    setPayment(record.verified_prior_payment);
    setVerified(record.payment_verified);
    setDirty(false);
  }

  function markEdited() {
    setDirty(true);
    setSuccess("");
  }

  useEffect(() => {
    let stopped = false;
    Promise.all([
      api<Draft | null>(`${path}/draft`),
      api<Note[]>(`${path}/voice-notes`),
      api<{ model_calls_enabled: boolean }>(`${base}/session`),
    ])
      .then(([record, voiceNotes, session]) => {
        if (stopped) return;
        if (record) accept(record);
        setNotes(voiceNotes);
        setEnabled(session.model_calls_enabled);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!stopped)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not open the draft.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [base, path]);

  function change(key: Exclude<keyof Values, "lines">, value: string) {
    setValues((current) => current && { ...current, [key]: value });
    markEdited();
    setSuccess("");
  }
  function changeLine(index: number, key: keyof Line, value: string) {
    setValues(
      (current) =>
        current && {
          ...current,
          lines: current.lines.map((line, i) =>
            i === index
              ? {
                  ...line,
                  [key]: value,
                  ...(key === "sku" || key === "quantity"
                    ? { unit_price: "", line_discount: "" }
                    : {}),
                }
              : line,
          ),
        },
    );
    markEdited();
    setSuccess("");
  }

  function source(field?: Evidence): ReactNode {
    if (!field) return <small>Seller entry</small>;
    const note = notes.find((item) => item.id === field.voice_note_id);
    return (
      <div className="field-source">
        {field.edited && <small>Seller edited · </small>}
        {field.screenshot_index ? (
          <button
            type="button"
            className="source-chip"
            onClick={() => onSource(field.screenshot_index!)}
          >
            Screenshot {field.screenshot_index} ↗
          </button>
        ) : note ? (
          <button
            type="button"
            className="source-chip"
            onClick={() => {
              setVoiceSource(note);
              voiceDialog.current?.showModal();
            }}
          >
            Voice note ↗
          </button>
        ) : (
          <small>Source needs review</small>
        )}
        {field.quote && <q>{field.quote}</q>}
      </div>
    );
  }

  const used = new Map<string, number>();
  let total: number | null = 0;
  const validPhone = Boolean(
    values && /^01[3-9]\d{8}$/.test(normalize(values.phone)),
  );
  let valid = Boolean(
    values?.customer_name.trim() &&
    values.address.trim() &&
    validPhone &&
    values.lines.length,
  );
  for (const line of values?.lines || []) {
    const quantity = Number(normalize(line.quantity));
    const price = cents(line.unit_price),
      discount = cents(line.line_discount);
    const item = stock.find((sku) => sku.sku === line.sku);
    const validQuantity =
      /^\d+$/.test(normalize(line.quantity)) &&
      Number.isInteger(quantity) &&
      quantity > 0 &&
      quantity <= 10000;
    used.set(line.sku, (used.get(line.sku) || 0) + quantity);
    if (
      !validQuantity ||
      price === null ||
      discount === null ||
      discount > quantity * price
    ) {
      total = null;
      valid = false;
    } else if (total !== null) total += quantity * price - discount;
    if (!item?.lot_received || (used.get(line.sku) || 0) > item.available_qty)
      valid = false;
  }
  const delivery = cents(values?.customer_delivery_charge || "");
  const prepaid = verified ? cents(payment) : 0;
  if (delivery === null || prepaid === null) {
    valid = false;
    total = null;
  } else if (total !== null) {
    total += delivery - prepaid;
    if (total < 0 || !Number.isSafeInteger(total) || total > 99999999999999) {
      valid = false;
      total = null;
    }
  }
  const isConfirmed = draft?.status === "confirmed" && !dirty;

  async function save(confirm: boolean) {
    if (!draft || !values) return;
    await act(async () => {
      const saved = await api<Draft>(
        `${path}/draft`,
        json("PUT", {
          revision: draft.revision,
          values,
          verified_prior_payment: payment,
          payment_verified: verified,
        }),
      );
      accept(saved);
      await onChange();
      if (confirm) {
        const confirmed = await api<Draft>(
          `${path}/draft/confirm`,
          json("POST", { revision: saved.revision }),
        );
        accept(confirmed);
        await onChange();
        setSuccess(`Confirmed ${confirmed.order_reference}.`);
      } else setSuccess("Draft saved. Review and confirm when ready.");
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(true);
  }

  if (loadError)
    return (
      <div className="message error" role="alert">
        {loadError}{" "}
        <button onClick={() => window.location.reload()}>Reload draft</button>
      </div>
    );
  if (!loaded) return <p role="status">Opening order draft…</p>;
  return (
    <section className="draft-editor stack" aria-labelledby="draft-heading">
      <div className="section-heading">
        <h2 id="draft-heading">{draft?.order_reference || "Order draft"}</h2>
        <StatusBadge
          status={isConfirmed ? "confirmed" : dirty ? "Unsaved edits" : "draft"}
        />
      </div>
      <p>
        Review every field against its source. You approve the order and every
        amount.
      </p>
      {!draft ? (
        <>
          {!enabled && (
            <p className="message">
              Screenshot extraction is unavailable right now. Choose New order,
              then Manual draft to enter the details yourself.
            </p>
          )}
          <label>
            Optional voice note · up to 2 minutes, 8 MiB
            <input
              type="file"
              accept="audio/*,.ogg,.m4a,.webm"
              disabled={busy || !enabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void act(async () => {
                    if (file.size > 8 * 1024 * 1024)
                      throw new Error("Voice notes must be at most 8 MiB.");
                    const form = new FormData();
                    form.set("audio", file);
                    const note = await api<Note>(`${path}/voice-notes`, {
                      method: "POST",
                      body: form,
                    });
                    setNotes((items) => [...items, note]);
                  });
              }}
            />
          </label>
          {notes.map((note) => (
            <p className="voice-transcript" key={note.id}>
              <strong>Voice note:</strong> {note.transcript}
            </p>
          ))}
          <button
            className="primary"
            disabled={busy || !enabled}
            onClick={() =>
              act(async () =>
                accept(await api<Draft>(`${path}/draft`, { method: "POST" })),
              )
            }
          >
            {busy ? "Preparing draft…" : "Extract order draft ↗"}
          </button>
        </>
      ) : (
        values && (
          <form className="stack" onSubmit={submit}>
            <fieldset className="stack" disabled={busy}>
              <legend>Recipient and agreement</legend>
              {(
                [
                  ["customer_name", "Customer name"],
                  ["phone", "Mobile number"],
                  ["address", "Delivery address"],
                  [
                    "customer_delivery_charge",
                    "Customer delivery charge (BDT)",
                  ],
                ] as const
              ).map(([key, label]) => (
                <div className="draft-field" key={key}>
                  <label>
                    {label}
                    <input
                      required
                      maxLength={
                        key === "address"
                          ? 2000
                          : key === "customer_name"
                            ? 160
                            : 40
                      }
                      inputMode={
                        key === "phone"
                          ? "tel"
                          : key === "customer_delivery_charge"
                            ? "decimal"
                            : "text"
                      }
                      value={values[key]}
                      aria-invalid={
                        !values[key].trim() ||
                        (key === "phone" && !validPhone) ||
                        (key === "customer_delivery_charge" &&
                          cents(values[key]) === null)
                      }
                      onChange={(event) => change(key, event.target.value)}
                    />
                  </label>
                  {source(draft.content[key])}
                </div>
              ))}
              <div className="draft-field">
                <label>
                  Customer agreed in conversation
                  <select
                    value={values.order_confirmed}
                    onChange={(event) =>
                      change("order_confirmed", event.target.value)
                    }
                  >
                    <option value="">Unclear / not stated</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                {source(draft.content.order_confirmed)}
              </div>
            </fieldset>
            {values.lines.map((line, index) => {
              const item = stock.find((sku) => sku.sku === line.sku);
              return (
                <fieldset
                  className="draft-line stack"
                  disabled={busy}
                  key={index}
                >
                  <legend>Item {index + 1}</legend>
                  {item?.photo_url && (
                    <img
                      className="draft-product"
                      src={item.photo_url}
                      alt={`${item.product_name}, ${item.variant}`}
                    />
                  )}
                  <div className="draft-field">
                    <label>
                      SKU
                      <select
                        required
                        value={line.sku}
                        aria-invalid={
                          !item?.lot_received ||
                          (used.get(line.sku) || 0) > (item?.available_qty || 0)
                        }
                        onChange={(event) =>
                          changeLine(index, "sku", event.target.value)
                        }
                      >
                        <option value="">Choose an available product</option>
                        {stock.map((sku) => (
                          <option
                            key={sku.sku}
                            value={sku.sku}
                            disabled={
                              !sku.lot_received || sku.available_qty < 1
                            }
                          >
                            {sku.product_name} · {sku.variant} ·{" "}
                            {sku.available_qty} available · {sku.sku}
                          </option>
                        ))}
                      </select>
                    </label>
                    {source(draft.content.lines[line.source_line ?? -1]?.sku)}
                    <details>
                      <summary>Browse product photos</summary>
                      <div className="sku-choices">
                        {stock
                          .filter(
                            (sku) => sku.lot_received && sku.available_qty > 0,
                          )
                          .map((sku) => (
                            <button
                              type="button"
                              key={sku.sku}
                              onClick={() => changeLine(index, "sku", sku.sku)}
                            >
                              {sku.photo_url && (
                                <img
                                  className="draft-product"
                                  src={sku.photo_url}
                                  alt=""
                                  loading="lazy"
                                />
                              )}
                              <span>
                                {sku.product_name} · {sku.variant}
                              </span>
                              <small>
                                {sku.available_qty} available · {sku.sku}
                              </small>
                            </button>
                          ))}
                      </div>
                    </details>
                  </div>
                  <div className="draft-amounts">
                    {(
                      [
                        ["quantity", "Quantity"],
                        ["unit_price", "Unit price (BDT)"],
                        ["line_discount", "Line discount (BDT)"],
                      ] as const
                    ).map(([key, label]) => (
                      <div className="draft-field" key={key}>
                        <label>
                          {label}
                          <input
                            required
                            inputMode={
                              key === "quantity" ? "numeric" : "decimal"
                            }
                            maxLength={20}
                            value={line[key]}
                            aria-invalid={
                              !line[key] ||
                              cents(line[key]) === null ||
                              (key === "quantity" &&
                                (!/^\d+$/.test(normalize(line.quantity)) ||
                                  Number(normalize(line.quantity)) < 1))
                            }
                            onChange={(event) =>
                              changeLine(index, key, event.target.value)
                            }
                          />
                        </label>
                        {source(
                          draft.content.lines[line.source_line ?? -1]?.[key],
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="fine-print">
                    Changing the SKU or quantity clears its prices and discount
                    for review. Enter 0 for no line discount.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setValues({
                        ...values,
                        lines: values.lines.filter((_, i) => i !== index),
                      });
                      markEdited();
                    }}
                  >
                    Remove item {index + 1}
                  </button>
                </fieldset>
              );
            })}
            <button
              type="button"
              disabled={busy || values.lines.length >= 30}
              onClick={() => {
                setValues({ ...values, lines: [...values.lines, emptyLine()] });
                markEdited();
              }}
            >
              Add item +
            </button>
            <fieldset className="stack" disabled={busy}>
              <legend>Seller-verified prior payment</legend>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(event) => {
                    setVerified(event.target.checked);
                    markEdited();
                  }}
                />
                I verified an advance or direct payment
              </label>
              {verified && (
                <label>
                  Verified payment (BDT)
                  <input
                    required
                    inputMode="decimal"
                    value={payment}
                    maxLength={30}
                    aria-invalid={cents(payment) === null}
                    onChange={(event) => {
                      setPayment(event.target.value);
                      markEdited();
                    }}
                  />
                </label>
              )}
              <p className="fine-print">
                A customer’s “already paid” message does not verify a payment.
              </p>
            </fieldset>
            <div className="draft-total" aria-live="polite">
              <span>COD to collect</span>
              <strong>
                {total !== null && total >= 0
                  ? money(total / 100)
                  : "Review amounts"}
              </strong>
            </div>
            <p className="fine-print">
              Line totals + customer delivery charge − seller-verified payment.
              Negative COD is blocked.
            </p>
            {!valid && (
              <p className="message error">
                Fill highlighted fields, review line prices and choose SKUs with
                enough stock before confirming.
              </p>
            )}
            {dirty && draft.status === "confirmed" && (
              <p className="message">
                Saving these edits returns this order to a draft and requires a
                new confirmation and pack check.
              </p>
            )}
            {success && (
              <p className="message success" role="status">
                {success}
              </p>
            )}
            <div className="button-row">
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => save(false)}
              >
                Save draft
              </button>
              <button
                className="primary"
                disabled={busy || !valid || isConfirmed}
              >
                {busy ? "Saving…" : "Confirm order ↗"}
              </button>
            </div>
          </form>
        )
      )}
      <dialog ref={voiceDialog} aria-label="Voice note source">
        <div className="stack">
          <h2>Voice note source</h2>
          <p>{voiceSource?.transcript}</p>
          <button onClick={() => voiceDialog.current?.close()}>Close</button>
        </div>
      </dialog>
    </section>
  );
}
