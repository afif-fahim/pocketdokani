import { useState } from "react";
import { api, json } from "./api";
import PackCheckPanel, { type PackCheckSummary } from "./pack-check";
import CourierBookingPanel, {
  bookingLocksOrder,
  type CourierBooking,
} from "./courier-booking";
import StatusChangeWarning from "./status-change-warning";

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

const currency = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
});
function money(value: string) {
  return currency.format(Number(value));
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusActions({
  order,
  base,
  busy,
  act,
  onChange,
}: {
  order: Order;
  base: string;
  busy: boolean;
  act: (action: () => Promise<void>) => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const options =
    order.status === "booked"
      ? ["delivered", "returned", "cancelled"]
      : ["draft", "confirmed", "packed"].includes(order.status)
        ? ["cancelled"]
        : [];
  if (!options.length) return null;
  return (
    <div className="stack">
      {target ? (
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
                  await api(
                    `${base}/orders/${encodeURIComponent(order.id)}/status`,
                    json("POST", {
                      status: target,
                      expected_status: order.status,
                      expected_updated_at: order.updated_at,
                    }),
                  );
                  setTarget("");
                  await onChange();
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
  const [booking, setBooking] = useState<CourierBooking | null>(null);
  const current = booking ? { ...order, booking } : order;
  const locked = bookingLocksOrder(current);
  return (
    <>
      <CourierBookingPanel
        order={current}
        base={base}
        busy={busy}
        act={act}
        onChange={onChange}
        onBooking={setBooking}
      />
      {!locked && (
        <>
          <PackCheckPanel
            order={current}
            base={base}
            busy={busy}
            act={act}
            onChange={onChange}
          />
          <StatusActions
            order={current}
            base={base}
            busy={busy}
            act={act}
            onChange={onChange}
          />
          {order.source_workspace_id && (
            <button
              disabled={busy}
              onClick={() => onOpenWorkspace(order.source_workspace_id!)}
            >
              Open draft and sources ↗
            </button>
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
}: {
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
  if (view === "stock") {
    return (
      <section
        className="panel business-section"
        aria-labelledby="stock-heading"
      >
        <div className="section-heading">
          <h2 id="stock-heading">Stock</h2>
          <span className="pill">{stock.length} SKUs</span>
        </div>
        <p className="muted">
          Only received lots with stock are available to sell.
        </p>
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
                  <p className="muted">Photo not recorded</p>
                )}
                <h3>{sku.product_name}</h3>
                <p>
                  {sku.variant} · {sku.lot}
                </p>
                <code>{sku.sku}</code>
                <span
                  className={`pill ${sku.available_qty > 0 ? "eligible" : "ineligible"}`}
                >
                  {!sku.lot_received
                    ? "In transit · unavailable"
                    : sku.stock_qty === 0
                      ? "Out of stock"
                      : `${sku.available_qty} available`}
                </span>
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
              </li>
            ))}
          </ul>
        ) : (
          <p>No stock loaded yet.</p>
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
        <h2 id="orders-heading">Orders</h2>
        <span className="pill">{orders.length} orders</span>
      </div>
      {orders.length ? (
        <ul className="order-list">
          {orders.map((order) => (
            <li key={order.id}>
              <details className="order-card" id={`order-${order.id}`}>
                <summary>
                  <strong className="reference">{order.reference}</strong>
                  <span className="pill">{order.status}</span>
                  <span>
                    {order.customer_name || "Name not recorded"} ·{" "}
                    {date(order.created_at)}
                  </span>
                  <span>
                    {order.lines.length}{" "}
                    {order.lines.length === 1 ? "line" : "lines"} ·{" "}
                    {order.status === "draft" && order.source_workspace_id
                      ? "Last confirmed COD"
                      : "COD"}{" "}
                    <strong>{money(order.cod_amount)}</strong>
                  </span>
                </summary>
                <div className="order-body">
                  {order.status === "draft" && order.source_workspace_id && (
                    <p className="message">
                      This order has edits awaiting confirmation. The details
                      below are from its last confirmation; open the draft to
                      review current values.
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
                        <code>{line.sku}</code>
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
                  <p className="muted">{order.note}</p>
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
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p>No orders loaded yet.</p>
      )}
      <details>
        <summary>Payouts · {payouts.length} recorded</summary>
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
