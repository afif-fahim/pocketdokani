import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Brand, Icon } from "@/components/app-shell";
import orderQuote from "../../public/product/order-quote.jpg";
import orderReview from "../../public/product/order-review.jpg";
import conversationInput from "../../public/product/conversation-input.png";
import parcelInput from "../../public/product/parcel-input.png";
import parcelCheck from "../../public/product/parcel-check.jpg";
import banglaAnswer from "../../public/product/bangla-answer.jpg";

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
        <Brand />
        <a className="quiet-link" href={judge ? "/" : "#seller-sign-in"}>
          Seller sign-in
          <Icon name="arrow" />
        </a>
      </header>
      <main id="welcome-content" className="welcome-content">
        <section className="welcome-intro">
          <p className="eyebrow">FOR SMALL ONLINE SELLERS IN BANGLADESH</p>
          <h1>
            From messy chats to <span>checked parcels.</span>
          </h1>
          <p className="welcome-promise">
            Turn order screenshots into drafts, check parcel labels, and ask
            shop questions in Bangla. You approve every change.
          </p>
          <div className="welcome-actions">
            {judge ? (
              <button
                className="primary"
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
              <a className="button-link primary" href="/judge">
                Try demo
                <Icon name="arrow" />
              </a>
            )}
            <a className="quiet-link" href="#product-examples">
              See it at work ↓
            </a>
          </div>
          <p className="welcome-disclosure">
            No sign-up. Synthetic shop data. Live AI analysis.
            <br />
            Demo courier bookings are simulated.
          </p>
          {signInFrom === "hero" && signInError}
          {!ready && (
            <p role="status" className="fine-print">
              Checking your saved session. This check stops after 20 seconds if
              the service cannot be reached.
            </p>
          )}
        </section>
        <figure className="welcome-capture">
          <div className="capture-label">
            <span className="status-dot" />
            FROM THE APP · SYNTHETIC EXAMPLE
          </div>
          <a
            href="/product/order-quote.jpg"
            aria-label="Open the extracted order capture at full size"
          >
            <Image
              src={orderQuote}
              alt="An extracted unit price of BDT 450 with the original Bangla message agreeing the tote and shoulder bag prices."
              sizes="(max-width: 760px) 100vw, 50vw"
              preload
            />
          </a>
          <figcaption>
            The agreed price, with the message behind it. Ready for your review.
          </figcaption>
        </figure>
        <section
          id="product-examples"
          className="welcome-evidence"
          aria-labelledby="examples-heading"
        >
          <div className="welcome-section-heading">
            <p className="eyebrow">
              LESS RETYPING. MORE KNOWING WHAT COMES NEXT.
            </p>
            <h2 id="examples-heading">A conversation. A parcel. A question.</h2>
            <p>
              Actual app captures from a synthetic shop, using live Meta models.
            </p>
          </div>
          <div className="proof-moments">
            <figure>
              <p className="proof-input-label">Conversation input · detail ↓</p>
              <a
                href="/product/conversation-input.png"
                className="proof-input proof-input--conversation"
                aria-label="Open the full synthetic conversation used for extraction"
              >
                <Image
                  src={conversationInput}
                  alt="Detail of the synthetic chat agreeing final prices in Bangla: tote BDT 450 and shoulder bag BDT 550."
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </a>
              <a
                href="/product/order-review.jpg"
                aria-label="Open the order draft capture at full size"
              >
                <Image
                  src={orderReview}
                  alt="The extracted recipient name and synthetic phone marker, each linked to the source message in screenshot 2."
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </a>
              <figcaption>
                <span className="eyebrow">01 · SCREENSHOTS → ORDER DRAFT</span>
                <h3>Keep the final agreement in view.</h3>
                <p>
                  Review the extracted items, prices and source quotes. Confirm
                  only when the details are right.
                </p>
              </figcaption>
            </figure>
            <figure>
              <p className="proof-input-label">Parcel input · label detail ↓</p>
              <a
                href="/product/parcel-input.png"
                className="proof-input proof-input--parcel"
                aria-label="Open the full synthetic parcel photo used for this check"
              >
                <Image
                  src={parcelInput}
                  alt="Detail of the synthetic parcel label for the same order, with its phone field deliberately obscured."
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </a>
              <a
                href="/product/parcel-check.jpg"
                aria-label="Open the parcel check capture at full size"
              >
                <Image
                  src={parcelCheck}
                  alt="Actual result: Pack check unsure, label unsure, visible bag match. The app asks for a reshoot with readable label fields."
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </a>
              <figcaption>
                <span className="eyebrow">02 · PARCEL PHOTO → LABEL CHECK</span>
                <h3>Unclear is a reason to pause.</h3>
                <p>
                  This label was unreadable in the live check. The app returned
                  unsure and asked for a clearer photo; it did not approve the
                  parcel.
                </p>
              </figcaption>
            </figure>
            <figure>
              <a
                href="/product/bangla-answer.jpg"
                aria-label="Open the Bangla assistant capture at full size"
              >
                <Image
                  src={banglaAnswer}
                  alt="Bangla question and actual assistant answer with clickable order records supporting the answer."
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </a>
              <figcaption>
                <span className="eyebrow">03 · BANGLA QUESTION → RECORDS</span>
                <h3 lang="bn">কয়টা অর্ডার পাঠানো বাকি?</h3>
                <p>
                  Speak or type in Bangla. See the shop records behind the
                  answer. Proposed changes still need your tap.
                </p>
              </figcaption>
            </figure>
          </div>
          <p className="proof-note">
            Screenshots show individual results, not an accuracy claim. A parcel
            photo checks visible details, not sealed contents. Select any
            capture to read it at full size.
          </p>
        </section>
        <section
          className="welcome-story"
          aria-labelledby="seller-story-heading"
        >
          <div>
            <p className="eyebrow">BUILT AROUND THE SELLER’S DAY</p>
            <h2 id="seller-story-heading">
              The details are scattered. The work is yours.
            </h2>
          </div>
          <div>
            <p>
              The colour is in one message. The final price is further down the
              chat. Then the same details have to go into the courier form. A
              packing mistake means checking again; a shop question means
              opening the spreadsheet.
            </p>
            <p>
              PocketDokani prepares that work in one place, so the seller can
              review it and decide. Your shop. One less thing to juggle.
            </p>
          </div>
        </section>
        <section className="welcome-models" aria-labelledby="models-heading">
          <h2 id="models-heading">Three Meta models, with a job to do.</h2>
          <dl>
            <div>
              <dt>Muse Spark 1.3</dt>
              <dd>
                Drafts from screenshots, reads labels and looks up shop records
                for answers.
              </dd>
            </div>
            <div>
              <dt>SAM 3.1</dt>
              <dd>
                Looks for the label and bag in parcel photos, with full-photo
                fallback.
              </dd>
            </div>
            <div>
              <dt>Muse Voice Transcribe</dt>
              <dd>
                Turns Bengali and English speech into text you can review.
              </dd>
            </div>
          </dl>
          <p>
            Upload your screenshots or voice notes. PocketDokani does not
            connect to your inbox or record phone calls.
          </p>
        </section>
        <section id="seller-sign-in" className="seller-entry panel">
          <div>
            <p className="eyebrow">{judge ? "SAMPLE SHOP" : "FOR SELLERS"}</p>
            <h2>
              {judge ? "A safe place to try it." : "Already have a shop?"}
            </h2>
            <p className="muted">
              {judge
                ? "Explore sample orders and screenshots. Your session is separate from every other visitor."
                : "Sign in with your shop passcode to pick up where you left off."}
            </p>
          </div>
          {notice && (
            <p className="message success" role="status">
              {notice}
            </p>
          )}
          <div className="seller-entry-controls">
            {signInFrom === "form" && signInError}
            {!ready ? (
              <p role="status">Checking your session…</p>
            ) : (
              <form className="seller-form" onSubmit={submit}>
                {!judge && (
                  <label htmlFor="shop-passcode">
                    Shop passcode
                    <input
                      id="shop-passcode"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={256}
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
                  {busy ? "Opening…" : judge ? "Open sample shop" : "Sign in"}
                  <Icon name="arrow" />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
      <footer className="welcome-footer">
        <span>PocketDokani · Built for small sellers in Bangladesh</span>
        <a
          className="quiet-link"
          href="https://github.com/afif-fahim/pocketdokani"
        >
          View the repository <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </div>
  );
}
