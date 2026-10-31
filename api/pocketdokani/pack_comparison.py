"""Compare a blind label transcription with seller-confirmed values in code."""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pocketdokani.records import Order

NAME_THRESHOLD = 0.82
DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).translate(DIGITS).casefold()
    return " ".join(
        "".join(
            char if unicodedata.category(char)[0] in "LMN" else " " for char in value
        ).split()
    )


def name_similarity(written: str, expected: str) -> float:
    return SequenceMatcher(
        None,
        " ".join(sorted(normalized(written).split())),
        " ".join(sorted(normalized(expected).split())),
    ).ratio()


def phone_digits(value: str) -> str:
    return re.sub(r"[\s()+-]", "", value.translate(DIGITS))


def written_amount(value: str) -> Decimal | None:
    value = value.translate(DIGITS).strip()
    value = re.sub(r"(?i)^(?:bdt|tk\.?|৳|টাকা)\s*", "", value)
    value = re.sub(r"(?i)\s*(?:bdt|tk\.?|৳|টাকা)$", "", value)
    if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?", value):
        return None
    try:
        return Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None


def address_result(written: str, expected: str) -> tuple[str, str]:
    # Address spelling/transliteration is deliberately conservative. Without a
    # confirmed area field, require all stored locality words rather than guess.
    number_pattern = r"[0-9]+(?:[/\-][0-9]+)*[a-z]?"

    def labelled_numbers(value: str) -> dict[str, str]:
        aliases = {
            "house": "house",
            "বাসা": "house",
            "বাড়ি": "house",
            "road": "road",
            "rd": "road",
            "রোড": "road",
            "রাস্তা": "road",
            "flat": "flat",
            "ফ্ল্যাট": "flat",
            "block": "block",
            "ব্লক": "block",
        }
        pattern = rf"({'|'.join(aliases)})\s*(?:(?:no\.?|number|নং|নম্বর)\s*)?[#: -]*({number_pattern})"
        return {
            aliases[label]: number
            for label, number in re.findall(pattern, value.translate(DIGITS).casefold())
        }

    actual_labels, expected_labels = (
        labelled_numbers(written),
        labelled_numbers(expected),
    )
    if any(
        actual_labels[key] != expected_labels[key]
        for key in actual_labels.keys() & expected_labels.keys()
    ):
        return (
            "fail",
            "The number in a house, road, flat or block field conflicts with the order. Fix and reshoot.",
        )
    actual_numbers = set(
        re.findall(number_pattern, written.translate(DIGITS).casefold())
    )
    expected_numbers = set(
        re.findall(number_pattern, expected.translate(DIGITS).casefold())
    )
    if actual_numbers - expected_numbers:
        return (
            "fail",
            "Address contains a conflicting house, road or other number. Fix and reshoot.",
        )
    if actual_labels != expected_labels:
        return (
            "unsure",
            "A house, road, flat or block number heading is missing or different. Show the complete address and reshoot.",
        )
    if expected_numbers - actual_numbers:
        return (
            "unsure",
            "An address number is missing. Show the full address and reshoot.",
        )
    if re.findall(number_pattern, written.translate(DIGITS).casefold()) != re.findall(
        number_pattern, expected.translate(DIGITS).casefold()
    ):
        return (
            "unsure",
            "Address number positions could not be matched. Show each house/road heading and reshoot.",
        )
    generic = {
        "house",
        "road",
        "rd",
        "flat",
        "block",
        "district",
        "area",
        "no",
        "number",
        "bangladesh",
        "bd",
        "বাড়ি",
        "বাসা",
        "রোড",
        "রাস্তা",
        "জেলা",
        "নং",
        "নম্বর",
    }

    def locality_words(value: str) -> set[str]:
        return {
            word
            for word in re.sub(r"[0-9]+", " ", normalized(value)).split()
            if word not in generic
        }

    expected_words, actual_words = locality_words(expected), locality_words(written)
    if expected_words and expected_words == actual_words:
        return "pass", "Stored district/area words and address numbers match."
    return (
        "unsure",
        "District/area spelling could not be matched. Show the complete address and reshoot.",
    )


