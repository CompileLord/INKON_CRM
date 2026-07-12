from typing import List, Optional
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.user import UserCreate, UserUpdate
from app.services.auth_service import AuthService


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = SQLAlchemyUserRepository(db)

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
            payment_day_of_month=user_create.payment_day_of_month,
            must_set_password=True
        )
        created_user = await self.user_repo.create(user)

        auth_service = AuthService(self.db)
        await auth_service.generate_verification_code(user.email)

        return created_user

    async def update_user(self, user_id: int, user_update: UserUpdate) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if user_update.email and user_update.email != user.email:
            existing_user = await self.user_repo.get_by_email(user_update.email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User with this email already exists"
                )
            user.email = user_update.email
            user.must_set_password = True
            auth_service = AuthService(self.db)
            await auth_service.generate_verification_code(user.email)

        if user_update.first_name is not None:
            user.first_name = user_update.first_name
        if user_update.last_name is not None:
            user.last_name = user_update.last_name
        if user_update.date_of_birth is not None:
            user.date_of_birth = user_update.date_of_birth
        if user_update.phone is not None:
            user.phone = user_update.phone
        if user_update.parent_telegram_chat_id is not None:
            user.parent_telegram_chat_id = user_update.parent_telegram_chat_id
        if user_update.payment_day_of_month is not None:
            if user.role != UserRole.STUDENT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Payment day of month can only be set for students"
                )
            user.payment_day_of_month = user_update.payment_day_of_month

        return await self.user_repo.update(user)

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
        search: Optional[str] = None
    ) -> dict:
        return await self.user_repo.get_students_list(page=page, page_size=page_size, search=search)

    async def get_mentors(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> dict:
        return await self.user_repo.get_mentors_list(page=page, page_size=page_size, search=search)

    async def upload_avatar(self, user_id: int, file: UploadFile) -> User:
        from fastapi import UploadFile
        from PIL import Image
        import io
        from app.services.storage_service import LocalStorageService

        user = await self.user_repo.get_by_id(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if file.size and file.size > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Avatar size exceeds the 5MB limit"
            )

        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Avatar size exceeds the 5MB limit"
            )
        try:
            image = Image.open(io.BytesIO(content))
            image.verify()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image file"
            )

        image = Image.open(io.BytesIO(content))
        if image.format not in ["PNG", "JPEG"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported image format. PNG or JPEG only."
            )

        image.thumbnail((200, 200))

        out_io = io.BytesIO()
        image.save(out_io, format=image.format)
        resized_bytes = out_io.getvalue()

        storage_service = LocalStorageService()
        if user.photo_path:
            await storage_service.delete(user.photo_path)

        ext = "png" if image.format == "PNG" else "jpg"
        filename = f"avatar.{ext}"
        new_path = await storage_service.save(resized_bytes, "avatar", user_id, filename)

        user.photo_path = new_path
        updated_user = await self.user_repo.update(user)
        await self.db.refresh(updated_user)
        return updated_user
