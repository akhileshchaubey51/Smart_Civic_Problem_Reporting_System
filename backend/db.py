"""
CampusCare Universal Database Module
Supports Microsoft SQL Server (for local Windows development & Azure SQL)
with automatic seamless SQLite fallback (for Render / Cloud deployments).
"""
import os
import re
import sqlite3
import threading
from datetime import datetime, timezone, date
from decimal import Decimal
from contextlib import contextmanager
from werkzeug.security import generate_password_hash
from backend.config import Config, BASE_DIR

_ENGINE = None  # 'mysql', 'mssql', or 'sqlite'
_INIT_LOCK = threading.RLock()
SQLITE_DB_PATH = str(BASE_DIR / 'backend' / 'campuscare.db')

def dict_row(cursor, row):
    """Convert cursor row object or dict into a clean JSON-serializable dictionary."""
    if row is None:
        return None
    if isinstance(row, dict):
        d = {}
        for k, val in row.items():
            if isinstance(val, (datetime, date)):
                d[k] = val.isoformat()
            elif isinstance(val, Decimal):
                d[k] = float(val)
            else:
                d[k] = val
        return d
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

_SQLITE_INITIALIZED = False

def _ensure_sqlite_initialized():
    global _SQLITE_INITIALIZED
    with _INIT_LOCK:
        if _SQLITE_INITIALIZED:
            return

        conn = sqlite3.connect(SQLITE_DB_PATH, timeout=30.0)
        try:
            try:
                conn.execute("PRAGMA journal_mode = WAL")
            except Exception:
                pass
            conn.execute("PRAGMA busy_timeout = 30000")
            conn.execute("PRAGMA synchronous = NORMAL")
            cur = conn.cursor()

            cur.execute("""
            CREATE TABLE IF NOT EXISTS Users (
                UserID INTEGER PRIMARY KEY AUTOINCREMENT,
                FullName TEXT NOT NULL,
                CollegeEmail TEXT NOT NULL UNIQUE,
                PasswordHash TEXT NOT NULL,
                Role TEXT NOT NULL CHECK (Role IN ('Student', 'Admin', 'Staff')),
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
            CREATE TABLE IF NOT EXISTS Categories (
                CategoryID INTEGER PRIMARY KEY AUTOINCREMENT,
                CategoryName TEXT NOT NULL UNIQUE,
                SLA_Hours INTEGER NOT NULL DEFAULT 48
            )""")

            cur.execute("""
            CREATE TABLE IF NOT EXISTS Complaints (
                ComplaintID INTEGER PRIMARY KEY AUTOINCREMENT,
                UserID INTEGER NOT NULL,
                CategoryID INTEGER NOT NULL,
                Title TEXT NOT NULL,
                Description TEXT NOT NULL,
                Location TEXT NOT NULL,
                Priority TEXT NOT NULL CHECK (Priority IN ('Low', 'Medium', 'High', 'Emergency')),
                Status TEXT NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'In Progress', 'Resolved', 'Rejected')),
                ImageAttachmentURL TEXT NULL,
                Upvotes INTEGER NOT NULL DEFAULT 0,
                Latitude REAL NULL,
                Longitude REAL NULL,
                AssignedToUserID INTEGER NULL,
                DepartmentTag TEXT NULL,
                AssignedAt TEXT NULL,
                AssignedNotes TEXT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
                UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
                FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE,
                FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID),
                FOREIGN KEY (AssignedToUserID) REFERENCES Users(UserID)
            )""")

            cur.execute("PRAGMA table_info(Complaints)")
            complaint_cols = [col[1] for col in cur.fetchall()]
            if 'Upvotes' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN Upvotes INTEGER NOT NULL DEFAULT 0")
                except Exception:
                    pass
            if 'Latitude' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN Latitude REAL NULL")
                except Exception:
                    pass
            if 'Longitude' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN Longitude REAL NULL")
                except Exception:
                    pass
            if 'AssignedToUserID' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN AssignedToUserID INTEGER NULL")
                except Exception:
                    pass
            if 'DepartmentTag' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN DepartmentTag TEXT NULL")
                except Exception:
                    pass
            if 'AssignedAt' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN AssignedAt TEXT NULL")
                except Exception:
                    pass
            if 'AssignedNotes' not in complaint_cols:
                try:
                    cur.execute("ALTER TABLE Complaints ADD COLUMN AssignedNotes TEXT NULL")
                except Exception:
                    pass

            cur.execute("""
            CREATE TABLE IF NOT EXISTS ComplaintTimeline (
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
            CREATE TABLE IF NOT EXISTS Feedback (
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
            CREATE TABLE IF NOT EXISTS Notifications (
                NotificationID INTEGER PRIMARY KEY AUTOINCREMENT,
                ComplaintID INTEGER NOT NULL,
                Title TEXT NOT NULL,
                Message TEXT NOT NULL,
                Priority TEXT NOT NULL,
                CategoryName TEXT NULL,
                StudentName TEXT NULL,
                IsRead INTEGER NOT NULL DEFAULT 0,
                UserID INTEGER NULL,
                CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
                FOREIGN KEY (ComplaintID) REFERENCES Complaints(ComplaintID) ON DELETE CASCADE,
                FOREIGN KEY (UserID) REFERENCES Users(UserID)
            )""")

            cur.execute("PRAGMA table_info(Notifications)")
            notif_cols = [col[1] for col in cur.fetchall()]
            if 'UserID' not in notif_cols:
                try:
                    cur.execute("ALTER TABLE Notifications ADD COLUMN UserID INTEGER NULL")
                except Exception:
                    pass

            cur.execute("""
            CREATE TABLE IF NOT EXISTS ComplaintUpvotes (
                UpvoteID INTEGER PRIMARY KEY AUTOINCREMENT,
                ComplaintID INTEGER NOT NULL,
                UserID INTEGER NOT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
                UNIQUE(ComplaintID, UserID),
                FOREIGN KEY (ComplaintID) REFERENCES Complaints(ComplaintID) ON DELETE CASCADE,
                FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE
            )""")

            # Seed default Users if empty
            cur.execute("SELECT COUNT(*) FROM Users")
            if cur.fetchone()[0] == 0:
                cur.execute("""
                INSERT INTO Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
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
                cur.execute("SELECT 1 FROM Users WHERE CollegeEmail = 'student.admin@kiet.edu'")
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
                        VALUES ('Student Records Admin (Academic Office)', 'student.admin@kiet.edu', ?, 'Admin', 'Academic Affairs & Student Records', 'Staff/Faculty', '9876543299', 'profile images/image2.jpg')
                    """, (generate_password_hash('Admin@123'),))

            # Seed default Categories if empty
            cur.execute("SELECT COUNT(*) FROM Categories")
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
                cur.executemany("INSERT INTO Categories (CategoryName, SLA_Hours) VALUES (?, ?)", categories)

            conn.commit()
            _SQLITE_INITIALIZED = True
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            conn.close()

