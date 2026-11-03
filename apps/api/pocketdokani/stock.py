"""Available received stock after unresolved courier booking holds."""


def available_quantity(stock_qty: int, *, lot_received: bool, held_qty: int) -> int:
    return max(0, stock_qty - held_qty) if lot_received else 0
