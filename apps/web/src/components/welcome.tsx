import { useState, type FormEvent, type ReactNode } from "react";
import { Brand, Icon } from "@/components/app-shell";
import { ImagePreviewButton } from "@/components/image-viewer";
import { Stamp, Voices } from "@/components/khata";
import { ParcelGallery, ProductImage } from "@/components/parcel-gallery";
import { ThemeSwitch } from "@/components/theme-switch";
import conversationInput from "../../public/product/conversation-input.png";
import orderQuote from "../../public/product/order-quote.jpg";
import orderReview from "../../public/product/order-review.jpg";
import parcelInput from "../../public/product/parcel-input.png";
import parcelCheck from "../../public/product/parcel-check.jpg";
import banglaAnswer from "../../public/product/bangla-answer.jpg";

function JudgeStartButton({
  className,
  ready,
  busy,
  labels,
  onStart,
}: {
  className: string;
  ready: boolean;
  busy: boolean;
  labels: { checking: string; starting: string; idle: string };
  onStart: () => void;
}) {
  return (
    <button className={className} disabled={!ready || busy} onClick={onStart}>
      {!ready ? labels.checking : busy ? labels.starting : labels.idle}
      <Icon name="arrow" />
    </button>
  );
}

type Voice = "ai" | "code" | "you";

const JOURNEY: {
  name: string;
  voice: Voice;
  role: string;
  body: string;
  guardrail: string;
}[] = [
  {
    name: "Chat",
    voice: "ai",
    role: "Spark 1.3 + Voice Transcribe",
    body: "Upload a one-to-one sales chat and an optional voice note. Audio is normalized to 16 kHz mono WAV and transcribed with Bengali/English bias.",
    guardrail: "Unclear fields stay empty for review.",
  },
  {
    name: "Draft",
    voice: "you",
    role: "Seller confirm + decimal COD",
    body: "Spark extracts recipient, SKU suggestions, quantities and negotiated prices with exact source quotes. You check each line against its quote, then confirm. Confirming locks the order terms for packing.",
    guardrail:
      "COD = Σ(qty × price − discount) + customer delivery charge − verified prior payment. A customer's “I already paid” never sets verified prior payment. Editing a confirmed order returns it to draft.",
  },
  {
    name: "Pack check",
    voice: "code",
    role: "SAM 3.1 + blind Spark",
    body: "SAM 3.1 crops the label and handbag, trying a second phrase before falling back to the full photo. Spark reads the label blind, without the expected order. A second call compares visible bags with catalog SKU photos. Code compares the fields.",
    guardrail:
      "A failed check cannot be overridden: fix and reshoot. An unsure read allows a separately recorded seller override.",
  },
  {
    name: "Courier",
    voice: "code",
    role: "Steadfast booking",
    body: "Book the packed order using its stable reference (PD-0012) as the unique courier invoice.",
    guardrail:
      "Durable booking attempts reserve stock and reconcile by invoice before any retry. Judge mode uses a simulated courier.",
  },
  {
    name: "Ask in Bangla",
    voice: "you",
    role: "Bangla copilot",
    body: "Ask by voice or text about pending orders, available stock or recorded payouts. Answers come from stored records.",
    guardrail:
      "The app calculates amounts. Nothing the assistant proposes is written until you confirm.",
  },
];

const MODELS = [
  {
    name: "muse-spark-1.3",
    role: "Vision · JSON Schema · Tool Calling",
    body: "Draft extraction from multi-screenshot chats with catalog SKU photos, blind label reads without expected order values, bag comparison, and the grounded tool loop (max six tool calls).",
  },
  {
    name: "sam-3.1",
    role: "Promptable segmentation",
    body: 'Called separately for label and handbag crops before Spark inspection, using the noun phrases "paper label" then "paper", and "handbag" then "bag". When no usable region comes back, the pipeline records a full-photo fallback.',
  },
  {
    name: "muse-voice-transcribe-1.0",
    role: "Bengali / English ASR",
    body: "Audio is normalized with ffmpeg to 16 kHz mono WAV, then transcribed with a Bengali and English language bias plus shop SKU keywords. Assistant transcripts stay editable before sending.",
  },
];

type MeasuredTone = "pass" | "neutral" | "warning";

