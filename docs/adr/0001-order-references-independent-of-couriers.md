# Keep order references independent of courier consignments

PocketDokani assigns its own order reference (for example `PD-0012`). The seller writes it on the parcel label, and courier booking sends it as the courier invoice. Courier consignment identifiers remain separate because the pack check must work before, and without, courier booking. This adds a handwritten reference to the packing workflow, but gives the order a stable identity independent of any courier. The courier's unique-invoice rule also prevents a second booking for the same order.
