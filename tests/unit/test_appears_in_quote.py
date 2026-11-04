from pocketdokani.features.orders.drafting import appears_in_quote


def test_wrapped_chat_bubble_supports_a_single_line_value() -> None:
    assert appears_in_quote("Example Road, Dhaka", "Example Road,\nDhaka")


def test_value_keeping_its_line_break_still_matches() -> None:
    assert appears_in_quote("Example Road,\nDhaka", "Example Road,\nDhaka")


def test_different_words_do_not_match() -> None:
    assert not appears_in_quote("Example Road, Khulna", "Example Road,\nDhaka")
