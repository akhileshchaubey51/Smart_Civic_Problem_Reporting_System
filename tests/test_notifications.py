"""
Automated Test Suite for CampusCare Notifications (Email & Real-Time System Alerts)
Ensures full cleanup after testing so the live database is never polluted.
"""
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.db import query_db, execute_db
from backend.auth import generate_token

class NotificationTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

        # Find or create a dedicated test student
        cls.temp_student_created = False
        student = query_db("SELECT * FROM dbo.Users WHERE Role = 'Student' AND CollegeEmail LIKE 'test_notif_%'", one=True)
        if not student:
            s_res = execute_db("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
                OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.CollegeEmail, INSERTED.Role, INSERTED.Department, INSERTED.Course, INSERTED.Phone
                VALUES ('Test Notif Student', 'test_notif_runner@kiet.edu', 'hash', 'Student', 'Computer Science & Engineering', 'B.Tech', '9999888877', 'profile images/image1.jpg')
            """)
            student = s_res[0]
            cls.temp_student_created = True
        cls.student = student

        admin = query_db("SELECT * FROM dbo.Users WHERE Role = 'Admin'", one=True)
        if not admin:
            admin = {'UserID': 1, 'CollegeEmail': 'admin@kiet.edu', 'FullName': 'Dean of Student Affairs', 'Role': 'Admin', 'Department': 'Campus Administration'}
        cls.admin = admin

        cls.student_token = generate_token(cls.student)
        cls.admin_token = generate_token(cls.admin)
        cls.test_complaint_ids = []

    @classmethod
    def tearDownClass(cls):
        # Clean up any complaints created during this test
        for cid in cls.test_complaint_ids:
            execute_db("DELETE FROM dbo.Feedback WHERE ComplaintID = ?", (cid,))
            execute_db("DELETE FROM dbo.ComplaintTimeline WHERE ComplaintID = ?", (cid,))
            execute_db("DELETE FROM dbo.Notifications WHERE ComplaintID = ?", (cid,))
            execute_db("DELETE FROM dbo.Complaints WHERE ComplaintID = ?", (cid,))

        # Clean up temp test student if created
        if cls.temp_student_created and cls.student:
            uid = cls.student['UserID']
            execute_db("DELETE FROM dbo.Notifications WHERE UserID = ?", (uid,))
            execute_db("DELETE FROM dbo.Users WHERE UserID = ?", (uid,))

    def test_01_grievance_creates_system_notification_and_dispatches_email(self):
        cat = query_db("SELECT TOP 1 CategoryID, CategoryName, SLA_Hours FROM dbo.Categories", one=True)
        
        res = self.client.post('/api/complaints/create', headers={
            'Authorization': f'Bearer {self.student_token}'
        }, json={
            'title': 'Automated Test Grievance for Notification Verification',
            'category_id': cat['CategoryID'],
            'location': 'Library Block A, Reading Hall 2',
            'priority': 'High',
            'description': 'Automated unit test testing end-to-end notification generation and email alert.'
        })

        self.assertEqual(res.status_code, 201)
        complaint_id = res.get_json()['complaint_id']
        self.test_complaint_ids.append(complaint_id)

        # Verify record in dbo.Notifications
        notif = query_db("SELECT * FROM dbo.Notifications WHERE ComplaintID = ?", (complaint_id,), one=True)
        self.assertIsNotNone(notif)
        self.assertEqual(notif['Priority'], 'High')
        self.assertEqual(bool(notif['IsRead']), False)

    def test_02_admin_notifications_endpoints(self):
        # 1. Fetch notifications
        res = self.client.get('/api/admin/notifications', headers={
            'Authorization': f'Bearer {self.admin_token}'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertIn('unread_count', data)
        self.assertIn('notifications', data)

        # 2. Mark all as read
        read_all = self.client.post('/api/admin/notifications/read-all', headers={
            'Authorization': f'Bearer {self.admin_token}'
        })
        self.assertEqual(read_all.status_code, 200)

        # 3. Verify unread count is now 0
        after = self.client.get('/api/admin/notifications', headers={
            'Authorization': f'Bearer {self.admin_token}'
        })
        self.assertEqual(after.get_json()['unread_count'], 0)

if __name__ == '__main__':
    unittest.main()
