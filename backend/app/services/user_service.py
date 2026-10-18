import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from typing import ClassVar, List, Optional

from PIL import Image
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.user import UserCreate, UserUpdate, UserSelfUpdate
from app.services.auth_service import AuthService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.services.storage_service import StorageService, get_storage_service


class AvatarTransformationService:
    maximum_upload_bytes: ClassVar[int] = 5 * 1024 * 1024
    maximum_dimension: ClassVar[int] = 4096
    maximum_pixels: ClassVar[int] = 16_000_000
    worker_slots: ClassVar[asyncio.Semaphore] = asyncio.Semaphore(2)
    worker_pool: ClassVar[ThreadPoolExecutor] = ThreadPoolExecutor(max_workers=2, thread_name_prefix="avatar")

    async def transform(self, file: UploadFile) -> tuple[bytes, str]:
        await self.worker_slots.acquire()
        try:
            content: bytes = await file.read(self.maximum_upload_bytes + 1)
            if len(content) > self.maximum_upload_bytes:
                raise HTTPException(status_code=413, detail="Avatar size exceeds the 5MB limit")
            loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
            worker: asyncio.Future[tuple[bytes, str]] = loop.run_in_executor(
                self.worker_pool, self._transform_image, content,
            )
        except BaseException:
            self.worker_slots.release()
            raise
        worker.add_done_callback(self._release_worker_slot)
        return await asyncio.shield(worker)

    @classmethod
    def _release_worker_slot(cls, worker: asyncio.Future[tuple[bytes, str]]) -> None:
        cls.worker_slots.release()
        if not worker.cancelled():
            worker.exception()

    @classmethod
    def _transform_image(cls, content: bytes) -> tuple[bytes, str]:
        try:
            image: Image.Image
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ("PNG", "JPEG"):
                    raise HTTPException(status_code=400, detail="Unsupported image format. PNG or JPEG only.")
                if max(image.size) > cls.maximum_dimension or image.width * image.height > cls.maximum_pixels:
                    raise HTTPException(status_code=400, detail="Invalid image file")
                image.verify()
            with Image.open(io.BytesIO(content)) as image:
                image_format: str | None = image.format
                image.thumbnail((200, 200))
                output: io.BytesIO
                with io.BytesIO() as output:
                    image.save(output, format=image_format)
                    return output.getvalue(), "png" if image_format == "PNG" else "jpg"
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
            raise HTTPException(status_code=400, detail="Invalid image file") from None


