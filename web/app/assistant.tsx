"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, json } from "./api";
import type { CourierBooking } from "./courier-booking";

type RecordChip = {
  key: string;
  label: string;
  kind: string;
  section: "orders" | "stock";
};
type DraftValues = {
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  customer_delivery_charge: string | null;
  order_confirmed: string | null;
  lines: {
    sku: string | null;
    quantity: string | null;
    unit_price: string | null;
    line_discount: string | null;
  }[];
};
type Proposal = { label: string } & (
  | {
      kind: "status";
      order_id: string;
      reference: string;
      status: string;
      expected_status: string;
      expected_updated_at: string;
    }
  | { kind: "order_draft"; request_id: string; values: DraftValues }
  | {
      kind: "booking";
      order_id: string;
      reference: string;
      expected_updated_at: string;
      courier_mode: "fake" | "live";
      customer_name: string | null;
      phone: string | null;
      address: string | null;
      cod_amount: string;
    }
);
type Turn = {
  id: string;
  question: string;
  answer: string;
  incomplete: boolean;
  facts: {
    id: string;
    tool: string;
    records: RecordChip[];
    metrics: Record<string, string | number>;
    period?: string;
    note?: string;
  }[];
  proposals: Proposal[];
};
const metricLabels: Record<string, string> = {
  order_count: "Orders / অর্ডার",
  available_quantity: "Available units / বিক্রির জন্য আছে",
  remaining_quantity: "Remaining units (includes in transit)",
  order_value_bdt: "Order value · BDT (before prior payments)",
  recorded_payout_bdt: "Recorded payouts · BDT",
  delivered_cod_bdt: "Delivered COD · BDT (before courier fees)",
};

