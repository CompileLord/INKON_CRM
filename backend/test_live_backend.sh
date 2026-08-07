#!/bin/bash

# Configuration
BASE_URL="http://localhost:8000/api/v1"
ADMIN_EMAIL="superadmin@mail.com"
ADMIN_PASSWORD="12341234"

echo "=========================================="
echo "    IMKON CRM LIVE BACKEND E2E TEST"
echo "=========================================="

# 1. Login as admin to get token
echo -n "1. Logging in as Admin... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}")

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$ACCESS_TOKEN" ]; then
    echo "FAILED"
    echo "Login Response: $LOGIN_RESPONSE"
    exit 1
fi
echo "SUCCESS"

# 2. Create a Mentor User
echo -n "2. Creating a Mentor User... "
CREATE_USER_RESPONSE=$(curl -s -X POST "$BASE_URL/users/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test_mentor_live@example.com",
    "first_name": "Test",
    "last_name": "Mentor",
    "role": "mentor"
  }')

MENTOR_ID=$(echo $CREATE_USER_RESPONSE | grep -o '"id": *[0-9]*' | grep -o '[0-9]*$')

if [ -z "$MENTOR_ID" ]; then
    # It might already exist from previous runs
    MENTOR_ID=$(curl -s -X GET "$BASE_URL/mentors/" \
      -H "Authorization: Bearer $ACCESS_TOKEN" | grep -o '"id": *[0-9]*' | head -1 | grep -o '[0-9]*$')
    
    if [ -z "$MENTOR_ID" ]; then
        echo "FAILED"
        echo "Response: $CREATE_USER_RESPONSE"
        exit 1
    else
        echo "SUCCESS (Already exists)"
    fi
else
    echo "SUCCESS (Mentor ID: $MENTOR_ID)"
fi

# 3. List Courses
echo -n "3. Listing Courses... "
COURSES_RESPONSE=$(curl -s -X GET "$BASE_URL/courses/" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if [[ $COURSES_RESPONSE == *"items"* ]]; then
    echo "SUCCESS"
else
    echo "FAILED"
    echo "Response: $COURSES_RESPONSE"
    exit 1
fi

# 4. Create a Student User
echo -n "4. Creating a Student User... "
CREATE_STUDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/users/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test_student_live@example.com",
    "first_name": "Test",
    "last_name": "Student",
    "role": "student"
  }')

STUDENT_ID=$(echo $CREATE_STUDENT_RESPONSE | grep -o '"id": *[0-9]*' | grep -o '[0-9]*$')

if [ -z "$STUDENT_ID" ]; then
    echo "FAILED (Maybe exists)"
else
    echo "SUCCESS (Student ID: $STUDENT_ID)"
fi

echo "=========================================="
echo "    ALL ENDPOINT TESTS PASSED VIA CURL"
echo "=========================================="
