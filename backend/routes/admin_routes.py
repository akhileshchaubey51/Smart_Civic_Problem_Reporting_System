"""
CampusCare Administrator Routes
Handles Complaint listing with filtering/pagination, Status transitions with timeline audit,
KPI metrics for analytics charts, and CSV report export.
"""
import os
import io
import csv
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response
from werkzeug.utils import secure_filename
from backend.db import query_db, execute_db, execute_transaction
from backend.auth import admin_required, hash_password
from backend.config import Config, BASE_DIR

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@admin_bp.route('/all-complaints', methods=['GET'])
@admin_required
def get_all_complaints():
    search = (request.args.get('search') or '').strip()
    status = (request.args.get('status') or '').strip()
    category_id = request.args.get('category_id')
    priority = (request.args.get('priority') or '').strip()
    
    try:
        page = max(1, int(request.args.get('page', 1)))
        limit = max(1, min(100, int(request.args.get('limit', 10))))
    except ValueError:
        page, limit = 1, 10

    offset = (page - 1) * limit

    # Build WHERE conditions
    where_clauses = ["1=1"]
    params = []

    if search:
        where_clauses.append("(c.Title LIKE ? OR c.Description LIKE ? OR c.Location LIKE ? OR u.FullName LIKE ? OR u.CollegeEmail LIKE ?)")
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard, wildcard, wildcard])

    if status and status.lower() != 'all':
        where_clauses.append("c.Status = ?")
        params.append(status)

    if category_id and category_id.lower() != 'all':
        where_clauses.append("c.CategoryID = ?")
        params.append(category_id)

    if priority and priority.lower() != 'all':
        where_clauses.append("c.Priority = ?")
        params.append(priority)

    where_sql = " AND ".join(where_clauses)

    # Count total records
    count_sql = f"""
        SELECT COUNT(*) AS TotalCount
        FROM dbo.Complaints c
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        WHERE {where_sql}
    """
    total_result = query_db(count_sql, params, one=True)
    total_count = total_result['TotalCount'] if total_result else 0

    # Fetch paginated complaints
    data_sql = f"""
        SELECT 
            c.ComplaintID, c.Title, c.Description, c.Location, c.Priority, c.Status,
            c.ImageAttachmentURL, c.CreatedAt, c.UpdatedAt,
            cat.CategoryID, cat.CategoryName, cat.SLA_Hours,
            u.UserID, u.FullName AS StudentName, u.CollegeEmail AS StudentEmail, u.Department AS StudentDepartment, u.Phone AS StudentPhone,
            f.Rating AS FeedbackRating, f.Comments AS FeedbackComments,
            CASE 
                WHEN c.Status IN ('Pending', 'In Progress') AND DATEDIFF(hour, c.CreatedAt, SYSUTCDATETIME()) > cat.SLA_Hours THEN 1
                ELSE 0 
            END AS IsSLAOverdue,
            DATEDIFF(hour, c.CreatedAt, SYSUTCDATETIME()) AS AgeHours
        FROM dbo.Complaints c
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        LEFT JOIN dbo.Feedback f ON c.ComplaintID = f.ComplaintID
        WHERE {where_sql}
        ORDER BY c.CreatedAt DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    """
    paged_params = list(params) + [offset, limit]
    complaints = query_db(data_sql, paged_params)

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

    return jsonify({
        'success': True,
        'pagination': {
            'page': page,
            'limit': limit,
            'total_records': total_count,
            'total_pages': total_pages
        },
        'complaints': complaints
    })

