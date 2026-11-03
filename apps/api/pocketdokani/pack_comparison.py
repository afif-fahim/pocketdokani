"""Compare a blind label transcription with seller-confirmed values in code."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from typing import TYPE_CHECKING

from pocketdokani.demo import DEMO_PHONE

if TYPE_CHECKING:
    from pocketdokani.records import Order

NAME_THRESHOLD = 0.82
DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
ADDRESS_ALIASES = {
    unicodedata.normalize("NFKC", label): field
    for label, field in {
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
    }.items()
}
# Keep letter suffixes in identifiers such as 12/A, 12-AB and ১২/ক.
ADDRESS_NUMBER = r"[0-9]+[a-z\u0980-\u09ff]*(?:(?:\s*/\s*|-)[0-9a-z\u0980-\u09ff]+)*"
ADDRESS_LABEL = re.compile(
    rf"(?P<label>{'|'.join(ADDRESS_ALIASES)})\.?\s*"
    rf"(?:(?:number|no\.?|নম্বর|নং)\s*)?[#: -]*(?P<number>{ADDRESS_NUMBER})"
)


@dataclass(frozen=True)
class _AddressParts:
    labelled: dict[str, Counter[str]]
    numbers: list[str]
    unlabelled: list[str]
    locality_words: set[str]


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


def reference_value(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).translate(DIGITS).strip().upper()
    return value.removeprefix("#").strip()


def _reference_token(value: str, reference: str) -> bool:
    token = normalized(reference)
    return bool(
        token and re.search(rf"(?<!\w){re.escape(token)}(?!\w)", normalized(value))
    )


def written_amount(value: str) -> Decimal | None:
    value = value.translate(DIGITS).strip()
    value = re.sub(r"(?i)^(?:bdt|tk\.?|৳|টাকা)\s*", "", value)
    value = re.sub(r"(?i)\s*(?:bdt|tk\.?|৳|টাকা)$", "", value)
    # The seller writes whole-taka amounts as 980/- on parcel labels.
    value = re.sub(r"\s*/\s*[-–—]\s*$", "", value).strip()
    if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?", value):
        return None
    try:
        return Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None


def _address_parts(value: str) -> _AddressParts:
    text = unicodedata.normalize("NFKC", value).translate(DIGITS).casefold()
    labelled: dict[str, Counter[str]] = {}
    labelled_starts: set[int] = set()
    locality = list(text)
    for match in ADDRESS_LABEL.finditer(text):
        # Python's word boundary excludes combining marks used in Bangla.
        # Reject an alias inside any word, including immediately after a mark.
        if match.start() and (
            unicodedata.category(text[match.start() - 1])[0] in "LMN"
            or text[match.start() - 1] == "_"
        ):
            continue
        field = ADDRESS_ALIASES[match["label"]]
        number = "".join(match["number"].split())
        labelled.setdefault(field, Counter())[number] += 1
        labelled_starts.add(match.start("number"))
        locality[match.start() : match.end()] = " " * (match.end() - match.start())
    numbers: list[str] = []
    unlabelled: list[str] = []
    for match in re.finditer(ADDRESS_NUMBER, text):
        number = "".join(match[0].split())
        numbers.append(number)
        if match.start() not in labelled_starts:
            unlabelled.append(number)
    generic = {
        "district",
        "area",
        "no",
        "number",
        "bangladesh",
        "bd",
        "জেলা",
        "নং",
        "নম্বর",
    } | ADDRESS_ALIASES.keys()
    # Keep the alphabetic part of unlabelled alphanumeric locality names.
    words = {
        word
        for word in re.sub(r"[0-9]+", " ", normalized("".join(locality))).split()
        if word not in generic
    }
    return _AddressParts(labelled, numbers, unlabelled, words)


def address_result(written: str, expected: str) -> tuple[str, str]:
    # Without confirmed area fields, require stored locality words rather than
    # infer spellings or transliterations. Explicit number headings may reorder.
    actual, target = _address_parts(written), _address_parts(expected)
    if any(
        actual.labelled[key].keys() - target.labelled[key].keys()
        for key in actual.labelled.keys() & target.labelled.keys()
    ):
        return (
            "fail",
            "The number in a house, road, flat or block field conflicts with the order. Fix and reshoot.",
        )
    actual_numbers, expected_numbers = set(actual.numbers), set(target.numbers)
    if actual_numbers - expected_numbers:
        return (
            "fail",
            "Address contains a conflicting house, road or other number. Fix and reshoot.",
        )
    if actual.labelled != target.labelled:
        return (
            "unsure",
            "A house, road, flat or block number heading is missing or different. Show the complete address and reshoot.",
        )
    if expected_numbers - actual_numbers:
        return (
            "unsure",
            "An address number is missing. Show the full address and reshoot.",
        )
    if actual.unlabelled != target.unlabelled:
        return (
            "unsure",
            "Address number positions could not be matched. Show each house/road heading and reshoot.",
        )
    if target.locality_words and target.locality_words == actual.locality_words:
        return "pass", "Stored district/area words and address numbers match."
    return (
        "unsure",
        "District/area spelling could not be matched. Show the complete address and reshoot.",
    )


def compare_label(
    reading: dict[str, object], order: Order, *, judge: bool = False
) -> tuple[str, list[dict[str, object]]]:
    expected = {
        "order_reference": order.label_reference,
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
            and not _reference_token(str(expected[key] or ""), order.label_reference)
            and (
                _reference_token(value, order.label_reference)
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
                "Label order number and another field are swapped or misplaced. Fix both fields and reshoot.",
            )
        elif not wanted:
            reason = "The confirmed order has no value for this field. Edit and reconfirm the order first."
        elif written and written.strip() and legible:
            if key == "order_reference":
                # The label's optional # marker is not part of its order number.
                match = reference_value(written) == reference_value(wanted)
                verdict, reason = (
                    ("pass", "Label order number matches exactly.")
                    if match
                    else ("fail", "Label order number does not match. Fix and reshoot.")
                )
            elif key == "phone":
                actual, target = phone_digits(written), phone_digits(wanted)
                if (
                    judge
                    and order.owner != "shop"
                    and wanted == DEMO_PHONE
                    and written == DEMO_PHONE
                ):
                    verdict, reason = (
                        "pass",
                        "Non-contactable judge demo marker matches; no telephone number is verified.",
                    )
                elif re.fullmatch(r"[0-9]{11}", actual) and actual == target:
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
