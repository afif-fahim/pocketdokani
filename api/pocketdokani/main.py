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
from sqlalchemy.orm import Session
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from pocketdokani.business import orders_payload, payouts_payload, stock_payload
from pocketdokani.config import settings
from pocketdokani.db import database
from pocketdokani.demo import product_photo, screenshots, seed_shop
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
from pocketdokani.records import BrowserSession, Product, SourceImage, Workspace
from pocketdokani.security import (
    Context,
    authenticate,
    budget,
    digest,
    issue_session,
    require_mutation,
)
from pocketdokani.storage import ObjectStorage

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
            else 16 * 1024
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
        {"detail": "Check the file selection, layout and side confirmation."},
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
        "model_calls_enabled": False,
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
    prior = db.scalar(
        select(Workspace).where(
            Workspace.context == "judge",
            Workspace.owner == actor.owner,
        )
    )
    if prior and payload.workspace_id is None:
        return workspace_payload(db, prior)
    if payload.workspace_id is not None and (
        prior is None or payload.workspace_id != prior.id
    ):
        raise HTTPException(409, "The example changed. Reload before resetting it.")
    old_keys: list[str] = []
    if prior:
        old_keys = list(
            db.scalars(
                select(SourceImage.storage_key).where(
                    SourceImage.workspace_id == prior.id
                )
            )
        )
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
