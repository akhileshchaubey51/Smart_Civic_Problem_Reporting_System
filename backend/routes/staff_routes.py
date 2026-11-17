"""
CampusCare Staff & Department In-Charge Routes
Dedicated endpoints for College Staff / Technicians / Department In-Charges.
Enables viewing assigned grievance tickets, seeing who is working on what across
departments, receiving instant notifications when tagged, and logging action remarks.
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from backend.db import query_db, execute_db, execute_transaction
from backend.auth import token_required, staff_required

staff_bp = Blueprint('staff', __name__, url_prefix='/api/staff')

@staff_bp.route('/overview', methods=['GET'])
@staff_required
def get_staff_overview():
    """
    Returns KPI metrics for the logged-in staff member:
    Total assigned tasks, pending tasks, in-progress tasks, resolved tasks,
    college-wide issues count, and unread notification alerts.
    """
    user_id = request.current_user['user_id']

    # 1. Staff's own assigned tasks counts
    stats = query_db("""
        SELECT 
            COUNT(*) AS TotalAssigned,
            SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS PendingTasks,
            SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) AS InProgressTasks,
            SUM(CASE WHEN Status = 'Resolved' THEN 1 ELSE 0 END) AS ResolvedTasks
        FROM dbo.Complaints
        WHERE AssignedToUserID = ?
    """, (user_id,), one=True) or {'TotalAssigned': 0, 'PendingTasks': 0, 'InProgressTasks': 0, 'ResolvedTasks': 0}

    # 2. Total issues across all college departments
    total_college = query_db("SELECT COUNT(*) AS Total FROM dbo.Complaints", one=True)
    college_issues_count = total_college['Total'] if total_college else 0

    # 3. Unread notifications for this staff member
    unread_res = query_db("""
        SELECT COUNT(*) AS UnreadCount 
        FROM dbo.Notifications 
        WHERE (UserID = ? OR UserID IS NULL) AND IsRead = 0
    """, (user_id,), one=True)
    unread_count = unread_res['UnreadCount'] if unread_res else 0

    return jsonify({
        'success': True,
        'kpi': {
            'total_assigned': stats.get('TotalAssigned', 0) or 0,
            'pending_tasks': stats.get('PendingTasks', 0) or 0,
            'in_progress_tasks': stats.get('InProgressTasks', 0) or 0,
            'resolved_tasks': stats.get('ResolvedTasks', 0) or 0,
            'college_issues': college_issues_count,
            'unread_notifications': unread_count
        },
        'user': {
            'user_id': user_id,
            'full_name': request.current_user.get('full_name'),
            'email': request.current_user.get('email'),
            'department': request.current_user.get('department'),
            'role': request.current_user.get('role')
        }
    })

@staff_bp.route('/my-tasks', methods=['GET'])
@staff_required
def get_staff_my_tasks():
    """
    Returns all grievances assigned to the currently logged in staff member.
    """
    user_id = request.current_user['user_id']
    status = (request.args.get('status') or '').strip()

    where_clauses = ["c.AssignedToUserID = ?"]
    params = [user_id]

    if status and status.lower() != 'all':
        where_clauses.append("c.Status = ?")
        params.append(status)

    where_sql = " AND ".join(where_clauses)

    complaints = query_db(f"""
        SELECT 
            c.ComplaintID, c.Title, c.Description, c.Location, c.Priority, c.Status,
            c.Upvotes, c.Latitude, c.Longitude,
            c.ImageAttachmentURL, c.CreatedAt, c.UpdatedAt,
            c.AssignedToUserID, c.DepartmentTag, c.AssignedAt, c.AssignedNotes,
            cat.CategoryID, cat.CategoryName, cat.SLA_Hours,
            u.FullName AS StudentName, u.CollegeEmail AS StudentEmail, u.Department AS StudentDepartment, u.Phone AS StudentPhone,
            f.Rating AS FeedbackRating, f.Comments AS FeedbackComments
        FROM dbo.Complaints c
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        LEFT JOIN dbo.Feedback f ON c.ComplaintID = f.ComplaintID
        WHERE {where_sql}
        ORDER BY 
            CASE c.Priority 
                WHEN 'Emergency' THEN 1 
                WHEN 'High' THEN 2 
                WHEN 'Medium' THEN 3 
                ELSE 4 
            END ASC,
            c.CreatedAt DESC
    """, params)

    return jsonify({
        'success': True,
        'tasks': complaints,
        'count': len(complaints)
    })

@staff_bp.route('/all-issues', methods=['GET'])
@staff_required
def get_staff_all_issues():
    """
    Returns all issues across the college with transparency on which department
    and which staff in-charge is assigned to each ticket.
    Supports search, department tag filtering, and status filtering.
    """
    search = (request.args.get('search') or '').strip()
    status = (request.args.get('status') or '').strip()
    dept = (request.args.get('department') or '').strip()

    where_clauses = ["1=1"]
    params = []

    if search:
        where_clauses.append("(c.Title LIKE ? OR c.Description LIKE ? OR c.Location LIKE ? OR c.DepartmentTag LIKE ? OR assigned_u.FullName LIKE ?)")
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard, wildcard, wildcard])

    if status and status.lower() != 'all':
        where_clauses.append("c.Status = ?")
        params.append(status)

    if dept and dept.lower() != 'all':
        where_clauses.append("(c.DepartmentTag LIKE ? OR assigned_u.Department LIKE ?)")
        wildcard_dept = f"%{dept}%"
        params.extend([wildcard_dept, wildcard_dept])

    where_sql = " AND ".join(where_clauses)

    complaints = query_db(f"""
        SELECT 
            c.ComplaintID, c.Title, c.Description, c.Location, c.Priority, c.Status,
            c.Upvotes, c.Latitude, c.Longitude,
            c.ImageAttachmentURL, c.CreatedAt, c.UpdatedAt,
            c.AssignedToUserID, c.DepartmentTag, c.AssignedAt, c.AssignedNotes,
            assigned_u.FullName AS AssignedToName, assigned_u.CollegeEmail AS AssignedToEmail, assigned_u.Department AS AssignedToDepartment,
            cat.CategoryID, cat.CategoryName, cat.SLA_Hours,
            u.FullName AS StudentName, u.CollegeEmail AS StudentEmail, u.Department AS StudentDepartment
        FROM dbo.Complaints c
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        LEFT JOIN dbo.Users assigned_u ON c.AssignedToUserID = assigned_u.UserID
        WHERE {where_sql}
        ORDER BY c.CreatedAt DESC
    """, params)

    return jsonify({
        'success': True,
        'issues': complaints,
        'count': len(complaints)
    })

@staff_bp.route('/update-task/<int:complaint_id>', methods=['POST'])
@staff_required
def staff_update_task(complaint_id):
    """
    Allows the assigned staff member to update task progress (In Progress or Resolved)
    with required action remarks / repair report.
    """
    user_id = request.current_user['user_id']
    user_name = request.current_user.get('full_name') or 'Staff Member'
    user_dept = request.current_user.get('department') or 'Maintenance Cell'
    role = request.current_user.get('role')
    data = request.get_json() or {}

    new_status = (data.get('status') or '').strip()
    remarks = (data.get('remarks') or '').strip()

    if new_status not in ('In Progress', 'Resolved', 'Pending'):
        return jsonify({'success': False, 'message': 'Status can only be set to "Pending", "In Progress", or "Resolved".'}), 400

    if not remarks or len(remarks) < 5:
        return jsonify({'success': False, 'message': 'Please provide action remarks (minimum 5 characters).'}), 400

    complaint = query_db("""
        SELECT ComplaintID, Status, AssignedToUserID, DepartmentTag, Title
        FROM dbo.Complaints 
        WHERE ComplaintID = ?
    """, (complaint_id,), one=True)

    if not complaint:
        return jsonify({'success': False, 'message': 'Complaint ticket not found.'}), 404

    # Permission check: must be assigned user or an Admin
    if role != 'Admin' and complaint.get('AssignedToUserID') != user_id:
        return jsonify({'success': False, 'message': 'You are only authorized to update tasks assigned to your ID.'}), 403

    prev_status = complaint['Status']
    tag_info = f" [{complaint.get('DepartmentTag')}]" if complaint.get('DepartmentTag') else ""
    full_remarks = f"{remarks} — [Action by Staff In-Charge: {user_name} ({user_dept}){tag_info}]"

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
                (complaint_id, user_id, prev_status, new_status, full_remarks)
            )
        ])

        return jsonify({
            'success': True,
            'message': f'Ticket #CMP-{complaint_id} updated to "{new_status}" successfully.',
            'complaint_id': complaint_id,
            'new_status': new_status,
            'remarks': remarks
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update task: {str(e)}'}), 500

@staff_bp.route('/notifications', methods=['GET'])
@staff_required
def get_staff_notifications():
    """
    Returns real-time notifications for the logged-in staff member.
    Includes unread count and latest 30 notifications.
    """
    user_id = request.current_user['user_id']

    unread_res = query_db("""
        SELECT COUNT(*) AS UnreadCount 
        FROM dbo.Notifications 
        WHERE (UserID = ? OR UserID IS NULL) AND IsRead = 0
    """, (user_id,), one=True)
    unread_count = unread_res['UnreadCount'] if unread_res else 0

    notifications = query_db("""
        SELECT TOP 30 
            NotificationID, ComplaintID, Title, Message, Priority, 
            CategoryName, StudentName, IsRead, CreatedAt
        FROM dbo.Notifications
        WHERE (UserID = ? OR UserID IS NULL)
        ORDER BY CreatedAt DESC
    """, (user_id,))

    return jsonify({
        'success': True,
        'unread_count': unread_count,
        'notifications': notifications
    })

@staff_bp.route('/notifications/read/<int:notification_id>', methods=['POST'])
@staff_required
def mark_staff_notification_read(notification_id):
    """
    Mark a single notification as read.
    """
    user_id = request.current_user['user_id']
    execute_db("UPDATE dbo.Notifications SET IsRead = 1 WHERE NotificationID = ? AND (UserID = ? OR UserID IS NULL)", (notification_id, user_id))
    return jsonify({
        'success': True,
        'message': f'Notification #{notification_id} marked as read.'
    })

@staff_bp.route('/notifications/read-all', methods=['POST'])
@staff_required
def mark_all_staff_notifications_read():
    """
    Mark all notifications for this staff member as read.
    """
    user_id = request.current_user['user_id']
    execute_db("UPDATE dbo.Notifications SET IsRead = 1 WHERE (UserID = ? OR UserID IS NULL) AND IsRead = 0", (user_id,))
    return jsonify({
        'success': True,
        'message': 'All notifications marked as read.'
    })
