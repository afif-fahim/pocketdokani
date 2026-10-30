import secrets
from typing import Annotated, Literal

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from pocketdokani.assistant import Question, answer_question
from pocketdokani.business import orders_payload, payouts_payload, stock_payload
from pocketdokani.config import settings
from pocketdokani.db import database
from pocketdokani.demo import product_photo, screenshots, seed_shop
from pocketdokani.drafting import (
    DraftRevision,
    SaveDraft,
    confirm_draft,
    draft_payload,
    extract,
    owned_draft,
    save_draft,
)
from pocketdokani.imports import (
    LAYOUT,
    MAX_BATCH_BYTES,
    MAX_FILE_BYTES,
    MAX_FILES,
    cleanup_objects,
    commit_workspace,
    create_workspace,
    validate_original,
    workspace_payload,
)
from pocketdokani.model_api import require_models
from pocketdokani.order_actions import (
    NewDraft,
    StatusChange,
    change_status,
    create_draft,
)
from pocketdokani.records import (
    BrowserSession,
    OrderDraft,
    Product,
    SourceImage,
    VoiceNote,
    Workspace,
)
from pocketdokani.security import (
    Context,
    authenticate,
    budget,
    digest,
    issue_session,
    require_mutation,
)
from pocketdokani.storage import ObjectStorage
from pocketdokani.voice_notes import MAX_AUDIO_BYTES, transcribe

app = FastAPI(title="PocketDokani", docs_url=None, redoc_url=None, openapi_url=None)
Database = Annotated[Session, Depends(database)]


