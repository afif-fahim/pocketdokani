import hashlib
import io
import warnings
from dataclasses import dataclass
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from pocketdokani.db import utc_iso
from pocketdokani.records import BrowserSession, SourceImage, Workspace
from pocketdokani.storage import ObjectStorage

MAX_FILES = 12
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_BATCH_BYTES = 32 * 1024 * 1024
LAYOUT = "messenger-mobile-bubbles-v1"
MEDIA_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


@dataclass(frozen=True)
class Original:
    filename: str
    data: bytes
    media_type: str
    width: int
    height: int


def validate_original(filename: str, data: bytes, declared_type: str) -> Original:
    if not data or len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "Each screenshot must be nonempty and at most 8 MiB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                media_type = MEDIA_TYPES.get(image.format or "")
                width, height = image.size
                if media_type is None or declared_type != media_type:
                    raise HTTPException(415, "Choose a PNG, JPEG or WebP screenshot with the correct file type.")
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(415, "Animated images are not supported. Choose a still screenshot.")
                if width * height > 20_000_000:
                    raise HTTPException(413, "Screenshots must be at most 20 megapixels.")
                image.verify()
            # verify() checks file structure; load() also catches truncated image data.
            with Image.open(io.BytesIO(data)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError,
            Image.DecompressionBombWarning):
        raise HTTPException(415, "This image could not be read. Export a PNG or JPEG and try again.") from None
    safe_name = filename.replace("\\", "/").rsplit("/", 1)[-1][:160] or "screenshot"
    return Original(safe_name, data, media_type, width, height)


def create_workspace(db: Session, actor: BrowserSession, seller_side: str,
                     originals: list[Original]) -> Workspace:
    """Publish a complete initial batch or roll it back; originals never get replaced."""
    workspace_id = str(uuid4())
    workspace = Workspace(
        id=workspace_id, reference=f"PD-{uuid4().hex[:16].upper()}",
        context=actor.context, owner=actor.owner, layout=LAYOUT, seller_side=seller_side,
        confirmed_by="shop-seller" if actor.context == "seller" else "judge-visitor",
    )
    storage = ObjectStorage()
    attempted_keys: list[str] = []
    try:
        db.add(workspace)
        db.flush()
        for sequence, original in enumerate(originals, 1):
            source_id = str(uuid4())
            key = f"{actor.context}/{actor.owner}/{workspace_id}/{source_id}"
            attempted_keys.append(key)
            storage.put(key, original.data, original.media_type)
            db.add(SourceImage(
                id=source_id, workspace_id=workspace_id, sequence=sequence,
                filename=original.filename, storage_key=key,
                sha256=hashlib.sha256(original.data).hexdigest(),
                media_type=original.media_type, size=len(original.data),
                width=original.width, height=original.height,
            ))
        db.flush()
        return workspace
    except Exception:
        db.rollback()
        cleanup_objects(attempted_keys)
        raise


def cleanup_objects(keys: list[str]) -> None:
    storage = ObjectStorage()
    for key in keys:
        try:
            storage.delete(key)
        except Exception:
            # Do not log provider exceptions, URLs, credentials or customer filenames.
            # An inaccessible orphan can be removed by the documented storage sweep.
            import logging

            logging.getLogger("pocketdokani").warning("Object cleanup incomplete; run storage sweep.")


def commit_workspace(db: Session, workspace: Workspace) -> None:
    """Never delete originals after an ambiguous database commit."""
    keys = list(db.scalars(select(SourceImage.storage_key).where(SourceImage.workspace_id == workspace.id)))
    workspace_id = workspace.id
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            with Session(db.get_bind()) as check:
                published = check.get(Workspace, workspace_id)
            if published is None:
                cleanup_objects(keys)
        except Exception:
            # Preserve possible published evidence; let the orphan sweep decide.
            pass
        raise


def workspace_payload(db: Session, workspace: Workspace) -> dict[str, object]:
    images = db.scalars(select(SourceImage).where(
        SourceImage.workspace_id == workspace.id,
    ).order_by(SourceImage.sequence)).all()
    return {
        "id": workspace.id, "reference": workspace.reference,
        "context": workspace.context, "created_at": utc_iso(workspace.created_at),
        "layout": workspace.layout, "seller_side": workspace.seller_side,
        "confirmed_by": workspace.confirmed_by, "confirmed_at": utc_iso(workspace.confirmed_at),
        "coverage": "selected_screenshots_only", "model_calls": 0,
        "sources": [{
            "id": image.id, "sequence": image.sequence, "filename": image.filename,
            "sha256": image.sha256, "media_type": image.media_type, "size": image.size,
            "width": image.width, "height": image.height,
            "url": f"/api/{workspace.context}/workspaces/{workspace.id}/sources/{image.id}",
        } for image in images],
    }
