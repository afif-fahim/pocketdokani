"""Short uploaded voice notes; no audio or provider errors enter public logs."""

import hashlib
import io
import json
import subprocess
import tempfile
import wave
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from pocketdokani.model_api import PreWriteModelError, model_call
from pocketdokani.records import BrowserSession, Order, Sku, Workspace

MAX_AUDIO_BYTES = 8 * 1024 * 1024


def transcribe(
    db: Session, actor: BrowserSession, workspace: Workspace | None, data: bytes
) -> tuple[str, str]:
    with tempfile.TemporaryDirectory(prefix="pocketdokani-voice-") as directory:
        source, target = Path(directory) / "upload", Path(directory) / "normalized.wav"
        source.write_bytes(data)
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-i",
                    str(source),
                    "-vn",
                    "-t",
                    "121",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "pcm_s16le",
                    "-y",
                    str(target),
                ],
                check=True,
                timeout=20,
                capture_output=True,
            )
            audio = target.read_bytes()
            with wave.open(io.BytesIO(audio)) as wav:
                duration = wav.getnframes() / wav.getframerate()
                if not 0 < duration <= 120:
                    raise ValueError()
        except FileNotFoundError:
            raise PreWriteModelError(
                503, "Voice notes require ffmpeg on the API server."
            ) from None
        except (subprocess.SubprocessError, ValueError, wave.Error):
            raise HTTPException(
                422, "Choose a playable voice note of at most two minutes."
            ) from None
    keywords = list(
        db.scalars(
            select(Sku.product_name)
            .where(Sku.owner == actor.owner, Sku.lot_received.is_(True))
            .distinct()
        )
    )
    if workspace is None:
        for sku in db.scalars(select(Sku).where(Sku.owner == actor.owner)):
            keywords.extend([sku.sku, sku.product_name, sku.variant])
        keywords.extend(
            db.scalars(
                select(Order.customer_name)
                .where(Order.owner == actor.owner, Order.customer_name.is_not(None))
                .distinct()
                .limit(100)
            )
        )
    keywords = list(dict.fromkeys(word for word in keywords if word))[:200]
    fingerprint = hashlib.sha256(data).hexdigest()
    result = model_call(
        db,
        actor,
        "voice_note" if workspace else "assistant_transcription",
        "muse-voice-transcribe-1.0",
        {
            "workspace_id": workspace.id if workspace else None,
            "audio_sha256": fingerprint,
        },
        "asr/transcribe",
        files={
            "request": (
                None,
                json.dumps(
                    {
                        "model": "muse-voice-transcribe-1.0",
                        "audioEncoding": "WAV",
                        "mode": "PUSH_TO_TALK",
                        "languageBias": ["Bengali", "English"],
                        "keywords": keywords,
                    }
                ),
                "application/json",
            ),
            "audio": ("voice.wav", audio, "audio/wav"),
        },
    )
    transcript = result.get("transcript")
    if (
        not isinstance(transcript, str)
        or not transcript.strip()
        or len(transcript) > 20000
    ):
        raise PreWriteModelError(
            502, "No usable transcript was returned. Try a clearer voice note."
        )
    return transcript, fingerprint
