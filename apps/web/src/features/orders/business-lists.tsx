import { useEffect, useState } from "react";
import { api, ApiError, ApiOutcomeUnknownError, json } from "@/lib/api";
import PackCheckPanel, {
  hasPendingPackAction,
  type PackCheckSummary,
} from "@/features/orders/pack-check";
import CourierBookingPanel, {
  bookingLocksOrder,
  pendingClientBooking,
  type CourierBooking,
} from "@/features/orders/courier-booking";
import StatusChangeWarning from "@/features/orders/status-change-warning";
import OrderProgress from "@/features/orders/order-progress";
import { money } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/ui";
import {
  hasPendingAction,
  pendingActionKey,
  writePendingAction,
} from "@/lib/pending-actions";

export type StockItem = {
  sku: string;
  product_name: string;
  variant: string;
  lot: string;
  lot_received: boolean;
  stock_qty: number;
  available_qty: number;
  unit_cost: string;
  list_price: string;
  photo_url: string | null;
};

export type Order = {
  id: string;
  reference: string;
  label_reference: string;
  status: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  customer_delivery_charge: string;
  verified_prior_payment: string;
  cod_amount: string;
  consignment_id: string | null;
  tracking_code: string | null;
  booking: CourierBooking | null;
  courier_mode: "fake" | "live" | "disabled";
  source_workspace_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
  pack_check: PackCheckSummary | null;
  lines: {
    line_number: number;
    sku: string;
    product_name: string;
    variant: string;
    quantity: number;
    unit_price: string;
    line_discount: string;
    line_total: string;
  }[];
};

export type Payout = {
  statement: string;
  paid_at: string;
  amount: string;
  order_references: string[];
};

function date(value: string) {
  return new Date(value).toLocaleDateString("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pendingStatusKey(base: string, orderId: string): string {
  return pendingActionKey("status", base, orderId);
}

function StatusActions({
  order,
  base,
  busy,
  act,
  onChange,
  onPendingChange,
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
}) {
  const [target, setTarget] = useState("");
  const pendingKey = pendingStatusKey(base, order.id);
  const [uncertain, setUncertain] = useState(() =>
    hasPendingAction(pendingKey),
  );
  const [reviewedStatus, setReviewedStatus] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  function remember(pending: boolean) {
    writePendingAction(pendingKey, pending ? order.updated_at : null);
    setUncertain(pending);
    onPendingChange(pending);
  }
  async function refreshOrder() {
    setRefreshRequired(true);
    onPendingChange(true);
    try {
      await onChange();
      setRefreshRequired(false);
      onPendingChange(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) throw cause;
      throw new Error(
        "The order status is known, but shop data could not be refreshed. Reload shop data before making another change.",
      );
    }
  }
  async function checkStatus() {
    const records = await api<Order[]>(`${base}/orders`);
    const current = records.find((record) => record.id === order.id);
    if (!current)
      throw new Error(
        "This order is no longer in this shop. Reload shop data before continuing.",
      );
    remember(false);
    setTarget("");
    setReviewedStatus(current.status);
    await refreshOrder();
  }
  const currentStatus = reviewedStatus || order.status;
  const options =
    currentStatus === "booked"
      ? ["delivered", "returned", "cancelled"]
      : ["draft", "confirmed", "packed"].includes(currentStatus)
        ? ["cancelled"]
        : [];
  if (!options.length && !uncertain && !refreshRequired) return null;
  return (
    <div className="stack">
      {refreshRequired ? (
        <div className="message" role="status">
          <p>
            The order status is known. Reload shop data before making another
            change.
          </p>
          <button disabled={busy} onClick={() => void act(refreshOrder)}>
            Reload shop data
          </button>
        </div>
      ) : uncertain ? (
        <div className="message" role="status">
          <p>
            The last status change may already be saved. Check the current order
            before making another change.
          </p>
          <button disabled={busy} onClick={() => void act(checkStatus)}>
            Check order status
          </button>
        </div>
      ) : target ? (
        <>
          <p>
            Change {order.reference} from {order.status} to {target}?
          </p>
          <StatusChangeWarning
            previousStatus={order.status}
            nextStatus={target}
          />
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  remember(true);
                  try {
                    await api(
                      `${base}/orders/${encodeURIComponent(order.id)}/status`,
                      json("POST", {
                        status: target,
                        expected_status: order.status,
                        expected_updated_at: order.updated_at,
                      }),
                    );
                  } catch (cause) {
                    remember(cause instanceof ApiOutcomeUnknownError);
                    throw cause;
                  }
                  remember(false);
                  setReviewedStatus(target);
                  setTarget("");
                  await refreshOrder();
                })
              }
            >
              Confirm status change
            </button>
            <button disabled={busy} onClick={() => setTarget("")}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="button-row">
          {options.map((status) => (
            <button
              key={status}
              disabled={busy}
              onClick={() => setTarget(status)}
            >
              Mark {status}
            </button>
          ))}
        </div>
      )}
      {reviewedStatus && (
        <p role="status">
          Current server status: {reviewedStatus}. Review the order before
          confirming another change.
        </p>
      )}
    </div>
  );
}

