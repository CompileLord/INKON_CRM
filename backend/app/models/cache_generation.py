from sqlalchemy import BigInteger, CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CacheGeneration(Base):
    __tablename__ = "cache_generations"
    __table_args__ = (CheckConstraint("generation >= 0", name="check_cache_generation_nonnegative"),)

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    generation: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
