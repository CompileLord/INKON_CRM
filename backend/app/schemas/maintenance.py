from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict


MaintenanceTaskName: TypeAlias = Literal["archive_expired_courses", "check_payment_reminders"]


class MaintenanceAccepted(BaseModel):
    model_config: ConfigDict = ConfigDict(extra="forbid")

    status: Literal["accepted"] = "accepted"
    task: MaintenanceTaskName
    job_id: str
