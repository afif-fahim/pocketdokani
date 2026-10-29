# PocketDokani

PocketDokani is a phone copilot for small Messenger sellers. It drafts orders from sales conversations, checks packed parcels, books the courier and answers business questions in Bangla. The seller confirms every order, amount and change.

## Language

**Order**: A seller-confirmed set of order lines for one recipient, delivery address, parcel and COD amount.

**Draft order**: An order the seller has not confirmed yet. Model-extracted values live only in drafts until the seller confirms them. _Avoid_: Pending order

**Order confirmation**: The seller's authorization of the order's current lines, amounts and recipient details. Editing a confirmed order returns it to a draft. _Avoid_: Customer agreement

**Order line**: A distinct product variant in an order, with a quantity, unit price and line discount. _Avoid_: Parcel, shipment

**Multi-item order**: An order containing more than one distinct product or variant. Multiple units of one variant do not by themselves make an order multi-item.

**Order reference**: PocketDokani's identifier for an order, such as `PD-0012`. The seller writes it on the parcel label, and it is sent to the courier as the invoice. It is distinct from any identifier the courier assigns. _Avoid_: Consignment ID, tracking number

**Consignment ID**: An identifier assigned by a courier to a booked shipment. _Avoid_: Order reference

**COD amount**: The amount the courier collects from the customer: line totals plus customer delivery charge, minus verified prior payment. _Avoid_: Order total, courier payout

**Line discount**: The total amount deducted from one order line's quantity multiplied by its unit price. It is deducted once for that line. _Avoid_: Per-unit discount

**Bundle allocation**: The seller's assignment of a bundle price or overall discount across individual order lines.

**Customer delivery charge**: The delivery amount charged to the customer as part of the order. It is separate from the courier's fee to the seller. _Avoid_: Courier delivery cost

**Verified prior payment**: An advance or other direct payment the seller has confirmed. A customer's statement that they paid is not enough.

**Pack check**: A photo-based comparison of a packed parcel's visible label, and any visible bag, with the confirmed order. Its verdict is pass, fail or unsure. It establishes nothing about sealed contents. _Avoid_: Parcel verification

**Seller override**: The seller's decision to proceed after an unsure pack check. It is recorded and shown separately from a pass, and is not allowed after a fail. _Avoid_: Automatic pass

**Courier booking**: Creating a consignment with the courier from a packed order, using the order reference as the invoice.

**Assistant**: The voice and chat helper that answers questions from stored business records and proposes changes.

**Proposal card**: A change suggested by the assistant, such as a draft order or courier booking. Nothing changes until the seller confirms the card. _Avoid_: Automatic action