@admin_bp.route('/update-status/<int:complaint_id>', methods=['PUT'])
@admin_required
def update_complaint_status(complaint_id):
    data = request.get_json() or {}
    new_status = (data.get('new_status') or '').strip()
    remarks = (data.get('remarks') or '').strip()

    if not new_status or not remarks:
        return jsonify({'success': False, 'message': 'New status and remarks are required.'}), 400

    if len(remarks) < 5 or len(remarks) > 500:
        return jsonify({'success': False, 'message': 'Remarks must be between 5 and 500 characters explaining the status change.'}), 400

    if new_status not in ('Pending', 'In Progress', 'Resolved', 'Rejected'):
        return jsonify({'success': False, 'message': 'Invalid status. Allowed: Pending, In Progress, Resolved, Rejected'}), 400

    # Fetch current complaint
    current = query_db("""
        SELECT c.ComplaintID, c.Status, c.UserID, c.Title, c.Priority, cat.CategoryName, u.FullName AS StudentName
        FROM dbo.Complaints c
        LEFT JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        LEFT JOIN dbo.Users u ON c.UserID = u.UserID
        WHERE c.ComplaintID = ?
    """, (complaint_id,), one=True)
    if not current:
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    prev_status = current['Status']
    admin_id = request.current_user['user_id']
    student_id = current.get('UserID')
    student_name = current.get('StudentName') or 'Student'
    cat_name = current.get('CategoryName') or 'Campus Service'
    priority = current.get('Priority') or 'Medium'

    notif_title = f"Issue #CMP-{complaint_id} marked as {new_status}"
    notif_msg = f"Admin Remark: \"{remarks}\""

    # Execute atomic status update and history log insertion
    try:
        operations = [
            (
                "UPDATE dbo.Complaints SET Status = ?, UpdatedAt = SYSUTCDATETIME() WHERE ComplaintID = ?",
                (new_status, complaint_id)
            ),
            (
                """
                INSERT INTO dbo.ComplaintTimeline (ComplaintID, UpdatedByUserID, PreviousStatus, NewStatus, Remarks)
                VALUES (?, ?, ?, ?, ?)
                """,
                (complaint_id, admin_id, prev_status, new_status, remarks)
            )
        ]
        if student_id:
            operations.append((
                """
                INSERT INTO dbo.Notifications (UserID, ComplaintID, Title, Message, Priority, CategoryName, StudentName, IsRead)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (student_id, complaint_id, notif_title, notif_msg, priority, cat_name, student_name)
            ))
        execute_transaction(operations)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update complaint status: {str(e)}'}), 500

    return jsonify({
        'success': True,
        'message': f'Complaint status updated from {prev_status} to {new_status} successfully.',
        'complaint_id': complaint_id,
        'previous_status': prev_status,
        'new_status': new_status,
        'remarks': remarks
    })

@admin_bp.route('/stats', methods=['GET'])
@admin_required
def get_admin_stats():
    # 1. Overall counts
    overview = query_db("""
        SELECT 
            COUNT(*) AS Total,
            SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS Pending,
            SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) AS InProgress,
            SUM(CASE WHEN Status = 'Resolved' THEN 1 ELSE 0 END) AS Resolved,
            SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS Rejected
        FROM dbo.Complaints
    """, one=True) or {'Total': 0, 'Pending': 0, 'InProgress': 0, 'Resolved': 0, 'Rejected': 0}

    total = overview.get('Total', 0) or 0
    resolved = overview.get('Resolved', 0) or 0
    resolution_rate = round((resolved / total * 100), 1) if total > 0 else 0.0

    # 2. SLA Overdue count (open tickets exceeding SLA)
    sla_query = query_db("""
        SELECT COUNT(*) AS OverdueCount
        FROM dbo.Complaints c
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        WHERE c.Status IN ('Pending', 'In Progress')
          AND DATEDIFF(hour, c.CreatedAt, SYSUTCDATETIME()) > cat.SLA_Hours
    """, one=True)
    overdue_count = sla_query['OverdueCount'] if sla_query else 0

    # 3. Average Rating
    rating_query = query_db("SELECT AVG(CAST(Rating AS FLOAT)) AS AvgRating, COUNT(*) AS TotalRatings FROM dbo.Feedback", one=True)
    avg_rating = round(rating_query['AvgRating'], 2) if rating_query and rating_query['AvgRating'] is not None else 0.0

    # 4. Category breakdown
    category_stats = query_db("""
        SELECT 
            cat.CategoryName,
            COUNT(c.ComplaintID) AS TotalIssues,
            SUM(CASE WHEN c.Status = 'Resolved' THEN 1 ELSE 0 END) AS ResolvedIssues,
            cat.SLA_Hours
        FROM dbo.Categories cat
        LEFT JOIN dbo.Complaints c ON cat.CategoryID = c.CategoryID
        GROUP BY cat.CategoryName, cat.SLA_Hours
        ORDER BY TotalIssues DESC
    """)

    # 5. Priority distribution
    priority_stats = query_db("""
        SELECT 
            Priority,
            COUNT(*) AS Count
        FROM dbo.Complaints
        GROUP BY Priority
    """)

    # 6. Department breakdown
    dept_stats = query_db("""
        SELECT 
            u.Department,
            COUNT(c.ComplaintID) AS Count
        FROM dbo.Complaints c
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        GROUP BY u.Department
        ORDER BY Count DESC
    """)

    return jsonify({
        'success': True,
        'kpi': {
            'total': total,
            'pending': overview.get('Pending', 0) or 0,
            'in_progress': overview.get('InProgress', 0) or 0,
            'resolved': resolved,
            'rejected': overview.get('Rejected', 0) or 0,
            'resolution_rate': resolution_rate,
            'sla_overdue': overdue_count,
            'avg_rating': avg_rating,
            'total_ratings': rating_query['TotalRatings'] if rating_query else 0
        },
        'categories': category_stats,
        'priorities': priority_stats,
        'departments': dept_stats
    })

@admin_bp.route('/export-csv', methods=['GET'])
@admin_required
def export_csv():
    search = (request.args.get('search') or '').strip()
    status = (request.args.get('status') or '').strip()
    category_id = request.args.get('category_id')
    priority = (request.args.get('priority') or '').strip()

    where_clauses = ["1=1"]
    params = []

    if search:
        where_clauses.append("(c.Title LIKE ? OR c.Description LIKE ? OR c.Location LIKE ? OR u.FullName LIKE ?)")
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard, wildcard])

    if status and status.lower() != 'all':
        where_clauses.append("c.Status = ?")
        params.append(status)

    if category_id and category_id.lower() != 'all':
        where_clauses.append("c.CategoryID = ?")
        params.append(category_id)

    if priority and priority.lower() != 'all':
        where_clauses.append("c.Priority = ?")
        params.append(priority)

    where_sql = " AND ".join(where_clauses)

    rows = query_db(f"""
        SELECT 
            c.ComplaintID,
            c.Title,
            cat.CategoryName,
            c.Priority,
            c.Status,
            c.Location,
            u.FullName AS StudentName,
            u.CollegeEmail AS StudentEmail,
            u.Department AS StudentDepartment,
            u.Phone AS StudentPhone,
            c.CreatedAt,
            c.UpdatedAt,
            f.Rating AS FeedbackRating,
            f.Comments AS FeedbackComments
        FROM dbo.Complaints c
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        LEFT JOIN dbo.Feedback f ON c.ComplaintID = f.ComplaintID
        WHERE {where_sql}
        ORDER BY c.CreatedAt DESC
    """, params)

    output = io.StringIO()
    # Write UTF-8 BOM for Microsoft Excel compatibility
    output.write('\ufeff')
    writer = csv.writer(output)

    writer.writerow([
        'Ticket ID', 'Title', 'Category', 'Priority', 'Status', 'Location',
        'Student Name', 'College Email', 'Department', 'Phone',
        'Created At (UTC)', 'Last Updated (UTC)', 'Student Rating', 'Feedback Comments'
    ])

    for r in rows:
        writer.writerow([
            r['ComplaintID'],
            r['Title'],
            r['CategoryName'],
            r['Priority'],
            r['Status'],
            r['Location'],
            r['StudentName'],
            r['StudentEmail'],
            r['StudentDepartment'],
            r['StudentPhone'] or '',
            r['CreatedAt'],
            r['UpdatedAt'],
            r['FeedbackRating'] or 'N/A',
            r['FeedbackComments'] or ''
        ])

    csv_data = output.getvalue()
    output.close()

    return Response(
        csv_data,
        mimetype='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename=CampusCare_Grievances_Report.csv',
            'Content-Type': 'text/csv; charset=utf-8'
        }
    )

@admin_bp.route('/users/create', methods=['POST'])
@admin_required
def admin_create_user():
    """
    Allow Administrator to register a new Student or Admin/Staff user.
    Enforces @kiet.edu domain compulsory validation.
    Supports profile image file upload or avatar URL.
    """
    image_file = None
    if not request.is_json:
        data = request.form or {}
        image_file = request.files.get('profile_image') or request.files.get('profile_photo')
    else:
        data = request.get_json(silent=True) or {}

    full_name = (data.get('full_name') or '').strip()
    college_email = (data.get('college_email') or '').strip().lower()
    password = data.get('password') or ''
    role = (data.get('role') or 'Student').strip().capitalize()
    department = (data.get('department') or '').strip()
    course = (data.get('course') or '').strip()
    phone = (data.get('phone') or '').strip()
    profile_image = (data.get('profile_image') or '').strip()

    # Handle photo file upload if inserted by admin
    if image_file and image_file.filename:
        ext = image_file.filename.rsplit('.', 1)[-1].lower() if '.' in image_file.filename else ''
        if ext in Config.ALLOWED_EXTENSIONS:
            os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
            unique_name = f"profile_{uuid.uuid4().hex[:10]}_{secure_filename(image_file.filename)}"
            save_path = os.path.join(Config.UPLOAD_FOLDER, unique_name)
            image_file.save(save_path)
            profile_image = f"/uploads/{unique_name}"

    if not profile_image:
        profile_image = 'images/logo.jpg'

    if not full_name or not college_email or not password or not department:
        return jsonify({
            'success': False,
            'message': 'Full name, college email, password, and department are mandatory.'
        }), 400

    if len(full_name) < 2 or len(full_name) > 100:
        return jsonify({'success': False, 'message': 'Full name must be between 2 and 100 characters.'}), 400

    if role not in ('Student', 'Admin'):
        return jsonify({'success': False, 'message': 'Role must be either Student or Admin.'}), 400

    if len(password) < 6 or len(password) > 100:
        return jsonify({'success': False, 'message': 'Password must be between 6 and 100 characters long.'}), 400

    # Phone validation
    if phone:
        import re
        clean_phone = re.sub(r'[\s\-+]', '', phone)
        if clean_phone.startswith('91') and len(clean_phone) == 12:
            clean_phone = clean_phone[2:]
        if not re.match(r'^[6-9]\d{9}$', clean_phone):
            return jsonify({'success': False, 'message': 'Invalid phone number. Must be a valid 10-digit mobile number.'}), 400
        phone = clean_phone

    # Resolve course
    if not course:
        dept_lower = department.lower()
        if 'bca' in dept_lower:
            course = 'BCA'
        elif 'mca' in dept_lower or 'computer applications' in dept_lower:
            course = 'MCA'
        elif 'bba' in dept_lower:
            course = 'BBA'
        elif 'mba' in dept_lower or 'management' in dept_lower:
            course = 'MBA'
        elif 'm.pharm' in dept_lower:
            course = 'M.Pharm'
        elif 'pharm' in dept_lower:
            course = 'B.Pharm'
        elif 'm.tech' in dept_lower:
            course = 'M.Tech'
        elif ' ba ' in f" {dept_lower} " or 'bachelor of arts' in dept_lower or 'humanities' in dept_lower:
            course = 'BA'
        elif role == 'Admin':
            course = 'Staff/Faculty'
        else:
            course = 'B.Tech'

    # Compulsory @kiet.edu domain check
    domain = Config.ALLOWED_EMAIL_DOMAIN
    if domain and domain != '*':
        if '@' not in college_email:
            college_email = f"{college_email}@{domain}"
        elif not college_email.endswith(f"@{domain}"):
            return jsonify({
                'success': False,
                'message': f'Access restricted: Only official @{domain} email addresses are allowed.'
            }), 400

    # Check for existing email in database
    existing = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (college_email,), one=True)
    if existing:
        return jsonify({
            'success': False,
            'message': f'An account with email {college_email} already exists in the system.'
        }), 409

    pwd_hash = hash_password(password)

    inserted = execute_db("""
        INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
        OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.CollegeEmail, INSERTED.Role, INSERTED.Department, INSERTED.Course, INSERTED.Phone, INSERTED.ProfileImage, INSERTED.CreatedAt
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (full_name, college_email, pwd_hash, role, department, course, phone, profile_image))

    if not inserted:
        return jsonify({'success': False, 'message': 'Failed to create user account in database.'}), 500

    new_user = inserted[0]

    return jsonify({
        'success': True,
        'message': f'{role} account for {full_name} created successfully!',
        'user': {
            'user_id': new_user['UserID'],
            'full_name': new_user['FullName'],
            'email': new_user['CollegeEmail'],
            'role': new_user['Role'],
            'course': new_user['Course'] or course,
            'department': new_user['Department'],
            'phone': new_user['Phone'],
            'profile_image': new_user.get('ProfileImage'),
            'created_at': new_user['CreatedAt']
        }
    }), 201

