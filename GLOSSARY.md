# OrderTrail

OrderTrail carries the evidence for a seller-approved order from a sales conversation to a parcel-label check.

## Language

**Order**:
A seller-reviewed set of item lines for one recipient, delivery address, parcel label and COD amount.

**Order line**:
A distinct product variant in an order, with a quantity, unit price and any line discount. Its price may come from customer agreement or an explicitly attributed seller decision.
_Avoid_: Parcel, shipment

**Multi-item order**:
An order containing more than one distinct product or variant. Multiple units of a single product variant do not by themselves make an order multi-item.

**OrderTrail reference**:
The seller's reference for an order in OrderTrail, also written in the designated reference field on its parcel label. It is distinct from any identifier assigned by a courier.
_Avoid_: Consignment ID, tracking number

**Consignment ID**:
An identifier assigned by a courier to a shipment. It does not identify the seller's order independently of that courier shipment.
_Avoid_: OrderTrail reference

**Customer agreement**:
Evidence that the customer and seller accepted the same terms for the same item. Acceptance of an earlier item or superseded proposal does not establish agreement on revised terms.
_Avoid_: Seller approval

**Seller approval**:
The seller's authorization of a particular version of the order after reviewing its terms and evidence. Approval does not itself establish that the customer agreed to every term.
_Avoid_: Customer agreement

**COD amount**:
The amount the courier is asked to collect from the customer, calculated from item charges, discounts, customer delivery charge and verified prior payments.
_Avoid_: Order total, courier payout

**Line discount**:
The total amount deducted from one order line's quantity multiplied by its unit price. It is deducted once for that line.
_Avoid_: Per-unit discount

**Bundle allocation**:
The seller's assignment of a negotiated bundle amount or overall discount across individual order lines. It records the seller's pricing decision without claiming that the customer agreed to those individual line prices.

**Item cancellation**:
Removal of an identified item line while the remaining order stays active. Removing the final item cancels the order.
_Avoid_: Whole-order cancellation

**Customer delivery charge**:
The delivery amount charged to the customer as part of the order. It is separate from the courier's cost to the seller.
_Avoid_: Courier delivery cost

**Verified prior payment**:
An advance or other direct payment confirmed through seller-side evidence. A customer's statement that payment was made is not sufficient confirmation.

**Label check**:
A comparison of the visible parcel-label fields with a seller-approved order version. It establishes no fact about sealed contents or courier booking.
_Avoid_: Parcel verification, dispatch confirmation

**Automatic label match**:
An automated label-check result indicating that all required visible fields meet the comparison rules for the approved order version. It is distinct from a seller's manual confirmation.
_Avoid_: Manually confirmed

**Assisted label review**:
A seller's inspection of the original label image alongside the approved order and any extracted readings. Any manual confirmation remains a human judgment, separate from the automatic label-check result.

**Seller checked**:
A manual completion outcome recording that the seller checked every required label field against the approved order and resolved any reading errors. It applies only to that order version and label photo, retains the separate automatic result, and cannot excuse an actual label mismatch.
_Avoid_: Automatic label match

**Trail**:
The history connecting an order's source evidence, corrections, approvals and label checks.
_Avoid_: Shipment tracking
