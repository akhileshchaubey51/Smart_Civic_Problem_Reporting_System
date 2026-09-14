"""
CampusCare Configuration Module
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file
load_dotenv(BASE_DIR / '.env')

class Config:
    # Flask & Security
    SECRET_KEY = os.getenv('SECRET_KEY', 'campuscare_jwt_production_secret_key_default')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', 24))
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'True').lower() in ('true', '1', 'yes')

    # SQL Server Database
    DB_SERVER = os.getenv('DB_SERVER', 'localhost')
    DB_NAME = os.getenv('DB_NAME', 'CampusCareDB')
    DB_DRIVER = os.getenv('DB_DRIVER', 'ODBC Driver 18 for SQL Server')
    DB_TRUSTED = os.getenv('DB_TRUSTED_CONNECTION', 'yes')
    DB_TRUST_CERT = os.getenv('DB_TRUST_SERVER_CERTIFICATE', 'yes')
    DB_USER = os.getenv('DB_USER', '')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')

    # College domain validation
    ALLOWED_EMAIL_DOMAIN = os.getenv('ALLOWED_EMAIL_DOMAIN', 'kiet.edu').strip().lower()

    # File uploads
    UPLOAD_FOLDER = BASE_DIR / 'backend' / 'uploads'
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 10 * 1024 * 1024)) # 10 MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

    @classmethod
    def get_connection_string(cls, db_name=None):
        import pyodbc
        available = pyodbc.drivers()
        driver = cls.DB_DRIVER
        if driver not in available:
            for fallback in ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server', 'SQL Server']:
                if fallback in available:
                    driver = fallback
                    break

        target_db = db_name or cls.DB_NAME
        parts = [f"Driver={{{driver}}}", f"Server={cls.DB_SERVER}", f"Database={target_db}"]

        if cls.DB_TRUSTED.lower() in ('yes', 'true', '1'):
            parts.append("Trusted_Connection=yes")
        else:
            parts.append(f"UID={cls.DB_USER}")
            parts.append(f"PWD={cls.DB_PASSWORD}")

        if cls.DB_TRUST_CERT.lower() in ('yes', 'true', '1'):
            parts.append("TrustServerCertificate=yes")

        return ";".join(parts) + ";"
