import os
import io
import pytest
from httpx import AsyncClient
from PIL import Image
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_avatar_upload_and_thumbnail(client: AsyncClient, test_admin: User, test_student: User, test_mentor: User) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create 300x400 PNG image (non-square to test aspect ratio preservation)
    img_io = io.BytesIO()
    image = Image.new("RGB", (300, 400), color="blue")
    image.save(img_io, format="PNG")
    png_content = img_io.getvalue()

    # 1. Admin uploads avatar for student -> verify 200
    response = await client.post(
        f"/api/v1/users/{test_student.id}/avatar/",
        files={"file": ("test.png", png_content, "image/png")},
        headers=admin_headers
    )
    assert response.status_code == 200
    user_data = response.json()
    photo_path1 = user_data["photo_path"]
    assert photo_path1 is not None

    # Check generated image dimensions on disk
    # The storage path is inside settings.STORAGE_PATH (i.e. 'storage')
    disk_path1 = os.path.join("storage", photo_path1.removeprefix("/storage/"))
    assert os.path.exists(disk_path1)

    disk_image1 = Image.open(disk_path1)
    # Target size was max 200x200. Since original is 300x400 (aspect ratio 3:4),
    # target height 200 means width becomes 150.
    assert disk_image1.size == (150, 200)

    # 2. Upload second avatar to verify old asset cleanup
    img_io2 = io.BytesIO()
    image2 = Image.new("RGB", (100, 100), color="red")
    image2.save(img_io2, format="JPEG")
    jpg_content = img_io2.getvalue()

    response2 = await client.post(
        f"/api/v1/users/{test_student.id}/avatar/",
        files={"file": ("new.jpg", jpg_content, "image/jpeg")},
        headers=admin_headers
    )
    assert response2.status_code == 200
    photo_path2 = response2.json()["photo_path"]

    # Verify old file disk_path1 was deleted
    assert not os.path.exists(disk_path1)
    disk_path2 = os.path.join("storage", photo_path2.removeprefix("/storage/"))
    assert os.path.exists(disk_path2)

    # 3. Try to upload txt file renamed to .png -> verify 400
    response_txt = await client.post(
        f"/api/v1/users/{test_student.id}/avatar/",
        files={"file": ("spoof.png", b"this is text content", "image/png")},
        headers=admin_headers
    )
    assert response_txt.status_code == 400

    # 4. Try to upload unsupported format (GIF) -> verify 400
    gif_io = io.BytesIO()
    image_gif = Image.new("RGB", (50, 50), color="green")
    image_gif.save(gif_io, format="GIF")
    gif_content = gif_io.getvalue()
    response_gif = await client.post(
        f"/api/v1/users/{test_student.id}/avatar/",
        files={"file": ("test.gif", gif_content, "image/gif")},
        headers=admin_headers
    )
    assert response_gif.status_code == 400

    # 5. Access control check: student cannot upload avatar for mentor -> verify 403
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}
    response_rbac = await client.post(
        f"/api/v1/users/{test_mentor.id}/avatar/",
        files={"file": ("test.png", png_content, "image/png")},
        headers=student_headers
    )
    assert response_rbac.status_code == 403

    # Clean up at end
    if os.path.exists(disk_path2):
        os.remove(disk_path2)
