# Use line pricing for bundle negotiations

Every active order line requires seller-confirmed quantity, unit price and line discount before order confirmation. When a conversation establishes only a bundle amount or overall discount, the seller allocates it across the lines. This adds a review step but keeps one money calculation: line totals, plus customer delivery charge, minus verified prior payment, each applied once to the whole order.

Changing the basket (adding or removing an item, or changing its variant or quantity) returns the order to a draft, and the seller reviews the line prices and discounts again before confirming. Discounts and bundle allocations never scale or redistribute silently.