const MEASURED: {
  check: string;
  outcome: string;
  tone: MeasuredTone;
  note: string;
}[] = [
  {
    check: "Real chat extraction",
    outcome: "8 / 8 fields, 3 / 3 repeats",
    tone: "pass",
    note: "One real seller chat with a voice note; values agree with the seller's workbook. Quantity and discount, not stated in the chat, were left for the seller",
  },
  {
    check: "Questions on the real workbook",
    outcome: "20 / 20 correct · 0 wrong",
    tone: "pass",
    note: "Bangla, Banglish and English, including 3 correct “unknown” answers",
  },
  {
    check: "Wrong labels and bags",
    outcome: "10 / 10 caught",
    tone: "pass",
    note: "7 wrong labels (COD, phone digit, swapped fields) and 3 wrong bags. Constructed labels, some beside real catalog photos",
  },
  {
    check: "Clean parcels",
    outcome: "5 / 6 passed",
    tone: "neutral",
    note: "The miss returned unsure, not fail: a tight crop hid part of the bag",
  },
  {
    check: "Unclear labels",
    outcome: "3 / 3 unsure",
    tone: "pass",
    note: "Obscured or scribbled phone was not guessed",
  },
  {
    check: "SAM 3.1 region crops",
    outcome: "19 / 19 checks cropped",
    tone: "pass",
    note: "Both label and bag, up from 0 after changing the noun phrases",
  },
  {
    check: "Crop vs full photo",
    outcome: "10 / 11 vs 11 / 11",
    tone: "neutral",
    note: "Same parcels. Crops added latency and one false alarm, with no accuracy gain here",
  },
  {
    check: "Real Bangla voice note",
    outcome: "Accuracy not verified",
    tone: "warning",
    note: "One 4 s clip gave the same meaning on 6 / 6 calls; no person has checked it against the audio",
  },
];

const LIMITS: { lead: string; body: ReactNode }[] = [
  {
    lead: "Visible details only.",
    body: "A pack check compares the visible label and unsealed bag beside it. It reveals nothing about sealed contents inside a flyer.",
  },
  {
    lead: "Missing courier fees stay unknown.",
    body: "Courier fee deductions are not stored in the records, so net payout due is refused as unknown rather than guessed.",
  },
  {
    lead: "No inbox scraping.",
    body: "PocketDokani works from screenshots and voice notes you upload. It never connects to social inboxes or records phone calls.",
  },
  {
    lead: "Simulated judge courier.",
    body: (
      <>
        Judge sessions run against isolated synthetic data and{" "}
        <code>SteadfastFake</code>, so exploring never dispatches a real parcel.
      </>
    ),
  },
];

