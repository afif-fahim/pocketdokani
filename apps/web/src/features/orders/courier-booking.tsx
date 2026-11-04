import { useRef, useState } from "react";
import { api, ApiError, json } from "@/lib/api";
import type { Order } from "@/features/orders/business-lists";
import { StatusBadge } from "@/components/ui";
import { Stamp } from "@/components/khata";
import { money } from "@/lib/format";
import {
  pendingActionKey,
  readPendingAction,
  writePendingAction,
} from "@/lib/pending-actions";

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

export function pendingClientBooking(
  base: string,
  order: Order,
): CourierBooking | null {
  const saved = readPendingAction<{
    orderVersion: string;
    booking: CourierBooking;
  }>(pendingActionKey("booking", base, order.id));
  // A newer server version means the durable claim has been observed. Until
  // then even an old not-found/rejected record must not enable another create.
  return saved &&
    saved.orderVersion === order.updated_at &&
    !order.consignment_id &&
    order.booking?.state !== "booked"
    ? saved.booking
    : null;
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
  onBooking: (booking: CourierBooking | null) => void;
}) {
  const [working, setWorking] = useState(false);
  const [scenario, setScenario] = useState<FakeScenario>("success");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const requesting = useRef(false);
  const booking = order.booking;
  const mode = booking?.mode ?? order.courier_mode;
  const importedConsignment = !booking && Boolean(order.consignment_id);
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
    setRecoveryNotice("");
    const pending: CourierBooking = {
      state: "in_progress",
      mode,
      message: reconcile ? "Checking the courier…" : "Booking the courier…",
      can_retry: false,
    };
    const pendingKey = pendingActionKey("booking", base, order.id);
    writePendingAction(pendingKey, {
      orderVersion: order.updated_at,
      booking: pending,
    });
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
          writePendingAction(pendingKey, null);
          onBooking(result);
        } catch (cause) {
          const unknown: CourierBooking = {
            ...pending,
            state: "booking_unknown",
            message:
              "The booking outcome is unclear. Check the courier before trying again.",
          };
          writePendingAction(pendingKey, {
            orderVersion: order.updated_at,
            booking: unknown,
          });
          onBooking(unknown);
          if (cause instanceof ApiError && cause.status === 409) {
            // A request lost before the durable claim has no booking for the
            // reconcile endpoint. Read the shop after that locked check before
            // offering another explicit create with the same stable invoice.
            const records = await api<Order[]>(`${base}/orders`);
            const current = records.find((record) => record.id === order.id);
            if (current) {
              writePendingAction(pendingKey, null);
              onBooking(current.booking);
              await onChange();
              if (reconcile && !current.booking && !current.consignment_id) {
                setRecoveryNotice(
                  "No booking is recorded after checking the order. Review the recipient and COD before explicitly trying the same invoice again.",
                );
                return;
              }
            }
          }
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
    <section className="courier-panel waybill" aria-label="Courier booking">
      <div className="waybill-head">
        <h3>কুরিয়ার · Courier</h3>
        {mode === "fake" && !importedConsignment && (
          <Stamp tone="neutral">Simulated</Stamp>
        )}
      </div>
      {(importedConsignment || mode !== "disabled") && (
        <StatusBadge
          status={importedConsignment ? "Imported consignment" : mode}
        />
      )}
      {order.consignment_id && (
        <p className="message success" role="status">
          {mode === "fake"
            ? "Fake booking complete · no real parcel is sent."
            : "Courier booking complete."}{" "}
          Invoice: {order.reference}.
        </p>
      )}
      <dl className="ledger waybill-ledger">
        <div className="ledger-row">
          <dt>Invoice</dt>
          <dd>{order.reference}</dd>
        </div>
        {order.consignment_id && (
          <>
            <div className="ledger-row">
              <dt>Consignment ID</dt>
              <dd>{order.consignment_id}</dd>
            </div>
            <div className="ledger-row">
              <dt>Tracking code</dt>
              <dd>
                {order.tracking_code ?? "Unavailable · check merchant panel"}
              </dd>
            </div>
          </>
        )}
        <div className="ledger-total">
          <dt>COD</dt>
          <dd>{money(order.cod_amount)}</dd>
        </div>
      </dl>
      {booking?.message && <p role="status">{booking.message}</p>}
      {recoveryNotice && (
        <p className="message warning" role="status">
          {recoveryNotice}
        </p>
      )}
      {unresolved && (
        <p className="message warning">
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
        <details>
          <summary>Advanced demo options</summary>
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
        </details>
      )}
      {canBook && (
        <>
          <p>
            Confirm booking for <strong>{order.reference}</strong>:{" "}
            {order.customer_name || "recipient not recorded"}, COD{" "}
            {order.cod_amount} BDT.{" "}
            {mode === "fake"
              ? "This is a simulation in your isolated sample shop."
              : "This creates a real courier consignment."}
          </p>
          <p>
            {order.phone || "Phone not recorded"} ·{" "}
            {order.address || "Address not recorded"}
          </p>
        </>
      )}
      <div className="button-row waybill-actions">
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
