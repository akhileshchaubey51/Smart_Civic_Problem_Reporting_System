# CampusCare: College Civic Grievance & Issue Resolution System

A production-ready, full-stack civic resolution system designed for college campuses. **CampusCare** empowers students to lodge grievances (hostel maintenance, electrical hazards, sanitation, IT labs, mess/canteen, and infrastructure repairs) with image proof and live progress tracking. Concurrently, it equips administrators with a control center featuring real-time KPI metrics, department SLA analytics, status transition audit trails, and report export capabilities.

---

## 1. System Architecture & Tech Stack

```
                                  +---------------------------------------+
                                  |     CampusCare Frontend SPA (HTML5)   |
                                  | Tailwind CSS | Lucide | Chart.js      |
                                  +---------------------------------------+
                                                     |
                                            RESTful HTTPS / JSON
                                                     |
                                                     v
+----------------------------------------------------------------------------------------------------+
|                                    Flask RESTful Backend API                                       |
|                                                                                                    |
|  +---------------------------+   +-------------------------------+   +--------------------------+  |
|  |       auth_routes.py      |   |      complaint_routes.py      |   |      admin_routes.py     |  |
|  | - College Domain Check    |   | - Multi-field form submission |   | - KPI & SLA Analytics    |  |
|  | - Password Hashing        |   | - Multipart Image Upload      |   | - Search / Multi-Filter  |  |
|  | - JWT Generation (HS256)  |   | - Progress Stepper / History  |   | - Atomic Status Update   |  |
|  |                           |   | - 5-Star Feedback & Rating    |   | - CSV Streaming Export   |  |
|  +---------------------------+   +-------------------------------+   +--------------------------+  |
+----------------------------------------------------------------------------------------------------+
                                                     |
                                          pyodbc (ODBC Driver 18)
                                                     |
                                                     v
                                  +---------------------------------------+
                                  |   Microsoft SQL Server (Transact-SQL) |
                                  |   CampusCareDB Normalized Relational  |
                                  +---------------------------------------+
```

### Key Highlights
- **Frontend:** Responsive Single-Page Application (SPA) with Tailwind CSS, Lucide icons, Chart.js visualizations, and an interactive 4-step resolution stepper.
- **Backend:** Modular Python Flask API with Blueprints, PyJWT authentication, role-based decorators (`@token_required`, `@admin_required`), secure file uploads (UUID filename hashing, MIME type checking), and atomic transactions.
- **Database:** Microsoft SQL Server with normalized tables, foreign keys with referential integrity, check constraints, default timestamps, and non-clustered performance indexes.

---

## 2. Directory Structure

```
CampusCare/
├── backend/
│   ├── __init__.py
│   ├── app.py                     # Flask application factory, CORS, static routes & error handlers
│   ├── config.py                  # Dynamic ODBC driver detection, JWT, and upload limits
│   ├── db.py                      # SQL Server pyodbc context manager, dictionary rows, transactions
│   ├── auth.py                    # PyJWT token encoding/decoding, @token_required, @admin_required
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth_routes.py         # Registration with @kiet.edu check, login, me
│   │   ├── complaint_routes.py    # Complaint create (multipart), student list, track, 5-star feedback
│   │   └── admin_routes.py        # All complaints (filter/paginate), update status, stats, CSV export
│   └── uploads/                   # Secure storage for grievance evidence photos
├── database/
│   ├── schema.sql                 # Microsoft SQL Server DDL script (tables, constraints, indexes)
│   └── init_db.py                 # Automated DB initialization and seeding script
├── frontend/
│   ├── index.html                 # Unified SPA interface with Student & Admin portals
│   ├── css/
│   │   └── styles.css             # Glassmorphism, stepper track, star rating, badges, custom toast
│   └── js/
│       ├── config.js              # State store, API fetcher, notification toasts, badges
│       ├── auth.js                # Token management, login/register handlers, demo 1-click accounts
│       ├── student.js             # Student dashboard, file dropzone, tracking stepper, feedback
│       └── admin.js               # Admin KPIs, Chart.js graphs, paged table, status updater, CSV export
├── tests/
│   └── test_api.py                # Automated integration test suite (Unittest)
├── requirements.txt               # Dependencies
├── .env.example                   # Environment configuration template
└── README.md                      # Documentation
```

---

## 3. Database Schema (Microsoft SQL Server)

### Tables & Relations
1. **`Users`**:
   - `UserID` (INT IDENTITY PRIMARY KEY)
   - `FullName` (NVARCHAR(100) NOT NULL)
   - `CollegeEmail` (NVARCHAR(150) NOT NULL UNIQUE)
   - `PasswordHash` (NVARCHAR(255) NOT NULL)
   - `Role` (NVARCHAR(20) NOT NULL CHECK IN ('Student', 'Admin'))
   - `Department` (NVARCHAR(100) NOT NULL)
   - `Phone` (NVARCHAR(20) NULL)
   - `CreatedAt` (DATETIME2(0) DEFAULT SYSUTCDATETIME())

2. **`Categories`**:
   - `CategoryID` (INT IDENTITY PRIMARY KEY)
   - `CategoryName` (NVARCHAR(50) NOT NULL UNIQUE CHECK IN ('Hostel', 'Sanitation', 'Infrastructure', 'IT / Labs', 'Mess/Canteen', 'Electrical'))
   - `SLA_Hours` (INT NOT NULL DEFAULT 48)

