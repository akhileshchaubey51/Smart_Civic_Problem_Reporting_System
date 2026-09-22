import unittest
import json
from backend.app import create_app
from backend.auth import generate_token
from backend.db import query_db, execute_db

class TestNotificationsAndDateTime(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        
        # Ensure test student exists
        student = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = 'test_notif_student@kiet.edu'", one=True)
        if not student:
            s_res = execute_db("""
                INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
                OUTPUT INSERTED.UserID
                VALUES ('Test Notif Student', 'test_notif_student@kiet.edu', 'hash', 'Student', 'Computer Science & Engineering', 'B.Tech', '9999999999', 'profile images/image1.jpg')
            """)
            self.student_id = s_res[0]['UserID']
        else:
            self.student_id = student['UserID']

        admin = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = 'admin@kiet.edu'", one=True)
        self.admin_id = admin['UserID'] if admin else 1

        self.student_token = generate_token({
            'UserID': self.student_id,
            'CollegeEmail': 'test_notif_student@kiet.edu',
            'FullName': 'Test Notif Student',
            'Role': 'Student',
            'Department': 'Computer Science & Engineering'
        })
        self.admin_token = generate_token({
            'UserID': self.admin_id,
            'CollegeEmail': 'admin@kiet.edu',
            'FullName': 'Dr. Ramesh Sharma',
            'Role': 'Admin',
            'Department': 'Campus Administration'
        })

        # Insert a clean test complaint
        c_res = execute_db("""
            INSERT INTO dbo.Complaints (UserID, CategoryID, Title, Description, Location, Priority, Status)
            OUTPUT INSERTED.ComplaintID
            VALUES (?, 1, 'Test Complaint for Notifications', 'Testing details', 'Campus', 'High', 'Pending')
        """, (self.student_id,))
        self.complaint_id = c_res[0]['ComplaintID']

    def tearDown(self):
        # Clean up test complaint and test user
        if hasattr(self, 'complaint_id') and self.complaint_id:
            execute_db("DELETE FROM dbo.Feedback WHERE ComplaintID = ?", (self.complaint_id,))
            execute_db("DELETE FROM dbo.ComplaintTimeline WHERE ComplaintID = ?", (self.complaint_id,))
            execute_db("DELETE FROM dbo.Notifications WHERE ComplaintID = ?", (self.complaint_id,))
            execute_db("DELETE FROM dbo.Complaints WHERE ComplaintID = ?", (self.complaint_id,))
        if hasattr(self, 'student_id') and self.student_id:
            execute_db("DELETE FROM dbo.Notifications WHERE UserID = ?", (self.student_id,))
            execute_db("DELETE FROM dbo.Users WHERE UserID = ?", (self.student_id,))

    def test_datetime_serialization_has_z(self):
        complaint = query_db("SELECT ComplaintID, CreatedAt, UpdatedAt FROM dbo.Complaints WHERE ComplaintID = ?", (self.complaint_id,), one=True)
        self.assertIsNotNone(complaint)
        self.assertTrue(complaint['CreatedAt'].endswith('Z'), f"CreatedAt does not end with Z: {complaint['CreatedAt']}")
        self.assertTrue(complaint['UpdatedAt'].endswith('Z'), f"UpdatedAt does not end with Z: {complaint['UpdatedAt']}")

    def test_student_notifications_api(self):
        res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertTrue(data['success'])
        self.assertIn('unread_count', data)
        self.assertIn('notifications', data)
        self.assertGreater(len(data['notifications']), 0)
        first = data['notifications'][0]
        self.assertTrue(first['CreatedAt'].endswith('Z'))

    def test_admin_status_update_creates_student_notification(self):
        payload = {
            'new_status': 'Resolved',
            'remarks': 'Testing student notification dispatch via admin update'
        }
        res = self.client.put(f'/api/admin/update-status/{self.complaint_id}',
                              data=json.dumps(payload),
                              content_type='application/json',
                              headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 200)

        # Check student notification
        s_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(s_res.status_code, 200)
        notifs = s_res.json['notifications']
        latest = notifs[0]
        self.assertEqual(latest['ComplaintID'], self.complaint_id)
        self.assertIn('Resolved', latest['Title'])
        self.assertIn('Testing student notification dispatch via admin update', latest['Message'])

    def test_student_mark_read_and_read_all(self):
        s_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        notifs = s_res.json['notifications']
        if notifs:
            notif_id = notifs[0]['NotificationID']
            r_res = self.client.post(f'/api/complaints/notifications/read/{notif_id}', headers={'Authorization': f'Bearer {self.student_token}'})
            self.assertEqual(r_res.status_code, 200)

        ra_res = self.client.post('/api/complaints/notifications/read-all', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(ra_res.status_code, 200)

        final_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(final_res.json['unread_count'], 0)

if __name__ == '__main__':
    unittest.main()