function OrderActions({
  order,
  base,
  busy,
  act,
  onChange,
  onOpenWorkspace,
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
  onOpenWorkspace: (id: string) => void;
}) {
  const [booking, setBooking] = useState<CourierBooking | null>(() =>
    pendingClientBooking(base, order),
  );
  const [statusPending, setStatusPending] = useState(() =>
    hasPendingAction(pendingStatusKey(base, order.id)),
  );
  const [packPending, setPackPending] = useState(() =>
    hasPendingPackAction(base, order.id),
  );
  const current = booking ? { ...order, booking } : order;
  const locked = bookingLocksOrder(current);
  return (
    <>
      {order.status === "draft" && !order.source_workspace_id ? (
        <p className="message">
          This draft has no editable conversation. View its recorded details
          below, or choose New order to create a draft you can review and
          confirm.
        </p>
      ) : (
        <OrderProgress order={current} />
      )}
      {statusPending && !locked ? (
        <p className="message">
          Resolve the order update below before packing, booking or editing this
          order.
        </p>
      ) : packPending ? (
        <p className="message">
          Resolve the pending pack action below before booking or editing this
          order.
        </p>
      ) : (
        <CourierBookingPanel
          order={current}
          base={base}
          busy={busy}
          act={act}
          onChange={onChange}
          onBooking={setBooking}
        />
      )}
      {!locked && (
        <>
          {!statusPending && (
            <PackCheckPanel
              initialOpen={order.status === "confirmed" || packPending}
              order={current}
              base={base}
              busy={busy}
              act={act}
              onChange={onChange}
              onPendingChange={setPackPending}
            />
          )}
          {!packPending && (
            <details open={statusPending}>
              <summary>Order changes and status</summary>
              <StatusActions
                order={current}
                base={base}
                busy={busy}
                act={act}
                onChange={onChange}
                onPendingChange={setStatusPending}
              />
              {!statusPending && order.source_workspace_id && (
                <button
                  disabled={busy}
                  onClick={() => onOpenWorkspace(order.source_workspace_id!)}
                >
                  Edit order and review sources ↗
                </button>
              )}
            </details>
          )}
        </>
      )}
    </>
  );
}

