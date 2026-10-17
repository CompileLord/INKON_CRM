from pydantic import BaseModel


class BuildInfoResponse(BaseModel):
    version: str
    commit_sha: str
    commit_message: str
    built_at: str

    model_config = {"extra": "forbid"}