export default function Welcome({
  judge,
  ready,
  busy,
  error,
  notice,
  onSignIn,
}: {
  judge: boolean;
  ready: boolean;
  busy: boolean;
  error: string;
  notice: string;
  onSignIn: (passcode: string) => Promise<void>;
}) {
  const [passcode, setPasscode] = useState("");
  const [signInFrom, setSignInFrom] = useState<"hero" | "form">("hero");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSignInFrom("form");
    await onSignIn(passcode);
  }

  function startSampleShop() {
    setSignInFrom("hero");
    void onSignIn("");
  }

  const signInError = error && (
    <p className="message error" role="alert">
      {error}{" "}
      {ready && !busy && "Use the start or sign-in button to reconnect."}
    </p>
  );

  return (
    <div className="welcome-page">
      <a className="skip-link" href="#welcome-content">
        Skip to content
      </a>

      <header className="welcome-header">
        <div className="welcome-header-inner">
          <Brand />

          <nav className="welcome-nav" aria-label="Landing page sections">
            <a href="#workflow">Journey</a>
            <a href="#packing-table">Packing table</a>
            <a href="#product-examples">Live evidence</a>
            <a href="#architecture">Models &amp; rules</a>
            <a href="#measured">Measured</a>
          </nav>

          <div className="welcome-header-actions">
            <ThemeSwitch />
            {judge ? (
              <JudgeStartButton
                className="primary header-cta"
                ready={ready}
                busy={busy}
                labels={{
                  checking: "Checking…",
                  starting: "Starting…",
                  idle: "Start sample shop",
                }}
                onStart={startSampleShop}
              />
            ) : (
              <a className="button-link primary header-cta" href="/judge">
                Judge demo
                <Icon name="arrow" />
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="welcome-content" className="welcome-content">
        <section className="welcome-hero" aria-labelledby="hero-heading">
          <div className="welcome-intro">
            <h1 id="hero-heading">
              <span lang="bn">চ্যাট থেকে কুরিয়ার</span>
              <span>From chat to courier.</span>
            </h1>

            <p className="hero-lede">
              Bangladeshi social sellers run their shops from chat, handwritten
              labels and spreadsheets. PocketDokani drafts the order, checks the
              parcel and answers in Bangla.{" "}
              <strong>You approve every order, amount, and change.</strong>
            </p>
            <p className="hero-lede-bn" lang="bn">
              চ্যাট স্ক্রিনশট থেকে অর্ডার ড্রাফট করুন। পার্সেল লেবেল যাচাই করুন
              আর বাংলায় দোকানের হিসাব দেখুন। প্রতিটি সিদ্ধান্ত আপনার হাতে।
            </p>

            <div className="welcome-actions">
              {judge ? (
                <JudgeStartButton
                  className="primary hero-primary-cta"
                  ready={ready}
                  busy={busy}
                  labels={{
                    checking: "Checking session…",
                    starting: "Starting demo…",
                    idle: "Start sample shop",
                  }}
                  onStart={startSampleShop}
                />
              ) : (
                <a
                  className="button-link primary hero-primary-cta"
                  href="/judge"
                >
                  Try interactive sample shop
                  <Icon name="arrow" />
                </a>
              )}
              <a className="quiet-link" href={judge ? "/" : "#seller-sign-in"}>
                {judge ? "Seller entry" : "Seller sign-in"}
              </a>
            </div>

            <p className="fine-print">
              Synthetic data only. Live Meta AI calls. Simulated courier. No
              login or key needed for the sample shop.
            </p>

            {signInFrom === "hero" && signInError}
            {!ready && (
              <p role="status" className="fine-print">
                Checking your saved session. This check stops after 20 seconds
                if the service cannot be reached.
              </p>
            )}
          </div>

          <div className="tableau">
            <figure className="tableau-chat">
              <ProductImage
                src={conversationInput}
                alt="Constructed sales chat screenshot in which the final negotiated prices are tote BDT 450 and shoulder bag BDT 550."
                label="Open the constructed sales chat at full size"
                sizes="(max-width: 900px) 60vw, 28vw"
                preload
              />
            </figure>

            <div className="tag tableau-tag">
              <p className="tag-title">
                <span>Draft order</span>
                <code>Spark 1.3 read</code>
              </p>
              <dl className="ledger">
                <div className="ledger-row">
                  <dt>Tote, unit price</dt>
                  <dd>
                    <span className="ai-mark">BDT 450</span>
                  </dd>
                </div>
                <div className="ledger-row">
                  <dt>Shoulder bag, unit price</dt>
                  <dd>
                    <span className="ai-mark">BDT 550</span>
                  </dd>
                </div>
                <div className="ledger-total">
                  <dt>COD you confirmed</dt>
                  <dd>BDT 1,080</dd>
                </div>
              </dl>
              <hr className="tag-tear" />
              <p className="quote">
                Both prices link to the original Bangla final-price message in
                Screenshot 1.
              </p>
            </div>

            <div className="tag tableau-slip">
              <p className="tag-title">
                <span>Pack check</span>
                <code>label vs order</code>
              </p>
              <dl className="ledger">
                <div className="ledger-row">
                  <dt>Written on label</dt>
                  <dd>
                    <span className="ai-mark">1180/-</span>
                  </dd>
                </div>
                <div className="ledger-row">
                  <dt>Confirmed order</dt>
                  <dd>1080.00</dd>
                </div>
              </dl>
              <span className="tableau-stamp">
                <Stamp tone="fail">Fail</Stamp>
              </span>
            </div>

            <p className="tableau-note">
              Constructed synthetic chat and parcel, real Muse Spark output. One
              example, not an accuracy rate.
            </p>
          </div>
        </section>

        <section
          id="voices"
          className="welcome-section"
          aria-labelledby="voices-heading"
        >
          <div className="section-head">
            <h2 id="voices-heading">AI reads. Code checks. You decide.</h2>
            <Voices />
          </div>

          <div className="voices-grid">
            <div className="voice-panel voice-ai">
              <h3>AI reads</h3>
              <p>
                Muse Spark reads screenshots, labels and Bangla questions.
                Whatever it reads is highlighted and carries its source quote.
                It is never trusted yet.
              </p>
              <p className="voice-sample">
                Label says <span className="ai-mark">1180/-</span>
              </p>
            </div>

            <div className="voice-panel voice-code">
              <h3>Code checks</h3>
              <p>
                Deterministic server code compares the read with stored records
                and works out every amount. Unreadable means unsure, never an
                automatic pass.
              </p>
              <dl className="ledger">
                <div className="ledger-row">
                  <dt>Confirmed order</dt>
                  <dd>1080.00</dd>
                </div>
                <div className="ledger-row">
                  <dt>Label</dt>
                  <dd>1180/-</dd>
                </div>
                <div className="ledger-total">
                  <dt>Check</dt>
                  <dd className="verdict-fail">fail</dd>
                </div>
              </dl>
            </div>

            <div className="voice-panel voice-you">
              <h3>You decide</h3>
              <p>
                You approve every order, amount and change. Nothing the
                assistant proposes is written until you confirm.
              </p>
              <div className="voice-decision" aria-hidden="true">
                <span className="voice-decision-button">
                  Confirm COD BDT 1,080
                </span>
                <Stamp tone="pass">Confirmed</Stamp>
              </div>
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="welcome-section"
          aria-labelledby="workflow-heading"
        >
          <div className="section-head">
            <h2 id="workflow-heading">A parcel&rsquo;s journey</h2>
            <p>Five steps, each gated by your confirmation.</p>
          </div>

          <ol className="journey">
            {JOURNEY.map((step, index) => (
              <li
                className="journey-step"
                data-voice={step.voice}
                key={step.name}
              >
                <span className="journey-node" aria-hidden="true">
                  {index + 1}
                </span>
                {index < JOURNEY.length - 1 && (
                  <span className="tag-tear journey-join" aria-hidden="true" />
                )}
                <h3>{step.name}</h3>
                <p className="journey-role">{step.role}</p>
                <p>{step.body}</p>
                <p className="journey-guard">{step.guardrail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="packing-table"
          className="welcome-section"
          aria-labelledby="packing-heading"
        >
          <div className="section-head">
            <h2 id="packing-heading">
              The packing table: why labels and bags need a second pair of eyes
            </h2>
            <p>
              In a two-person home shop, one person negotiates in chat and the
              other packs boxes on the floor. All five photos are AI-generated
              illustrations using fictional orders. They are not app results;
              they show what PocketDokani checks before dispatch.
            </p>
          </div>

          <ParcelGallery />

          <p className="proof-note">
            <strong>Provenance note.</strong> All five photos are AI-generated
            illustrations using fictional orders, and are not app results. A
            pack check compares the label and any visible bag with the confirmed
            order.
          </p>
        </section>

        <section
          id="product-examples"
          className="welcome-section"
          aria-labelledby="examples-heading"
        >
          <div className="section-head">
            <h2 id="examples-heading">
              What the app returned on live Meta API calls
            </h2>
            <p>
              Cropped browser captures, values unchanged, from the November 5
              (Asia/Dhaka) local walkthrough, recaptured after the Khata restyle
              and before the SAM fix, on constructed synthetic inputs, using
              live <code>muse-spark-1.3</code> and <code>sam-3.1</code> calls at{" "}
              <code>api.meta.ai</code>. Select any image to inspect it at full
              resolution.
            </p>
          </div>

          <div className="evidence-list">
            <article className="evidence">
              <div className="evidence-text">
                <p className="evidence-time">muse-spark-1.3 · 01:33:53</p>
                <h3>Screenshots → draft order</h3>
                <p>
                  From the synthetic two-item chat, Spark extracted the tote at{" "}
                  <span className="ai-mark">BDT 450</span> and shoulder bag at{" "}
                  <span className="ai-mark">BDT 550</span>, linking each field
                  to its original Bangla message and screenshot index. It left
                  both line discounts blank for review, so the seller entered 0
                  and confirmed COD BDT 1,080.
                </p>
                <ImagePreviewButton
                  className="evidence-link"
                  src="/product/conversation-input.png"
                  alt="Full synthetic conversation input"
                >
                  Inspect full synthetic conversation input (720 × 1400)
                </ImagePreviewButton>
              </div>
              <div className="evidence-shots">
                <figure>
                  <ProductImage
                    src={orderQuote}
                    alt="An extracted unit price of BDT 450 with the original Bangla message agreeing the tote and shoulder bag prices."
                    label="Open the extracted order quote capture at full size"
                    sizes="(max-width: 760px) 80vw, 280px"
                  />
                  <figcaption>Extracted price + Bangla quote</figcaption>
                </figure>
                <figure>
                  <ProductImage
                    src={orderReview}
                    alt="The extracted recipient name and synthetic phone marker, each linked to the source message in screenshot 2."
                    label="Open the order draft recipient capture at full size"
                    sizes="(max-width: 760px) 80vw, 280px"
                  />
                  <figcaption>Recipient details + Screenshot 2 link</figcaption>
                </figure>
              </div>
            </article>

            <article className="evidence">
              <div className="evidence-text">
                <p className="evidence-time">sam-3.1 + spark-1.3 · 01:35:28</p>
                <h3>Parcel photo → pack check</h3>
                <p>
                  This synthetic label says{" "}
                  <span className="ai-mark">1180/-</span> for an order confirmed
                  at BDT 1,080. The blind label reader returned the written
                  amount, and server code marked the check <strong>fail</strong>
                  . These images predate the SAM fix and used the full photo. In
                  a later walkthrough on the redrawn sample, SAM cropped both
                  regions, the wrong label again failed and the matching label
                  passed. One example of each, not an accuracy rate.
                </p>
                <ImagePreviewButton
                  className="evidence-link"
                  src="/product/parcel-input.png"
                  alt="Full synthetic parcel fixture with the wrong COD on its label"
                >
                  Inspect full synthetic parcel fixture (1000 × 820)
                </ImagePreviewButton>
              </div>
              <div className="evidence-shots">
                <figure>
                  <ProductImage
                    src={parcelInput}
                    alt="Synthetic parcel input for the confirmed order, with a label showing price 1180/- beside illustrated blue and black bags."
                    label="Open the full synthetic parcel photo used for this check"
                    sizes="(max-width: 760px) 80vw, 280px"
                  />
                  <figcaption>Synthetic parcel input (wrong COD)</figcaption>
                </figure>
                <figure>
                  <ProductImage
                    src={parcelCheck}
                    alt="Actual result, top of the slip: a Fail stamp and a notice that a failed check cannot be overridden. The COD row shows 1180/- written against 1080.00 confirmed, followed by a matching order number row."
                    label="Open the pack check capture at full size"
                    sizes="(max-width: 760px) 80vw, 280px"
                  />
                  <figcaption>Observed app verdict: Fail</figcaption>
                </figure>
              </div>
            </article>

            <article className="evidence">
              <div className="evidence-text">
                <p className="evidence-time">muse-spark-1.3 · 01:37:27</p>
                <h3 lang="bn">“কয়টা অর্ডার পাঠানো বাকি আছে?”</h3>
                <p>
                  Asked in Bangla, the assistant selected the order-lookup tool
                  and returned <code>অর্ডার: 3</code> from stored records,
                  citing the newly packed order alongside{" "}
                  <code>PD-DEMO-0003</code> and <code>PD-DEMO-0002</code>.
                </p>
                <ImagePreviewButton
                  className="evidence-link"
                  src="/product/bangla-answer.jpg"
                  alt="Full Bangla assistant answer capture"
                >
                  Inspect full assistant capture (860 × 758)
                </ImagePreviewButton>
              </div>
              <div className="evidence-shots">
                <figure>
                  <ProductImage
                    src={banglaAnswer}
                    alt="Bangla question and actual assistant answer with clickable order records supporting the answer."
                    label="Open the Bangla assistant capture at full size"
                    sizes="(max-width: 760px) 80vw, 305px"
                  />
                  <figcaption>
                    Bangla answer + 3 clickable order chips
                  </figcaption>
                </figure>
              </div>
            </article>
          </div>
        </section>

        <section
          id="architecture"
          className="welcome-section"
          aria-labelledby="models-heading"
        >
          <div className="section-head">
            <h2 id="models-heading">
              Three Meta models, each doing a distinct job
            </h2>
            <p>
              Every call goes to <code>https://api.meta.ai/v1</code> through an
              audited provider client that logs model name, input references,
              token usage and latency in <code>model_runs</code>.
            </p>
          </div>

          <dl className="ledger ledger-wide">
            {MODELS.map((model) => (
              <div className="ledger-row" key={model.name}>
                <dt>
                  <code>{model.name}</code>
                </dt>
                <dd>{model.role}</dd>
                <dd className="ledger-note">{model.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          id="measured"
          className="welcome-section"
          aria-labelledby="measured-heading"
        >
          <div className="section-head">
            <h2 id="measured-heading">
              Measured: what passed, what fell back, what is unevaluated
            </h2>
            <p>
              Recorded November 5, 2026 with live Meta API calls (214 provider
              attempts: 153 Spark, 55 SAM, 6 Voice) on one real seller chat, the
              real seller workbook and 19 constructed parcel checks, with fixes
              made during the run. These are development results, not held-out
              accuracy. No real label photo or genuine pilot shipment is
              claimed.
            </p>
          </div>

          <dl className="ledger ledger-wide">
            {MEASURED.map((row) => (
              <div className="ledger-row" key={row.check}>
                <dt>{row.check}</dt>
                <dd className="measured-outcome" data-tone={row.tone}>
                  {row.outcome}
                </dd>
                <dd className="ledger-note">{row.note}</dd>
              </div>
            ))}
          </dl>

          <div className="limits">
            <h3 id="limits-heading">Said plainly: scope and limits</h3>
            <ul aria-labelledby="limits-heading">
              {LIMITS.map((limit) => (
                <li key={limit.lead}>
                  <strong>{limit.lead}</strong> {limit.body}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="seller-sign-in"
          className="seller-entry"
          aria-labelledby="entry-heading"
        >
          <div className="seller-entry-info">
            <h2 id="entry-heading">
              Take a sample order from chat to courier.
            </h2>
            <p className="muted">
              {judge
                ? "Your isolated shop includes eight sample orders, chat screenshots, parcel photos, and a Bangla and English assistant."
                : "Launch an isolated sample shop without a login, or sign in with your seller passcode."}
            </p>

            <ol className="try-steps-list" role="list">
              <li>
                <span className="try-step-number" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Extract a sample chat</strong>
                  Review source quotes, fill any blank fields and confirm COD
                  BDT 1,080.
                </div>
              </li>
              <li>
                <span className="try-step-number" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Run a pack check</strong>
                  Upload a parcel image and inspect the label and bag verdicts.
                </div>
              </li>
              <li>
                <span className="try-step-number" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Book a simulated courier</strong>
                  Generate a consignment and check the updated stock.
                </div>
              </li>
              <li>
                <span className="try-step-number" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Ask in Bangla</strong>
                  Type <span lang="bn">
                    “এখন কয়টা পার্সেল পাঠানো বাকি?”
                  </span>{" "}
                  and open the cited orders.
                </div>
              </li>
            </ol>
          </div>

          <div className="seller-entry-controls">
            {notice && (
              <p className="message success" role="status">
                {notice}
              </p>
            )}
            {signInFrom === "form" && signInError}
            {!ready ? (
              <p role="status">Checking your session…</p>
            ) : (
              <div className="entry-forms-stack">
                {!judge && (
                  <div className="judge-fast-lane">
                    <p>Evaluating for the hackathon?</p>
                    <a className="button-link primary" href="/judge">
                      Open interactive judge demo
                      <Icon name="arrow" />
                    </a>
                  </div>
                )}

                <form className="seller-form" onSubmit={submit}>
                  {!judge && (
                    <label htmlFor="shop-passcode">
                      Seller shop passcode
                      <input
                        id="shop-passcode"
                        type="password"
                        autoComplete="current-password"
                        required
                        maxLength={256}
                        placeholder="Enter configured shop passcode"
                        value={passcode}
                        onChange={(event) => setPasscode(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <button
                    className={judge ? "primary" : undefined}
                    disabled={busy}
                  >
                    {busy
                      ? "Opening…"
                      : judge
                        ? "Open sample shop"
                        : "Sign in to seller shop"}
                    <Icon name="arrow" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <p>
          <strong>PocketDokani</strong> · Built for the Meta Global AI Developer
          Hackathon 2026 (Track 1: Build for Your World). The application and
          model integrations were built during the hackathon. The seller&rsquo;s
          spreadsheet existed beforehand and was a private data source.
        </p>
        <div className="footer-links">
          <a className="quiet-link" href="/judge">
            Sample shop
          </a>
          <a
            className="quiet-link"
            href="https://github.com/afif-fahim/pocketdokani"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub repository <span aria-hidden="true">↗</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