export default function BusinessLists({
  view,
  orders,
  stock,
  payouts,
  onOpenWorkspace,
  base,
  busy,
  act,
  onChange,
  selectedReference,
  onSelectOrder,
}: {
  selectedReference?: string | null;
  onSelectOrder?: (reference: string) => void;
  view: "orders" | "stock";
  orders: Order[];
  stock: StockItem[];
  payouts: Payout[];
  onOpenWorkspace: (id: string) => void;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const [openedReference, setOpenedReference] = useState<string | null>(null);
  const selected = selectedReference ?? openedReference;
  useEffect(() => {
    if (!selectedReference || view !== "orders") return;
    const task = document.getElementById(`task-${selectedReference}`);
    task?.focus({ preventScroll: true });
    task?.scrollIntoView({ block: "nearest" });
  }, [selectedReference, view]);

  function openOrder(order: Order) {
    if (order.status === "draft" && order.source_workspace_id) {
      onOpenWorkspace(order.source_workspace_id);
      return;
    }
    setOpenedReference(order.reference);
    onSelectOrder?.(order.reference);
    requestAnimationFrame(() => {
      const task = document.getElementById(`task-${order.reference}`);
      task?.focus({ preventScroll: true });
      task?.scrollIntoView({ block: "nearest" });
    });
  }

  function renderOrder(order: Order) {
    const expanded = selected === order.reference;
    const next = bookingLocksOrder({
      ...order,
      booking: pendingClientBooking(base, order) ?? order.booking,
    })
      ? "Check booking"
      : order.status === "draft" && order.source_workspace_id
        ? "Review order"
        : order.status === "confirmed"
          ? "Check parcel"
          : order.status === "packed"
            ? "Book courier"
            : "View order";
    return (
      <li key={order.id}>
        <article
          className="order-card"
          id={`order-${order.id}`}
          data-open={expanded || undefined}
        >
          <div className="order-overview">
            <div className="order-identity">
              <div className="button-row">
                <strong className="order-reference">{order.reference}</strong>
                <StatusBadge status={order.status} />
              </div>
              <h3>{order.customer_name || "Name not recorded"}</h3>
              <p className="order-product-summary">
                {order.lines
                  .map(
                    (line) =>
                      `${line.quantity} × ${line.product_name} · ${line.variant}`,
                  )
                  .join("; ") || "Items need review"}
              </p>
            </div>
            <div className="order-card-actions">
              <div className="order-card-meta">
                <div className="order-cod">
                  <span className="eyebrow">
                    {order.status === "draft" && order.source_workspace_id
                      ? "Last confirmed COD"
                      : "COD amount"}
                  </span>
                  <strong>{money(order.cod_amount)}</strong>
                </div>
                <small className="muted">{date(order.created_at)}</small>
              </div>
              <div className="order-next-action button-row">
                <button
                  className="primary"
                  disabled={busy}
                  aria-expanded={expanded}
                  aria-controls={
                    expanded ? `task-${order.reference}` : undefined
                  }
                  onClick={() => openOrder(order)}
                >
                  {next} <span aria-hidden="true">→</span>
                </button>
                {order.pack_check && (
                  <span
                    className={`pack-verdict pack-${order.pack_check.verdict}`}
                  >
                    {order.pack_check.override_by
                      ? "Seller override · unsure"
                      : `Pack ${order.pack_check.verdict}`}
                  </span>
                )}
              </div>
            </div>
          </div>
          {expanded && (
            <div
              className="order-task stack"
              id={`task-${order.reference}`}
              tabIndex={-1}
            >
              <h3>
                {order.reference} · {next}
              </h3>
              <OrderActions
                key={`${order.updated_at}-${order.booking?.state ?? ""}`}
                order={order}
                base={base}
                busy={busy}
                act={act}
                onChange={onChange}
                onOpenWorkspace={onOpenWorkspace}
              />
            </div>
          )}
          <details
            open={
              expanded &&
              ((order.status === "draft" && !order.source_workspace_id) ||
                ["booked", "delivered", "returned", "cancelled"].includes(
                  order.status,
                ))
            }
          >
            <summary>Recipient, items and amounts</summary>
            <div className="order-body">
              {order.status === "draft" && order.source_workspace_id && (
                <p className="message">
                  This order has edits awaiting confirmation. These are the last
                  confirmed details; open the draft to review current values.
                </p>
              )}
              <p>{order.phone || "Phone not recorded"}</p>
              <p>{order.address || "Address not recorded"}</p>
              <p>
                Label order number: <code>{order.label_reference}</code>
              </p>
              <ul className="order-lines">
                {order.lines.map((line) => (
                  <li key={line.line_number}>
                    <h3>
                      {line.product_name} · {line.variant}
                    </h3>
                    <small className="muted">SKU · {line.sku}</small>
                    <p>
                      {line.quantity} × {money(line.unit_price)} −{" "}
                      {money(line.line_discount)} line discount
                    </p>
                    <strong>{money(line.line_total)}</strong>
                  </li>
                ))}
              </ul>
              <dl className="record-amounts">
                <div>
                  <dt>Customer delivery charge</dt>
                  <dd>{money(order.customer_delivery_charge)}</dd>
                </div>
                <div>
                  <dt>Verified prior payment</dt>
                  <dd>{money(order.verified_prior_payment)}</dd>
                </div>
                <div>
                  <dt>COD amount</dt>
                  <dd>
                    <strong>{money(order.cod_amount)}</strong>
                  </dd>
                </div>
              </dl>
              {order.note && (
                <details>
                  <summary>Order notes</summary>
                  <p>{order.note}</p>
                </details>
              )}
            </div>
          </details>
        </article>
      </li>
    );
  }
  const activeOrders = orders.filter(
    (order) => !["delivered", "returned", "cancelled"].includes(order.status),
  );
  const historyOrders = orders.filter((order) =>
    ["delivered", "returned", "cancelled"].includes(order.status),
  );

  if (view === "stock") {
    return (
      <section
        className="panel business-section"
        aria-labelledby="stock-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="stock-heading">Products &amp; variants</h2>
            <p className="muted">
              Only received lots with stock are available to sell.
            </p>
          </div>
          <span className="pill">{stock.length} variants</span>
        </div>
        {stock.length ? (
          <ul className="stock-grid">
            {stock.map((sku) => (
              <li className="stock-card" key={sku.sku} id={`sku-${sku.sku}`}>
                {sku.photo_url ? (
                  <img
                    className="product-photo"
                    src={sku.photo_url}
                    alt={`${sku.product_name}, ${sku.variant}`}
                    loading="lazy"
                  />
                ) : (
                  <p className="product-photo stock-photo-placeholder">
                    Photo not recorded
                  </p>
                )}
                <div className="stock-card-heading">
                  <div>
                    <h3>{sku.product_name}</h3>
                    <p className="muted">{sku.variant}</p>
                  </div>
                  <span
                    className={`pill ${sku.available_qty > 0 ? "eligible" : "ineligible"}`}
                  >
                    {!sku.lot_received
                      ? "In transit · unavailable"
                      : sku.stock_qty === 0
                        ? "Out of stock"
                        : `${sku.available_qty} available`}
                  </span>
                </div>
                <dl className="record-amounts">
                  <div>
                    <dt>Remaining quantity</dt>
                    <dd>{sku.stock_qty}</dd>
                  </div>
                  <div>
                    <dt>Unit cost</dt>
                    <dd>{money(sku.unit_cost)}</dd>
                  </div>
                  <div>
                    <dt>List price</dt>
                    <dd>{money(sku.list_price)}</dd>
                  </div>
                </dl>
                <details>
                  <summary>SKU and lot details</summary>
                  <p>
                    <code>{sku.sku}</code> · {sku.lot}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Your stock will appear here">
            Review and import your product records to see photos, prices and
            available quantities.
          </EmptyState>
        )}
      </section>
    );
  }
  return (
    <section
      className="panel business-section"
      aria-labelledby="orders-heading"
    >
      <div className="section-heading">
        <h2 id="orders-heading">All orders</h2>
        <span className="pill">{orders.length} orders</span>
      </div>
      {activeOrders.length ? (
        <ul className="order-list">{activeOrders.map(renderOrder)}</ul>
      ) : (
        <EmptyState title="No active orders">
          Choose New order to review screenshots or enter a manual draft.
        </EmptyState>
      )}
      {historyOrders.length > 0 && (
        <details
          className="order-disclosure"
          open={historyOrders.some((order) => order.reference === selected)}
        >
          <summary>
            Completed and closed orders · {historyOrders.length}
          </summary>
          <ul className="order-list">{historyOrders.map(renderOrder)}</ul>
        </details>
      )}
      <details className="order-disclosure">
        <summary>Payouts · {payouts.length} recorded</summary>
        {payouts.length === 0 && (
          <p className="muted">
            No payouts recorded yet. Only recorded payments appear here.
          </p>
        )}
        <ul className="order-lines">
          {payouts.map((payout) => (
            <li key={payout.statement} id={`payout-${payout.statement}`}>
              <strong>
                {payout.statement} · {money(payout.amount)}
              </strong>
              <p>{date(payout.paid_at)}</p>
              <p>
                {payout.order_references.join(", ") ||
                  "No linked orders recorded"}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