3. **`Complaints`**:
   - `ComplaintID` (INT IDENTITY PRIMARY KEY)
   - `UserID` (INT NOT NULL FK -> `Users(UserID)` ON DELETE CASCADE)
   - `CategoryID` (INT NOT NULL FK -> `Categories(CategoryID)`)
   - `Title` (NVARCHAR(200) NOT NULL)
   - `Description` (NVARCHAR(MAX) NOT NULL)
   - `Location` (NVARCHAR(100) NOT NULL)
   - `Priority` (NVARCHAR(20) NOT NULL CHECK IN ('Low', 'Medium', 'High', 'Emergency'))
   - `Status` (NVARCHAR(20) NOT NULL CHECK IN ('Pending', 'In Progress', 'Resolved', 'Rejected') DEFAULT 'Pending')
   - `ImageAttachmentURL` (NVARCHAR(500) NULL)
   - `CreatedAt` (DATETIME2(0) DEFAULT SYSUTCDATETIME())
   - `UpdatedAt` (DATETIME2(0) DEFAULT SYSUTCDATETIME())

4. **`ComplaintTimeline`**:
   - `LogID` (INT IDENTITY PRIMARY KEY)
   - `ComplaintID` (INT NOT NULL FK -> `Complaints(ComplaintID)` ON DELETE CASCADE)
   - `UpdatedByUserID` (INT NOT NULL FK -> `Users(UserID)`)
   - `PreviousStatus` (NVARCHAR(20) NULL)
   - `NewStatus` (NVARCHAR(20) NOT NULL)
   - `Remarks` (NVARCHAR(500) NOT NULL)
   - `Timestamp` (DATETIME2(0) DEFAULT SYSUTCDATETIME())

5. **`Feedback`**:
   - `FeedbackID` (INT IDENTITY PRIMARY KEY)
   - `ComplaintID` (INT NOT NULL UNIQUE FK -> `Complaints(ComplaintID)` ON DELETE CASCADE)
   - `UserID` (INT NOT NULL FK -> `Users(UserID)`)
   - `Rating` (INT NOT NULL CHECK (Rating BETWEEN 1 AND 5))
   - `Comments` (NVARCHAR(1000) NULL)
   - `CreatedAt` (DATETIME2(0) DEFAULT SYSUTCDATETIME())

### Non-Clustered Performance Indexes
- `IX_Complaints_UserID` on `Complaints(UserID)` INCLUDE `(Status, Priority, CreatedAt)`
- `IX_Complaints_Status` on `Complaints(Status)` INCLUDE `(CategoryID, Priority, CreatedAt)`
- `IX_Complaints_CategoryID` on `Complaints(CategoryID)`
- `IX_Complaints_Priority` on `Complaints(Priority)`
- `IX_ComplaintTimeline_ComplaintID` on `ComplaintTimeline(ComplaintID)` INCLUDE `(Timestamp, NewStatus)`
- `IX_Feedback_ComplaintID` on `Feedback(ComplaintID)`

---

## 4. API Endpoints Specification

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register student with `@kiet.edu` verification |
| `POST` | `/api/auth/login` | Public | Authenticate user and issue signed 24h JWT token |
| `GET` | `/api/auth/me` | Authenticated | Fetch authenticated user profile |
| `GET` | `/api/categories` | Public | List complaint categories with SLA benchmark hours |
| `POST` | `/api/complaints/create` | Student / Token | Submit new grievance with multipart image proof |
| `GET` | `/api/complaints/student` | Student / Token | Get logged-in student's tickets and metric counters |
| `GET` | `/api/complaints/track/<id>` | Student / Admin | Get ticket details and chronological audit logs |
| `POST` | `/api/complaints/feedback` | Student / Token | Submit 1-5 star rating and comments for resolved tickets |
| `GET` | `/api/admin/all-complaints` | Admin Only | Search, multi-filter, and paginate grievances |
| `PUT` | `/api/admin/update-status/<id>`| Admin Only | Atomically update status and log remarks into timeline |
| `GET` | `/api/admin/stats` | Admin Only | Get real-time KPIs and aggregated chart analytics |
| `GET` | `/api/admin/export-csv` | Admin Only | Stream dynamic CSV file of filtered grievance records |

---

## 5. Quickstart & Deployment Guide

### Prerequisites
- Python 3.10+
- Microsoft SQL Server (Local, Express, or Enterprise)
- Microsoft ODBC Driver 17 or 18 for SQL Server

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Configure Database & Environment
Copy `.env.example` to `.env` and verify your settings:
```ini
DB_SERVER=localhost
DB_NAME=CampusCareDB
DB_DRIVER=ODBC Driver 18 for SQL Server
DB_TRUSTED_CONNECTION=yes
DB_TRUST_SERVER_CERTIFICATE=yes
ALLOWED_EMAIL_DOMAIN=kiet.edu
```

### 3. Initialize Database & Seed Sample Data
Execute the initialization script to automatically create `CampusCareDB`, apply tables, constraints, indexes, categories, default accounts, and sample tickets:
```powershell
python database/init_db.py
```

### 4. Run Automated Test Suite
Verify all endpoints and database operations:
```powershell
python tests/test_api.py
```

### 5. Launch Application
```powershell
python backend/app.py
```
Open your browser at `http://127.0.0.1:5000` to access the portal.

---

## 6. Pre-Configured Accounts (@kiet.edu is compulsory)

| Role | Email / ID | Password | Features Available |
|---|---|---|---|
| **Student** | `student@kiet.edu` (or enter `student`) | `Student@123` | Lodge grievances, drag-drop image upload, view SLA metrics, 4-step live tracking stepper, 5-star resolution feedback |
| **Admin** | `admin@kiet.edu` (or enter `admin`) | `Admin@123` | Real-time KPI cards, Category / Priority / Department charts, search & filter data table, status update modal with remarks, CSV export |
