"""
CampusCare Administrator Routes
Handles Complaint listing with filtering/pagination, Status transitions with timeline audit,
KPI metrics for analytics charts, and CSV report export.
"""
import csv
import io
from flask import Blueprint, request, jsonify, Response
from backend.db import query_db, execute_db, execute_transaction
from backend.auth import admin_required, hash_password
from backend.config import Config

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
    current = query_db("SELECT ComplaintID, Status FROM dbo.Complaints WHERE ComplaintID = ?", (complaint_id,), one=True)
    if not current:
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    prev_status = current['Status']
    admin_id = request.current_user['user_id']

    # Execute atomic status update and history log insertion
    try:
        execute_transaction([
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
        ])
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
    """
    data = request.get_json() or {}
    full_name = (data.get('full_name') or '').strip()
    college_email = (data.get('college_email') or '').strip().lower()
    password = data.get('password') or ''
    role = (data.get('role') or 'Student').strip().capitalize()
    department = (data.get('department') or '').strip()
    course = (data.get('course') or '').strip()
    phone = (data.get('phone') or '').strip()

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
        INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone)
        OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.CollegeEmail, INSERTED.Role, INSERTED.Department, INSERTED.Course, INSERTED.Phone, INSERTED.CreatedAt
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (full_name, college_email, pwd_hash, role, department, course, phone))

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
            'created_at': new_user['CreatedAt']
        }
    }), 201

@admin_bp.route('/users', methods=['GET'])
@admin_required
def admin_get_users():
    """
    Fetch all users with optional search and role filtering.
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
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, CreatedAt
        FROM dbo.Users
        WHERE {where_sql}
        ORDER BY CreatedAt DESC
    """, params)

    return jsonify({
        'success': True,
        'users': users,
        'total': len(users)
    })

