import pytest
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User

def get_auth_headers(user: User):
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
class TestUsersEndpointGroup:
    async def test_superadmin_can_create_users(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.post("/api/v1/users/", json={
            "email": "new_admin_user@example.com",
            "first_name": "New",
            "last_name": "AdminUser",
            "role": "student"
        }, headers=headers)
        assert res.status_code == 201

    async def test_mentor_cannot_create_users(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.post("/api/v1/users/", json={
            "email": "mentor_bad_create@example.com",
            "first_name": "New",
            "last_name": "MentorUser",
            "role": "student"
        }, headers=headers)
        assert res.status_code == 403

    async def test_student_cannot_create_users(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.post("/api/v1/users/", json={
            "email": "student_bad_create@example.com",
            "first_name": "New",
            "last_name": "StudentUser",
            "role": "student"
        }, headers=headers)
        assert res.status_code == 403

@pytest.mark.asyncio
class TestCoursesEndpointGroup:
    async def test_superadmin_can_manage_courses(self, client: AsyncClient, test_admin: User, test_mentor: User):
        headers = get_auth_headers(test_admin)
        # Create course
        res = await client.post("/api/v1/courses/", json={
            "title": "Admin Course",
            "description": "Admin Course Desc",
            "start_date": "2025-01-01",
            "end_date": "2025-03-01",
            "exam_type": "weekly",
            "price": 1000.0,
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        }, headers=headers)
        assert res.status_code == 201
        
        # List courses
        res = await client.get("/api/v1/courses/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_can_list_courses(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/courses/", headers=headers)
        assert res.status_code == 200
        
        # Mentor cannot create courses
        res = await client.post("/api/v1/courses/", json={
            "title": "Mentor Course",
            "description": "Mentor Course Desc",
            "start_date": "2025-01-01",
            "end_date": "2025-03-01",
            "exam_type": "weekly",
            "price": 1000.0,
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        }, headers=headers)
        assert res.status_code == 403

    async def test_student_can_list_courses(self, client: AsyncClient, test_student: User, test_mentor: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/courses/", headers=headers)
        assert res.status_code == 200
        
        # Student cannot create courses
        res = await client.post("/api/v1/courses/", json={
            "title": "Student Course",
            "description": "Student Course Desc",
            "start_date": "2025-01-01",
            "end_date": "2025-03-01",
            "exam_type": "weekly",
            "price": 1000.0,
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        }, headers=headers)
        assert res.status_code == 403

@pytest.mark.asyncio
class TestMentorsEndpointGroup:
    async def test_superadmin_can_manage_mentors(self, client: AsyncClient, test_admin: User, test_mentor: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/mentors/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_can_access_own_profile(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/mentors/me/profile", headers=headers)
        assert res.status_code == 200

    async def test_student_cannot_list_mentors(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/mentors/", headers=headers)
        assert res.status_code == 403

@pytest.mark.asyncio
class TestStudentsEndpointGroup:
    async def test_superadmin_can_list_students(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/students/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_can_list_students(self, client: AsyncClient, test_mentor: User):
        # Mentors typically can see students
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/students/", headers=headers)
        assert res.status_code == 200

    async def test_student_can_access_own_profile(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/students/me/profile", headers=headers)
        assert res.status_code == 200

@pytest.mark.asyncio
class TestEnrollmentsEndpointGroup:
    async def test_superadmin_can_manage_enrollments(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/enrollments/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_cannot_list_enrollments(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/enrollments/", headers=headers)
        assert res.status_code == 403

    async def test_student_cannot_list_enrollments(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/enrollments/", headers=headers)
        assert res.status_code == 403

@pytest.mark.asyncio
class TestFinanceEndpointGroup:
    async def test_superadmin_can_access_finance(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/finance/payments/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_cannot_access_finance(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/finance/payments/", headers=headers)
        assert res.status_code == 403

    async def test_student_cannot_access_finance(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/finance/payments/", headers=headers)
        assert res.status_code == 403

@pytest.mark.asyncio
class TestDocumentsEndpointGroup:
    async def test_superadmin_can_access_documents(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/documents/", headers=headers)
        assert res.status_code == 200

    async def test_mentor_can_access_documents(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/documents/", headers=headers)
        assert res.status_code == 200

    async def test_student_can_access_documents(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/documents/", headers=headers)
        assert res.status_code == 200

@pytest.mark.asyncio
class TestJournalsEndpointGroup:
    async def test_superadmin_can_access_journals(self, client: AsyncClient, test_admin: User):
        headers = get_auth_headers(test_admin)
        res = await client.get("/api/v1/journals/9999", headers=headers)
        assert res.status_code == 404

    async def test_mentor_can_access_journals(self, client: AsyncClient, test_mentor: User):
        headers = get_auth_headers(test_mentor)
        res = await client.get("/api/v1/journals/9999", headers=headers)
        assert res.status_code == 404

    async def test_student_cannot_access_journals(self, client: AsyncClient, test_student: User):
        headers = get_auth_headers(test_student)
        res = await client.get("/api/v1/journals/9999", headers=headers)
        assert res.status_code in [403, 404] # Depending on if 404 is thrown before 403
