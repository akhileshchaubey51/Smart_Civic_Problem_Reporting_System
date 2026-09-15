"""
CampusCare Complaint Management Routes
Handles Complaint creation with image evidence upload, Student listing, Detailed tracking, and Post-resolution feedback.
"""
import os
import uuid
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from backend.db import query_db, execute_db
from backend.auth import token_required
from backend.config import Config

complaint_bp = Blueprint('complaints', __name__, url_prefix='/api')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

@complaint_bp.route('/categories', methods=['GET'])
def get_categories():
    categories = query_db("SELECT CategoryID, CategoryName, SLA_Hours FROM dbo.Categories ORDER BY CategoryID ASC")
    return jsonify({'success': True, 'categories': categories})

@complaint_bp.route('/complaints/create', methods=['POST'])
@token_required
def create_complaint():
    # Support both multipart/form-data and JSON
    if request.is_json:
        data = request.get_json() or {}
        image_file = None
    else:
        data = request.form or {}
        image_file = request.files.get('image')

    title = (data.get('title') or '').strip()
    category_id = data.get('category_id')
    description = (data.get('description') or '').strip()
    location = (data.get('location') or '').strip()
    priority = (data.get('priority') or '').strip()

    if not title or not category_id or not description or not location or not priority:
        return jsonify({
            'success': False, 
            'message': 'All fields (title, category, location, priority, description) are mandatory.'
        }), 400

    if len(title) < 5 or len(title) > 150:
        return jsonify({
            'success': False,
            'message': 'Title must be between 5 and 150 characters.'
        }), 400

    if len(location) < 3 or len(location) > 100:
        return jsonify({
            'success': False,
            'message': 'Location must be between 3 and 100 characters (e.g. Block B, 2nd Floor).'
        }), 400

    if len(description) < 15 or len(description) > 2000:
        return jsonify({
            'success': False,
            'message': 'Description must be between 15 and 2000 characters so our team has sufficient detail.'
        }), 400

    if priority not in ('Low', 'Medium', 'High', 'Emergency'):
        return jsonify({
            'success': False, 
            'message': 'Invalid priority level. Allowed: Low, Medium, High, Emergency.'
        }), 400

    # Validate category exists
    try:
        cat_id_int = int(category_id)
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Invalid category identifier.'}), 400

    category = query_db("SELECT CategoryID, CategoryName, SLA_Hours FROM dbo.Categories WHERE CategoryID = ?", (cat_id_int,), one=True)
    if not category:
        return jsonify({'success': False, 'message': 'Selected category does not exist in our system.'}), 400

    # Handle image attachment upload
    image_url = None
    if image_file and image_file.filename:
        if not allowed_file(image_file.filename):
            return jsonify({
                'success': False, 
                'message': f'Invalid file format. Allowed formats: {", ".join(Config.ALLOWED_EXTENSIONS)}'
            }), 400

        # Verify file size (10 MB limit)
        image_file.seek(0, os.SEEK_END)
        file_size = image_file.tell()
        image_file.seek(0)
        if file_size > Config.MAX_CONTENT_LENGTH:
            return jsonify({
                'success': False,
                'message': f'Uploaded image is too large ({round(file_size / (1024*1024), 2)} MB). Maximum allowed size is 10 MB.'
            }), 400

        try:
            os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
            safe_name = secure_filename(image_file.filename)
            unique_name = f"{uuid.uuid4().hex[:12]}_{safe_name}"
            save_path = os.path.join(Config.UPLOAD_FOLDER, unique_name)
            image_file.save(save_path)
            image_url = f"/uploads/{unique_name}"
        except Exception as e:
            return jsonify({
                'success': False,
                'message': f'Failed to store uploaded image: {str(e)}'
            }), 500

    user_id = request.current_user['user_id']

    # Insert complaint
    try:
        inserted = execute_db("""
            INSERT INTO dbo.Complaints (UserID, CategoryID, Title, Description, Location, Priority, Status, ImageAttachmentURL)
            OUTPUT INSERTED.ComplaintID, INSERTED.Title, INSERTED.Status, INSERTED.CreatedAt
            VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
        """, (user_id, cat_id_int, title, description, location, priority, image_url))
    except Exception as e:
        return jsonify({'success': False, 'message': f'Database error while submitting grievance: {str(e)}'}), 500

    if not inserted:
        return jsonify({'success': False, 'message': 'Could not submit complaint to database.'}), 500

    new_complaint = inserted[0]
    complaint_id = new_complaint['ComplaintID']

    # Insert initial timeline log
    try:
        execute_db("""
            INSERT INTO dbo.ComplaintTimeline (ComplaintID, UpdatedByUserID, PreviousStatus, NewStatus, Remarks)
            VALUES (?, ?, NULL, 'Pending', 'Grievance ticket registered by student.')
        """, (complaint_id, user_id))
    except Exception:
        pass  # non-critical for response

    # Fetch student details for notifications
    student = query_db("""
        SELECT UserID, FullName, CollegeEmail, Department, Course, Phone 
        FROM dbo.Users 
        WHERE UserID = ?
    """, (user_id,), one=True)

    # 1. Insert System Notification into dbo.Notifications
    try:
        student_display = student['FullName'] if student else 'Student'
        cat_name = category.get('CategoryName', 'Campus Service')
        notif_title = f"New {priority} Grievance: {title[:60]}"
        notif_msg = f"{student_display} ({student.get('Department', '-')}) reported {priority.lower()} priority grievance #{complaint_id} at {location}."
        execute_db("""
            INSERT INTO dbo.Notifications (ComplaintID, Title, Message, Priority, CategoryName, StudentName, IsRead)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (complaint_id, notif_title, notif_msg, priority, cat_name, student_display))
    except Exception as notif_err:
        print(f"[-] Non-critical error creating system notification: {notif_err}")

    # 2. Dispatch Asynchronous Email Notification to Admin
    try:
        complaint_payload = {
            'ComplaintID': complaint_id,
            'Title': title,
            'Description': description,
            'Location': location,
            'Priority': priority,
            'Status': 'Pending'
        }
        from backend.services.email_service import dispatch_complaint_email
        dispatch_complaint_email(complaint_payload, student, category)
    except Exception as email_err:
        print(f"[-] Non-critical error dispatching admin email notification: {email_err}")

    return jsonify({
        'success': True,
        'message': 'Grievance ticket registered successfully.',
        'complaint_id': complaint_id,
        'sla_hours': category['SLA_Hours'],
        'complaint': new_complaint
    }), 201

@complaint_bp.route('/complaints/student', methods=['GET'])
@token_required
def get_student_complaints():
    user_id = request.current_user['user_id']

    complaints = query_db("""
        SELECT 
            c.ComplaintID, c.Title, c.Description, c.Location, c.Priority, c.Status,
            c.ImageAttachmentURL, c.CreatedAt, c.UpdatedAt,
            cat.CategoryID, cat.CategoryName, cat.SLA_Hours,
            f.Rating AS FeedbackRating, f.Comments AS FeedbackComments
        FROM dbo.Complaints c
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        LEFT JOIN dbo.Feedback f ON c.ComplaintID = f.ComplaintID
        WHERE c.UserID = ?
        ORDER BY c.CreatedAt DESC
    """, (user_id,))

    # Compute quick metrics
    total = len(complaints)
    pending = sum(1 for c in complaints if c['Status'] == 'Pending')
    in_progress = sum(1 for c in complaints if c['Status'] == 'In Progress')
    resolved = sum(1 for c in complaints if c['Status'] == 'Resolved')

    return jsonify({
        'success': True,
        'metrics': {
            'total': total,
            'pending': pending,
            'in_progress': in_progress,
            'resolved': resolved
        },
        'complaints': complaints
    })

@complaint_bp.route('/complaints/track/<int:complaint_id>', methods=['GET'])
@token_required
def track_complaint(complaint_id):
    user_id = request.current_user['user_id']
    role = request.current_user.get('role')

    complaint = query_db("""
        SELECT 
            c.ComplaintID, c.UserID, c.Title, c.Description, c.Location, c.Priority, c.Status,
            c.ImageAttachmentURL, c.CreatedAt, c.UpdatedAt,
            cat.CategoryID, cat.CategoryName, cat.SLA_Hours,
            u.FullName AS StudentName, u.CollegeEmail AS StudentEmail, u.Department AS StudentDepartment, u.Phone AS StudentPhone,
            f.FeedbackID, f.Rating AS FeedbackRating, f.Comments AS FeedbackComments, f.CreatedAt AS FeedbackDate
        FROM dbo.Complaints c
        INNER JOIN dbo.Categories cat ON c.CategoryID = cat.CategoryID
        INNER JOIN dbo.Users u ON c.UserID = u.UserID
        LEFT JOIN dbo.Feedback f ON c.ComplaintID = f.ComplaintID
        WHERE c.ComplaintID = ?
    """, (complaint_id,), one=True)

    if not complaint:
        return jsonify({'success': False, 'message': 'Complaint ticket not found.'}), 404

    # Security check: Only Admin or the ticket owner can view
    if role != 'Admin' and complaint['UserID'] != user_id:
        return jsonify({'success': False, 'message': 'Unauthorized to view this complaint ticket.'}), 403

    # Fetch chronological timeline
    timeline = query_db("""
        SELECT 
            t.LogID, t.PreviousStatus, t.NewStatus, t.Remarks, t.Timestamp,
            u.FullName AS UpdatedByName, u.Role AS UpdatedByRole
        FROM dbo.ComplaintTimeline t
        INNER JOIN dbo.Users u ON t.UpdatedByUserID = u.UserID
        WHERE t.ComplaintID = ?
        ORDER BY t.Timestamp ASC
    """, (complaint_id,))

    return jsonify({
        'success': True,
        'complaint': complaint,
        'timeline': timeline
    })

@complaint_bp.route('/complaints/feedback', methods=['POST'])
@token_required
def submit_feedback():
    data = request.get_json() or {}
    complaint_id = data.get('complaint_id')
    rating = data.get('rating')
    comments = (data.get('comments') or '').strip()

    if not complaint_id or rating is None:
        return jsonify({'success': False, 'message': 'Complaint ID and rating are required.'}), 400

    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            raise ValueError()
    except ValueError:
        return jsonify({'success': False, 'message': 'Rating must be an integer between 1 and 5.'}), 400

    user_id = request.current_user['user_id']

    complaint = query_db("""
        SELECT ComplaintID, UserID, Status 
        FROM dbo.Complaints 
        WHERE ComplaintID = ?
    """, (complaint_id,), one=True)

    if not complaint:
        return jsonify({'success': False, 'message': 'Complaint ticket not found.'}), 404

    if complaint['UserID'] != user_id:
        return jsonify({'success': False, 'message': 'You can only submit feedback for your own complaints.'}), 403

    if complaint['Status'] != 'Resolved':
        return jsonify({'success': False, 'message': 'Feedback can only be provided for resolved complaints.'}), 400

    # Check if already submitted
    existing = query_db("SELECT FeedbackID FROM dbo.Feedback WHERE ComplaintID = ?", (complaint_id,), one=True)
    if existing:
        return jsonify({'success': False, 'message': 'Feedback has already been submitted for this complaint.'}), 409

    result = execute_db("""
        INSERT INTO dbo.Feedback (ComplaintID, UserID, Rating, Comments)
        OUTPUT INSERTED.FeedbackID, INSERTED.Rating, INSERTED.Comments, INSERTED.CreatedAt
        VALUES (?, ?, ?, ?)
    """, (complaint_id, user_id, rating, comments))

    return jsonify({
        'success': True,
        'message': 'Thank you! Your feedback has been recorded.',
        'feedback': result[0] if result else None
    }), 201
