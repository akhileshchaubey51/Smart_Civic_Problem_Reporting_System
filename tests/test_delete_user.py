import unittest
import json
from backend.app import create_app
from backend.auth import generate_token
from backend.db import query_db, execute_db
from werkzeug.security import generate_password_hash

class TestDeleteUser(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()

        # Ensure root admin exists
        admin = query_db("SELECT UserID FROM dbo.Users WHERE CollegeEmail = 'admin@kiet.edu'", one=True)
        self.admin_id = admin['UserID'] if admin else 1
        self.admin_token = generate_token({
            'UserID': self.admin_id,
            'CollegeEmail': 'admin@kiet.edu',
            'FullName': 'Dr. Ramesh Sharma',
            'Role': 'Admin',
            'Department': 'Campus Administration'
        })

    def tearDown(self):
        execute_db("DELETE FROM dbo.Users WHERE CollegeEmail LIKE 'delete_me%'")

    def test_cannot_delete_root_admin(self):
        res = self.client.delete(f'/api/admin/users/{self.admin_id}', headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('cannot delete', res.json['message'].lower())

    def test_delete_user_success(self):
        # 1. Create a student to delete
        u_res = execute_db("""
            INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
            OUTPUT INSERTED.UserID
            VALUES ('Student To Delete', 'delete_me@kiet.edu', 'hash', 'Student', 'IT', 'B.Tech', '9988776655', 'profile images/image1.jpg')
        """)
        target_uid = u_res[0]['UserID']

        # 2. Delete via DELETE method
        res = self.client.delete(f'/api/admin/users/{target_uid}', headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json['success'])

        # 3. Verify user no longer exists in DB
        check = query_db("SELECT UserID FROM dbo.Users WHERE UserID = ?", (target_uid,), one=True)
        self.assertIsNone(check)

    def test_delete_user_post_method(self):
        # Create student to delete via POST
        u_res = execute_db("""
            INSERT INTO dbo.Users (FullName, CollegeEmail, PasswordHash, Role, Department, Course, Phone, ProfileImage)
            OUTPUT INSERTED.UserID
            VALUES ('Student To Delete POST', 'delete_me_post@kiet.edu', 'hash', 'Student', 'IT', 'B.Tech', '9988776655', 'profile images/image1.jpg')
        """)
        target_uid = u_res[0]['UserID']

        res = self.client.post(f'/api/admin/users/{target_uid}/delete', headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json['success'])

        check = query_db("SELECT UserID FROM dbo.Users WHERE UserID = ?", (target_uid,), one=True)
        self.assertIsNone(check)

    def test_delete_non_existent_user(self):
        res = self.client.delete('/api/admin/users/999999', headers={'Authorization': f'Bearer {self.admin_token}'})
        self.assertEqual(res.status_code, 404)

if __name__ == '__main__':
    unittest.main()
