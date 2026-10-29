"""Validate source-group partitioning without reading private media."""
import json
import re
from pathlib import Path


def main() -> None:
    manifest = json.loads(Path("evals/split_manifest.json").read_text(encoding="utf-8"))
    seen_sources: set[str] = set()
    seen_artifacts: set[str] = set()
    for group in manifest["source_groups"]:
        source = group["source_id"]
        if source in seen_sources:
            raise SystemExit("A conversation/label source appears more than once.")
        seen_sources.add(source)
        if group["kind"] not in ("conversation", "label") or group["split"] not in ("development", "evaluation"):
            raise SystemExit("Each source needs a kind and an explicit split.")
        if group["provenance"] not in ("constructed", "private", "anonymised"):
            raise SystemExit("Each source needs its provenance.")
        artifacts = group["artifact_ids"]
        if not artifacts or len(set(artifacts)) != len(artifacts) or seen_artifacts.intersection(artifacts):
            raise SystemExit("Artifact IDs must occur in exactly one source group.")
        for identifier in [source, *artifacts]:
            if not re.fullmatch(r"[a-z][a-z0-9-]{0,79}", identifier):
                raise SystemExit("Use safe fixture IDs, never customer identifiers or paths.")
        seen_artifacts.update(artifacts)
    print(f"Valid source partition: {len(seen_sources)} sources, {len(seen_artifacts)} artifacts.")


if __name__ == "__main__":
    main()
