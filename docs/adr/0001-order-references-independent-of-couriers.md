# Keep OrderTrail references independent of courier consignments

OrderTrail assigns its own order reference, which the seller writes in the designated field on the supported parcel-label layout. Courier consignment identifiers remain separate because label checking must work before, and without, courier booking. This adds a handwritten reference to the initial workflow but gives the order and its evidence a stable identity independent of a courier integration.
