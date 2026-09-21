"""
CampusCare Authentication Routes
Handles Student registration with college domain validation, User login, and Session checks.
"""
from flask import Blueprint, request, jsonify
from backend.db import query_db, execute_db
from backend.auth import hash_password, verify_password, generate_token, token_required
from backend.config import Config

import os
import re
import uuid
from werkzeug.utils import secure_filename

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def infer_course(dept: str, explicit_course: str = '') -> str:
    if explicit_course:
        return explicit_course
    dept_lower = (dept or '').lower()
    if 'bca' in dept_lower:
        return 'BCA'
    if 'mca' in dept_lower or 'computer applications' in dept_lower:
        return 'MCA'
    if 'bba' in dept_lower:
        return 'BBA'
    if 'mba' in dept_lower or 'management' in dept_lower:
        return 'MBA'
    if 'm.pharm' in dept_lower:
        return 'M.Pharm'
    if 'pharm' in dept_lower:
        return 'B.Pharm'
    if 'm.tech' in dept_lower:
        return 'M.Tech'
    if ' ba ' in f" {dept_lower} " or 'bachelor of arts' in dept_lower or 'humanities' in dept_lower:
        return 'BA'
    return 'B.Tech'

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    
    full_name = (data.get('full_name') or '').strip()
    college_email = (data.get('college_email') or '').strip().lower()
    password = data.get('password') or ''
    department = (data.get('department') or '').strip()
    course = (data.get('course') or '').strip()
    phone = (data.get('phone') or '').strip()

    # Field validations
    if not full_name or not college_email or not password or not department:
        return jsonify({
            'success': False, 
            'message': 'Full name, college email, password, and department are required.'
        }), 400

    if len(full_name) < 2 or len(full_name) > 100:
        return jsonify({
            'success': False,
            'message': 'Full name must be between 2 and 100 characters.'
        }), 400

    # Auto-append domain if roll number entered
    domain = Config.ALLOWED_EMAIL_DOMAIN
    if domain and domain != '*':
        if '@' not in college_email:
            college_email = f"{college_email}@{domain}"
        elif not college_email.endswith(f"@{domain}"):
            return jsonify({
                'success': False, 
                'message': f'Registration is restricted to college students with an official @{domain} email address.'
            }), 400

    if len(password) < 6 or len(password) > 100:
        return jsonify({
            'success': False, 
            'message': 'Password must be between 6 and 100 characters long.'
        }), 400

    # Phone validation (optional, but if provided must be valid Indian mobile)
    if phone:
        # Strip spaces and dashes
        clean_phone = re.sub(r'[\s\-+]', '', phone)
        if clean_phone.startswith('91') and len(clean_phone) == 12:
            clean_phone = clean_phone[2:]
        if not re.match(r'^[6-9]\d{9}$', clean_phone):
            return jsonify({
                'success': False,
                'message': 'Invalid phone number format. Please enter a valid 10-digit mobile number.'
            }), 400
        phone = clean_phone

    # Resolve course
    course = infer_course(department, course)

    # Check for existing email
    existing = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = ?", (college_email,), one=True)
    if existing:
        return jsonify({
            'success': False, 
            'message': f'An account with {college_email} already exists. Please log in.'
        }), 409

    # Hash password and insert
    pwd_hash = hash_password(password)
    result = execute_db("""
        INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone)
        OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.CollegeEmail, INSERTED.Role, INSERTED.Department, INSERTED.Course, INSERTED.Phone, INSERTED.CreatedAt
        VALUES (?, ?, ?, 'Student', ?, ?, ?)
    """, (full_name, college_email, pwd_hash, department, course, phone))

    if not result:
        return jsonify({'success': False, 'message': 'Failed to create student account.'}), 500

    user = result[0]
    token = generate_token(user)

    return jsonify({
        'success': True,
        'message': f'Registration successful! Welcome to CampusCare, {user["FullName"]}.',
        'token': token,
        'user': {
            'user_id': user['UserID'],
            'full_name': user['FullName'],
            'email': user['CollegeEmail'],
            'role': user['Role'],
            'course': user['Course'] or course,
            'department': user['Department'],
            'phone': user['Phone']
        }
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    college_email = (data.get('college_email') or data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not college_email or not password:
        return jsonify({'success': False, 'message': 'College ID/Email and password are required.'}), 400

    # Compulsory @kiet.edu domain enforcement
    domain = Config.ALLOWED_EMAIL_DOMAIN
    if domain and domain != '*':
        if '@' not in college_email:
            college_email = f"{college_email}@{domain}"
        elif not college_email.endswith(f"@{domain}"):
            return jsonify({
                'success': False,
                'message': f'Access restricted: Official @{domain} college ID is compulsory.'
            }), 403

    user = query_db("""
        SELECT UserID, FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage, CreatedAt
        FROM dbo.Users 
        WHERE CollegeEmail = ?
    """, (college_email,), one=True)

    if not user or not verify_password(password, user['PasswordHash']):
        return jsonify({'success': False, 'message': 'Invalid credentials. Please verify your college email and password.'}), 401

    token = generate_token(user)

    return jsonify({
        'success': True,
        'message': 'Login successful.',
        'token': token,
        'user': {
            'user_id': user['UserID'],
            'full_name': user['FullName'],
            'email': user['CollegeEmail'],
            'role': user['Role'],
            'course': user.get('Course') or infer_course(user.get('Department', '')),
            'department': user['Department'],
            'phone': user['Phone'],
            'profile_image': user.get('ProfileImage')
        }
    }), 200

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user():
    user = query_db("""
        SELECT UserID, FullName, CollegeEmail, Role, Department, Course, Phone, ProfileImage, CreatedAt
        FROM dbo.Users 
        WHERE UserID = ?
    """, (request.current_user['user_id'],), one=True)

    if not user:
        return jsonify({'success': False, 'message': 'User record not found.'}), 404

    user['course'] = user.get('Course') or infer_course(user.get('Department', ''))
    user['profile_image'] = user.get('ProfileImage')
    return jsonify({'success': True, 'user': user})

@auth_bp.route('/profile-photo', methods=['POST'])
@token_required
def update_profile_photo():
    """
    Update profile photo for the logged-in user.
    Supports file upload (multipart/form-data) or JSON { "profile_image": "URL" }.
    """
    user_id = request.current_user['user_id']
    image_url = None

    if 'profile_image' in request.files or 'profile_photo' in request.files or 'image' in request.files:
        photo_file = request.files.get('profile_image') or request.files.get('profile_photo') or request.files.get('image')
        if photo_file and photo_file.filename:
            ext = photo_file.filename.rsplit('.', 1)[-1].lower() if '.' in photo_file.filename else ''
            if ext not in Config.ALLOWED_EXTENSIONS:
                return jsonify({'success': False, 'message': f'Invalid file format. Allowed: {", ".join(Config.ALLOWED_EXTENSIONS)}'}), 400

            os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
            unique_filename = f"avatar_{uuid.uuid4().hex[:10]}_{secure_filename(photo_file.filename)}"
            save_path = os.path.join(Config.UPLOAD_FOLDER, unique_filename)
            photo_file.save(save_path)
            image_url = f"/uploads/{unique_filename}"
    else:
        data = request.get_json(silent=True) or request.form or {}
        image_url = (data.get('profile_image') or data.get('profile_photo') or '').strip()

    if not image_url:
        return jsonify({'success': False, 'message': 'No profile photo file or image URL provided.'}), 400

    execute_db("UPDATE dbo.Users SET ProfileImage = ? WHERE UserID = ?", (image_url, user_id))

    return jsonify({
        'success': True,
        'message': 'Profile picture updated successfully.',
        'profile_image': image_url
    }), 200

@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password():
    data = request.get_json() or {}
    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''

    if not current_password or not new_password:
        return jsonify({'success': False, 'message': 'Current and new password are required.'}), 400

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters long.'}), 400

    if current_password == new_password:
        return jsonify({'success': False, 'message': 'New password cannot be the same as your current password.'}), 400

    user = query_db("SELECT UserID, PasswordHash FROM dbo.Users WHERE UserID = ?", (request.current_user['user_id'],), one=True)
    if not user or not verify_password(current_password, user['PasswordHash']):
        return jsonify({'success': False, 'message': 'Current password does not match our records.'}), 400

    new_hash = hash_password(new_password)
    execute_db("UPDATE dbo.Users SET PasswordHash = ? WHERE UserID = ?", (new_hash, request.current_user['user_id']))

    return jsonify({'success': True, 'message': 'Password updated successfully.'})

