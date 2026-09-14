"""
Automated API Verification Test Suite for CampusCare
Tests authentication, complaints lifecycle, admin status updates, statistics, and CSV export.
"""
import unittest
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app

class CampusCareAPITestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        self.student_token = None
        self.admin_token = None

    def test_01_student_login(self):
        res = self.client.post('/api/auth/login', json={
            'college_email': 'student@kiet.edu',
            'password': 'Student@123'
        })
        data = res.get_json()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data['success'])
        self.assertIn('token', data)
        self.assertEqual(data['user']['role'], 'Student')

    def test_02_admin_login(self):
        res = self.client.post('/api/auth/login', json={
            'college_email': 'admin@kiet.edu',
            'password': 'Admin@123'
        })
        data = res.get_json()
        self.assertEqual(res.status_code, 200)
        self.assertTrue(data['success'])
        self.assertIn('token', data)
        self.assertEqual(data['user']['role'], 'Admin')

    def test_03_registration_domain_validation(self):
        # Invalid domain registration rejected
        res = self.client.post('/api/auth/register', json={
            'full_name': 'Test Stranger',
            'college_email': 'stranger@gmail.com',
            'password': 'Password123',
            'department': 'Mechanical',
            'phone': '1234567890'
        })
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertIn('restricted', data['message'])

    def test_03b_login_domain_validation(self):
        # 1. Non-kiet email rejected with 403
        res = self.client.post('/api/auth/login', json={
            'college_email': 'intruder@external.com',
            'password': 'Password123'
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn('compulsory', res.get_json()['message'])

        # 2. Roll number without @ auto-appends @kiet.edu
        res_auto = self.client.post('/api/auth/login', json={
            'college_email': 'student',
            'password': 'Student@123'
        })
        self.assertEqual(res_auto.status_code, 200)
        self.assertEqual(res_auto.get_json()['user']['email'], 'student@kiet.edu')

    def test_04_get_categories(self):
        res = self.client.get('/api/categories')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data['success'])
        self.assertGreaterEqual(len(data['categories']), 6)

    def test_05_complaint_lifecycle(self):
        # 1. Login as Student
        login_res = self.client.post('/api/auth/login', json={
            'college_email': 'student@kiet.edu',
            'password': 'Student@123'
        })
        std_token = login_res.get_json()['token']
        std_headers = {'Authorization': f'Bearer {std_token}'}

        # 2. Login as Admin
        admin_res = self.client.post('/api/auth/login', json={
            'college_email': 'admin@kiet.edu',
            'password': 'Admin@123'
        })
        adm_token = admin_res.get_json()['token']
        adm_headers = {'Authorization': f'Bearer {adm_token}'}

        # 3. Create a new complaint
        create_res = self.client.post('/api/complaints/create', json={
            'title': 'Flickering lights in Reading Room',
            'category_id': 6, # Electrical
            'description': 'Tube lights are constantly buzzing and flickering in the quiet study zone.',
            'location': 'Central Library, 2nd Floor',
            'priority': 'Medium'
        }, headers=std_headers)
        self.assertEqual(create_res.status_code, 201)
        comp_id = create_res.get_json()['complaint_id']

        # 4. Student views their tickets
        std_tickets_res = self.client.get('/api/complaints/student', headers=std_headers)
        self.assertEqual(std_tickets_res.status_code, 200)
        self.assertGreater(std_tickets_res.get_json()['metrics']['total'], 0)

        # 5. Track the ticket
        track_res = self.client.get(f'/api/complaints/track/{comp_id}', headers=std_headers)
        self.assertEqual(track_res.status_code, 200)
        track_data = track_res.get_json()
        self.assertEqual(track_data['complaint']['Status'], 'Pending')
        self.assertGreaterEqual(len(track_data['timeline']), 1)

        # 6. Admin updates status to 'In Progress'
        update_res = self.client.put(f'/api/admin/update-status/{comp_id}', json={
            'new_status': 'In Progress',
            'remarks': 'Maintenance electrician assigned. Replacement ballast ordered.'
        }, headers=adm_headers)
        self.assertEqual(update_res.status_code, 200)

        # 7. Admin updates status to 'Resolved'
        resolve_res = self.client.put(f'/api/admin/update-status/{comp_id}', json={
            'new_status': 'Resolved',
            'remarks': 'Flickering LED tube and ballast replaced. Illumination tested.'
        }, headers=adm_headers)
        self.assertEqual(resolve_res.status_code, 200)

        # 8. Student submits feedback
        feedback_res = self.client.post('/api/complaints/feedback', json={
            'complaint_id': comp_id,
            'rating': 5,
            'comments': 'Great job fixing it quickly!'
        }, headers=std_headers)
        self.assertEqual(feedback_res.status_code, 201)

        # 9. Admin checks stats
        stats_res = self.client.get('/api/admin/stats', headers=adm_headers)
        self.assertEqual(stats_res.status_code, 200)
        stats_data = stats_res.get_json()
        self.assertIn('kpi', stats_data)
        self.assertGreater(stats_data['kpi']['total'], 0)

        # 10. Admin exports CSV
        csv_res = self.client.get('/api/admin/export-csv', headers=adm_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn('text/csv', csv_res.content_type)
        self.assertIn('Ticket ID', csv_res.data.decode('utf-8'))

    def test_06_admin_user_management(self):
        # 1. Login as Admin
        admin_res = self.client.post('/api/auth/login', json={
            'college_email': 'admin@kiet.edu',
            'password': 'Admin@123'
        })
        adm_token = admin_res.get_json()['token']
        adm_headers = {'Authorization': f'Bearer {adm_token}'}

        # 2. Login as Student
        std_res = self.client.post('/api/auth/login', json={
            'college_email': 'student@kiet.edu',
            'password': 'Student@123'
        })
        std_token = std_res.get_json()['token']
        std_headers = {'Authorization': f'Bearer {std_token}'}

        # 3. Student forbidden from viewing or creating users
        std_forbidden = self.client.get('/api/admin/users', headers=std_headers)
        self.assertEqual(std_forbidden.status_code, 403)

        # 4. Admin tries to create user with invalid non-kiet domain -> 400
        invalid_res = self.client.post('/api/admin/users/create', json={
            'full_name': 'External Person',
            'college_email': 'test@gmail.com',
            'password': 'Password@123',
            'role': 'Student',
            'department': 'CSE'
        }, headers=adm_headers)
        self.assertEqual(invalid_res.status_code, 400)
        self.assertIn('@kiet.edu', invalid_res.get_json()['message'])

        # 5. Admin creates valid student user with @kiet.edu
        import random
        rand_id = random.randint(1000, 9999)
        test_email = f'newstudent_{rand_id}@kiet.edu'
        create_res = self.client.post('/api/admin/users/create', json={
            'full_name': f'New Student {rand_id}',
            'college_email': test_email,
            'password': 'Password@123',
            'role': 'Student',
            'department': 'Information Technology',
            'phone': '9876543210'
        }, headers=adm_headers)
        self.assertEqual(create_res.status_code, 201)
        self.assertTrue(create_res.get_json()['success'])

        # 6. Admin fetches user directory
        users_res = self.client.get('/api/admin/users', headers=adm_headers)
        self.assertEqual(users_res.status_code, 200)
        users_data = users_res.get_json()
        self.assertTrue(users_data['success'])
        self.assertGreaterEqual(len(users_data['users']), 1)

        # 7. Admin searches for newly created user
        search_res = self.client.get(f'/api/admin/users?search={test_email}', headers=adm_headers)
        self.assertEqual(search_res.status_code, 200)
        search_data = search_res.get_json()
        self.assertTrue(any(u['CollegeEmail'] == test_email for u in search_data['users']))

    def test_07_all_branches_and_validations(self):
        import random
        rand_id = random.randint(10000, 99999)

        # 1. Register student from MCA
        mca_res = self.client.post('/api/auth/register', json={
            'full_name': 'Aarav MCA Student',
            'college_email': f'mca_{rand_id}@kiet.edu',
            'course': 'MCA',
            'department': 'Master of Computer Applications',
            'password': 'Password@123',
            'phone': '9876543210'
        })
        self.assertEqual(mca_res.status_code, 201)
        mca_data = mca_res.get_json()
        self.assertEqual(mca_data['user']['course'], 'MCA')
        mca_token = mca_data['token']
        mca_headers = {'Authorization': f'Bearer {mca_token}'}

        # 2. Register student from Pharmacy (B.Pharm)
        pharm_res = self.client.post('/api/auth/register', json={
            'full_name': 'Riya Pharmacy Student',
            'college_email': f'pharm_{rand_id}@kiet.edu',
            'course': 'B.Pharm',
            'department': 'Bachelor of Pharmacy',
            'password': 'Password@123',
            'phone': '9123456789'
        })
        self.assertEqual(pharm_res.status_code, 201)
        pharm_data = pharm_res.get_json()
        self.assertEqual(pharm_data['user']['course'], 'B.Pharm')

        # 3. Validation: Full name too short
        inv_name = self.client.post('/api/auth/register', json={
            'full_name': 'A',
            'college_email': f'shortname_{rand_id}@kiet.edu',
            'course': 'B.Tech',
            'department': 'CSE',
            'password': 'Password@123'
        })
        self.assertEqual(inv_name.status_code, 400)
        self.assertIn('between 2 and 100', inv_name.get_json()['message'])

        # 4. Validation: Invalid phone number
        inv_phone = self.client.post('/api/auth/register', json={
            'full_name': 'Valid Name',
            'college_email': f'badphone_{rand_id}@kiet.edu',
            'course': 'B.Tech',
            'department': 'CSE',
            'password': 'Password@123',
            'phone': '123' # Not a 10-digit mobile
        })
        self.assertEqual(inv_phone.status_code, 400)
        self.assertIn('phone number', inv_phone.get_json()['message'].lower())

        # 5. Validation: Short complaint title (< 5 chars)
        inv_title = self.client.post('/api/complaints/create', json={
            'title': 'Bad',
            'category_id': 1,
            'location': 'MCA Lab Block',
            'priority': 'Medium',
            'description': 'Valid description with enough characters explaining the issue.'
        }, headers=mca_headers)
        self.assertEqual(inv_title.status_code, 400)
        self.assertIn('5 and 150', inv_title.get_json()['message'])

        # 6. Validation: Short complaint description (< 15 chars)
        inv_desc = self.client.post('/api/complaints/create', json={
            'title': 'Projector Broken in MCA Lab',
            'category_id': 1,
            'location': 'MCA Lab Block, 3rd Floor',
            'priority': 'Medium',
            'description': 'Fix it'
        }, headers=mca_headers)
        self.assertEqual(inv_desc.status_code, 400)
        self.assertIn('15 and 2000', inv_desc.get_json()['message'])

        # 7. Validation: Invalid category ID
        inv_cat = self.client.post('/api/complaints/create', json={
            'title': 'Projector Broken in MCA Lab',
            'category_id': 9999,
            'location': 'MCA Lab Block, 3rd Floor',
            'priority': 'Medium',
            'description': 'Valid description with enough characters explaining the issue.'
        }, headers=mca_headers)
        self.assertEqual(inv_cat.status_code, 400)

        # 8. Successful grievance submission by MCA student
        valid_comp = self.client.post('/api/complaints/create', json={
            'title': 'Projector Display Flickering in MCA Computer Lab 3',
            'category_id': 4, # IT / Labs
            'location': 'MCA Department Block, 3rd Floor, Lab 3',
            'priority': 'High',
            'description': 'HDMI cable connection is loose and the projector screen goes blank repeatedly during class lectures.'
        }, headers=mca_headers)
        self.assertEqual(valid_comp.status_code, 201)
        comp_data = valid_comp.get_json()
        self.assertTrue(comp_data['success'])
        self.assertIn('sla_hours', comp_data)
        self.assertEqual(comp_data['sla_hours'], 24)

        # 9. Admin status update validation: remarks must be >= 5 chars
        adm_login = self.client.post('/api/auth/login', json={
            'college_email': 'admin@kiet.edu',
            'password': 'Admin@123'
        })
        adm_token = adm_login.get_json()['token']
        adm_headers = {'Authorization': f'Bearer {adm_token}'}

        short_remarks = self.client.put(f'/api/admin/update-status/{comp_data["complaint_id"]}', json={
            'new_status': 'In Progress',
            'remarks': 'ok' # < 5 chars
        }, headers=adm_headers)
        self.assertEqual(short_remarks.status_code, 400)
        self.assertIn('between 5 and 500', short_remarks.get_json()['message'])

if __name__ == '__main__':
    unittest.main()
