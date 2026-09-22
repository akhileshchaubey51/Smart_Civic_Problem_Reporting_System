import unittest
import json
from backend.app import create_app
from backend.auth import generate_token
from backend.db import query_db, execute_db

class TestNotificationsAndDateTime(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        self.student_token = generate_token({
            'UserID': 81,
            'CollegeEmail': '2628mca0206@kiet.edu',
            'FullName': 'Akhilesh Chaubey',
            'Role': 'Student',
            'Department': 'Master of Computer Applications'
        })
        self.admin_token = generate_token({
            'UserID': 1,
            'CollegeEmail': 'admin@kiet.edu',
            'FullName': 'Dr. Ramesh Sharma',
            'Role': 'Admin',
            'Department': 'Campus Administration'
        })

    def test_datetime_serialization_has_z(self):
        complaint = query_db("SELECT ComplaintID, CreatedAt, UpdatedAt FROM dbo.Complaints WHERE ComplaintID = 45", one=True)
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
        # Update complaint 45
        payload = {
            'new_status': 'Resolved',
            'remarks': 'Testing student notification dispatch via admin update'
        }
        res = self.client.put('/api/admin/update-status/45',
                              data=json.dumps(payload),
                              content_type='application/json',
                              headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 200)

        # Check student notification
        s_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(s_res.status_code, 200)
        notifs = s_res.json['notifications']
        latest = notifs[0]
        self.assertEqual(latest['ComplaintID'], 45)
        self.assertIn('Resolved', latest['Title'])
        self.assertIn('Testing student notification dispatch via admin update', latest['Message'])

    def test_student_mark_read_and_read_all(self):
        # Get latest notification
        s_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        notif_id = s_res.json['notifications'][0]['NotificationID']

        # Mark single as read
        r_res = self.client.post(f'/api/complaints/notifications/read/{notif_id}', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(r_res.status_code, 200)

        # Mark all as read
        ra_res = self.client.post('/api/complaints/notifications/read-all', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(ra_res.status_code, 200)

        # Verify unread count is 0
        final_res = self.client.get('/api/complaints/notifications', headers={'Authorization': f'Bearer {self.student_token}'})
        self.assertEqual(final_res.json['unread_count'], 0)

if __name__ == '__main__':
    unittest.main()
