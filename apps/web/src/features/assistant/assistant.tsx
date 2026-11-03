"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiOutcomeUnknownError, json } from "@/lib/api";
import type { CourierBooking } from "@/features/orders/courier-booking";
import StatusChangeWarning from "@/features/orders/status-change-warning";
import { money } from "@/lib/format";

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
  answer_language: "en" | "bn";
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
type AnswerLanguage = "en" | "bn" | "auto";
const metricLabels: Record<string, string> = {
  order_count: "Orders / অর্ডার",
  available_quantity: "Available units / বিক্রির জন্য আছে",
  remaining_quantity: "Remaining units (includes in transit)",
  order_value_bdt: "Order value · BDT (before prior payments)",
  recorded_payout_bdt: "Recorded payouts · BDT",
  delivered_cod_bdt: "Delivered COD · BDT (before courier fees)",
};
const starterQuestions = [
  {
    label: "Pending dispatch",
    english: "How many orders are left to send?",
    bangla: "কয়টা অর্ডার পাঠানো বাকি আছে?",
  },
  {
    label: "Available stock",
    english: "How many units are available to sell?",
    bangla: "বিক্রির জন্য মোট কয়টা পণ্য স্টকে আছে?",
  },
  {
    label: "Recorded sales & payouts",
    english: "What are the all-time order value and recorded payouts?",
    bangla: "সব সময়ের অর্ডারের মূল্য আর রেকর্ড করা পেআউট কত?",
  },
];

