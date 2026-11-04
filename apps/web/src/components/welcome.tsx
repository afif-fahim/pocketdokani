import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Brand, Icon } from "@/components/app-shell";
import orderQuote from "../../public/product/order-quote.jpg";
import orderReview from "../../public/product/order-review.jpg";
import parcelInput from "../../public/product/parcel-input.png";
import parcelCheck from "../../public/product/parcel-check.jpg";
import banglaAnswer from "../../public/product/bangla-answer.jpg";
import parcelCleanDome from "../../public/product/parcel-clean-dome.jpg";
import parcelSwappedError from "../../public/product/parcel-swapped-error.jpg";
import parcelPrepaidBag from "../../public/product/parcel-prepaid-bag.jpg";
import parcelBlackDome from "../../public/product/parcel-black-dome.jpg";
import workspaceOverview from "../../public/product/workspace-overview.jpg";

type ShowcaseTab = "parcel" | "workspace" | "bangla";

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
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("parcel");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSignInFrom("form");
    await onSignIn(passcode);
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
        <div className="welcome-brand-group">
          <Brand />
          <span className="hackathon-pill">
            Meta AI Hackathon 2026 · Track 1
          </span>
        </div>

        <nav className="welcome-nav" aria-label="Landing page sections">
          <a href="#workflow">Workflow</a>
          <a href="#packing-table">Packing table</a>
          <a href="#product-examples">Live evidence</a>
          <a href="#architecture">Models &amp; rules</a>
          <a href="#measured">Measured</a>
        </nav>

        <div className="welcome-header-actions">
          <a className="quiet-link" href={judge ? "/" : "#seller-sign-in"}>
            {judge ? "Seller entry" : "Seller sign-in"}
          </a>
          {judge ? (
            <button
              className="primary header-cta"
              disabled={!ready || busy}
              onClick={() => {
                setSignInFrom("hero");
                void onSignIn("");
              }}
            >
              {!ready ? "Checking…" : busy ? "Starting…" : "Start sample shop"}
              <Icon name="arrow" />
            </button>
          ) : (
            <a className="button-link primary header-cta" href="/judge">
              Judge demo
              <Icon name="arrow" />
            </a>
          )}
        </div>
      </header>

      <main id="welcome-content" className="welcome-content">
        <section className="welcome-hero" aria-labelledby="hero-heading">
          <div className="welcome-intro">
            <div className="hero-badge-row">
              <span className="eyebrow-pill">
                <span className="status-dot" />
                BANGLA AI COPILOT FOR SOCIAL SELLERS
              </span>
              <span className="model-tag">Muse Spark 1.3</span>
              <span className="model-tag">SAM 3.1</span>
              <span className="model-tag">Voice Transcribe</span>
            </div>

            <h1 id="hero-heading">
              From messy chats to <span>checked parcels.</span>
            </h1>

            <p className="welcome-bangla-lead" lang="bn">
              মেসেঞ্জার স্ক্রিনশট থেকে অর্ডার ড্রাফট, পার্সেল লেবেল যাচাই এবং
              বাংলায় দোকানের হিসাব — প্রতিটি সিদ্ধান্ত আপনার হাতে।
            </p>

            <p className="welcome-promise">
              A small online bag shop in Bangladesh negotiates prices in chat,
              writes shipping labels by hand, and retypes every order into a
              spreadsheet and courier form. <strong>PocketDokani</strong>{" "}
              prepares that work in one phone web app: AI drafts orders with
              source quotes, checks visible parcel details, and answers shop
              questions from stored records.{" "}
              <strong>You approve every order, amount, and change.</strong>
            </p>

            <div className="welcome-actions">
              {judge ? (
                <button
                  className="primary hero-primary-cta"
                  disabled={!ready || busy}
                  onClick={() => {
                    setSignInFrom("hero");
                    void onSignIn("");
                  }}
                >
                  {!ready
                    ? "Checking session…"
                    : busy
                      ? "Starting demo…"
                      : "Start sample shop"}
                  <Icon name="arrow" />
                </button>
              ) : (
                <a
                  className="button-link primary hero-primary-cta"
                  href="/judge"
                >
                  Try interactive sample shop
                  <Icon name="arrow" />
                </a>
              )}
              <a className="button-link secondary-cta" href="#packing-table">
                See packing table photos ↓
              </a>
            </div>

            {signInFrom === "hero" && signInError}
            {!ready && (
              <p role="status" className="fine-print">
                Checking your saved session. This check stops after 20 seconds
                if the service cannot be reached.
              </p>
            )}

            <dl className="hero-trust-strip">
              <div>
                <dt>No login or key for judges</dt>
                <dd>
                  Isolated synthetic shop with live calls to{" "}
                  <code>api.meta.ai</code>.
                </dd>
              </div>
              <div>
                <dt>Source-linked extraction</dt>
                <dd>
                  Every drafted field cites its Bangla/Banglish quote and
                  screenshot.
                </dd>
              </div>
              <div>
                <dt>Blind label check</dt>
                <dd>
                  Spark reads the parcel label without seeing the expected
                  order.
                </dd>
              </div>
              <div>
                <dt>Confirm-gated writes</dt>
                <dd>
                  Server code owns money math; assistant proposals require a
                  tap.
                </dd>
              </div>
            </dl>
          </div>

          <div className="welcome-showcase">
            <div className="showcase-window">
              <div className="showcase-topbar">
                <div className="window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div
                  className="showcase-tabs"
                  role="tablist"
                  aria-label="Product preview modes"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "parcel"}
                    onClick={() => setActiveTab("parcel")}
                  >
                    1. Parcel check
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "workspace"}
                    onClick={() => setActiveTab("workspace")}
                  >
                    2. Order &amp; quote
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "bangla"}
                    onClick={() => setActiveTab("bangla")}
                  >
                    3. Bangla assistant
                  </button>
                </div>
              </div>

              {activeTab === "parcel" && (
                <div className="showcase-stage" role="tabpanel">
                  <div className="showcase-compare-grid">
                    <figure className="showcase-photo-card">
                      <span className="photo-badge pass">
                        Clean handwritten label · 980/-
                      </span>
                      <a
                        href="/product/parcel-clean-dome.jpg"
                        aria-label="Open clean parcel photo at full size"
                      >
                        <Image
                          src={parcelCleanDome}
                          alt="Generated packing-table parcel for order #PD-SAMPLE-01 with Name Demo recipient, phone 01X-EXAMPLE redacted, price 980/-, and brown monogram dome bag."
                          sizes="(max-width: 900px) 100vw, 28vw"
                          preload
                        />
                      </a>
                      <figcaption>
                        <strong>Order #PD-SAMPLE-01:</strong> Name &amp; phone in
                        correct rows, <code>980/-</code> matches COD, brown
                        monogram dome bag beside parcel.
                      </figcaption>
                    </figure>

                    <figure className="showcase-photo-card">
                      <span className="photo-badge danger">
                        Swapped rows &amp; wrong COD · 890/-
                      </span>
                      <a
                        href="/product/parcel-swapped-error.jpg"
                        aria-label="Open swapped-field parcel photo at full size"
                      >
                        <Image
                          src={parcelSwappedError}
                          alt="Generated packing-table parcel for order #PD-SAMPLE-01 where phone is written in the Name row, Name in the Number row, and price is 890/- instead of 980/-."
                          sizes="(max-width: 900px) 100vw, 28vw"
                        />
                      </a>
                      <figcaption>
                        <strong>Packing mistake:</strong> Phone written in{" "}
                        <code>NAME</code>, customer name in <code>NUMBER</code>,
                        and <code>890/-</code> written instead of{" "}
                        <code>980/-</code>.
                      </figcaption>
                    </figure>
                  </div>

                  <div className="showcase-callout">
                    <div className="callout-header">
                      <span className="eyebrow">
                        HOW PACK CHECK EVALUATE PARCELS
                      </span>
                      <span className="callout-chip">
                        SAM 3.1 + Blind Muse Spark 1.3
                      </span>
                    </div>
                    <p>
                      Spark reads the label{" "}
                      <strong>without seeing the order</strong> so it cannot
                      guess expected digits. Server code compares order ref,
                      phone, COD, name, and address. Unreadable fields return{" "}
                      <strong>unsure</strong> (never an automatic pass).
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "workspace" && (
                <div className="showcase-stage" role="tabpanel">
                  <div className="showcase-workspace-stack">
                    <a
                      href="/product/workspace-overview.jpg"
                      className="workspace-main-shot"
                      aria-label="Open full sample shop workspace capture"
                    >
                      <Image
                        src={workspaceOverview}
                        alt="PocketDokani sample shop showing the 3-step judge walkthrough and 8 isolated synthetic orders."
                        sizes="(max-width: 900px) 100vw, 45vw"
                      />
                    </a>
                    <div className="workspace-quote-overlay">
                      <span className="eyebrow">
                        SOURCE-LINKED DRAFT EXTRACTION
                      </span>
                      <a
                        href="/product/order-quote.jpg"
                        aria-label="Open extracted unit price capture at full size"
                      >
                        <Image
                          src={orderQuote}
                          alt="Extracted unit price of BDT 450.00 linked to Screenshot 1 with the original Bangla final-price quote."
                          sizes="280px"
                        />
                      </a>
                      <p>
                        Every extracted price retains the original chat message
                        so the seller verifies before confirming COD.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "bangla" && (
                <div className="showcase-stage" role="tabpanel">
                  <div className="showcase-bangla-layout">
                    <a
                      href="/product/bangla-answer.jpg"
                      className="bangla-shot-card"
                      aria-label="Open Bangla assistant answer capture at full size"
                    >
                      <Image
                        src={banglaAnswer}
                        alt="Typed Bangla question asking how many orders remain to be sent, returning 3 orders with clickable order reference chips."
                        sizes="(max-width: 900px) 100vw, 24vw"
                      />
                    </a>
                    <div className="bangla-explanation">
                      <span className="eyebrow">
                        GROUNDED TOOL CALLING · ZERO MODEL ARITHMETIC
                      </span>
                      <h3 lang="bn">“কয়টা অর্ডার পাঠানো বাকি আছে?”</h3>
                      <p>
                        Spark selects shop-scoped tools (up to 6 steps) and
                        cites record IDs. FastAPI validates every reference and
                        renders the exact count (<code>অর্ডার: 3</code>)
                        directly from PostgreSQL.
                      </p>
                      <ul className="Grounded-list">
                        <li>
                          <strong>Clickable record chips:</strong> Jump straight
                          to <code>PD-0DEF112AC1994D96</code>,{" "}
                          <code>PD-DEMO-0003</code>, or{" "}
                          <code>PD-DEMO-0002</code>.
                        </li>
                        <li>
                          <strong>Proposal cards:</strong> Asking to mark an
                          order delivered or book a courier creates a confirm
                          card—nothing writes until you tap.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="welcome-section"
          aria-labelledby="workflow-heading"
        >
          <div className="section-header-row">
            <div>
              <p className="eyebrow">
                THE SELLER’S WORKFLOW · FOUR CONFIRMATION-GATED STEPS
              </p>
              <h2 id="workflow-heading">
                AI prepares the reading. Code checks the math. You decide.
              </h2>
            </div>
            <div className="pipeline-legend" aria-label="Component roles">
              <span className="legend-pill model">Meta Model API</span>
              <span className="legend-pill code">
                Deterministic Server Code
              </span>
              <span className="legend-pill seller">Seller Approval</span>
            </div>
          </div>

          <div className="workflow-grid">
            <article className="workflow-card">
              <div className="workflow-step-top">
                <span className="step-badge">STEP 01</span>
                <span className="role-tag model">
                  Spark 1.3 + Voice Transcribe
                </span>
              </div>
              <h3>Screenshots &amp; voice → Draft order</h3>
              <p>
                Upload a 1-to-1 sales chat batch and optional voice note. Audio
                is normalized to 16 kHz mono WAV and transcribed with
                Bengali/English bias; Spark extracts recipient details, SKU
                suggestions, quantities, and negotiated prices with exact source
                quotes.
              </p>
              <div className="workflow-rule">
                <strong>Guardrail:</strong> Unclear fields stay empty for
                review. A customer’s “I already paid” message never sets
                verified prior payment.
              </div>
            </article>

            <article className="workflow-card">
              <div className="workflow-step-top">
                <span className="step-badge">STEP 02</span>
                <span className="role-tag code">
                  Seller Confirm + Decimal COD
                </span>
              </div>
              <h3>Review lines → Confirm exact COD</h3>
              <p>
                Inspect each extracted line against its screenshot quote, adjust
                prices or discounts, and record any seller-verified advance.
                Confirming locks the order terms for packing.
              </p>
              <div className="workflow-rule">
                <strong>Formula:</strong>{" "}
                <code>
                  COD = Σ(qty × price − discount) + delivery − verified_prepaid
                </code>
                . Editing a confirmed order returns it to draft.
              </div>
            </article>

            <article className="workflow-card">
              <div className="workflow-step-top">
                <span className="step-badge">STEP 03</span>
                <span className="role-tag model">SAM 3.1 + Blind Spark</span>
              </div>
              <h3>Parcel photo → Blind label &amp; bag check</h3>
              <p>
                SAM 3.1 segments the shipping label and handbag (with full-photo
                fallback). Spark reads the label blind—without the expected
                order—while a second call compares visible bags against catalog
                SKU photos.
              </p>
              <div className="workflow-rule">
                <strong>Guardrail:</strong> A red mismatch blocks booking until
                fixed and reshot. An <code>unsure</code> read allows a
                separately recorded seller override.
              </div>
            </article>

            <article className="workflow-card">
              <div className="workflow-step-top">
                <span className="step-badge">STEP 04</span>
                <span className="role-tag seller">
                  Steadfast Booking + Bangla Copilot
                </span>
              </div>
              <h3>Book courier &amp; ask in Bangla</h3>
              <p>
                Book the packed order using its stable reference (
                <code>PD-0012</code>) as the unique courier invoice. Ask voice
                or text questions in Bangla to inspect pending orders, available
                stock, or recorded payouts.
              </p>
              <div className="workflow-rule">
                <strong>Guardrail:</strong> Durable booking attempts reserve
                stock and reconcile by invoice before any retry. Judge mode uses
                a simulated courier.
              </div>
            </article>
          </div>
        </section>

        <section
          id="packing-table"
          className="welcome-section"
          aria-labelledby="packing-heading"
        >
          <div className="section-header-row">
            <div>
              <p className="eyebrow">
                REAL-ORDER SCENARIOS · GENERATED PACKING TABLE GALLERY
              </p>
              <h2 id="packing-heading">
                Why handwritten labels and bag variants need a second pair of
                eyes.
              </h2>
              <p className="section-subtext">
                In a two-person home shop, one person negotiates in Messenger
                and the other packs boxes on the floor. These generated parcel
                scenes—modeled after real orders from the{" "}
                <strong>Demo shop</strong> bag workbook with personal phone digits
                and street details anonymized—show the exact failure modes
                PocketDokani is built around.
              </p>
            </div>
          </div>

          <div className="parcel-gallery-grid">
            <figure className="parcel-scenario-card">
              <div className="scenario-image-wrap">
                <span className="photo-badge pass">
                  01 · Clean label &amp; matching SKU
                </span>
                <a
                  href="/product/parcel-clean-dome.jpg"
                  aria-label="Open full-size photo of clean parcel #PD-SAMPLE-01"
                >
                  <Image
                    src={parcelCleanDome}
                    alt="Packed parcel #PD-SAMPLE-01 with clean handwritten label (Demo recipient, 01X-EXAMPLE redacted, Example Road, Dhaka, 980/-) beside the brown monogram dome bag."
                    sizes="(max-width: 760px) 100vw, 48vw"
                  />
                </a>
              </div>
              <figcaption>
                <div className="scenario-meta">
                  <code>Order #PD-SAMPLE-01</code>
                  <span>COD: BDT 980/-</span>
                  <span>SKU: Brown Monogram Dome</span>
                </div>
                <h3>Every field in its row, bag beside the parcel.</h3>
                <p>
                  Order reference, recipient name, 11-digit phone, address, and{" "}
                  <code>980/-</code> COD are written in their designated rows
                  with the unsealed handbag visible beside the box for SKU
                  comparison.
                </p>
              </figcaption>
            </figure>

            <figure className="parcel-scenario-card">
              <div className="scenario-image-wrap">
                <span className="photo-badge danger">
                  02 · Swapped rows &amp; wrong COD (890/- vs 980/-)
                </span>
                <a
                  href="/product/parcel-swapped-error.jpg"
                  aria-label="Open full-size photo of swapped-row parcel #PD-SAMPLE-01"
                >
                  <Image
                    src={parcelSwappedError}
                    alt="Packed parcel #PD-SAMPLE-01 where the phone number is written in the Name row, customer name in the Number row, and price is 890/- instead of 980/-."
                    sizes="(max-width: 760px) 100vw, 48vw"
                  />
                </a>
              </div>
              <figcaption>
                <div className="scenario-meta">
                  <code>Order #PD-SAMPLE-01</code>
                  <span className="danger-text">
                    Written: 890/- (Expected 980/-)
                  </span>
                  <span>Row swap error</span>
                </div>
                <h3>The packing mistake that inspired blind label checks.</h3>
                <p>
                  When rushing through parcels, the packer wrote the phone
                  number in the <code>NAME:</code> field, the customer name in{" "}
                  <code>NUMBER:</code>, and transposed the COD to{" "}
                  <code>890/-</code>. A blind read + deterministic field
                  comparison is designed to catch swapped or mismatched values.
                </p>
              </figcaption>
            </figure>

            <figure className="parcel-scenario-card">
              <div className="scenario-image-wrap">
                <span className="photo-badge warning">
                  03 · Scratched-out phone &amp; prepaid 0/- COD
                </span>
                <a
                  href="/product/parcel-prepaid-bag.jpg"
                  aria-label="Open full-size photo of prepaid parcel #PD-SAMPLE-03 with scratched phone"
                >
                  <Image
                    src={parcelPrepaidBag}
                    alt="Packed parcel #PD-SAMPLE-03 with a scratched-out phone number, rewritten phone, and 0/- price next to a brown leather shoulder bag with silver buckle and chain."
                    sizes="(max-width: 760px) 100vw, 48vw"
                  />
                </a>
              </div>
              <figcaption>
                <div className="scenario-meta">
                  <code>Order #PD-SAMPLE-03</code>
                  <span>Written COD: 0/-</span>
                  <span>SKU: Brown Chain Shoulder Bag</span>
                </div>
                <h3>Handwritten corrections and advance payments.</h3>
                <p>
                  A crossed-out number on the label makes optical reading
                  ambiguous—returning <code>unsure</code> prompts a clearer
                  photo or explicit seller review. And a <code>0/-</code> COD is
                  accepted only when the seller has confirmed a verified prior
                  payment.
                </p>
              </figcaption>
            </figure>

            <figure className="parcel-scenario-card">
              <div className="scenario-image-wrap">
                <span className="photo-badge neutral">
                  04 · Colour variant verification
                </span>
                <a
                  href="/product/parcel-black-dome.jpg"
                  aria-label="Open full-size photo of black dome bag parcel #PD-SAMPLE-04"
                >
                  <Image
                    src={parcelBlackDome}
                    alt="Packed parcel #PD-SAMPLE-04 for Example Road, Dhaka with price 970/- beside the black monogram dome bag variant."
                    sizes="(max-width: 760px) 100vw, 48vw"
                  />
                </a>
              </div>
              <figcaption>
                <div className="scenario-meta">
                  <code>Order #PD-SAMPLE-04</code>
                  <span>COD: BDT 970/-</span>
                  <span>SKU: Black Monogram Dome</span>
                </div>
                <h3>
                  Distinguishing Black vs. Brown SKU variants before sealing.
                </h3>
                <p>
                  The same dome bag ships in multiple colourways. Placing the
                  unsealed bag beside the parcel lets Spark compare the visible
                  product against the confirmed SKU photo before the bag goes
                  into the flyer.
                </p>
              </figcaption>
            </figure>
          </div>

          <p className="proof-note">
            <strong>Provenance &amp; privacy note:</strong> The four photos
            above are AI-generated parcel scenes modeled after real packing
            table orders; customer surnames, phone digits, and building details
            are redacted. A parcel photo checks visible label and bag details
            only and establishes nothing about sealed contents.
          </p>
        </section>

        <section
          id="product-examples"
          className="welcome-section welcome-evidence"
          aria-labelledby="examples-heading"
        >
          <div className="section-header-row">
            <div>
              <p className="eyebrow">
                ACTUAL APP CAPTURES · CONSTRUCTED WALKTHROUGH ON LIVE META
                MODELS
              </p>
              <h2 id="examples-heading">
                What the app actually returned on live Meta API calls.
              </h2>
              <p className="section-subtext">
                Unedited browser captures from the November 4 local walkthrough
                on constructed synthetic inputs, using live{" "}
                <code>muse-spark-1.3</code> and <code>sam-3.1</code> calls at{" "}
                <code>api.meta.ai</code>. Select any image to inspect it at full
                resolution.
              </p>
            </div>
          </div>

          <div className="proof-moments">
            <article className="evidence-card">
              <div className="evidence-card-header">
                <span className="eyebrow">01 · SCREENSHOTS → ORDER DRAFT</span>
                <span className="audit-time">muse-spark-1.3 · 15:34:19</span>
              </div>
              <h3>Keep the final negotiated price and quote in view.</h3>
              <p>
                From the synthetic two-item chat, Spark extracted the tote at{" "}
                <strong>BDT 450</strong> and shoulder bag at{" "}
                <strong>BDT 550</strong>, linking each field to its original
                Bangla message and screenshot index.
              </p>

              <div className="evidence-pair">
                <div className="evidence-specimen">
                  <span className="specimen-label">
                    Extracted price + Bangla quote
                  </span>
                  <a
                    href="/product/order-quote.jpg"
                    aria-label="Open the extracted order quote capture at full size"
                  >
                    <Image
                      src={orderQuote}
                      alt="An extracted unit price of BDT 450 with the original Bangla message agreeing the tote and shoulder bag prices."
                      sizes="(max-width: 760px) 100vw, 280px"
                    />
                  </a>
                </div>

                <div className="evidence-specimen">
                  <span className="specimen-label">
                    Recipient details + Screenshot 2 link
                  </span>
                  <a
                    href="/product/order-review.jpg"
                    aria-label="Open the order draft recipient capture at full size"
                  >
                    <Image
                      src={orderReview}
                      alt="The extracted recipient name and synthetic phone marker, each linked to the source message in screenshot 2."
                      sizes="(max-width: 760px) 100vw, 280px"
                    />
                  </a>
                </div>
              </div>

              <div className="evidence-footer-link">
                <a href="/product/conversation-input.png">
                  Inspect full synthetic conversation input (720 × 1400) ↗
                </a>
              </div>
            </article>

            <article className="evidence-card">
              <div className="evidence-card-header">
                <span className="eyebrow">02 · PARCEL PHOTO → LABEL CHECK</span>
                <span className="audit-time">
                  sam-3.1 + spark-1.3 · 15:36:13
                </span>
              </div>
              <h3>Unclear is a reason to pause—never an automatic pass.</h3>
              <p>
                Tested on a synthetic parcel image with the phone field
                deliberately obscured. SAM fell back to the full photo; the
                blind label reader marked the label <strong>unsure</strong>{" "}
                while matching the visible bags, prompting a reshoot.
              </p>

              <div className="evidence-pair">
                <div className="evidence-specimen">
                  <span className="specimen-label">
                    Synthetic parcel input (phone obscured)
                  </span>
                  <a
                    href="/product/parcel-input.png"
                    aria-label="Open the full synthetic parcel photo used for this check"
                  >
                    <Image
                      src={parcelInput}
                      alt="Synthetic parcel input for the confirmed order, with its phone field deliberately obscured and two illustrated bags."
                      sizes="(max-width: 760px) 100vw, 280px"
                    />
                  </a>
                </div>

                <div className="evidence-specimen">
                  <span className="specimen-label">
                    Observed app verdict: Unsure
                  </span>
                  <a
                    href="/product/parcel-check.jpg"
                    aria-label="Open the parcel check capture at full size"
                  >
                    <Image
                      src={parcelCheck}
                      alt="Actual result: Pack check unsure, label unsure, visible bag match. The app asks for a reshoot with readable label fields."
                      sizes="(max-width: 760px) 100vw, 280px"
                    />
                  </a>
                </div>
              </div>

              <div className="evidence-footer-link">
                <a href="/product/parcel-input.png">
                  Inspect full synthetic parcel fixture (1000 × 820) ↗
                </a>
              </div>
            </article>

            <article className="evidence-card">
              <div className="evidence-card-header">
                <span className="eyebrow">03 · BANGLA QUESTION → RECORDS</span>
                <span className="audit-time">muse-spark-1.3 · 15:45:55</span>
              </div>
              <h3 lang="bn">“কয়টা অর্ডার পাঠানো বাকি আছে?”</h3>
              <p>
                Asked in Bangla, the assistant selected the order-lookup tool
                and returned <code>অর্ডার: 3</code> from stored records—citing
                the newly confirmed order alongside <code>PD-DEMO-0003</code>{" "}
                and <code>PD-DEMO-0002</code>.
              </p>

              <div className="evidence-single">
                <div className="evidence-specimen">
                  <span className="specimen-label">
                    Bangla answer + 3 clickable order chips
                  </span>
                  <a
                    href="/product/bangla-answer.jpg"
                    aria-label="Open the Bangla assistant capture at full size"
                  >
                    <Image
                      src={banglaAnswer}
                      alt="Bangla question and actual assistant answer with clickable order records supporting the answer."
                      sizes="(max-width: 760px) 100vw, 305px"
                    />
                  </a>
                </div>
              </div>

              <div className="evidence-footer-link">
                <a href="/product/bangla-answer.jpg">
                  Inspect full assistant capture (305 × 335) ↗
                </a>
              </div>
            </article>
          </div>
        </section>

        <section
          id="architecture"
          className="welcome-section welcome-models-section"
          aria-labelledby="models-heading"
        >
          <div className="section-header-row">
            <div>
              <p className="eyebrow">
                META MODEL API AT RUNTIME · AUDITED IN MODEL_RUNS
              </p>
              <h2 id="models-heading">
                Three Meta models, each doing a distinct job.
              </h2>
              <p className="section-subtext">
                Every call goes to <code>https://api.meta.ai/v1</code> through
                an audited provider client that logs model name, input
                references, token usage, and latency in <code>model_runs</code>.
              </p>
            </div>
          </div>

          <div className="models-cards-grid">
            <article className="model-detail-card">
              <div className="model-card-top">
                <code>muse-spark-1.3</code>
                <span className="model-role-pill">
                  Vision · JSON Schema · Tool Calling
                </span>
              </div>
              <h3>Draft extraction, blind label reads &amp; agent loop</h3>
              <p>
                Reads multi-screenshot sales conversations with catalog SKU
                photos, performs blind label OCR without expected order values,
                compares visible bags, and drives the 6-step grounded tool loop.
              </p>
            </article>

            <article className="model-detail-card">
              <div className="model-card-top">
                <code>sam-3.1</code>
                <span className="model-role-pill">Promptable Segmentation</span>
              </div>
              <h3>Shipping-label &amp; handbag region localization</h3>
              <p>
                Called separately for <code>&quot;shipping label&quot;</code>{" "}
                and <code>&quot;handbag&quot;</code> crops before Spark
                inspection. When no usable region is returned, the pipeline
                explicitly records a full-photo fallback.
              </p>
            </article>

            <article className="model-detail-card">
              <div className="model-card-top">
                <code>muse-voice-transcribe-1.0</code>
                <span className="model-role-pill">Bengali / English ASR</span>
              </div>
              <h3>Voice notes &amp; editable assistant speech input</h3>
              <p>
                Normalizes audio with <code>ffmpeg</code> to 16 kHz mono WAV and
                transcribes with{" "}
                <code>
                  languageBias: [&quot;Bengali&quot;, &quot;English&quot;]
                </code>{" "}
                plus shop SKU keywords. Assistant transcripts stay editable
                before sending.
              </p>
            </article>
          </div>
        </section>

        <section
          id="measured"
          className="welcome-section"
          aria-labelledby="measured-heading"
        >
          <div className="section-header-row">
            <div>
              <p className="eyebrow">
                MEASURED SMOKE RESULTS &amp; HONEST LIMITS · NOVEMBER 4, 2026
              </p>
              <h2 id="measured-heading">
                What passed locally, what fell back, and what remains
                unevaluated.
              </h2>
              <p className="section-subtext">
                Recorded on constructed development fixtures with live Meta API
                calls (28 provider attempts: 21 Spark, 6 SAM, 1 Voice) and an
                isolated simulated courier. No held-out accuracy or genuine
                pilot shipment is claimed.
              </p>
            </div>
          </div>

          <div className="measured-layout">
            <div className="measured-table-card">
              <table className="measured-table">
                <thead>
                  <tr>
                    <th scope="col">Capability check</th>
                    <th scope="col">Observed outcome</th>
                    <th scope="col">Sample &amp; scope note</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Order extraction values</th>
                    <td>
                      <span className="metric-badge pass">11 / 11 correct</span>
                    </td>
                    <td>
                      5 header fields + qty/price/discount across 2 item lines
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Catalog SKU suggestions</th>
                    <td>
                      <span className="metric-badge pass">2 / 2 correct</span>
                    </td>
                    <td>Blue canvas tote &amp; black shoulder bag matched</td>
                  </tr>
                  <tr>
                    <th scope="row">Grounded business questions</th>
                    <td>
                      <span className="metric-badge pass">
                        5 / 5 correct · 0 wrong
                      </span>
                    </td>
                    <td>
                      4 record-backed answers + 1 correct “unknown” refusal
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Synthetic parcel checks</th>
                    <td>
                      <span className="metric-badge neutral">
                        1 pass · 2 unsure
                      </span>
                    </td>
                    <td>
                      Clean parcel passed (1/1); obscured phone returned unsure
                      (1/1)
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Wrong-COD synthetic parcel</th>
                    <td>
                      <span className="metric-badge warning">
                        0 / 1 fail (returned unsure)
                      </span>
                    </td>
                    <td>
                      Blind reader marked fields illegible on synthetic 1,180 vs
                      1,080 fixture
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">SAM 3.1 region crops</th>
                    <td>
                      <span className="metric-badge warning">
                        0 / 6 usable crops
                      </span>
                    </td>
                    <td>
                      All 6 calls on synthetic illustrations used full-photo
                      fallback
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Voice transcription</th>
                    <td>
                      <span className="metric-badge pass">1 / 1 exact</span>
                    </td>
                    <td>
                      Synthetic English WAV (2.09 s); Bangla mic ASR untested in
                      smoke run
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <aside className="limits-card" aria-labelledby="limits-heading">
              <span className="eyebrow">SAID PLAINLY · SCOPE &amp; LIMITS</span>
              <h3 id="limits-heading">Boundaries we keep explicit</h3>
              <ul className="limits-list">
                <li>
                  <strong>Visible details only:</strong> A parcel photo checks
                  the visible label and unsealed bag beside it; it reveals
                  nothing about sealed contents inside a flyer.
                </li>
                <li>
                  <strong>Missing courier fees stay unknown:</strong> Because
                  courier fee deductions are not stored in the records, net
                  payout due is refused as unknown rather than guessed.
                </li>
                <li>
                  <strong>No inbox scraping:</strong> PocketDokani works from
                  seller-uploaded screenshots and voice notes; it never connects
                  to Messenger inboxes or records phone calls.
                </li>
                <li>
                  <strong>Simulated judge courier:</strong> Judge sessions run
                  against isolated synthetic data and <code>SteadfastFake</code>{" "}
                  so exploring never dispatches a real parcel.
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section
          id="seller-sign-in"
          className="seller-entry panel"
          aria-labelledby="entry-heading"
        >
          <div className="seller-entry-info">
            <p className="eyebrow">
              {judge ? "INTERACTIVE JUDGE SANDBOX" : "TRY OR SIGN IN"}
            </p>
            <h2 id="entry-heading">
              {judge
                ? "Take one sample order from chat to courier."
                : "Explore the judge sample shop or sign in to your shop."}
            </h2>
            <p className="muted">
              {judge
                ? "Your session gets an isolated synthetic shop with 8 sample orders, sample chat screenshots, synthetic parcel fixtures, and the Bangla/English assistant."
                : "Judges can launch an isolated sample shop with no login. Sellers can sign in below with their shop passcode."}
            </p>

            <ol className="try-steps-list">
              <li>
                <strong>Extract sample chat:</strong> Review source quotes and
                confirm COD BDT 1,080.
              </li>
              <li>
                <strong>Run pack check:</strong> Upload a parcel image and
                inspect label &amp; bag verdicts.
              </li>
              <li>
                <strong>Book fake courier:</strong> Generate a simulated
                consignment and verify stock deduction.
              </li>
              <li>
                <strong>Ask in Bangla:</strong> Type{" "}
                <span lang="bn">“এখন কয়টা পার্সেল পাঠানো বাকি?”</span> and
                inspect the cited order chips.
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
                    <span className="eyebrow">
                      EVALUATING FOR THE HACKATHON?
                    </span>
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
        <div>
          <strong>PocketDokani</strong> · Built for the Meta Global AI Developer
          Hackathon 2026 (Track 1: Build for Your World)
        </div>
        <div className="footer-links">
          <a className="quiet-link" href="/judge">
            Sample shop
          </a>
          <a
            className="quiet-link"
            href="https://github.com/afif-fahim/pocketdokani"
          >
            GitHub repository <span aria-hidden="true">↗</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
