-- ============================================================================
-- CAMPUSCARE CIVIC GRIEVANCE & ISSUE RESOLUTION SYSTEM
-- Database Schema Script (Microsoft SQL Server / Transact-SQL)
-- ============================================================================

-- 1. Create Database if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'CampusCareDB')
BEGIN
    CREATE DATABASE CampusCareDB;
END
GO

USE CampusCareDB;
GO

-- 2. Drop existing tables if re-initializing (in reverse dependency order)
IF OBJECT_ID(N'dbo.Feedback', N'U') IS NOT NULL DROP TABLE dbo.Feedback;
IF OBJECT_ID(N'dbo.ComplaintTimeline', N'U') IS NOT NULL DROP TABLE dbo.ComplaintTimeline;
IF OBJECT_ID(N'dbo.Complaints', N'U') IS NOT NULL DROP TABLE dbo.Complaints;
IF OBJECT_ID(N'dbo.Categories', N'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL DROP TABLE dbo.Users;
GO

-- 3. Create Users Table
CREATE TABLE dbo.Users (
    UserID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY CLUSTERED,
    FullName NVARCHAR(100) NOT NULL,
    CollegeEmail NVARCHAR(150) NOT NULL CONSTRAINT UQ_Users_CollegeEmail UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Role NVARCHAR(20) NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN ('Student', 'Admin')),
    Department NVARCHAR(100) NOT NULL,
    Course NVARCHAR(50) NULL,
    Phone NVARCHAR(20) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- 4. Create Categories Table
CREATE TABLE dbo.Categories (
    CategoryID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categories PRIMARY KEY CLUSTERED,
    CategoryName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
    SLA_Hours INT NOT NULL CONSTRAINT DF_Categories_SLA DEFAULT 48,
    CONSTRAINT CK_Categories_CategoryName CHECK (
        CategoryName IN ('Hostel', 'Sanitation', 'Infrastructure', 'IT / Labs', 'Mess/Canteen', 'Electrical')
    )
);
GO

-- 5. Create Complaints Table
CREATE TABLE dbo.Complaints (
    ComplaintID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Complaints PRIMARY KEY CLUSTERED,
    UserID INT NOT NULL,
    CategoryID INT NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    Location NVARCHAR(100) NOT NULL,
    Priority NVARCHAR(20) NOT NULL CONSTRAINT CK_Complaints_Priority CHECK (Priority IN ('Low', 'Medium', 'High', 'Emergency')),
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Complaints_Status DEFAULT 'Pending' CONSTRAINT CK_Complaints_Status CHECK (Status IN ('Pending', 'In Progress', 'Resolved', 'Rejected')),
    ImageAttachmentURL NVARCHAR(500) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Complaints_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Complaints_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_Complaints_Users FOREIGN KEY (UserID) 
        REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
    CONSTRAINT FK_Complaints_Categories FOREIGN KEY (CategoryID) 
        REFERENCES dbo.Categories(CategoryID)
);
GO

-- 6. Create ComplaintTimeline / History Table
CREATE TABLE dbo.ComplaintTimeline (
    LogID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ComplaintTimeline PRIMARY KEY CLUSTERED,
    ComplaintID INT NOT NULL,
    UpdatedByUserID INT NOT NULL,
    PreviousStatus NVARCHAR(20) NULL,
    NewStatus NVARCHAR(20) NOT NULL,
    Remarks NVARCHAR(500) NOT NULL,
    Timestamp DATETIME2(0) NOT NULL CONSTRAINT DF_ComplaintTimeline_Timestamp DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_ComplaintTimeline_Complaints FOREIGN KEY (ComplaintID) 
        REFERENCES dbo.Complaints(ComplaintID) ON DELETE CASCADE,
    CONSTRAINT FK_ComplaintTimeline_Users FOREIGN KEY (UpdatedByUserID) 
        REFERENCES dbo.Users(UserID)
);
GO

-- 7. Create Feedback / Ratings Table
CREATE TABLE dbo.Feedback (
    FeedbackID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Feedback PRIMARY KEY CLUSTERED,
    ComplaintID INT NOT NULL CONSTRAINT UQ_Feedback_ComplaintID UNIQUE,
    UserID INT NOT NULL,
    Rating INT NOT NULL CONSTRAINT CK_Feedback_Rating CHECK (Rating BETWEEN 1 AND 5),
    Comments NVARCHAR(1000) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Feedback_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_Feedback_Complaints FOREIGN KEY (ComplaintID) 
        REFERENCES dbo.Complaints(ComplaintID) ON DELETE CASCADE,
    CONSTRAINT FK_Feedback_Users FOREIGN KEY (UserID) 
        REFERENCES dbo.Users(UserID)
);
GO

-- 8. Performance Indexes
CREATE NONCLUSTERED INDEX IX_Complaints_UserID 
    ON dbo.Complaints(UserID) 
    INCLUDE (Status, Priority, CreatedAt);

CREATE NONCLUSTERED INDEX IX_Complaints_Status 
    ON dbo.Complaints(Status) 
    INCLUDE (CategoryID, Priority, CreatedAt);

CREATE NONCLUSTERED INDEX IX_Complaints_CategoryID 
    ON dbo.Complaints(CategoryID);

CREATE NONCLUSTERED INDEX IX_Complaints_Priority 
    ON dbo.Complaints(Priority);

CREATE NONCLUSTERED INDEX IX_ComplaintTimeline_ComplaintID 
    ON dbo.ComplaintTimeline(ComplaintID) 
    INCLUDE (Timestamp, NewStatus);

CREATE NONCLUSTERED INDEX IX_Feedback_ComplaintID 
    ON dbo.Feedback(ComplaintID);
GO

-- 9. Seed Categories
INSERT INTO dbo.Categories (CategoryName, SLA_Hours) VALUES
('Hostel', 48),
('Sanitation', 24),
('Infrastructure', 72),
('IT / Labs', 24),
('Mess/Canteen', 12),
('Electrical', 12);
GO

PRINT 'CampusCareDB schema and seeds successfully created.';
GO
