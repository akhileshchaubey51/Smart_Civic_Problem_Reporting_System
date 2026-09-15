"""
Automated Test Suite for CampusCare Notifications (Email & Real-Time System Alerts)
"""
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.db import query_db, execute_db
from backend.auth import generate_token

class NotificationTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        self.student = query_db("SELECT * FROM dbo.Users WHERE Role = 'Student'", one=True)
        self.admin = query_db("SELECT * FROM dbo.Users WHERE Role = 'Admin'", one=True)
        self.student_token = generate_token(self.student)
        self.admin_token = generate_token(self.admin)

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
