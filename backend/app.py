"""
CampusCare Flask Application Entry Point
Initializes routes, middleware, static file handlers, and error handlers.
"""
import os
import sys
from pathlib import Path

# Add project root to sys.path to allow absolute imports
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from flask import Flask, jsonify, send_from_directory, request, redirect
from flask_cors import CORS
from backend.config import Config
from backend.routes.auth_routes import auth_bp
from backend.routes.complaint_routes import complaint_bp
from backend.routes.admin_routes import admin_bp

def create_app():
    frontend_dir = BASE_DIR / 'frontend'
    app = Flask(__name__, static_folder=str(frontend_dir))
    
    app.config['SECRET_KEY'] = Config.SECRET_KEY
    app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH
    app.config['UPLOAD_FOLDER'] = str(Config.UPLOAD_FOLDER)

    # Ensure upload directory exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Register API Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(complaint_bp)
    app.register_blueprint(admin_bp)

    # Static route for uploaded images
    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        return send_from_directory(str(Config.UPLOAD_FOLDER), filename)

    # Static routes for Frontend Landing Page and Resolution Portal
    @app.route('/')
    @app.route('/landing')
    def serve_landing():
        return send_from_directory(str(frontend_dir), 'landing.html')

    @app.route('/portal')
    def serve_portal_redirect():
        return redirect('/index.html')

    @app.route('/admin')
    @app.route('/admin.html')
    def serve_admin():
        return send_from_directory(str(frontend_dir), 'admin.html')

    @app.route('/admin.css')
    def serve_admin_css():
        return send_from_directory(str(frontend_dir), 'admin.css')

    @app.route('/page-transitions.css')
    def serve_page_transitions_css():
        return send_from_directory(str(frontend_dir / 'css'), 'page-transitions.css')

    @app.route('/page-transitions.js')
    def serve_page_transitions_js():
        return send_from_directory(str(frontend_dir / 'js'), 'page-transitions.js')

    @app.route('/index.html')
    def serve_index():
        return send_from_directory(str(frontend_dir), 'index.html')

    @app.route('/login')
    def serve_login():
        return send_from_directory(str(frontend_dir), 'login.html')

    @app.route('/login.css')
    def serve_login_css():
        return send_from_directory(str(frontend_dir), 'login.css')

    @app.route('/login.js')
    def serve_login_js():
        return send_from_directory(str(frontend_dir), 'login.js')

    @app.route('/dashboard')
    @app.route('/dashboard.html')
    def serve_dashboard():
        return send_from_directory(str(frontend_dir), 'dashboard.html')

    @app.route('/dashboard.css')
    def serve_dashboard_css():
        return send_from_directory(str(frontend_dir), 'dashboard.css')

    @app.route('/dashboard.js')
    def serve_dashboard_js():
        return send_from_directory(str(frontend_dir), 'dashboard.js')

    @app.route('/complaint-form')
    @app.route('/complaint-form.html')
    def serve_complaint_form():
        return send_from_directory(str(frontend_dir), 'complaint-form.html')

    @app.route('/complaint-form.css')
    def serve_complaint_form_css():
        return send_from_directory(str(frontend_dir), 'complaint-form.css')

    @app.route('/complaint-form.js')
    def serve_complaint_form_js():
        return send_from_directory(str(frontend_dir), 'complaint-form.js')

    @app.route('/style.css')
    def serve_root_css():
        return send_from_directory(str(frontend_dir), 'style.css')

    @app.route('/script.js')
    def serve_root_js():
        return send_from_directory(str(frontend_dir), 'script.js')

    @app.route('/images/<path:filename>')
    def serve_images(filename):
        return send_from_directory(str(frontend_dir / 'images'), filename)

    @app.route('/video/<path:filename>')
    def serve_video(filename):
        return send_from_directory(str(frontend_dir / 'video'), filename)

    @app.route('/css/<path:filename>')
    def serve_css(filename):
        return send_from_directory(str(frontend_dir / 'css'), filename)

    @app.route('/js/<path:filename>')
    def serve_js(filename):
        return send_from_directory(str(frontend_dir / 'js'), filename)

    # Global Error Handlers
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({'success': False, 'message': str(e)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({'success': False, 'message': 'Authentication required.'}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({'success': False, 'message': 'Access forbidden.'}), 403

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'message': 'API endpoint not found.'}), 404
        return send_from_directory(str(frontend_dir), 'index.html')

    @app.errorhandler(413)
    def file_too_large(e):
        return jsonify({'success': False, 'message': 'Uploaded file exceeds 10MB limit.'}), 413

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({'success': False, 'message': 'Internal server error occurred.'}), 500

    return app

app = create_app()

if __name__ == '__main__':
    print(f"[*] Starting CampusCare Server on http://127.0.0.1:{Config.PORT}")
    app.run(host='0.0.0.0', port=Config.PORT, debug=Config.DEBUG)