export default function Assistant({
  base,
  busy,
  act,
  onRecord,
  onDraft,
  onChange,
  active = true,
  defaultAnswerLanguage = "auto",
}: {
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onRecord: (record: RecordChip) => void;
  onDraft: (id: string) => Promise<void>;
  onChange: () => Promise<void>;
  active?: boolean;
  defaultAnswerLanguage?: AnswerLanguage;
}) {
  const [question, setQuestion] = useState("");
  const [answerLanguage, setAnswerLanguage] = useState<AnswerLanguage>(
    defaultAnswerLanguage,
  );
  const [turns, setTurns] = useState<Turn[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [working, setWorking] = useState("");
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [modelsEnabled, setModelsEnabled] = useState<boolean | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [audioToRetry, setAudioToRetry] = useState<Blob | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const holding = useRef(false);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const deciding = useRef(new Set<string>());
  const activeRef = useRef(active);

  useEffect(() => {
    let stopped = false;
    api<{ model_calls_enabled: boolean }>(`${base}/session`)
      .then((result) => {
        if (!stopped) setModelsEnabled(result.model_calls_enabled);
      })
      .catch(() => {
        if (!stopped)
          setCapabilityError(
            "Could not check live assistant availability. Your typed question will stay here if a request fails.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [base]);

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

  const stopRecording = useCallback(() => {
    holding.current = false;
    if (mounted.current) setStarting(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) stopRecording();
  }, [active, stopRecording]);

  useEffect(() => {
    if (transcriptReady && !busy && active) questionRef.current?.focus();
  }, [transcriptReady, busy, active]);

  async function transcribeAudio(audio: Blob) {
    await act(async () => {
      setWorking("Transcribing… / কথা লেখা হচ্ছে…");
      try {
        const form = new FormData();
        form.set("audio", audio, "question");
        const result = await api<{ transcript: string }>(
          `${base}/assistant/transcribe`,
          { method: "POST", body: form },
        );
        if (mounted.current && activeRef.current) {
          setQuestion(result.transcript);
          setTranscriptReady(true);
          setAudioToRetry(null);
        }
      } finally {
        if (mounted.current) setWorking("");
      }
    });
  }

  async function startRecording() {
    if (busy || startingRef.current || recorder.current?.state === "recording")
      return;
    holding.current = true;
    startingRef.current = true;
    setStarting(true);
    setVoiceError("");
    setTranscriptReady(false);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Voice recording needs a supported browser over HTTPS.",
        );
      setPermissionPending(true);
      timer.current = setTimeout(() => {
        holding.current = false;
        if (mounted.current) {
          setStarting(false);
          setVoiceError(
            "The microphone request is still waiting. Dismiss the browser prompt and type your question below to continue.",
          );
          questionRef.current?.focus();
        }
      }, 20_000);
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (timer.current) clearTimeout(timer.current);
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
        if (!activeRef.current) return;
        if (!size || size > 8 * 1024 * 1024) {
          setVoiceError(
            "Record a short question of at most two minutes and 8 MiB.",
          );
          return;
        }
        const audio = new Blob(chunks, { type: next.mimeType });
        setAudioToRetry(audio);
        void transcribeAudio(audio);
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
      const cancelled = !holding.current;
      holding.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current && activeRef.current && !cancelled)
        setVoiceError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone permission was denied. Type your question below, or allow microphone access in your browser and try again."
            : cause instanceof DOMException && cause.name === "NotFoundError"
              ? "No microphone was found. Connect one and try again, or type your question below."
              : cause instanceof Error
                ? `${cause.message} You can type your question below.`
                : "Microphone access failed. Type your question below to continue.",
        );
    } finally {
      if (timer.current && recorder.current?.state !== "recording")
        clearTimeout(timer.current);
      startingRef.current = false;
      if (mounted.current) {
        setStarting(false);
        setPermissionPending(false);
      }
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy || !question.trim() || recording || starting) return;
    await act(async () => {
      setWorking("Checking your records… / রেকর্ড দেখা হচ্ছে…");
      try {
        const turn = await api<Turn>(
          `${base}/assistant/turns`,
          json("POST", {
            transcript: question,
            answer_language: answerLanguage,
          }),
        );
        setTurns((items) => [...items, turn]);
        setQuestion("");
        setTranscriptReady(false);
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
          try {
            await api(
              `${base}/orders/${encodeURIComponent(proposal.order_id)}/status`,
              json("POST", {
                status: proposal.status,
                expected_status: proposal.expected_status,
                expected_updated_at: proposal.expected_updated_at,
              }),
            );
          } catch (cause) {
            if (cause instanceof ApiOutcomeUnknownError) {
              setDecisions((items) => ({
                ...items,
                [key]:
                  "Status result unknown. Open the current order to review its status before another change.",
              }));
              await onChange().catch(() => {});
            }
            throw cause;
          }
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
      <div className="assistant-welcome stack">
        <h2 id="assistant-heading">Ask your shop</h2>
        <p>
          <span lang="bn">বাংলায় বলুন বা লিখুন.</span> You approve every
          change.
        </p>
      </div>
      {modelsEnabled === false && (
        <p className="message" role="status">
          Live assistant and voice transcription are unavailable because models
          are disabled on this server. You can browse Orders and Stock, or try
          again when AI processing is enabled.
        </p>
      )}
      {capabilityError && <p className="message">{capabilityError}</p>}
      <form className="stack assistant-compose" onSubmit={ask}>
        <div className="mic-controls button-row">
          <button
            type="button"
            className="primary mic-button"
            disabled={
              busy ||
              modelsEnabled === false ||
              (permissionPending && !starting)
            }
            aria-pressed={recording || starting}
            aria-describedby="mic-help"
            onClick={() => {
              if (recording || starting) stopRecording();
              else void startRecording();
            }}
          >
            <span aria-hidden="true">{recording ? "■" : "◉"}</span>{" "}
            {recording
              ? "Stop & review · থামুন"
              : starting
                ? "Cancel microphone"
                : "Talk in Bangla · কথা বলুন"}
          </button>
          {recording && (
            <span role="status">Recording… Tap Stop when done.</span>
          )}
          {starting && (
            <span role="status">Allow microphone access to begin.</span>
          )}
          {permissionPending && !starting && (
            <span role="status">
              Type below while you dismiss the browser’s microphone prompt.
            </span>
          )}
        </div>
        <p id="mic-help" className="muted">
          Record up to two minutes, then stop and review. Or type below.
        </p>
        {voiceError && (
          <p role="alert" className="error message">
            {voiceError}
          </p>
        )}
        {audioToRetry && !working && (
          <div className="message">
            <p>
              Your recording is kept in this tab. Retry transcription or type
              your question below.
            </p>
            <button
              type="button"
              disabled={
                busy || recording || starting || modelsEnabled === false
              }
              onClick={() => void transcribeAudio(audioToRetry)}
            >
              Retry voice transcription
            </button>
          </div>
        )}
        <label>
          Your question · আপনার প্রশ্ন
          <textarea
            ref={questionRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={4000}
            required
            disabled={busy || recording || starting}
            placeholder="Ask in Bangla, Banglish or English…"
            aria-describedby="question-help"
          />
        </label>
        <p id="question-help" className="fine-print">
          {transcriptReady
            ? "Transcript ready. Check names and amounts, then send when you’re ready."
            : "Review before sending. Starter questions fill this box."}
        </p>
        {transcriptReady && (
          <p role="status" className="transcript-ready success">
            Voice transcribed. Review your question above.
          </p>
        )}
        <label>
          Answer language
          <select
            value={answerLanguage}
            onChange={(event) =>
              setAnswerLanguage(event.target.value as AnswerLanguage)
            }
            disabled={busy}
            aria-describedby="answer-language-help"
          >
            <option value="en">English</option>
            <option value="bn" lang="bn">
              বাংলা
            </option>
            <option value="auto">Automatic</option>
          </select>
        </label>
        <p id="answer-language-help" className="fine-print">
          Speak or type in any language. Automatic uses Bangla when the question
          contains Bangla script; otherwise English. Source quotes stay in their
          original language.
        </p>
        <button
          className="primary"
          disabled={
            busy ||
            modelsEnabled === false ||
            recording ||
            starting ||
            !question.trim()
          }
        >
          {working ? "Working…" : "Ask assistant · জিজ্ঞেস করুন"}
        </button>
        {working && (
          <p role="status">
            {working} Live processing can take several minutes. Your question
            stays here if it cannot finish.
          </p>
        )}
      </form>
      <div className="assistant-starters" aria-label="Starter questions">
        {starterQuestions.map((starter) => (
          <div
            className="starter-card stack"
            key={starter.label}
            role="group"
            aria-label={starter.label}
          >
            <h3>{starter.label}</h3>
            {(["english", "bangla"] as const).map((language) => (
              <button
                type="button"
                className="starter-question"
                key={language}
                lang={language === "bangla" ? "bn" : "en"}
                disabled={busy || recording || starting}
                onClick={() => {
                  setQuestion(starter[language]);
                  setTranscriptReady(false);
                  questionRef.current?.focus();
                }}
              >
                <strong>{language === "bangla" ? "বাংলা" : "English"} ↗</strong>
                <span>{starter[language]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {!turns.length && !working && (
        <p className="assistant-empty muted">
          Your answers and links to the source records will appear here. Courier
          fees and payout due are not available from the records.
        </p>
      )}
      <ol className="assistant-turns" aria-live="polite">
        {turns.map((turn) => (
          <li className="stack assistant-turn" key={turn.id}>
            <h3>{turn.question}</h3>
            <p className="assistant-answer" lang={turn.answer_language}>
              {turn.answer}
            </p>
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
                      <dd>{key.endsWith("_bdt") ? money(value) : value}</dd>
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
                  {proposal.kind === "status" && (
                    <>
                      <StatusChangeWarning
                        previousStatus={proposal.expected_status}
                        nextStatus={proposal.status}
                      />
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
                        Open current order ↗
                      </button>
                    </>
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
                            {line.quantity ?? "?"} · {money(line.unit_price)} ·
                            Discount {money(line.line_discount)}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Delivery ·{" "}
                        {money(proposal.values.customer_delivery_charge)}.
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
                        COD · {money(proposal.cod_amount)}. Books from the
                        packed order using {proposal.reference} as the courier
                        invoice.
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
