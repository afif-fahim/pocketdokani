import { useRef, useState } from "react";
import { api, json } from "./api";
import type { Order } from "./business-lists";

export type CourierBooking = {
  state:
    "in_progress" | "booking_unknown" | "not_found" | "rejected" | "booked";
  mode: "fake" | "live";
  message: string;
  can_retry: boolean;
};

type FakeScenario = "success" | "duplicate" | "timeout" | "late_success";

function isFakeScenario(value: string): value is FakeScenario {
  return ["success", "duplicate", "timeout", "late_success"].includes(value);
}

export function bookingLocksOrder(order: Order): boolean {
  return Boolean(
    order.booking &&
    ["in_progress", "booking_unknown", "not_found"].includes(
      order.booking.state,
    ),
  );
}

export default function CourierBookingPanel({
  order,
  base,
  busy,
  act,
  onChange,
  onBooking,
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
  onBooking: (booking: CourierBooking) => void;
}) {
  const [working, setWorking] = useState(false);
  const [scenario, setScenario] = useState<FakeScenario>("success");
  const requesting = useRef(false);
  const booking = order.booking;
  const mode = booking?.mode ?? order.courier_mode;
  const canBook =
    order.status === "packed" &&
    mode !== "disabled" &&
    (!booking || booking.state === "rejected" || booking.can_retry);
  const unresolved = bookingLocksOrder(order);

  if (!booking && !order.consignment_id && order.status !== "packed")
    return null;

  async function submit(reconcile: boolean) {
    if (requesting.current || busy || mode === "disabled") return;
    requesting.current = true;
    setWorking(true);
    const pending: CourierBooking = {
      state: "in_progress",
      mode,
      message: reconcile ? "Checking the courier…" : "Booking the courier…",
      can_retry: false,
    };
    onBooking(pending);
    try {
      await act(async () => {
        try {
          const result = await api<CourierBooking>(
            `${base}/orders/${encodeURIComponent(order.id)}/booking${reconcile ? "/reconcile" : ""}`,
            json(
              "POST",
              reconcile
                ? {}
                : {
                    expected_updated_at: order.updated_at,
                    ...(mode === "fake" && base === "/api/judge"
                      ? { fake_scenario: scenario }
                      : {}),
                  },
            ),
          );
          onBooking(result);
        } catch (cause) {
          onBooking({
            ...pending,
            state: "booking_unknown",
            message:
              "The booking outcome is unclear. Check the courier before trying again.",
          });
          await onChange().catch(() => {});
          throw cause;
        }
        await onChange();
      });
    } finally {
      requesting.current = false;
      setWorking(false);
    }
  }

  return (
    <section className="courier-panel stack" aria-label="Courier booking">
      <div className="button-row">
        <h3>কুরিয়ার · Courier</h3>
        {mode !== "disabled" && (
          <span className="pill">
            {mode === "fake" ? "Fake · no parcel is sent" : "Live · Steadfast"}
          </span>
        )}
      </div>
      {order.consignment_id && (
        <dl className="record-amounts">
          <div>
            <dt>Consignment ID</dt>
            <dd>
              <code>{order.consignment_id}</code>
            </dd>
          </div>
          <div>
            <dt>Tracking code</dt>
            <dd>
              {order.tracking_code ? (
                <code>{order.tracking_code}</code>
              ) : (
                "Unavailable · check merchant panel"
              )}
            </dd>
          </div>
        </dl>
      )}
      {booking?.message && <p role="status">{booking.message}</p>}
      {unresolved && (
        <p className="message">
          Check this booking before editing, packing again or changing status. A
          lost response can still mean the courier booked the parcel.
        </p>
      )}
      {mode === "disabled" && order.status === "packed" && (
        <p className="muted">
          Live courier booking is not enabled for this shop.
        </p>
      )}
      {canBook && mode === "fake" && base === "/api/judge" && (
        <label>
          Fake courier example
          <select
            value={scenario}
            disabled={busy || working}
            onChange={(event) => {
              if (isFakeScenario(event.target.value))
                setScenario(event.target.value);
            }}
          >
            <option value="success">Success</option>
            <option value="duplicate">Duplicate invoice</option>
            <option value="timeout">Timeout without booking</option>
            <option value="late_success">Timeout, then late success</option>
          </select>
        </label>
      )}
      <div className="button-row">
        {canBook && (
          <button
            className="primary"
            disabled={busy || working}
            onClick={() => void submit(false)}
          >
            {working
              ? "Booking…"
              : booking?.can_retry
                ? "Retry booking with the same invoice"
                : mode === "fake"
                  ? "Simulate booking · Fake"
                  : "Book Steadfast · কুরিয়ার বুক করুন"}
          </button>
        )}
        {unresolved && (
          <button disabled={busy || working} onClick={() => void submit(true)}>
            {working ? "Checking…" : "Check courier booking"}
          </button>
        )}
      </div>
    </section>
  );
}
