
-- ============================================================================
-- CAMPUSCARE CIVIC GRIEVANCE & ISSUE RESOLUTION SYSTEM
-- Database Schema Script (MySQL 8.0+)
-- ============================================================================

-- 1. Create Database if it does not exist
CREATE DATABASE IF NOT EXISTS CampusCareDB
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE CampusCareDB;

-- 2. Drop existing tables if re-initializing
-- WARNING: This deletes existing data in these tables.
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS Feedback;
DROP TABLE IF EXISTS Notifications;
DROP TABLE IF EXISTS ComplaintTimeline;
DROP TABLE IF EXISTS Complaints;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Users;

SET FOREIGN_KEY_CHECKS = 1;

-- 3. Create Users Table
CREATE TABLE Users (
    UserID INT NOT NULL AUTO_INCREMENT,
    FullName VARCHAR(100) NOT NULL,
    CollegeEmail VARCHAR(150) NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role VARCHAR(20) NOT NULL,
    Department VARCHAR(100) NOT NULL,
    Course VARCHAR(50) NULL,
    Phone VARCHAR(20) NULL,
    ProfileImage VARCHAR(500) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT PK_Users PRIMARY KEY (UserID),
    CONSTRAINT UQ_Users_CollegeEmail UNIQUE (CollegeEmail),
    CONSTRAINT CK_Users_Role
        CHECK (Role IN ('Student', 'Admin'))
) ENGINE = InnoDB;

-- 4. Create Categories Table
CREATE TABLE Categories (
    CategoryID INT NOT NULL AUTO_INCREMENT,
    CategoryName VARCHAR(50) NOT NULL,
    SLA_Hours INT NOT NULL DEFAULT 48,

    CONSTRAINT PK_Categories PRIMARY KEY (CategoryID),
    CONSTRAINT UQ_Categories_Name UNIQUE (CategoryName),
    CONSTRAINT CK_Categories_SLA CHECK (SLA_Hours > 0)
) ENGINE = InnoDB;

-- 5. Create Complaints Table
CREATE TABLE Complaints (
    ComplaintID INT NOT NULL AUTO_INCREMENT,
    UserID INT NOT NULL,
    CategoryID INT NOT NULL,
    Title VARCHAR(200) NOT NULL,
    Description TEXT NOT NULL,
    Location VARCHAR(100) NOT NULL,
    Priority VARCHAR(20) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    ImageAttachmentURL VARCHAR(500) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT PK_Complaints PRIMARY KEY (ComplaintID),

    CONSTRAINT CK_Complaints_Priority
        CHECK (Priority IN ('Low', 'Medium', 'High', 'Emergency')),

    CONSTRAINT CK_Complaints_Status
        CHECK (Status IN ('Pending', 'In Progress', 'Resolved', 'Rejected')),

    CONSTRAINT FK_Complaints_Users
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON DELETE CASCADE,

    CONSTRAINT FK_Complaints_Categories
        FOREIGN KEY (CategoryID)
        REFERENCES Categories(CategoryID)
        ON DELETE RESTRICT,

    INDEX IX_Complaints_UserID (UserID),
    INDEX IX_Complaints_Status (Status),
    INDEX IX_Complaints_CategoryID (CategoryID),
    INDEX IX_Complaints_Priority (Priority),
    INDEX IX_Complaints_User_Status_Created (UserID, Status, Priority, CreatedAt),
    INDEX IX_Complaints_Status_Category_Priority (Status, CategoryID, Priority, CreatedAt)
) ENGINE = InnoDB;