class UserService:
    def __init__(self, db: AsyncSession, storage: StorageService | None = None) -> None:
        self.db = db
        self.user_repo = SQLAlchemyUserRepository(db)
        self.storage_service: StorageService = storage or get_storage_service()

    async def create_user(self, user_create: UserCreate) -> User:
        existing_user = await self.user_repo.get_by_email(user_create.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists"
            )

        if user_create.payment_day_of_month is not None and user_create.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment day of month can only be set for students"
            )

        user = User(
            email=user_create.email,
            first_name=user_create.first_name,
            last_name=user_create.last_name,
            role=user_create.role,
            date_of_birth=user_create.date_of_birth,
            phone=user_create.phone,
            parent_telegram_chat_id=user_create.parent_telegram_chat_id,
            parent_phone=user_create.parent_phone,
            payment_day_of_month=user_create.payment_day_of_month,
            must_set_password=True
        )
        created_user = await self.user_repo.create(user)

        auth_service = AuthService(self.db)
        await auth_service.issue_temporary_credentials(created_user)
        await self.db.refresh(created_user)

        return created_user

    async def update_user(self, user_id: int, user_update: UserUpdate) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if "payment_day_of_month" in user_update.model_fields_set and user.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment day of month can only be set for students"
            )

        if user_update.email and user_update.email != user.email:
            existing_user = await self.user_repo.get_by_email(user_update.email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User with this email already exists"
                )
            user.email = user_update.email
            auth_service = AuthService(self.db)
            await auth_service.issue_temporary_credentials(user)

        if user_update.first_name is not None:
            user.first_name = user_update.first_name
        if user_update.last_name is not None:
            user.last_name = user_update.last_name
        self.apply_optional_profile_fields(user, user_update)
        if "payment_day_of_month" in user_update.model_fields_set:
            user.payment_day_of_month = user_update.payment_day_of_month

        updated_user = await self.user_repo.update(user)
        await self.db.refresh(updated_user)
        return updated_user

    @staticmethod
    def _normalize_guardian_phone(phone_number: str) -> str | None:
        trimmed_phone: str = phone_number.strip()
        if not trimmed_phone or trimmed_phone.count("+") > 1:
            return None
        if "+" in trimmed_phone and not trimmed_phone.startswith("+"):
            return None
        allowed_formatting: frozenset[str] = frozenset({"+", "-", "(", ")", ".", " "})
        if any(
            not ("0" <= character <= "9") and character not in allowed_formatting
            for character in trimmed_phone
        ):
            return None
        digits: str = "".join(character for character in trimmed_phone if "0" <= character <= "9")
        if len(digits) < 2 or len(digits) > 15 or digits.startswith("0"):
            return None
        return f"+{digits}"

    async def bind_parent_telegram_contact(
        self,
        phone_number: str,
        telegram_chat_id: int,
    ) -> list[str]:
        normalized_phone: str | None = self._normalize_guardian_phone(phone_number)
        if normalized_phone is None:
            return []

        phone_values: tuple[str, str] = (
            normalized_phone,
            normalized_phone.removeprefix("+"),
        )
        students: list[User] = await self.user_repo.get_guardian_binding_candidates(phone_values)
        if not students or any(
            student.parent_telegram_chat_id is not None
            and student.parent_telegram_chat_id != telegram_chat_id
            for student in students
        ):
            return []

        await self.user_repo.update_guardian_bindings(students, telegram_chat_id)

        return [f"{student.first_name} {student.last_name}" for student in students]

    async def update_own_profile(self, user_id: int, user_update: UserSelfUpdate) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if user_update.first_name is not None:
            user.first_name = user_update.first_name
        if user_update.last_name is not None:
            user.last_name = user_update.last_name
        self.apply_optional_profile_fields(user, user_update)

        updated_user = await self.user_repo.update(user)
        await self.db.refresh(updated_user)
        return updated_user

    def apply_optional_profile_fields(self, user: User, user_update: UserUpdate | UserSelfUpdate) -> None:
        if "date_of_birth" in user_update.model_fields_set:
            user.date_of_birth = user_update.date_of_birth
        if "phone" in user_update.model_fields_set:
            user.phone = user_update.phone
        if "parent_telegram_chat_id" in user_update.model_fields_set:
            user.parent_telegram_chat_id = user_update.parent_telegram_chat_id
        if "parent_phone" in user_update.model_fields_set:
            if (
                user_update.parent_phone != user.parent_phone
                and "parent_telegram_chat_id" not in user_update.model_fields_set
            ):
                user.parent_telegram_chat_id = None
            user.parent_phone = user_update.parent_phone

    async def delete_user(self, user_id: int, current_user_id: int) -> bool:
        if user_id == current_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SuperAdmin cannot delete themselves"
            )

        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        success = await self.user_repo.soft_delete(user_id)
        if success:
            auth_service = AuthService(self.db)
            await auth_service.revoke_all_user_tokens(user_id)
        return success

    async def get_students(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        mentor_id: int | None = None,
    ) -> dict:
        return await self.user_repo.get_students_list(
            page=page,
            page_size=page_size,
            search=search,
            mentor_id=mentor_id,
        )

    async def get_mentors(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        return await self.user_repo.get_mentors_list(page=page, page_size=page_size, search=search)

    async def upload_avatar(self, user_id: int, file: UploadFile) -> User:
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        resized_bytes: bytes
        ext: str
        resized_bytes, ext = await AvatarTransformationService().transform(file)

        lifecycle: StorageLifecycleService = StorageLifecycleService(self.db, self.storage_service)
        old_photo: str | None = user.photo_path
        old_thumbnail: str | None = user.thumbnail_path

        filename: str = f"avatar.{ext}"
        new_path: str
        photo_intent: str
        new_path, photo_intent = await lifecycle.stage(resized_bytes, "avatar", user_id, filename)

        thumb_filename: str = f"avatar_thumb.{ext}"
        thumb_path: str
        thumbnail_intent: str
        thumb_path, thumbnail_intent = await lifecycle.stage(resized_bytes, "avatar", user_id, thumb_filename)

        user.photo_path = new_path
        user.thumbnail_path = thumb_path
        updated_user: User = await self.user_repo.update(user)
        await lifecycle.adopt(photo_intent)
        await lifecycle.adopt(thumbnail_intent)
        await lifecycle.delete_after_commit(old_photo)
        await lifecycle.delete_after_commit(old_thumbnail)
        await self.db.refresh(updated_user)
        return updated_user