export default function Assistant({
  base,
  busy,
  act,
  onRecord,
  onDraft,
  onChange,
}: {
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onRecord: (record: RecordChip) => void;
  onDraft: (id: string) => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [working, setWorking] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const holding = useRef(false);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const deciding = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      holding.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopRecording() {
    holding.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current) clearTimeout(timer.current);
  }

  async function startRecording() {
    if (busy || startingRef.current || recorder.current?.state === "recording")
      return;
    holding.current = true;
    startingRef.current = true;
    setStarting(true);
    setVoiceError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Voice recording needs a supported browser over HTTPS. You can type your question below.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      if (!mounted.current || !holding.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = next;
      const chunks: Blob[] = [];
      let size = 0;
      next.ondataavailable = (event) => {
        size += event.data.size;
        chunks.push(event.data);
        if (size > 8 * 1024 * 1024) stopRecording();
      };
      next.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        if (!size || size > 8 * 1024 * 1024) {
          setVoiceError(
            "Record a short question of at most two minutes and 8 MiB.",
          );
          return;
        }
        void act(async () => {
          setWorking("Transcribing… / কথা লেখা হচ্ছে…");
          try {
            const form = new FormData();
            form.set(
              "audio",
              new Blob(chunks, { type: next.mimeType }),
              "question",
            );
            const result = await api<{ transcript: string }>(
              `${base}/assistant/transcribe`,
              { method: "POST", body: form },
            );
            if (mounted.current) setQuestion(result.transcript);
          } finally {
            if (mounted.current) setWorking("");
          }
        });
      };
      next.onerror = () => {
        stopRecording();
        if (mounted.current)
          setVoiceError("Recording failed. Try again or type your question.");
      };
      next.start(250);
      setRecording(true);
      timer.current = setTimeout(stopRecording, 119000);
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current)
        setVoiceError(
          cause instanceof Error
            ? cause.message
            : "Microphone access failed. You can type instead.",
        );
    } finally {
      startingRef.current = false;
      if (mounted.current) setStarting(false);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || recording || starting) return;
    await act(async () => {
      setWorking("Checking your records… / রেকর্ড দেখা হচ্ছে…");
      try {
        const turn = await api<Turn>(
          `${base}/assistant/turns`,
          json("POST", { transcript: question }),
        );
        setTurns((items) => [...items, turn]);
        setQuestion("");
      } finally {
        setWorking("");
      }
    });
  }

  async function confirm(proposal: Proposal, key: string) {
    if (deciding.current.has(key) || decisions[key] || busy) return;
    deciding.current.add(key);
    try {
      await act(async () => {
        if (proposal.kind === "status") {
          await api(
            `${base}/orders/${encodeURIComponent(proposal.order_id)}/status`,
            json("POST", {
              status: proposal.status,
              expected_status: proposal.expected_status,
              expected_updated_at: proposal.expected_updated_at,
            }),
          );
          setDecisions((items) => ({
            ...items,
            [key]: "Confirmed / নিশ্চিত হয়েছে",
          }));
          await onChange();
        } else if (proposal.kind === "booking") {
          setDecisions((items) => ({
            ...items,
            [key]: "Booking… / কুরিয়ার বুক করা হচ্ছে…",
          }));
          try {
            const booking = await api<CourierBooking>(
              `${base}/orders/${encodeURIComponent(proposal.order_id)}/booking`,
              json("POST", {
                expected_updated_at: proposal.expected_updated_at,
              }),
            );
            setDecisions((items) => ({
              ...items,
              [key]:
                booking.state === "booked"
                  ? proposal.courier_mode === "fake"
                    ? "Fake booking confirmed · no parcel sent"
                    : "Steadfast booking confirmed / কুরিয়ার বুক হয়েছে"
                  : booking.message,
            }));
          } catch (cause) {
            setDecisions((items) => ({
              ...items,
              [key]:
                "Booking result not confirmed. Open the order and check the courier before trying again.",
            }));
            await onChange().catch(() => {});
            throw cause;
          }
          await onChange();
        } else {
          const draft = await api<{ id: string }>(
            `${base}/order-drafts`,
            json("POST", {
              request_id: proposal.request_id,
              values: proposal.values,
            }),
          );
          setDecisions((items) => ({
            ...items,
            [key]: "Draft created for review / খসড়া তৈরি হয়েছে",
          }));
          await onDraft(draft.id);
        }
      });
    } finally {
      deciding.current.delete(key);
    }
  }

  return (
    <section
      className="panel assistant stack"
      aria-labelledby="assistant-heading"
    >
      <h2 id="assistant-heading">আপনার দোকানের সহকারী</h2>
      <p>
        Ask in Bangla, Banglish or English. Answers use your shop records.
        Review every change before confirming.
      </p>
      <form className="stack" onSubmit={ask}>
        <button
          type="button"
          className="primary mic-button"
          disabled={busy}
          aria-pressed={recording}
          aria-describedby="mic-help"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            void startRecording();
          }}
          onPointerUp={stopRecording}
          onPointerCancel={stopRecording}
          onLostPointerCapture={stopRecording}
          onKeyDown={(event) => {
            if ((event.key === " " || event.key === "Enter") && !event.repeat) {
              event.preventDefault();
              void startRecording();
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              stopRecording();
            }
          }}
          onBlur={stopRecording}
        >
          {recording
            ? "● ছেড়ে দিন · Release to finish"
            : starting
              ? "Microphone opening…"
              : "চেপে ধরে বলুন · Hold to talk"}
        </button>
        <p id="mic-help" className="muted">
          Hold for up to two minutes. Review and edit the transcript, then tap
          Ask. You can also type.
        </p>
        {voiceError && (
          <p role="alert" className="error message">
            {voiceError}
          </p>
        )}
        <label>
          আপনার প্রশ্ন / Your question
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={4000}
            required
            disabled={busy || recording || starting}
            placeholder="আজ কয়টা পার্সেল পাঠানো বাকি?"
          />
        </label>
        <button
          className="primary"
          disabled={busy || recording || starting || !question.trim()}
        >
          Ask / জিজ্ঞেস করুন
        </button>
        {working && <p role="status">{working}</p>}
      </form>
      <ol className="assistant-turns" aria-live="polite">
        {turns.map((turn) => (
          <li className="stack assistant-turn" key={turn.id}>
            <h3>{turn.question}</h3>
            <p className="assistant-answer">{turn.answer}</p>
            {turn.incomplete && (
              <p className="muted">
                The request stopped early. Only completed record lookups are
                shown; you can ask again.
              </p>
            )}
            {turn.facts.map((fact) => (
              <div className="stack" key={fact.id}>
                {fact.period && (
                  <p className="muted">
                    Period: {fact.period.replaceAll("_", " ")}
                  </p>
                )}
                {fact.note && <p className="muted">{fact.note}</p>}
                <dl className="record-amounts">
                  {Object.entries(fact.metrics).map(([key, value]) => (
                    <div key={key}>
                      <dt>{metricLabels[key] || key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="button-row">
                  {fact.records.map((record) => (
                    <button
                      type="button"
                      key={`${record.kind}-${record.key}`}
                      onClick={() => onRecord(record)}
                    >
                      {record.label} ↗
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {turn.proposals.map((proposal, index) => {
              const key = `${turn.id}-${index}`;
              return (
                <article className="proposal-card stack" key={key}>
                  <h3>{proposal.label}</h3>
                  {proposal.kind === "status" &&
                    proposal.expected_status === "booked" &&
                    ["returned", "cancelled"].includes(proposal.status) && (
                      <p className="message">
                        Confirm only after the parcel is back with you. Its
                        items will return to available stock. This does not
                        cancel a courier parcel.
                      </p>
                    )}
                  {proposal.kind === "order_draft" && (
                    <>
                      <p>
                        {proposal.values.customer_name || "Name not specified"}{" "}
                        · {proposal.values.phone || "Phone not specified"}
                      </p>
                      <p>
                        {proposal.values.address || "Address not specified"}
                      </p>
                      <ul>
                        {proposal.values.lines.map((line, i) => (
                          <li key={i}>
                            {line.sku || "SKU to review"} · Qty{" "}
                            {line.quantity ?? "?"} · BDT{" "}
                            {line.unit_price ?? "?"} · Discount{" "}
                            {line.line_discount ?? "?"}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Delivery · BDT{" "}
                        {proposal.values.customer_delivery_charge ?? "?"}.
                        Creates a draft; review prices and recipient details
                        before confirming the order.
                      </p>
                    </>
                  )}
                  {proposal.kind === "booking" && (
                    <>
                      <p className="pill">
                        {proposal.courier_mode === "fake"
                          ? "Fake · no parcel is sent"
                          : "Live · books a real Steadfast parcel"}
                      </p>
                      <p>
                        {proposal.reference} ·{" "}
                        {proposal.customer_name || "Name not recorded"} ·{" "}
                        {proposal.phone || "Phone not recorded"}
                      </p>
                      <p>{proposal.address || "Address not recorded"}</p>
                      <p>
                        COD · BDT {proposal.cod_amount}. Books from the packed
                        order using {proposal.reference} as the courier invoice.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          onRecord({
                            key: proposal.order_id,
                            kind: "order",
                            section: "orders",
                            label: proposal.reference,
                          })
                        }
                      >
                        Open order and booking ↗
                      </button>
                    </>
                  )}
                  {decisions[key] ? (
                    <p role="status">{decisions[key]}</p>
                  ) : (
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => confirm(proposal, key)}
                      >
                        {proposal.kind === "order_draft"
                          ? "Confirm draft creation"
                          : proposal.kind === "booking"
                            ? proposal.courier_mode === "fake"
                              ? "Confirm fake booking"
                              : "Confirm Steadfast booking"
                            : "Confirm / নিশ্চিত করুন"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          setDecisions((items) => ({
                            ...items,
                            [key]:
                              "Cancelled; nothing changed / কোনো পরিবর্তন হয়নি",
                          }))
                        }
                      >
                        Cancel / বাতিল
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </li>
        ))}
      </ol>
    </section>
  );
}
