"""
CampusCare Database Initializer
Creates the database, executes schema DDL, and populates initial seed data.
"""
import os
import sys
import pyodbc
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_SERVER = os.getenv('DB_SERVER', 'localhost')
DB_NAME = os.getenv('DB_NAME', 'CampusCareDB')
DB_DRIVER = os.getenv('DB_DRIVER', 'ODBC Driver 18 for SQL Server')
DB_TRUSTED = os.getenv('DB_TRUSTED_CONNECTION', 'yes')
DB_TRUST_CERT = os.getenv('DB_TRUST_SERVER_CERTIFICATE', 'yes')
DB_USER = os.getenv('DB_USER', '')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

def get_connection_string(db_name='master'):
    # Detect available driver if specified driver isn't installed
    available_drivers = pyodbc.drivers()
    driver = DB_DRIVER
    if driver not in available_drivers:
        for fallback in ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server', 'SQL Server']:
            if fallback in available_drivers:
                driver = fallback
                break

    parts = [f"Driver={{{driver}}}", f"Server={DB_SERVER}", f"Database={db_name}"]
    if DB_TRUSTED.lower() in ('yes', 'true', '1'):
        parts.append("Trusted_Connection=yes")
    else:
        parts.append(f"UID={DB_USER}")
        parts.append(f"PWD={DB_PASSWORD}")

    if DB_TRUST_CERT.lower() in ('yes', 'true', '1'):
        parts.append("TrustServerCertificate=yes")

    return ";".join(parts) + ";"

