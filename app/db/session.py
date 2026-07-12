from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect
import re
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    future=True,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


TAG_RE = re.compile(r'<[^>]+>')

_SANITIZE_FIELDS = frozenset({
    'title', 'description', 'comment', 'first_name', 'last_name',
    'file_name', 'error_message',
})


def sanitize_html(text: str) -> str:
    return TAG_RE.sub('', text)


@event.listens_for(Session, "before_flush")
def before_flush(session, flush_context, instances) -> None:
    for obj in session.new | session.dirty:
        try:
            state = inspect(obj)
            if state is not None and state.mapper is not None:
                for attr in state.mapper.column_attrs:
                    if attr.key in _SANITIZE_FIELDS and attr.key in state.dict:
                        val = state.dict[attr.key]
                        if isinstance(val, str):
                            setattr(obj, attr.key, sanitize_html(val))
        except Exception:
            pass

