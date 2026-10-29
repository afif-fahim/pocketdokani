from alembic import context

from pocketdokani.db import Base, engine
from pocketdokani import records  # noqa: F401 - register table metadata

target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(url=engine.url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
