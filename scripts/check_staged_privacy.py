"""Block private paths and likely Bangladesh phone numbers in staged content."""

import re
import subprocess
import unicodedata

PRIVATE_PREFIXES = (
    "docs/private/",
    "data/private/",
    "evals/private/",
    "media/",
    ".venv/",
)
PHONE = re.compile(r"(?<!\d)(?:\+?88)?01[3-9]\d{8}(?!\d)")


def main() -> None:
    paths = (
        subprocess.check_output(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        )
        .decode()
        .split("\0")
    )
    blocked = []
    for path in filter(None, paths):
        basename = path.rsplit("/", 1)[-1]
        if (
            path.startswith(PRIVATE_PREFIXES)
            or path.endswith(".xlsx")
            or (basename.startswith(".env") and basename != ".env.example")
        ):
            blocked.append(path)
            continue
        data = subprocess.check_output(["git", "show", f":{path}"])
        if b"\0" in data[:8192]:
            continue
        value = data.decode("utf-8", errors="replace")
        normalised = "".join(
            str(unicodedata.digit(char)) if char.isdecimal() else char for char in value
        )
        if PHONE.search(normalised):
            blocked.append(path)
    if blocked:
        raise SystemExit(
            "Privacy check blocked staged files (values withheld):\n"
            + "\n".join(blocked)
        )
    print("Staged privacy check passed.")


if __name__ == "__main__":
    main()
