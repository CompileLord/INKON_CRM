import pytest
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_upload_document_flow(client: AsyncClient, test_admin: User, test_student: User, test_mentor: User) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Upload valid PDF
    pdf_content = b"%PDF-1.5\n%EOF"
    response = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("test.pdf", pdf_content, "application/pdf")},
        headers=admin_headers
    )
    assert response.status_code == 201
    doc_data = response.json()
    assert doc_data["file_name"] == "test.pdf"
    assert doc_data["file_type"] == "application/pdf"
    assert doc_data["file_size"] == len(pdf_content)

    doc_id = doc_data["id"]

    # 2. Try upload 51MB file -> verify 413
    large_content = b"a" * (51 * 1024 * 1024)
    response_large = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("large.pdf", large_content, "application/pdf")},
        headers=admin_headers
    )
    assert response_large.status_code == 413

    # 3. Try upload text file renamed to .pdf -> verify magic bytes validation blocks it (400)
    spoofed_content = b"hello world this is not a pdf file"
    response_spoofed = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("spoofed.pdf", spoofed_content, "application/pdf")},
        headers=admin_headers
    )
    assert response_spoofed.status_code == 400

    # 4. Access Matrix: Student GET should only see own
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    list_resp = await client.get("/api/v1/documents/", headers=student_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()["items"]) == 1

    # Mentor GET should be able to see student's document
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}

    list_resp_m = await client.get("/api/v1/documents/", headers=mentor_headers)
    assert list_resp_m.status_code == 200
    assert len(list_resp_m.json()["items"]) == 1

    # Student tries to DELETE -> verify 403
    del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=student_headers)
    assert del_resp.status_code == 403

    # Admin DELETES -> verify 204
    del_resp_admin = await client.delete(f"/api/v1/documents/{doc_id}", headers=admin_headers)
    assert del_resp_admin.status_code == 204
