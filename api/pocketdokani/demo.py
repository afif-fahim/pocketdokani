import io

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import text
from sqlalchemy.orm import Session

from pocketdokani.imports import Original
from pocketdokani.records import Sku

# Hand-authored constructed source; no real seller/customer identifiers or phones.
DEMO_SOURCE_ID = "constructed-conversation-001"


def screenshots() -> list[Original]:
    font = ImageFont.load_default(size=22)
    title = ImageFont.load_default(size=28)
    batches = [
        [("left", "Blue tote ta ache?"), ("right", "Ji, received lot e ache."),
         ("left", "Ekta blue, ekta black chai."), ("right", "Duita item note korlam.")],
        [("left", "Age screenshots gulo dekhen."), ("right", "Ji, details review korbo."),
         ("left", "Eta constructed example."), ("right", "Real customer data nei.")],
    ]
    result = []
    for sequence, bubbles in enumerate(batches, 1):
        image = Image.new("RGB", (720, 1100), "#f4f5f9")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 720, 120), fill="#ffffff")
        draw.text((28, 26), "Demo customer | Messenger", font=title, fill="#203831")
        draw.text((28, 75), "CONSTRUCTED - no real conversation", font=font, fill="#53645e")
        for index, (side, text) in enumerate(bubbles):
            x = 28 if side == "left" else 160
            y = 190 + index * 170
            draw.rounded_rectangle((x, y, x + 530, y + 110), radius=24,
                                   fill="#e2e5ed" if side == "left" else "#d4eee5")
            draw.text((x + 20, y + 40), text, font=font, fill="#203831")
        draw.text((28, 1010), f"Development source | screenshot {sequence}/2", font=font, fill="#53645e")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        result.append(Original(f"constructed-{sequence:02}.png", buffer.getvalue(), "image/png", 720, 1100))
    return result


def seed_catalogue(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(73012001)"))
    for sku, colour, lot, received in [
        ("DEMO-TOTE-BLUE-R1", "Blue", "DEMO-RECEIVED", True),
        ("DEMO-TOTE-BLACK-R1", "Black", "DEMO-RECEIVED", True),
        ("DEMO-TOTE-BLUE-T2", "Blue", "DEMO-IN-TRANSIT", False),
    ]:
        if db.get(Sku, ("judge-catalogue", sku)) is None:
            db.add(Sku(owner="judge-catalogue", sku=sku, product_name="Constructed canvas tote",
                       variant=colour, lot=lot, lot_received=received, constructed=True,
                       reviewed_by="constructed-fixture-review"))