-- 6. Create ComplaintTimeline / History Table
CREATE TABLE ComplaintTimeline (
    LogID INT NOT NULL AUTO_INCREMENT,
    ComplaintID INT NOT NULL,
    UpdatedByUserID INT NOT NULL,
    PreviousStatus VARCHAR(20) NULL,
    NewStatus VARCHAR(20) NOT NULL,
    Remarks VARCHAR(500) NOT NULL,
    `Timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT PK_ComplaintTimeline PRIMARY KEY (LogID),

    CONSTRAINT CK_Timeline_PreviousStatus
        CHECK (
            PreviousStatus IS NULL OR
            PreviousStatus IN ('Pending', 'In Progress', 'Resolved', 'Rejected')
        ),

    CONSTRAINT CK_Timeline_NewStatus
        CHECK (NewStatus IN ('Pending', 'In Progress', 'Resolved', 'Rejected')),

    CONSTRAINT FK_ComplaintTimeline_Complaints
        FOREIGN KEY (ComplaintID)
        REFERENCES Complaints(ComplaintID)
        ON DELETE CASCADE,

    CONSTRAINT FK_ComplaintTimeline_Users
        FOREIGN KEY (UpdatedByUserID)
        REFERENCES Users(UserID)
        ON DELETE RESTRICT,

    INDEX IX_ComplaintTimeline_ComplaintID (`Timestamp`, NewStatus)
) ENGINE = InnoDB;

-- 7. Create Feedback / Ratings Table
CREATE TABLE Feedback (
    FeedbackID INT NOT NULL AUTO_INCREMENT,
    ComplaintID INT NOT NULL,
    UserID INT NOT NULL,
    Rating INT NOT NULL,
    Comments VARCHAR(1000) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT PK_Feedback PRIMARY KEY (FeedbackID),
    CONSTRAINT UQ_Feedback_ComplaintID UNIQUE (ComplaintID),

    CONSTRAINT CK_Feedback_Rating
        CHECK (Rating BETWEEN 1 AND 5),

    CONSTRAINT FK_Feedback_Complaints
        FOREIGN KEY (ComplaintID)
        REFERENCES Complaints(ComplaintID)
        ON DELETE CASCADE,

    CONSTRAINT FK_Feedback_Users
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
        ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 8. Create Notifications Table
CREATE TABLE Notifications (
    NotificationID INT NOT NULL AUTO_INCREMENT,
    ComplaintID INT NOT NULL,
    Title VARCHAR(200) NOT NULL,
    Message VARCHAR(500) NOT NULL,
    Priority VARCHAR(20) NOT NULL,
    CategoryName VARCHAR(50) NULL,
    StudentName VARCHAR(100) NULL,
    IsRead BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT PK_Notifications PRIMARY KEY (NotificationID),

    CONSTRAINT CK_Notifications_Priority
        CHECK (Priority IN ('Low', 'Medium', 'High', 'Emergency')),

    CONSTRAINT FK_Notifications_Complaints
        FOREIGN KEY (ComplaintID)
        REFERENCES Complaints(ComplaintID)
        ON DELETE CASCADE,

    INDEX IX_Notifications_ComplaintID (ComplaintID),
    INDEX IX_Notifications_IsRead_CreatedAt (IsRead, CreatedAt)
) ENGINE = InnoDB;

-- 9. Seed Categories (12 Core Campus Domains)
INSERT INTO Categories (CategoryID, CategoryName, SLA_Hours)
VALUES
    (1, 'Hostel', 48),
    (2, 'Sanitation', 24),
    (3, 'Infrastructure', 72),
    (4, 'IT / Labs', 24),
    (5, 'Mess/Canteen', 12),
    (6, 'Electrical', 12),
    (7, 'Road Issues', 72),
    (8, 'Water Issues', 24),
    (9, 'Parking', 72),
    (10, 'Library & Academics', 24),
    (11, 'Security & Safety', 12),
    (12, 'Other Issues', 48);

-- 10. Seed Verified Users (#UID-1, #UID-2, #UID-54, #UID-55, #UID-56)
-- Default Passwords: Admin accounts: Admin@123 | Student accounts: Student@123
INSERT INTO Users (UserID, FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage, CreatedAt)
VALUES
    (1, 'Dean of Student Affairs', 'admin@kiet.edu', 'scrypt:32768:8:1$xs5rBC8w4mpS05oK$7c48d190f0b26df70156e4f5b7aeb01dce9cf6eb4b56a5857cabda8cae348d279cc767d1bac2bc513dd69243d0336d50cedf98df244f58f376e9214f8b087441', 'Admin', 'Campus Administration', 'Staff/Faculty', '9876543210', 'profile images/image2.jpg', '2026-09-22 03:20:31'),
    (2, 'Akhilesh Chaubey', '2628mca0206@kiet.edu', 'scrypt:32768:8:1$QUPujDlEUxDF0xie$ac06def03fe0e6031d7dd8d138bcb24010d095b5483eb09ef052e1e1e9bac07f62c378ac80a1fc1cb08549825b832caa72fed9cf636b4e29c21d9254ded84f5d', 'Student', 'Master of Computer Applications', 'MCA', '9876543210', 'profile images/image3.jpg', '2026-09-22 03:30:03'),
    (54, 'Arpit Tiwari', '2628mca0240@kiet.edu', 'scrypt:32768:8:1$QUPujDlEUxDF0xie$ac06def03fe0e6031d7dd8d138bcb24010d095b5483eb09ef052e1e1e9bac07f62c378ac80a1fc1cb08549825b832caa72fed9cf636b4e29c21d9254ded84f5d', 'Student', 'Master of Computer Applications', 'MCA', '7852638748', '/uploads/profile_0afeca7627_image3.jpg', '2026-09-24 14:24:57'),
    (55, 'Student Records Admin (Academic Office)', 'admin1@kiet.edu', 'scrypt:32768:8:1$xs5rBC8w4mpS05oK$7c48d190f0b26df70156e4f5b7aeb01dce9cf6eb4b56a5857cabda8cae348d279cc767d1bac2bc513dd69243d0336d50cedf98df244f58f376e9214f8b087441', 'Admin', 'Academic Affairs & Student Records', 'Staff/Faculty', '9876543299', 'profile images/image2.jpg', '2026-09-25 03:22:19'),
    (56, 'Anubhav Kumar', '2628mca0298@kiet.edu', 'scrypt:32768:8:1$QUPujDlEUxDF0xie$ac06def03fe0e6031d7dd8d138bcb24010d095b5483eb09ef052e1e1e9bac07f62c378ac80a1fc1cb08549825b832caa72fed9cf636b4e29c21d9254ded84f5d', 'Student', 'Master of Computer Applications', 'MCA', '9873209683', '/uploads/profile_d26157aca2_image9.jpg', '2026-09-25 09:04:07');

-- 11. Success Message
SELECT 'CampusCareDB schema, 12 categories, and 5 verified users created successfully.'
    AS Message;