@admin_bp.route('/users', methods=['GET'])
@admin_required
def admin_get_users():
    """
    Fetch all users with optional search and role filtering, including profile images.
    """
    search = (request.args.get('search') or '').strip()
    role = (request.args.get('role') or '').strip().capitalize()

    where_clauses = ["1=1"]
    params = []

    if search:
        where_clauses.append("(FullName LIKE ? OR CollegeEmail LIKE ? OR Department LIKE ? OR Course LIKE ? OR Phone LIKE ?)")
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard, wildcard, wildcard])

    if role and role in ('Student', 'Admin'):
        where_clauses.append("Role = ?")
        params.append(role)

    where_sql = " AND ".join(where_clauses)

    users = query_db(f"""
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, ProfileImage, CreatedAt
        FROM dbo.Users
        WHERE {where_sql}
        ORDER BY CreatedAt DESC
    """, params)

    return jsonify({
        'success': True,
        'users': users,
        'total': len(users)
    })

@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@admin_required
def admin_get_user_details(user_id):
    """
    Fetch a single user record by UserID for inspection or pre-filling edit modals.
    """
    user = query_db("""
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, ProfileImage, CreatedAt
        FROM dbo.Users
        WHERE UserID = ?
    """, (user_id,), one=True)

    if not user:
        return jsonify({'success': False, 'message': 'User record not found.'}), 404

    return jsonify({'success': True, 'user': user})

