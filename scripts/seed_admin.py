import asyncio
import sys
import argparse
import re
from getpass import getpass
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password

def validate_email(email: str) -> bool:
    # Basic email regex validation
    return bool(re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email))

async def main():
    parser = argparse.ArgumentParser(description="Interactive terminal script to seed a superadmin user into the database.")
    parser.add_argument("--email", help="Email address of the superadmin.")
    parser.add_argument("--password", help="Password of the superadmin (minimum 8 characters).")
    parser.add_argument("--first-name", help="First name of the superadmin.")
    parser.add_argument("--last-name", help="Last name of the superadmin.")
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Run in non-interactive mode. Errors out if required values are missing."
    )
    
    args = parser.parse_args()
    
    # 1. First Name
    first_name = args.first_name
    if not first_name:
        if args.non_interactive:
            first_name = "Admin"
        else:
            first_name = input("Enter First Name [Admin]: ").strip() or "Admin"
            
    # 2. Last Name
    last_name = args.last_name
    if not last_name:
        if args.non_interactive:
            last_name = "Super"
        else:
            last_name = input("Enter Last Name [Super]: ").strip() or "Super"
            
    # 3. Email
    email = args.email
    if not email:
        if args.non_interactive:
            print("Error: --email is required in non-interactive mode.", file=sys.stderr)
            sys.exit(1)
        else:
            while True:
                email = input("Enter Email: ").strip()
                if not email:
                    print("Email cannot be empty. Please try again.")
                    continue
                if not validate_email(email):
                    print("Invalid email format. Please try again.")
                    continue
                break
    else:
        if not validate_email(email):
            print(f"Error: Invalid email format: {email}", file=sys.stderr)
            sys.exit(1)
            
    # 4. Password
    password = args.password
    if not password:
        if args.non_interactive:
            print("Error: --password is required in non-interactive mode.", file=sys.stderr)
            sys.exit(1)
        else:
            while True:
                p1 = getpass("Enter Password: ")
                if not p1:
                    print("Password cannot be empty.")
                    continue
                if len(p1) < 8:
                    print("Password must be at least 8 characters long.")
                    continue
                p2 = getpass("Confirm Password: ")
                if p1 != p2:
                    print("Passwords do not match. Please try again.")
                    continue
                password = p1
                break
    else:
        if len(password) < 8:
            print("Error: Password must be at least 8 characters long.", file=sys.stderr)
            sys.exit(1)

    print(f"\nSeeding superadmin: {first_name} {last_name} ({email})...")
    
    try:
        async with AsyncSessionLocal() as session:
            # Check if user already exists
            query = select(User).filter(User.email == email)
            result = await session.execute(query)
            existing_user = result.scalars().first()
            
            if existing_user:
                print(f"Error: User with email '{email}' already exists!", file=sys.stderr)
                sys.exit(1)
                
            admin_user = User(
                email=email,
                password_hash=hash_password(password),
                first_name=first_name,
                last_name=last_name,
                role=UserRole.SUPERADMIN,
                must_set_password=False
            )
            
            session.add(admin_user)
            await session.commit()
            print("Superadmin user successfully created!")
            print(f"Email: {email}")
    except Exception as e:
        print(f"Database error occurred: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
