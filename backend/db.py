"""
CampusCare Universal Database Module
Supports Microsoft SQL Server (for local Windows development & Azure SQL)
with automatic seamless SQLite fallback (for Render / Cloud deployments).
"""
import os
import re
import sqlite3
from datetime import datetime, timezone, date
from decimal import Decimal
from contextlib import contextmanager
from werkzeug.security import generate_password_hash
from backend.config import Config, BASE_DIR

_ENGINE = None  # 'mssql' or 'sqlite'
SQLITE_DB_PATH = str(BASE_DIR / 'backend' / 'campuscare.db')

def dict_row(cursor, row):
    """Convert cursor row object into a clean JSON-serializable dictionary."""
    if row is None:
        return None
    d = {}
    for idx, col in enumerate(cursor.description):
        name = col[0]
        val = row[idx]
        if isinstance(val, (datetime, date)):
            d[name] = val.isoformat()
        elif isinstance(val, Decimal):
            d[name] = float(val)
        else:
            d[name] = val
    return d

def _datediff(unit, start, end):
    try:
        if isinstance(start, str):
            s = datetime.fromisoformat(start.replace('Z', '+00:00'))
        elif isinstance(start, (datetime, date)):
            s = start
        else:
            s = datetime.now(timezone.utc)
        if isinstance(end, str):
            e = datetime.fromisoformat(end.replace('Z', '+00:00'))
        elif isinstance(end, (datetime, date)):
            e = end
        else:
            e = datetime.now(timezone.utc)
        return int((e - s).total_seconds() // 3600)
    except Exception:
        return 0

def _ensure_sqlite_initialized():
    conn = sqlite3.connect(SQLITE_DB_PATH, timeout=30)
    cur = conn.cursor()
    try:
        cur.execute("PRAGMA journal_mode = WAL")
        cur.execute("PRAGMA busy_timeout = 30000")
    except Exception:
        pass
    cur.execute(f"ATTACH DATABASE '{SQLITE_DB_PATH}' AS dbo")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.Users (
        UserID INTEGER PRIMARY KEY AUTOINCREMENT,
        FullName TEXT NOT NULL,
        CollegeEmail TEXT NOT NULL UNIQUE,
        PasswordHash TEXT NOT NULL,
        Role TEXT NOT NULL CHECK (Role IN ('Student', 'Admin')),
        Department TEXT NOT NULL,
        Course TEXT NULL,
        Phone TEXT NULL,
        ProfileImage TEXT NULL,
        CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
    )""")

    # Self-migration: ensure ProfileImage column exists on Users table
    cur.execute("PRAGMA table_info(Users)")
    existing_cols = [col[1] for col in cur.fetchall()]
    if 'ProfileImage' not in existing_cols:
        try:
            cur.execute("ALTER TABLE Users ADD COLUMN ProfileImage TEXT NULL")
        except Exception:
            pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.Categories (
        CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
        CategoryName TEXT NOT NULL UNIQUE,
        SLA_Hours INTEGER NOT NULL DEFAULT 48
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.Complaints (
        ComplaintID INTEGER PRIMARY KEY AUTOINCREMENT,
        UserID INTEGER NOT NULL,
        CategoryID INTEGER NOT NULL,
        Title TEXT NOT NULL,
        Description TEXT NOT NULL,
        Location TEXT NOT NULL,
        Priority TEXT NOT NULL CHECK (Priority IN ('Low', 'Medium', 'High', 'Emergency')),
        Status TEXT NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'In Progress', 'Resolved', 'Rejected')),
        ImageAttachmentURL TEXT NULL,
        CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE,
        FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID)
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.ComplaintTimeline (
        LogID INTEGER PRIMARY KEY AUTOINCREMENT,
        ComplaintID INTEGER NOT NULL,
        UpdatedByUserID INTEGER NOT NULL,
        PreviousStatus TEXT NULL,
        NewStatus TEXT NOT NULL,
        Remarks TEXT NOT NULL,
        Timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        FOREIGN KEY (ComplaintID) REFERENCES Complaints(ComplaintID) ON DELETE CASCADE,
        FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID)
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.Feedback (
        FeedbackID INTEGER PRIMARY KEY AUTOINCREMENT,
        ComplaintID INTEGER NOT NULL UNIQUE,
        UserID INTEGER NOT NULL,
        Rating INTEGER NOT NULL CHECK (Rating BETWEEN 1 AND 5),
        Comments TEXT NULL,
        CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        FOREIGN KEY (ComplaintID) REFERENCES Complaints(ComplaintID) ON DELETE CASCADE,
        FOREIGN KEY (UserID) REFERENCES Users(UserID)
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS dbo.Notifications (
        NotificationID INTEGER PRIMARY KEY AUTOINCREMENT,
        ComplaintID INTEGER NOT NULL,
        Title TEXT NOT NULL,
        Message TEXT NOT NULL,
        Priority TEXT NOT NULL,
        CategoryName TEXT NULL,
        StudentName TEXT NULL,
        IsRead INTEGER NOT NULL DEFAULT 0,
        CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        FOREIGN KEY (ComplaintID) REFERENCES Complaints(ComplaintID) ON DELETE CASCADE
    )""")

    # Seed default Users if empty
    cur.execute("SELECT COUNT(*) FROM dbo.Users")
    if cur.fetchone()[0] == 0:
        cur.execute("""
        INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
        VALUES 
        ('Dr. Ramesh Sharma (Dean of Student Affairs)', 'admin@kiet.edu', ?, 'Admin', 'Campus Administration', 'Staff/Faculty', '9876543210', 'profile images/image2.jpg'),
        ('KIET System Admin', 'admin1@kiet.edu', ?, 'Admin', 'Information Technology', 'Staff/Faculty', '9876543211', 'profile images/image2.jpg'),
        ('Student Records Admin (Academic Office)', 'student.admin@kiet.edu', ?, 'Admin', 'Academic Affairs & Student Records', 'Staff/Faculty', '9876543299', 'profile images/image2.jpg'),
        ('Aarav Patel', 'student@kiet.edu', ?, 'Student', 'Computer Science & Engineering', 'B.Tech', '9876543212', 'profile images/image1.jpg')
        """, (
            generate_password_hash('Admin@123'),
            generate_password_hash('Admin@123'),
            generate_password_hash('Admin@123'),
            generate_password_hash('Student@123')
        ))
    else:
        cur.execute("""
            UPDATE Users
            SET ProfileImage = CASE 
                WHEN Role = 'Admin' THEN 'profile images/image2.jpg'
                ELSE 'profile images/image1.jpg'
            END
            WHERE ProfileImage IS NULL OR ProfileImage = '' OR ProfileImage LIKE 'https://images.unsplash.com%';
        """)
        # Ensure student.admin exists in SQLite
        cur.execute("SELECT 1 FROM dbo.Users WHERE CollegeEmail = 'student.admin@kiet.edu'")
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
                VALUES ('Student Records Admin (Academic Office)', 'student.admin@kiet.edu', ?, 'Admin', 'Academic Affairs & Student Records', 'Staff/Faculty', '9876543299', 'profile images/image2.jpg')
            """, (generate_password_hash('Admin@123'),))

    # Seed default Categories if empty
    cur.execute("SELECT COUNT(*) FROM dbo.Categories")
    if cur.fetchone()[0] == 0:
        categories = [
            ('Hostel', 48),
            ('Sanitation', 24),
            ('Infrastructure', 72),
            ('IT / Labs', 24),
            ('Mess/Canteen', 12),
            ('Electrical', 12),
            ('Road Issues', 72),
            ('Water Issues', 24),
            ('Parking', 72),
            ('Library & Academics', 24),
            ('Security & Safety', 12),
            ('Other Issues', 48)
        ]
        cur.executemany("INSERT INTO dbo.Categories (CategoryName, SLA_Hours) VALUES (?, ?)", categories)

    conn.commit()
    conn.close()

def get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    if os.getenv('DATABASE_ENGINE', '').lower() == 'sqlite':
        _ENGINE = 'sqlite'
        _ensure_sqlite_initialized()
        return _ENGINE

    try:
        import pyodbc
        conn_str = Config.get_connection_string()
        conn = pyodbc.connect(conn_str, timeout=2)
        try:
            cur = conn.cursor()
            cur.execute("""
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'ProfileImage')
                BEGIN
                    ALTER TABLE dbo.Users ADD ProfileImage NVARCHAR(500) NULL;
                END
            """)
            conn.commit()

            # Self-healing: Assign realistic portrait photo to existing users with NULL/empty avatar
            cur.execute("""
                UPDATE dbo.Users
                SET ProfileImage = CASE 
                    WHEN Role = 'Admin' THEN 'profile images/image2.jpg'
                    ELSE 'profile images/image1.jpg'
                END
                WHERE ProfileImage IS NULL OR ProfileImage = '' OR ProfileImage LIKE 'https://images.unsplash.com%';
            """)
            conn.commit()

            # Ensure student.admin exists in MSSQL
            cur.execute("""
                IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE CollegeEmail = 'student.admin@kiet.edu')
                BEGIN
                    INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
                    VALUES ('Student Records Admin (Academic Office)', 'student.admin@kiet.edu', ?, 'Admin', 'Academic Affairs & Student Records', 'Staff/Faculty', '9876543299', 'profile images/image2.jpg');
                END
            """, (generate_password_hash('Admin@123'),))
            conn.commit()
        except Exception:
            pass
        conn.close()
        _ENGINE = 'mssql'
    except Exception:
        _ENGINE = 'sqlite'
        _ensure_sqlite_initialized()
    return _ENGINE

def _adapt_sqlite_sql(query, params):
    params = list(params)
    # 1. DATEDIFF unquoted unit: DATEDIFF(hour, ...) -> DATEDIFF('hour', ...)
    query = re.sub(r'DATEDIFF\s*\(\s*([a-zA-Z_]\w*)\s*,', r"DATEDIFF('\1',", query, flags=re.IGNORECASE)

    # 2. OUTPUT INSERTED -> RETURNING
    output_match = re.search(r'OUTPUT\s+(.*?)\s+VALUES', query, re.IGNORECASE | re.DOTALL)
    if output_match:
        cols = output_match.group(1).replace('INSERTED.', '')
        query = re.sub(r'OUTPUT\s+.*?\s+VALUES', 'VALUES', query, flags=re.IGNORECASE | re.DOTALL)
        query = query.strip() + f' RETURNING {cols}'

    # 3. OFFSET ? ROWS FETCH NEXT ? ROWS ONLY -> LIMIT ? OFFSET ?
    if re.search(r'OFFSET\s+\?\s+ROWS\s+FETCH\s+NEXT\s+\?\s+ROWS\s+ONLY', query, re.IGNORECASE):
        query = re.sub(r'OFFSET\s+\?\s+ROWS\s+FETCH\s+NEXT\s+\?\s+ROWS\s+ONLY', 'LIMIT ? OFFSET ?', query, flags=re.IGNORECASE)
        if len(params) >= 2:
            params[-2], params[-1] = params[-1], params[-2]

    # 4. SELECT TOP (\d+) -> SELECT ... LIMIT \1
    if re.search(r'SELECT\s+TOP\s+\d+', query, re.IGNORECASE):
        query = re.sub(r'SELECT\s+TOP\s+(\d+)\s+(.*)', r'SELECT \2 LIMIT \1', query, flags=re.IGNORECASE | re.DOTALL)

    return query, tuple(params)

@contextmanager
def get_db_connection():
    engine = get_engine()
    if engine == 'sqlite':
        conn = sqlite3.connect(SQLITE_DB_PATH, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.create_function('DATEDIFF', 3, _datediff)
        conn.create_function('SYSUTCDATETIME', 0, lambda: datetime.now(timezone.utc).isoformat())
        cur = conn.cursor()
        cur.execute(f"ATTACH DATABASE '{SQLITE_DB_PATH}' AS dbo")
        try:
            yield conn
        finally:
            conn.close()
    else:
        import pyodbc
        conn_str = Config.get_connection_string()
        conn = pyodbc.connect(conn_str)
        try:
            yield conn
        finally:
            conn.close()

def query_db(query, params=(), one=False):
    engine = get_engine()
    if engine == 'sqlite':
        query, params = _adapt_sqlite_sql(query, params)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        if one:
            row = cursor.fetchone()
            return dict_row(cursor, row) if row else None
        else:
            rows = cursor.fetchall()
            return [dict_row(cursor, r) for r in rows]

def execute_db(query, params=(), commit=True):
    engine = get_engine()
    if engine == 'sqlite':
        query, params = _adapt_sqlite_sql(query, params)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = None
        try:
            if cursor.description:
                rows = cursor.fetchall()
                result = [dict_row(cursor, r) for r in rows]
        except Exception:
            result = None

        if commit:
            conn.commit()
        return result

def execute_transaction(operations):
    engine = get_engine()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        results = []
        try:
            for sql, params in operations:
                if engine == 'sqlite':
                    sql, params = _adapt_sqlite_sql(sql, params)
                cursor.execute(sql, params)
                try:
                    if cursor.description:
                        rows = cursor.fetchall()
                        results.append([dict_row(cursor, r) for r in rows])
                    else:
                        results.append(None)
                except Exception:
                    results.append(None)
            conn.commit()
            return results
        except Exception as e:
            conn.rollback()
            raise e