@admin_bp.route('/users/<int:user_id>', methods=['PUT', 'POST'])
@admin_bp.route('/users/<int:user_id>/update', methods=['POST'])
@admin_required
def admin_update_user(user_id):
    """
    Allow Administrator to update and correct an existing student or user account.
    Supports updating FullName, CollegeEmail, Department, Course, Phone, ProfileImage, and Password.
    """
    user = query_db("""
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, ProfileImage 
        FROM dbo.Users WHERE UserID = ?
    """, (user_id,), one=True)
    if not user:
        return jsonify({'success': False, 'message': 'User record not found.'}), 404

    image_file = None
    if not request.is_json:
        data = request.form or {}
        image_file = request.files.get('profile_image') or request.files.get('profile_photo')
    else:
        data = request.get_json(silent=True) or {}

    full_name = (data.get('full_name') or user.get('FullName') or '').strip()
    college_email = (data.get('college_email') or user.get('CollegeEmail') or '').strip().lower()
    department = (data.get('department') or user.get('Department') or '').strip()
    course = (data.get('course') or user.get('Course') or '').strip()
    phone = (data.get('phone') or '').strip()
    profile_image = (data.get('profile_image') or user.get('ProfileImage') or 'images/logo.jpg').strip()
    new_password = (data.get('password') or '').strip()

    # Handle photo file upload if inserted by admin
    if image_file and image_file.filename:
        ext = image_file.filename.rsplit('.', 1)[-1].lower() if '.' in image_file.filename else ''
        if ext in Config.ALLOWED_EXTENSIONS:
            os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
            unique_name = f"profile_{uuid.uuid4().hex[:10]}_{secure_filename(image_file.filename)}"
            save_path = os.path.join(Config.UPLOAD_FOLDER, unique_name)
            image_file.save(save_path)
            profile_image = f"/uploads/{unique_name}"

    if not full_name:
        return jsonify({'success': False, 'message': 'Full name cannot be empty.'}), 400
    if len(full_name) < 2 or len(full_name) > 100:
        return jsonify({'success': False, 'message': 'Full name must be between 2 and 100 characters.'}), 400

    if not college_email:
        return jsonify({'success': False, 'message': 'College email cannot be empty.'}), 400

    # Compulsory @kiet.edu domain check
    domain = Config.ALLOWED_EMAIL_DOMAIN
    if domain and domain != '*':
        if '@' not in college_email:
            college_email = f"{college_email}@{domain}"
        elif not college_email.endswith(f"@{domain}"):
            return jsonify({
                'success': False,
                'message': f'Access restricted: Only official @{domain} email addresses are allowed.'
            }), 400

    # Check for email conflict with other users
    existing = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ? AND UserID != ?", (college_email, user_id), one=True)
    if existing:
        return jsonify({
            'success': False,
            'message': f'Another account with email {college_email} already exists.'
        }), 409

    # Phone validation
    if phone:
        import re
        clean_phone = re.sub(r'[\s\-+]', '', phone)
        if clean_phone.startswith('91') and len(clean_phone) == 12:
            clean_phone = clean_phone[2:]
        if not re.match(r'^[6-9]\d{9}$', clean_phone):
            return jsonify({'success': False, 'message': 'Invalid phone number. Must be a valid 10-digit mobile number.'}), 400
        phone = clean_phone
    else:
        phone = user.get('Phone')

    # Resolve course if not supplied
    if not course:
        dept_lower = department.lower()
        if 'bca' in dept_lower:
            course = 'BCA'
        elif 'mca' in dept_lower or 'computer applications' in dept_lower:
            course = 'MCA'
        elif 'bba' in dept_lower:
            course = 'BBA'
        elif 'mba' in dept_lower or 'management' in dept_lower:
            course = 'MBA'
        elif 'pharm' in dept_lower:
            course = 'B.Pharm'
        elif 'm.tech' in dept_lower:
            course = 'M.Tech'
        elif user.get('Role') == 'Admin':
            course = 'Staff/Faculty'
        else:
            course = user.get('Course') or 'B.Tech'

    # Execute DB Update
    if new_password:
        if len(new_password) < 6 or len(new_password) > 100:
            return jsonify({'success': False, 'message': 'New password must be between 6 and 100 characters long.'}), 400
        pwd_hash = hash_password(new_password)
        execute_db("""
            UPDATE dbo.Users
            SET FullName = ?, CollegeEmail = ?, PasswordHash = ?, Department = ?, Course = ?, Phone = ?, ProfileImage = ?
            WHERE UserID = ?
        """, (full_name, college_email, pwd_hash, department, course, phone, profile_image, user_id))
    else:
        execute_db("""
            UPDATE dbo.Users
            SET FullName = ?, CollegeEmail = ?, Department = ?, Course = ?, Phone = ?, ProfileImage = ?
            WHERE UserID = ?
        """, (full_name, college_email, department, course, phone, profile_image, user_id))

    updated_user = query_db("""
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, ProfileImage, CreatedAt
        FROM dbo.Users WHERE UserID = ?
    """, (user_id,), one=True)

    return jsonify({
        'success': True,
        'message': f'Record for {full_name} corrected and updated successfully!',
        'user': updated_user
    })

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_bp.route('/users/<int:user_id>/delete', methods=['POST', 'DELETE'])
@admin_required
def admin_delete_user(user_id):
    """
    Allow Administrator to delete an existing student or staff user account.
    Prevents self-deletion and root admin deletion.
    Cascades to complaints, timeline, feedback, notifications.
    """
    user = query_db("SELECT UserID, FullName, CollegeEmail, Role FROM dbo.Users WHERE UserID = ?", (user_id,), one=True)
    if not user:
        return jsonify({'success': False, 'message': 'User record not found.'}), 404

    current_admin_id = request.current_user.get('user_id')
    if user_id == current_admin_id:
        return jsonify({'success': False, 'message': 'Action prohibited: You cannot delete your own active administrator account.'}), 400

    if user_id == 1 or user['CollegeEmail'] == 'admin@kiet.edu':
        return jsonify({'success': False, 'message': 'Action prohibited: Root system administrator account cannot be deleted.'}), 400

    try:
        execute_transaction([
            ("DELETE FROM dbo.Feedback WHERE UserID = ? OR ComplaintID IN (SELECT ComplaintID FROM dbo.Complaints WHERE UserID = ?)", (user_id, user_id)),
            ("DELETE FROM dbo.ComplaintTimeline WHERE UpdatedByUserID = ? OR ComplaintID IN (SELECT ComplaintID FROM dbo.Complaints WHERE UserID = ?)", (user_id, user_id)),
            ("DELETE FROM dbo.Notifications WHERE UserID = ? OR ComplaintID IN (SELECT ComplaintID FROM dbo.Complaints WHERE UserID = ?)", (user_id, user_id)),
            ("DELETE FROM dbo.Complaints WHERE UserID = ?", (user_id,)),
            ("DELETE FROM dbo.Users WHERE UserID = ?", (user_id,))
        ])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to delete user: {str(e)}'}), 500

    return jsonify({
        'success': True,
        'message': f"User '{user['FullName']}' ({user['CollegeEmail']}) has been successfully deleted.",
        'deleted_user_id': user_id
    })