class RequestBoundary:
    """Bound bytes before multipart parsing; never cache private records or originals."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = (
            MAX_BATCH_BYTES + 64 * 1024
            if scope["path"].endswith("/workspaces")
            else MAX_AUDIO_BYTES + 64 * 1024
            if scope["path"].endswith(("/voice-notes", "/assistant/transcribe"))
            else 128 * 1024
        )
        consumed = 0
        response_started = False

        async def bounded_receive() -> Message:
            nonlocal consumed
            message = await receive()
            consumed += len(message.get("body", b""))
            if consumed > limit:
                raise HTTPException(
                    413, "Batch too large. Choose at most 32 MiB in total."
                )
            return message

        async def private_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                message.setdefault("headers", []).extend(
                    [
                        (b"cache-control", b"no-store, private"),
                        (b"x-content-type-options", b"nosniff"),
                        (b"referrer-policy", b"no-referrer"),
                    ]
                )
            await send(message)

        headers = dict(scope.get("headers", []))
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = limit + 1
        if length > limit:
            await JSONResponse(
                {"detail": "Batch too large. Choose at most 32 MiB in total."},
                status_code=413,
            )(scope, receive, private_send)
            return
        try:
            await self.app(scope, bounded_receive, private_send)
        except Exception:
            # Provider exceptions can contain URLs or credentials. Do not rethrow
            # them into Uvicorn's error logger or include them in the response.
            if response_started:
                raise RuntimeError("PocketDokani response interrupted") from None
            await JSONResponse(
                {
                    "detail": "Storage is temporarily unavailable. Please retry; no incomplete workspace was saved."
                },
                status_code=503,
            )(scope, receive, private_send)


app.add_middleware(RequestBoundary)


@app.exception_handler(RequestValidationError)
async def invalid_request(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    # Pydantic errors can echo secret inputs; return only a safe, actionable message.
    return JSONResponse(
        {
            "detail": "Check the required fields, amounts, file selection and confirmation."
        },
        status_code=422,
    )


@app.get("/api/health")
def health(db: Database) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


class Login(BaseModel):
    passcode: SecretStr = Field(max_length=256)


@app.post("/api/seller/session")
def login(
    payload: Login, request: Request, response: Response, db: Database
) -> dict[str, str]:
    require_mutation(request)
    address = request.client.host if request.client else "unknown"
    budget(db, "login:" + digest(address), 10, 15)
    if not secrets.compare_digest(
        payload.passcode.get_secret_value().encode(),
        settings().shop_passcode.get_secret_value().encode(),
    ):
        raise HTTPException(401, "That shop passcode is incorrect.")
    # Rotate an existing browser token without disturbing its independent judge session.
    prior = request.cookies.get("pd_seller")
    if prior:
        db.execute(
            delete(BrowserSession).where(BrowserSession.token_hash == digest(prior))
        )
    issue_session(db, response, "seller")
    db.commit()
    return {"context": "seller"}


@app.post("/api/judge/session")
def start_judge(request: Request, response: Response, db: Database) -> dict[str, str]:
    require_mutation(request)
    try:
        actor = authenticate(db, request, "judge", lock=True)
        seed_shop(db, actor.owner)
        db.commit()
        return {"context": "judge"}
    except HTTPException as error:
        if error.status_code != 401:
            raise
    address = request.client.host if request.client else "unknown"
    budget(db, "judge-session:" + digest(address), 10)
    actor = issue_session(db, response, "judge")
    seed_shop(db, actor.owner)
    db.commit()
    return {"context": "judge"}


@app.get("/api/{context}/session")
def current_session(
    context: Context, request: Request, db: Database
) -> dict[str, object]:
    authenticate(db, request, context)
    return {
        "context": context,
        "max_files": MAX_FILES,
        "max_file_bytes": MAX_FILE_BYTES,
        "max_batch_bytes": MAX_BATCH_BYTES,
        "model_calls_enabled": settings().model_calls_enabled
        and bool(settings().model_api_key.get_secret_value()),
    }


@app.delete("/api/{context}/session")
def logout(
    context: Context, request: Request, response: Response, db: Database
) -> dict[str, bool]:
    require_mutation(request)
    session = authenticate(db, request, context)
    db.delete(session)
    db.commit()
    response.delete_cookie(f"pd_{context}", path="/")
    return {"signed_out": True}


def owned_workspace(db: Session, actor: BrowserSession, workspace_id: str) -> Workspace:
    workspace = db.scalar(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.owner == actor.owner,
            Workspace.context == actor.context,
        )
    )
    if workspace is None:
        raise HTTPException(404, "Workspace not found in this session.")
    return workspace


@app.get("/api/{context}/workspaces")
def list_workspaces(
    context: Context, request: Request, db: Database
) -> list[dict[str, object]]:
    actor = authenticate(db, request, context)
    workspaces = db.scalars(
        select(Workspace)
        .where(
            Workspace.owner == actor.owner,
            Workspace.context == context,
        )
        .order_by(Workspace.created_at.desc())
        .limit(100)
    ).all()
    return [workspace_payload(db, workspace) for workspace in workspaces]


@app.get("/api/{context}/workspaces/{workspace_id}")
def get_workspace(
    context: Context, workspace_id: str, request: Request, db: Database
) -> dict[str, object]:
    actor = authenticate(db, request, context)
    return workspace_payload(db, owned_workspace(db, actor, workspace_id))


@app.post("/api/seller/workspaces", status_code=201)
def import_batch(
    request: Request,
    db: Database,
    files: Annotated[list[UploadFile], File()],
    seller_side: Annotated[Literal["left", "right"], Form()],
    layout: Annotated[str, Form()],
    sides_confirmed: Annotated[Literal["yes"], Form()],
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, "seller")
    budget(db, "import:" + actor.owner, 30)
    if layout != LAYOUT:
        raise HTTPException(422, "Use the supported Messenger mobile bubble layout.")
    if not 1 <= len(files) <= MAX_FILES:
        raise HTTPException(422, "Select between 1 and 12 screenshots.")
    originals = []
    total = 0
    try:
        for file in files:
            data = file.file.read(MAX_FILE_BYTES + 1)
            total += len(data)
            if total > MAX_BATCH_BYTES:
                raise HTTPException(413, "The screenshot batch must be at most 32 MiB.")
            originals.append(
                validate_original(
                    file.filename or "screenshot", data, file.content_type or ""
                )
            )
    finally:
        for file in files:
            file.file.close()
    workspace = create_workspace(db, actor, seller_side, originals)
    commit_workspace(db, workspace)
    return workspace_payload(db, workspace)


@app.get("/api/{context}/workspaces/{workspace_id}/sources/{source_id}")
def original_image(
    context: Context, workspace_id: str, source_id: str, request: Request, db: Database
) -> Response:
    actor = authenticate(db, request, context)
    owned_workspace(db, actor, workspace_id)
    source = db.scalar(
        select(SourceImage).where(
            SourceImage.id == source_id,
            SourceImage.workspace_id == workspace_id,
        )
    )
    if source is None:
        raise HTTPException(404, "Original screenshot not found.")
    return Response(
        ObjectStorage().get(source.storage_key), media_type=source.media_type
    )


class ResetExample(BaseModel):
    workspace_id: str | None = Field(default=None, max_length=36)


@app.post("/api/judge/example")
def reset_example(
    payload: ResetExample, request: Request, db: Database
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, "judge")
    budget(db, "judge-reset:" + actor.owner, 10)
    actor = authenticate(db, request, "judge", lock=True)
    prior_workspaces = list(
        db.scalars(
            select(Workspace).where(
                Workspace.context == "judge",
                Workspace.owner == actor.owner,
            )
        )
    )
    if prior_workspaces and payload.workspace_id is None:
        return workspace_payload(db, prior_workspaces[0])
    if payload.workspace_id is not None and (
        payload.workspace_id not in [workspace.id for workspace in prior_workspaces]
    ):
        raise HTTPException(409, "The example changed. Reload before resetting it.")
    old_keys: list[str] = []
    for prior in prior_workspaces:
        old_keys.extend(
            db.scalars(
                select(SourceImage.storage_key).where(
                    SourceImage.workspace_id == prior.id
                )
            )
        )
        db.execute(delete(OrderDraft).where(OrderDraft.workspace_id == prior.id))
        db.execute(delete(VoiceNote).where(VoiceNote.workspace_id == prior.id))
        db.execute(delete(SourceImage).where(SourceImage.workspace_id == prior.id))
        db.delete(prior)
        db.flush()
    workspace = create_workspace(db, actor, "right", screenshots())
    seed_shop(db, actor.owner, reset=True)
    commit_workspace(db, workspace)
    cleanup_objects(old_keys)
    return workspace_payload(db, workspace)


@app.get("/api/{context}/catalogue")
@app.get("/api/{context}/stock")
def catalogue(
    context: Context, request: Request, db: Database
) -> list[dict[str, object]]:
    return stock_payload(db, authenticate(db, request, context))


@app.get("/api/{context}/orders")
def list_orders(
    context: Context, request: Request, db: Database
) -> list[dict[str, object]]:
    return orders_payload(db, authenticate(db, request, context))


@app.get("/api/{context}/payouts")
def list_payouts(
    context: Context, request: Request, db: Database
) -> list[dict[str, object]]:
    return payouts_payload(db, authenticate(db, request, context))


@app.get("/api/{context}/products/{product_id}/photo")
def catalogue_photo(
    context: Context, product_id: str, request: Request, db: Database
) -> Response:
    actor = authenticate(db, request, context)
    product = db.get(Product, (actor.owner, product_id))
    if product is None or not product.photo_key:
        raise HTTPException(404, "Product photo not found in this shop.")
    data = (
        product_photo(product_id)
        if context == "judge"
        else ObjectStorage().get(product.photo_key)
    )
    return Response(data, media_type=product.photo_media_type)


@app.get("/api/{context}/workspaces/{workspace_id}/draft")
def get_draft(
    context: Context, workspace_id: str, request: Request, db: Database
) -> dict[str, object] | None:
    actor = authenticate(db, request, context)
    owned_workspace(db, actor, workspace_id)
    draft = db.get(OrderDraft, workspace_id)
    return draft_payload(db, draft) if draft else None


@app.post("/api/{context}/workspaces/{workspace_id}/draft")
def extract_draft(
    context: Context, workspace_id: str, request: Request, db: Database
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    workspace = owned_workspace(db, actor, workspace_id)
    existing = db.get(OrderDraft, workspace_id)
    if existing:
        return draft_payload(db, existing)
    require_models()
    content = extract(db, actor, workspace)
    # Model calls commit their audit records. Recheck ownership after the network wait.
    actor = authenticate(db, request, context, lock=True)
    owned_workspace(db, actor, workspace_id)
    existing = db.get(OrderDraft, workspace_id)
    if existing:
        return draft_payload(db, existing)
    draft = OrderDraft(workspace_id=workspace_id, owner=actor.owner, content=content)
    db.add(draft)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "The workspace changed. Reload to open the latest draft."
        ) from None
    return draft_payload(db, draft)


@app.put("/api/{context}/workspaces/{workspace_id}/draft")
def update_draft(
    context: Context,
    workspace_id: str,
    payload: SaveDraft,
    request: Request,
    db: Database,
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    owned_workspace(db, actor, workspace_id)
    draft = owned_draft(db, actor, workspace_id)
    save_draft(db, draft, payload)
    return draft_payload(db, draft)


@app.post("/api/{context}/workspaces/{workspace_id}/draft/confirm")
def approve_draft(
    context: Context,
    workspace_id: str,
    payload: DraftRevision,
    request: Request,
    db: Database,
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    owned_workspace(db, actor, workspace_id)
    draft = owned_draft(db, actor, workspace_id)
    confirm_draft(db, actor, draft, payload.revision)
    return draft_payload(db, draft)


@app.get("/api/{context}/workspaces/{workspace_id}/voice-notes")
def list_voice_notes(
    context: Context, workspace_id: str, request: Request, db: Database
) -> list[dict[str, str]]:
    actor = authenticate(db, request, context)
    owned_workspace(db, actor, workspace_id)
    notes = db.scalars(
        select(VoiceNote)
        .where(VoiceNote.workspace_id == workspace_id)
        .order_by(VoiceNote.created_at)
    ).all()
    return [{"id": n.id, "transcript": n.transcript} for n in notes]


@app.post("/api/{context}/workspaces/{workspace_id}/voice-notes")
def upload_voice_note(
    context: Context,
    workspace_id: str,
    request: Request,
    db: Database,
    audio: Annotated[UploadFile, File()],
) -> dict[str, str]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    workspace = owned_workspace(db, actor, workspace_id)
    if db.get(OrderDraft, workspace_id):
        raise HTTPException(
            409,
            "Add voice notes before extracting. Existing drafts keep their original evidence.",
        )
    require_models()
    try:
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
    finally:
        audio.file.close()
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Choose a nonempty voice note of at most 8 MiB.")
    transcript, fingerprint = transcribe(db, actor, workspace, data)
    actor = authenticate(db, request, context, lock=True)
    owned_workspace(db, actor, workspace_id)
    if db.get(OrderDraft, workspace_id):
        raise HTTPException(
            409,
            "A draft was extracted while the voice note was transcribing. It was not changed.",
        )
    note = VoiceNote(
        workspace_id=workspace_id, transcript=transcript, sha256=fingerprint
    )
    db.add(note)
    db.commit()
    return {"id": note.id, "transcript": note.transcript}


@app.post("/api/{context}/assistant/transcribe")
def assistant_transcribe(
    context: Context,
    request: Request,
    db: Database,
    audio: Annotated[UploadFile, File()],
) -> dict[str, str]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    require_models()
    try:
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
    finally:
        audio.file.close()
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Record nonempty audio of at most 8 MiB.")
    transcript, _ = transcribe(db, actor, None, data)
    authenticate(db, request, context)
    return {"transcript": transcript}


@app.post("/api/{context}/assistant/turns")
def assistant_turn(
    context: Context,
    payload: Question,
    request: Request,
    db: Database,
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, context)
    return answer_question(db, actor, request, context, payload)


@app.post("/api/{context}/order-drafts", status_code=201)
def new_order_draft(
    context: Context,
    payload: NewDraft,
    request: Request,
    db: Database,
) -> dict[str, object]:
    require_mutation(request)
    actor = authenticate(db, request, context, lock=True)
    return workspace_payload(db, create_draft(db, actor, payload))


@app.post("/api/{context}/orders/{order_id}/status")
def update_order_status(
    context: Context,
    order_id: str,
    payload: StatusChange,
    request: Request,
    db: Database,
) -> dict[str, bool]:
    require_mutation(request)
    actor = authenticate(db, request, context, lock=True)
    change_status(db, actor, order_id, payload)
    return {"updated": True}
