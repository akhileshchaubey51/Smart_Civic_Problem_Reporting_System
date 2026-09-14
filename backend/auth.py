"""
CampusCare Authentication & Authorization Module
JWT token creation, validation, and role-based route decorators.
"""
from functools import wraps
from datetime import datetime, timezone, timedelta
import jwt
from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from backend.config import Config

def hash_password(password: str) -> str:
    return generate_password_hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return check_password_hash(hashed, password)

def generate_token(user: dict) -> str:
    """Generate a signed JWT token containing user identity and role."""
    payload = {
        'user_id': user['UserID'],
        'email': user['CollegeEmail'],
        'full_name': user['FullName'],
        'role': user['Role'],
        'department': user['Department'],
        'course': user.get('Course') or 'B.Tech',
        'exp': datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')
    return token

def decode_token(token: str) -> dict:
    """Decode and verify the signature and validity of the JWT token."""
    return jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])

def token_required(f):
    """Decorator to enforce that the request carries a valid Bearer JWT."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'success': False, 'message': 'Authorization header is missing'}), 401
        
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return jsonify({'success': False, 'message': 'Invalid token format. Expected: Bearer <token>'}), 401

        token = parts[1]
        try:
            payload = decode_token(token)
            request.current_user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'message': 'Session expired. Please log in again.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'message': 'Invalid authentication token.'}), 401

        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Decorator to enforce that the request user has the 'Admin' role."""
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if request.current_user.get('role') != 'Admin':
            return jsonify({'success': False, 'message': 'Access denied: Administrator privileges required.'}), 403
        return f(*args, **kwargs)
    return decorated