@admin_bp.route('/files', methods=['GET'])
@admin_required
def admin_get_uploaded_files():
    """
    Returns all grievance evidence files uploaded to the backend/uploads directory with metadata.
    Decoupled from static preset avatars.
    """
    upload_dir = Config.UPLOAD_FOLDER
    os.makedirs(upload_dir, exist_ok=True)
    files = []

    # Map filenames to complaint info
    complaint_rows = query_db("SELECT ComplaintID, Title, ImageAttachmentURL, CreatedAt FROM dbo.Complaints WHERE ImageAttachmentURL IS NOT NULL")
    complaint_map = {}
    for c in (complaint_rows or []):
        if c.get('ImageAttachmentURL'):
            fname = c['ImageAttachmentURL'].split('/')[-1]
            complaint_map[fname] = c

    total_bytes = 0
    for entry in os.scandir(upload_dir):
        if entry.is_file() and entry.name != '.gitkeep':
            try:
                stat = entry.stat()
                size = stat.st_size
                total_bytes += size
                ext = entry.name.rsplit('.', 1)[-1].lower() if '.' in entry.name else ''
                
                # Format human-readable size
                if size < 1024:
                    size_str = f"{size} B"
                elif size < 1024 * 1024:
                    size_str = f"{size / 1024:.1f} KB"
                else:
                    size_str = f"{size / (1024 * 1024):.1f} MB"

                # Determine category / association
                assoc = None
                if entry.name in complaint_map:
                    c = complaint_map[entry.name]
                    assoc = {
                        'type': 'Complaint Evidence',
                        'id': c['ComplaintID'],
                        'title': c['Title']
                    }
                else:
                    assoc = {
                        'type': 'Uploaded File',
                        'id': None,
                        'title': 'Grievance Evidence'
                    }

                files.append({
                    'filename': entry.name,
                    'url': f"/uploads/{entry.name}",
                    'size_bytes': size,
                    'size_formatted': size_str,
                    'extension': ext,
                    'is_image': ext in ('png', 'jpg', 'jpeg', 'webp', 'gif'),
                    'modified_at': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    'association': assoc
                })
            except Exception:
                continue

    # Sort newest first
    files.sort(key=lambda x: x['modified_at'], reverse=True)

    total_mb = round(total_bytes / (1024 * 1024), 2)
    return jsonify({
        'success': True,
        'files': files,
        'total_files': len(files),
        'total_size_mb': total_mb
    })