def init_database():
    print(f"[*] Connecting to SQL Server on {DB_SERVER}...")
    master_conn_str = get_connection_string('master')
    
    try:
        conn = pyodbc.connect(master_conn_str, autocommit=True)
        cursor = conn.cursor()
        
        # Check / Create Database
        cursor.execute("SELECT name FROM sys.databases WHERE name = ?", (DB_NAME,))
        exists = cursor.fetchone()
        if not exists:
            print(f"[*] Creating database '{DB_NAME}'...")
            cursor.execute(f"CREATE DATABASE [{DB_NAME}]")
            print(f"[+] Database '{DB_NAME}' created successfully.")
        else:
            print(f"[+] Database '{DB_NAME}' already exists.")
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[-] Error connecting to master database: {e}")
        sys.exit(1)

    # Now connect to CampusCareDB to apply schema
    db_conn_str = get_connection_string(DB_NAME)
    try:
        conn = pyodbc.connect(db_conn_str, autocommit=True)
        cursor = conn.cursor()
        print(f"[*] Connected to [{DB_NAME}]. Applying schema...")

        # Read schema.sql
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        with open(schema_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        # Split into GO batches
        batches = [b.strip() for b in sql_content.split('GO') if b.strip()]
        for batch in batches:
            # Skip USE or CREATE DATABASE statements since we handled them
            clean_batch = batch.strip()
            if clean_batch.upper().startswith('CREATE DATABASE') or clean_batch.upper().startswith('USE '):
                continue
            try:
                cursor.execute(batch)
            except Exception as batch_err:
                # If table already exists or minor seed conflict, print info
                print(f"[~] Batch info: {batch_err}")

        print("[+] Schema batches applied successfully.")

        # Migrate existing users if any were registered with legacy domain
        cursor.execute("UPDATE dbo.Users SET CollegeEmail = REPLACE(CollegeEmail, '@campuscare.edu', '@kiet.edu') WHERE CollegeEmail LIKE '%@campuscare.edu'")

        # Seed initial admin and student accounts if not present
        admin_email = "admin@kiet.edu"
        cursor.execute("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (admin_email,))
        if not cursor.fetchone():
            admin_pwd_hash = generate_password_hash("Admin@123")
            cursor.execute("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Phone)
                VALUES (?, ?, ?, 'Admin', 'Campus Administration', '+91 9876543210')
            """, ("Dr. Ramesh Sharma (Dean of Student Affairs)", admin_email, admin_pwd_hash))
            print(f"[+] Seeded Admin: {admin_email} (Password: Admin@123)")

        student_email = "student@kiet.edu"
        cursor.execute("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (student_email,))
        if not cursor.fetchone():
            student_pwd_hash = generate_password_hash("Student@123")
            cursor.execute("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Phone)
                VALUES (?, ?, ?, 'Student', 'Computer Science & Engineering', '+91 9123456780')
            """, ("Aarav Patel", student_email, student_pwd_hash))
            print(f"[+] Seeded Student: {student_email} (Password: Student@123)")

        # Additional sample student for multi-user visualization
        student2_email = "priya.sharma@kiet.edu"
        cursor.execute("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (student2_email,))
        if not cursor.fetchone():
            student2_pwd_hash = generate_password_hash("Student@123")
            cursor.execute("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Phone)
                VALUES (?, ?, ?, 'Student', 'Electronics & Communication', '+91 9988776655')
            """, ("Priya Sharma", student2_email, student2_pwd_hash))
            print(f"[+] Seeded Student: {student2_email} (Password: Student@123)")

        # Query user IDs for complaint seeds
        cursor.execute("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (student_email,))
        std_row = cursor.fetchone()
        std1_id = std_row[0] if std_row else 1

        cursor.execute("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (admin_email,))
        adm_row = cursor.fetchone()
        adm_id = adm_row[0] if adm_row else 1

        # Query Category IDs
        cursor.execute("SELECT CategoryID, CategoryName FROM dbo.Categories")
        cat_map = {row[1]: row[0] for row in cursor.fetchall()}

        # Check if complaints exist
        cursor.execute("SELECT COUNT(*) FROM dbo.Complaints")
        complaint_count = cursor.fetchone()[0]

        if complaint_count == 0:
            print("[*] Seeding sample grievance cases...")
            # Complaint 1: In Progress IT issue
            cursor.execute("""
                INSERT INTO dbo.Complaints (UserID, CategoryID, Title, Description, Location, Priority, Status, ImageAttachmentURL)
                OUTPUT INSERTED.ComplaintID
                VALUES (?, ?, ?, ?, ?, 'High', 'In Progress', NULL)
            """, (
                std1_id,
                cat_map.get('IT / Labs', 4),
                "Core Switch Down in Lab 302",
                "Ethernet ports on rows 3 and 4 are not providing network access. Affecting the ongoing distributed systems practicals.",
                "Academic Block B, Lab 302",
            ))
            c1_id = cursor.fetchone()[0]
            cursor.execute("""
                INSERT INTO dbo.ComplaintTimeline (ComplaintID, UpdatedByUserID, PreviousStatus, NewStatus, Remarks)
                VALUES 
                (?, ?, NULL, 'Pending', 'Complaint submitted via Student Web Portal.'),
                (?, ?, 'Pending', 'In Progress', 'Network engineering team dispatched with replacement Cisco Catalyst switch.')
            """, (c1_id, std1_id, c1_id, adm_id))

            # Complaint 2: Resolved Electrical issue
            cursor.execute("""
                INSERT INTO dbo.Complaints (UserID, CategoryID, Title, Description, Location, Priority, Status, ImageAttachmentURL)
                OUTPUT INSERTED.ComplaintID
                VALUES (?, ?, ?, ?, ?, 'Emergency', 'Resolved', NULL)
            """, (
                std1_id,
                cat_map.get('Electrical', 6),
                "Sparking MCB in Corridor Junction Box",
                "Frequent sparking and burning smell from the main electrical junction panel near the emergency exit.",
                "Hostel Block 4, 2nd Floor Corridor",
            ))
            c2_id = cursor.fetchone()[0]
            cursor.execute("""
                INSERT INTO dbo.ComplaintTimeline (ComplaintID, UpdatedByUserID, PreviousStatus, NewStatus, Remarks)
                VALUES 
                (?, ?, NULL, 'Pending', 'Emergency alert logged.'),
                (?, ?, 'Pending', 'In Progress', 'Main power isolated, licensed electrician assigned immediately.'),
                (?, ?, 'In Progress', 'Resolved', 'Faulty 63A MCB replaced and thermal scan verified safe.')
            """, (c2_id, std1_id, c2_id, adm_id, c2_id, adm_id))

            # Feedback for Complaint 2
            cursor.execute("""
                INSERT INTO dbo.Feedback (ComplaintID, UserID, Rating, Comments)
                VALUES (?, ?, 5, 'Super prompt response! The electrician arrived within 15 minutes and fixed it safely.')
            """, (c2_id, std1_id))

            # Complaint 3: Pending Hostel Sanitation issue
            cursor.execute("""
                INSERT INTO dbo.Complaints (UserID, CategoryID, Title, Description, Location, Priority, Status, ImageAttachmentURL)
                OUTPUT INSERTED.ComplaintID
                VALUES (?, ?, ?, ?, ?, 'Medium', 'Pending', NULL)
            """, (
                std1_id,
                cat_map.get('Sanitation', 2),
                "Water Pressure Drop on 3rd Floor Washrooms",
                "Low water pressure during morning hours between 7 AM and 9 AM in the west-wing washroom.",
                "Ramanujan Hostel, 3rd Floor West",
            ))
            c3_id = cursor.fetchone()[0]
            cursor.execute("""
                INSERT INTO dbo.ComplaintTimeline (ComplaintID, UpdatedByUserID, PreviousStatus, NewStatus, Remarks)
                VALUES (?, ?, NULL, 'Pending', 'Ticket logged. Awaiting plumbing supervisor allocation.')
            """, (c3_id, std1_id))

            print("[+] Sample complaints, timelines, and feedback successfully seeded.")

        cursor.close()
        conn.close()
        print("\n===========================================================")
        print(" [SUCCESS] CampusCareDB database initialized successfully! ")
        print("===========================================================")
        print("Default Accounts:")
        print(" - Admin:   admin@kiet.edu   / Admin@123")
        print(" - Student: student@kiet.edu / Student@123")
        print("===========================================================\n")
    except Exception as e:
        print(f"[-] Error initializing database: {e}")
        sys.exit(1)

if __name__ == '__main__':
    init_database()
