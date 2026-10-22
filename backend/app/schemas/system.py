from typing import Optional

from pydantic import BaseModel


class BuildInfoResponse(BaseModel):
    version: str
    commit_sha: Optional[str] = None
    commit_message: Optional[str] = None
    built_at: Optional[str] = None

    model_config = {"extra": "forbid"}
