import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles


class PublicMediaFiles(StaticFiles):
    def __init__(self, storage_path: str, media_directory: str) -> None:
        if media_directory not in ("avatar", "course"):
            raise ValueError("Invalid public media directory")
        self.public_root: Path = Path(storage_path).resolve() / media_directory
        self.public_root.mkdir(parents=True, exist_ok=True)
        super().__init__(directory=str(self.public_root))

    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        file_path, file_stat = super().lookup_path(path)
        if file_stat is None or not Path(file_path).resolve().is_relative_to(self.public_root):
            return "", None
        return file_path, file_stat
