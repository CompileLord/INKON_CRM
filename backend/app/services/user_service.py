import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from typing import Awaitable, ClassVar, List, Optional, Sequence

from PIL import Image
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.email_normalizer import EmailNormalizer
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.common import CanonicalPhonePolicy
from app.schemas.user import UserCreate, UserUpdate, UserSelfUpdate
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.auth_composition import AuthServiceComposition
from app.services.credentials_channel import CredentialsChannel
from app.services.credentials_delivery_service import CredentialsDelivery, CredentialsDeliveryService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.services.telegram_link_service import IssuedLinkCode, TelegramLinkService
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.sms.messages import PasswordSmsReason
from app.services.student_password_sms_service import StudentPasswordSmsDestinationResolver
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
        created_user: User
        created_user, _, _ = await self.create_user_with_link_code(user_create)
        return created_user

    async def create_user_with_link_code(
        self,
        user_create: UserCreate,
        actor_id: int | None = None,
    ) -> tuple[User, IssuedLinkCode | None, CredentialsDelivery]:
        user_create.email = EmailNormalizer.normalize_optional(user_create.email)
        self._require_email_when_disabled(user_create.email)
        if user_create.role == UserRole.STUDENT and not user_create.email:
            StudentPasswordSmsDestinationResolver().reject_undeliverable_contacts(user_create.phone, user_create.parent_phone)
        await self._reject_taken_contacts(user_create.email, user_create.phone, None)

        if user_create.payment_day_of_month is not None and user_create.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment day of month can only be set for students"
            )

        user: User = User(
            email=user_create.email,
            preferred_language=user_create.preferred_language,
            first_name=user_create.first_name,
            last_name=user_create.last_name,
            role=user_create.role,
            date_of_birth=user_create.date_of_birth,
            phone=user_create.phone,
            parent_phone=user_create.parent_phone,
            payment_day_of_month=user_create.payment_day_of_month,
            must_set_password=True
        )
        created_user: User = await self._persist_unique(self.user_repo.create(user))

        issued_link_code: IssuedLinkCode | None = None
        if created_user.role == UserRole.STUDENT:
            issued_link_code = await TelegramLinkService(self.db).issue_code(created_user, None)

        delivery: CredentialsDelivery = await CredentialsDeliveryService(self.db).deliver(
            created_user, PasswordSmsReason.INITIAL, None, actor_id, enforce_rate_limits=False
        )
        await AuditService(self.db).log_change(
            actor_id, "create", "user", created_user.id,
            f"{created_user.first_name} {created_user.last_name}",
            user_create.model_fields_set & {"first_name", "last_name", "email", "phone", "role", "parent_phone", "date_of_birth", "payment_day_of_month"},
        )
        await self.db.refresh(created_user)

        return created_user, issued_link_code, delivery

    async def update_user(self, user_id: int, user_update: UserUpdate, actor_id: int | None = None) -> User:
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
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

        if "email" in user_update.model_fields_set:
            user_update.email = EmailNormalizer.normalize_optional(user_update.email)
            self._require_email_when_disabled(user_update.email)

        audited_fields: set[str] = {"first_name", "last_name", "email", "phone", "parent_phone", "date_of_birth", "payment_day_of_month", "role"}
        previous_values: dict[str, object] = {field: getattr(user, field) for field in audited_fields}
        previous_email: str | None = user.email
        email_changed: bool = "email" in user_update.model_fields_set and user_update.email != EmailNormalizer.normalize_optional(user.email)
        if email_changed:
            if user_update.email is None and user.role != UserRole.STUDENT:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="An email is required for this role",
                )
            if user_update.email is not None:
                await self._reject_taken_contacts(user_update.email, None, user.id)
            user.email = user_update.email

        if user_update.first_name is not None:
            user.first_name = user_update.first_name
        if user_update.last_name is not None:
            user.last_name = user_update.last_name
        await self.apply_optional_profile_fields(user, user_update)
        if "payment_day_of_month" in user_update.model_fields_set:
            user.payment_day_of_month = user_update.payment_day_of_month

        updated_user: User = await self._persist_unique(self.user_repo.update(user))
        if email_changed:
            await self._react_to_email_change(updated_user, previous_email, actor_id)
        await AuditService(self.db).log_change(
            actor_id, "update", "user", updated_user.id,
            f"{updated_user.first_name} {updated_user.last_name}",
            {field: (previous_values[field], getattr(updated_user, field)) for field in audited_fields if previous_values[field] != getattr(updated_user, field)},
        )
        await self.db.refresh(updated_user)
        return updated_user

    @staticmethod
    def _require_email_when_disabled(email: str | None) -> None:
        if not email and not settings.ALLOW_EMAILLESS_USERS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email is required until email-less users are enabled",
            )

    async def _react_to_email_change(self, user: User, previous_email: str | None, actor_id: int | None) -> None:
        if user.must_set_password:
            await CredentialsDeliveryService(self.db).deliver(
                user, PasswordSmsReason.INITIAL, None, actor_id, enforce_rate_limits=False
            )

    async def resend_credentials(
        self, user_id: int, actor_id: int, requested_channel: CredentialsChannel | None
    ) -> CredentialsDelivery:
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return await CredentialsDeliveryService(self.db).deliver(
            user, PasswordSmsReason.RESET, requested_channel, actor_id, enforce_rate_limits=True
        )

    async def _reject_taken_contacts(self, email: str | None, phone: str | None, own_id: int | None) -> None:
        if email:
            email_owner: User | None = await self.user_repo.get_by_email(email)
            if email_owner is not None and email_owner.id != own_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this email already exists")
        if phone:
            phone_owner: User | None = await self.user_repo.get_by_phone(phone)
            if phone_owner is not None and phone_owner.id != own_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this phone already exists")

    async def _persist_unique(self, persistence: Awaitable[User]) -> User:
        try:
            return await persistence
        except IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="User with this email or phone already exists"
            ) from None

    async def list_password_sms_deliveries(
        self,
        statuses: list[OutboxEventStatus],
        user_id: int | None,
        limit: int,
    ) -> list[OutboxEvent]:
        events: Sequence[OutboxEvent] = await SQLAlchemyOutboxRepository(self.db).list_by_kind(
            OutboxEventKind.STUDENT_PASSWORD_SMS, statuses, limit, user_id
        )
        return list(events)

    async def update_own_profile(self, user_id: int, user_update: UserSelfUpdate) -> User:
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if user_update.first_name is not None:
            user.first_name = user_update.first_name
        if user_update.last_name is not None:
            user.last_name = user_update.last_name
        await self.apply_optional_profile_fields(user, user_update)

        updated_user = await self._persist_unique(self.user_repo.update(user))
        await self.db.refresh(updated_user)
        return updated_user

    async def apply_optional_profile_fields(self, user: User, user_update: UserUpdate | UserSelfUpdate) -> None:
        if "preferred_language" in user_update.model_fields_set:
            user.preferred_language = user_update.preferred_language
        previous_destination_phone: str | None = user.phone or user.parent_phone
        if "date_of_birth" in user_update.model_fields_set:
            user.date_of_birth = user_update.date_of_birth
        if "phone" in user_update.model_fields_set:
            if user_update.phone is not None and user_update.phone != user.phone:
                await self._reject_taken_contacts(None, user_update.phone, user.id)
            user.phone = user_update.phone
        if "parent_phone" in user_update.model_fields_set:
            if not CanonicalPhonePolicy.are_equivalent(user.parent_phone, user_update.parent_phone):
                user.parent_telegram_chat_id = None
            user.parent_phone = user_update.parent_phone
        if user.role == UserRole.STUDENT and not (user.email or user.phone):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A student requires an email or their own phone to log in; a parent phone alone is not enough",
            )
        contacts_changed: bool = "phone" in user_update.model_fields_set or "parent_phone" in user_update.model_fields_set
        if user.role == UserRole.STUDENT and not user.email and contacts_changed:
            StudentPasswordSmsDestinationResolver().reject_undeliverable_contacts(user.phone, user.parent_phone)
        if previous_destination_phone != (user.phone or user.parent_phone):
            user.pending_password_hash = None
            user.pending_password_expires_at = None

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
            await AuditService(self.db).log_change(
                current_user_id, "delete", "user", user.id,
                f"{user.first_name} {user.last_name}", {"is_deleted"},
            )
            auth_service: AuthService = AuthServiceComposition.create(self.db)
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
