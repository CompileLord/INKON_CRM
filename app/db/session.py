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
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


TAG_RE = re.compile(r'<[^>]+>')


def sanitize_html(text: str) -> str:
    return TAG_RE.sub('', text)


@event.listens_for(Session, "before_flush")
def before_flush(session, flush_context, instances) -> None:
    for obj in session.new | session.dirty:
        try:
            state = inspect(obj)
            if state is not None and state.mapper is not None:
                for attr in state.mapper.column_attrs:
                    if attr.key in state.dict:
                        val = state.dict[attr.key]
                        if isinstance(val, str):
                            setattr(obj, attr.key, sanitize_html(val))
        except Exception:
            pass

