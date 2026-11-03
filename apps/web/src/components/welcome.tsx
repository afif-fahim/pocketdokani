import { useState, type FormEvent } from "react";
import { Brand, Icon } from "@/components/app-shell";

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
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSignIn(passcode);
  }
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
          <p className="eyebrow">A LITTLE HELP FOR YOUR SMALL BUSINESS</p>
          <h1>
            Your shop.
            <br />
            One less thing
            <br />
            <span>to juggle.</span>
          </h1>
          <p className="welcome-promise">
            A Bangla AI copilot for online sellers,
            <br className="desktop-break" /> from chat to courier.
          </p>
          <p className="welcome-detail">
            Sell on Instagram, TikTok, WhatsApp or Messenger, or take orders by
            phone. Bring screenshots, voice notes or the details yourself. You
            stay in charge of every decision.
          </p>
          <div className="welcome-actions">
            {judge ? (
              <button
                className="primary"
                disabled={!ready || busy}
                onClick={() => onSignIn("")}
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
            <span>No sign-up. Just a sample shop.</span>
          </div>
          {error && (
            <p className="message error" role="alert">
              {error}{" "}
              {ready &&
                !busy &&
                "Use the start or sign-in button to reconnect."}
            </p>
          )}
          {!ready && (
            <p role="status" className="fine-print">
              Checking your saved session. This check stops after 20 seconds if
              the service cannot be reached.
            </p>
          )}
          <div className="welcome-assurance">
            <span className="status-dot" />
            AI prepares. You approve.
          </div>
        </section>
        <section
          className="welcome-preview"
          aria-label="What PocketDokani helps you do"
        >
          <div className="preview-topline">
            <span className="eyebrow">FROM CHAT TO COURIER</span>
            <span className="pill">A clear next step</span>
          </div>
          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-icon">
                <Icon name="conversations" />
              </span>
              <div>
                <h2>Start with a conversation</h2>
                <p>
                  Upload screenshots or create a draft. Review the details
                  before confirming.
                </p>
              </div>
              <span className="step-count">01</span>
            </li>
            <li>
              <span className="welcome-step-icon">
                <Icon name="bag" />
              </span>
              <div>
                <h2>Get the parcel ready</h2>
                <p>
                  Check the visible label and bag, then review your courier
                  booking.
                </p>
              </div>
              <span className="step-count">02</span>
            </li>
            <li>
              <span className="welcome-step-icon">
                <Icon name="assistant" />
              </span>
              <div>
                <h2>Ask your shop a question</h2>
                <p lang="bn">কতগুলো অর্ডার পাঠানো বাকি?</p>
                <p>Speak or type. See the records behind the answer.</p>
              </div>
              <span className="step-count">03</span>
            </li>
          </ol>
          <div className="sample-note">
            <span className="status-dot" />
            <p>
              {judge
                ? "Your demo uses synthetic shop records and real AI analysis. Courier bookings are simulated."
                : "Try it with sample records, then bring it to your own shop."}
            </p>
          </div>
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
              <button className={judge ? "primary" : undefined} disabled={busy}>
                {busy ? "Opening…" : judge ? "Open sample shop" : "Sign in"}
                <Icon name="arrow" />
              </button>
            </form>
          )}
        </section>
      </main>
      <footer className="welcome-footer">
        <span>PocketDokani · Built for small sellers in Bangladesh</span>
        <span>বাংলায় বলুন. Get on with your day.</span>
      </footer>
    </div>
  );
}