# ============================================================================
# ADMINISTRATIVE NOTIFICATIONS (SYSTEM & REAL-TIME ALERTS)
# ============================================================================

@admin_bp.route('/notifications', methods=['GET'])
@admin_required
def get_admin_notifications():
    """
    Retrieve real-time system notifications for administrators.
    Returns unread count and latest 25 notifications.
    """
    unread_res = query_db("SELECT COUNT(*) AS UnreadCount FROM dbo.Notifications WHERE IsRead = 0 AND UserID IS NULL", one=True)
    unread_count = unread_res['UnreadCount'] if unread_res else 0

    notifications = query_db("""
        SELECT TOP 25 
            NotificationID, ComplaintID, Title, Message, Priority, 
            CategoryName, StudentName, IsRead, CreatedAt
        FROM dbo.Notifications
        WHERE UserID IS NULL
        ORDER BY CreatedAt DESC
    """)

    return jsonify({
        'success': True,
        'unread_count': unread_count,
        'notifications': notifications
    })

@admin_bp.route('/notifications/read/<int:notification_id>', methods=['POST'])
@admin_required
def mark_notification_read(notification_id):
    """
    Mark a single notification as read.
    """
    execute_db("UPDATE dbo.Notifications SET IsRead = 1 WHERE NotificationID = ?", (notification_id,))
    return jsonify({
        'success': True,
        'message': f'Notification #{notification_id} marked as read.'
    })

@admin_bp.route('/notifications/read-all', methods=['POST'])
@admin_required
def mark_all_notifications_read():
    """
    Mark all notifications as read.
    """
    execute_db("UPDATE dbo.Notifications SET IsRead = 1 WHERE IsRead = 0 AND UserID IS NULL")
    return jsonify({
        'success': True,
        'message': 'All notifications marked as read.'
    })