def get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    with _INIT_LOCK:
        if _ENGINE is not None:
            return _ENGINE

        target_engine = getattr(Config, 'DATABASE_ENGINE', '').lower()

        # 1. Try MySQL (XAMPP / phpMyAdmin)
        if target_engine in ('mysql', ''):
            try:
                import pymysql
                conn = pymysql.connect(
                    host=Config.MYSQL_HOST,
                    port=Config.MYSQL_PORT,
                    user=Config.MYSQL_USER,
                    password=Config.MYSQL_PASSWORD,
                    database=Config.MYSQL_DB,
                    connect_timeout=2
                )
                conn.close()
                _ENGINE = 'mysql'
                return _ENGINE
            except Exception:
                if target_engine == 'mysql':
                    pass # fallback to mssql/sqlite

        # 2. Try Microsoft SQL Server
        if target_engine in ('mssql', ''):
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
                except Exception:
                    pass
                conn.close()
                _ENGINE = 'mssql'
                return _ENGINE
            except Exception:
                pass

        # 3. Fallback to SQLite
        _ENGINE = 'sqlite'
        _ensure_sqlite_initialized()
        return _ENGINE

def _adapt_mysql_sql(query, params):
    params = list(params)
    # 1. Strip dbo. prefix
    query = re.sub(r'\bdbo\.', '', query, flags=re.IGNORECASE)

    # 2. OUTPUT INSERTED -> RETURNING
    output_match = re.search(r'OUTPUT\s+(.*?)\s+VALUES', query, re.IGNORECASE | re.DOTALL)
    if output_match:
        cols = output_match.group(1).replace('INSERTED.', '')
        query = re.sub(r'OUTPUT\s+.*?\s+VALUES', 'VALUES', query, flags=re.IGNORECASE | re.DOTALL)
        query = query.strip() + f' RETURNING {cols}'

    # 3. SYSUTCDATETIME() -> CURRENT_TIMESTAMP()
    query = re.sub(r'SYSUTCDATETIME\(\)', 'CURRENT_TIMESTAMP()', query, flags=re.IGNORECASE)

    # 4. DATEDIFF(unit, start, end) -> TIMESTAMPDIFF(unit, start, end)
    query = re.sub(r'DATEDIFF\s*\(\s*([a-zA-Z_]\w*)\s*,', r'TIMESTAMPDIFF(\1,', query, flags=re.IGNORECASE)

    # 5. ISNULL -> IFNULL
    query = re.sub(r'\bISNULL\s*\(', 'IFNULL(', query, flags=re.IGNORECASE)

    # 6. OFFSET ? ROWS FETCH NEXT ? ROWS ONLY -> LIMIT ? OFFSET ?
    if re.search(r'OFFSET\s+\?\s+ROWS\s+FETCH\s+NEXT\s+\?\s+ROWS\s+ONLY', query, re.IGNORECASE):
        query = re.sub(r'OFFSET\s+\?\s+ROWS\s+FETCH\s+NEXT\s+\?\s+ROWS\s+ONLY', 'LIMIT ? OFFSET ?', query, flags=re.IGNORECASE)
        if len(params) >= 2:
            params[-2], params[-1] = params[-1], params[-2]

    # 7. SELECT TOP (\d+) -> SELECT ... LIMIT \1
    if re.search(r'SELECT\s+TOP\s+\d+', query, re.IGNORECASE):
        query = re.sub(r'SELECT\s+TOP\s+(\d+)\s+(.*)', r'SELECT \2 LIMIT \1', query, flags=re.IGNORECASE | re.DOTALL)

    # 8. Replace ? placeholder with %s for PyMySQL
    query = query.replace('?', '%s')
    return query, tuple(params)

def _adapt_sqlite_sql(query, params):
    params = list(params)
    # Strip dbo. prefix for seamless SQLite query execution
    query = re.sub(r'\bdbo\.', '', query, flags=re.IGNORECASE)

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
    if engine == 'mysql':
        import pymysql
        conn = pymysql.connect(
            host=Config.MYSQL_HOST,
            port=Config.MYSQL_PORT,
            user=Config.MYSQL_USER,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DB,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False
        )
        try:
            yield conn
        finally:
            conn.close()
    elif engine == 'sqlite':
        conn = sqlite3.connect(SQLITE_DB_PATH, timeout=30.0)
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.create_function('DATEDIFF', 3, _datediff)
        conn.create_function('SYSUTCDATETIME', 0, lambda: datetime.now(timezone.utc).isoformat())
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
    if engine == 'mysql':
        query, params = _adapt_mysql_sql(query, params)
    elif engine == 'sqlite':
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
    if engine == 'mysql':
        query, params = _adapt_mysql_sql(query, params)
    elif engine == 'sqlite':
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
                if engine == 'mysql':
                    sql, params = _adapt_mysql_sql(sql, params)
                elif engine == 'sqlite':
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