def compare_label(
    reading: dict[str, object], order: Order
) -> tuple[str, list[dict[str, object]]]:
    expected = {
        "order_reference": order.reference,
        "phone": order.phone,
        "cod_amount": str(order.cod_amount),
        "customer_name": order.customer_name,
        "address": order.address,
    }
    raw_fields = reading.get("fields")
    fields: dict[str, tuple[str | None, bool]] = {}
    duplicates: set[str] = set()
    if isinstance(raw_fields, list):
        for item in raw_fields:
            if not isinstance(item, dict) or item.get("field") not in expected:
                continue
            key = str(item["field"])
            if key in fields:
                duplicates.add(key)
            value = item.get("written")
            # Duplicate readings cannot establish a field match.
            fields[key] = (
                (value[:2000] if isinstance(value, str) else None),
                item.get("legible") is True and key not in duplicates,
            )
    swapped: set[str] = set()
    for key, (value, field_legible) in fields.items():
        if (
            key != "order_reference"
            and field_legible
            and value
            and (
                normalized(order.reference) in normalized(value)
                or re.search(
                    r"(?i)\bPD[- ](?:[A-Z0-9]+[- ])*[A-Z0-9]*[0-9][A-Z0-9]*\b",
                    value.translate(DIGITS),
                )
            )
        ):
            swapped.update(("order_reference", key))
    reference, reference_legible = fields.get("order_reference", (None, False))
    if (
        reference
        and reference_legible
        and order.customer_name
        and name_similarity(reference, order.customer_name) >= NAME_THRESHOLD
    ):
        swapped.update(("order_reference", "customer_name"))
    results: list[dict[str, object]] = []
    for key, wanted in expected.items():
        written, legible = fields.get(key, (None, False))
        verdict, reason = (
            "unsure",
            "Required field is missing or unreadable. Move closer, reduce glare and reshoot.",
        )
        if key in swapped:
            verdict, reason = (
                "fail",
                "Order reference and another field are swapped or misplaced. Fix both fields and reshoot.",
            )
        elif not wanted:
            reason = "The confirmed order has no value for this field. Edit and reconfirm the order first."
        elif written and written.strip() and legible:
            if key == "order_reference":
                # Only Unicode/case/spacing normalization; no fuzzy references.
                match = (
                    written.translate(DIGITS).strip().upper()
                    == wanted.translate(DIGITS).strip().upper()
                )
                verdict, reason = (
                    ("pass", "Order reference matches exactly.")
                    if match
                    else ("fail", "Order reference does not match. Fix and reshoot.")
                )
            elif key == "phone":
                actual, target = phone_digits(written), phone_digits(wanted)
                if re.fullmatch(r"[0-9]{11}", actual) and actual == target:
                    verdict, reason = "pass", "All 11 phone digits match."
                elif (
                    len(actual) == len(target) == 11
                    and actual.isascii()
                    and actual.isdigit()
                ):
                    positions = ", ".join(
                        str(i + 1)
                        for i, pair in enumerate(zip(actual, target, strict=True))
                        if pair[0] != pair[1]
                    )
                    verdict, reason = (
                        "fail",
                        f"Phone digit mismatch at position(s) {positions}. Fix and reshoot.",
                    )
                else:
                    verdict, reason = (
                        "fail",
                        "The phone must contain exactly the confirmed 11 digits. Fix and reshoot.",
                    )
            elif key == "cod_amount":
                actual_amount = written_amount(written)
                if actual_amount is None:
                    reason = "COD amount could not be read as one amount. Show the amount and reshoot."
                elif actual_amount == order.cod_amount:
                    verdict, reason = "pass", "COD amount matches exactly."
                else:
                    verdict, reason = (
                        "fail",
                        "COD amount does not match. Fix and reshoot.",
                    )
            elif key == "customer_name":
                if name_similarity(written, wanted) >= NAME_THRESHOLD:
                    verdict, reason = (
                        "pass",
                        "Normalized name matches the confirmed recipient.",
                    )
                else:
                    reason = "Recipient name is below the match threshold. Show the name clearly and reshoot."
            else:
                verdict, reason = address_result(written, wanted)
        results.append(
            {
                "field": key,
                "verdict": verdict,
                "reason": reason,
                "written": written,
                "expected": wanted,
            }
        )
    verdicts = {str(item["verdict"]) for item in results}
    return (
        "fail" if "fail" in verdicts else "unsure" if "unsure" in verdicts else "pass"
    ), results
