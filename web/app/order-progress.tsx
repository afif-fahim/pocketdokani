import type { Order } from "./business-lists";

export default function OrderProgress({
  order,
}: {
  order: Pick<Order, "status" | "booking" | "consignment_id">;
}) {
  if (["cancelled", "returned"].includes(order.status)) return null;
  const booked = Boolean(
    order.consignment_id ||
    order.booking?.state === "booked" ||
    ["booked", "delivered"].includes(order.status),
  );
  const packed = booked || order.status === "packed";
  const confirmed = packed || order.status === "confirmed";
  const current = !confirmed ? 0 : !packed ? 1 : 2;
  return (
    <ol className="order-progress" aria-label="Order progress">
      {["Review order", "Check parcel", "Book courier"].map((label, index) => (
        <li
          key={label}
          aria-current={!booked && index === current ? "step" : undefined}
          data-complete={index < current || booked}
        >
          <span aria-hidden="true">
            {index < current || booked ? "✓" : index + 1}
          </span>{" "}
          {label}
        </li>
      ))}
    </ol>
  );
}
