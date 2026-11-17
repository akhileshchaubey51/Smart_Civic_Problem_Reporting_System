/**
 * CampusCare Split-Screen Login Controller
 * Features: 3-Role Switcher (Student, Staff, Admin), Direct Portal Launchers,
 * Password Toggle, JWT Storage & Automatic Role-based Redirection.
 */

const ROLE_CONFIGS = {
  Student: {
    title: '🎓 Student Portal Login',
    subtitle: 'Enter your student ID or @kiet.edu email to register complaints & track live progress.',
    label: 'Student College ID / Email',
    placeholder: 'e.g. student@kiet.edu or roll number',
    submitText: 'Login to Student Portal →'
  },
  StaffAdmin: {
    title: '👨‍💼 Staff & Administration Portal',
    subtitle: 'Unified official login for campus staff, department in-charges, and administrators.',
    label: 'Official College Email ID',
    placeholder: 'e.g. staff@kiet.edu or admin@kiet.edu',
    submitText: 'Login to Portal →'
  }
};

let activeRole = 'Student';

const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000'))
  ? 'http://127.0.0.1:5000'
  : '';

// 1. Toggle Password Visibility
function togglePassword() {
  const passwordInput = document.getElementById('password');
  const btn = document.querySelector('.show-password');
  if (!passwordInput || !btn) return;

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    btn.innerText = '🙈';
    btn.setAttribute('title', 'Hide Password');
  } else {
    passwordInput.type = 'password';
    btn.innerText = '👁';
    btn.setAttribute('title', 'Show Password');
  }
}

// 2. Select Role (Student / StaffAdmin)
function selectRole(role) {
  if (role === 'Staff' || role === 'Admin' || role === 'staff' || role === 'admin') {
    role = 'StaffAdmin';
  }
  if (!ROLE_CONFIGS[role]) role = 'Student';
  activeRole = role;
  const config = ROLE_CONFIGS[role];

  // Update Buttons
  const studentBtn = document.getElementById('role-student');
  const staffAdminBtn = document.getElementById('role-staffadmin');

  if (studentBtn) studentBtn.classList.remove('active');
  if (staffAdminBtn) staffAdminBtn.classList.remove('active', 'role-staffadmin-active');

  if (role === 'Student' && studentBtn) {
    studentBtn.classList.add('active');
  } else if (role === 'StaffAdmin' && staffAdminBtn) {
    staffAdminBtn.classList.add('active', 'role-staffadmin-active');
  }

  // Update Headings & Labels
  const title = document.getElementById('loginTitle');
  const subtitle = document.getElementById('loginSubtitle');
  const idLabel = document.getElementById('collegeIdLabel');
  const idInput = document.getElementById('collegeId');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (title) title.innerText = config.title;
  if (subtitle) subtitle.innerText = config.subtitle;
  if (idLabel) idLabel.innerText = config.label;
  if (idInput) {
    idInput.placeholder = config.placeholder;
    idInput.value = '';
  }
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.value = '';
  }
  if (submitBtn) submitBtn.innerText = config.submitText;

  hideAlert();
}

function navigateToPortal(targetPage) {
  if (typeof CampusLoader !== 'undefined' && CampusLoader.navigate) {
    CampusLoader.navigate(targetPage, 'Opening Portal', 'Loading user session and administrative privileges...');
  } else {
    if (window.location.protocol === 'file:') {
      window.location.replace(targetPage.replace(/^\//, ''));
    } else {
      window.location.replace(targetPage);
    }
  }
}

// 4. Alert Helpers
function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('loginAlert');
  if (!alertBox) return;

  alertBox.className = `login-alert ${type}`;
  alertBox.innerText = message;
  alertBox.style.display = 'block';
}

function hideAlert() {
  const alertBox = document.getElementById('loginAlert');
  if (alertBox) {
    alertBox.style.display = 'none';
  }
}

// 5. Handle Form Submission
document.addEventListener('DOMContentLoaded', () => {
  // Check URL query parameters (e.g. ?role=staff, ?role=admin)
  const urlParams = new URLSearchParams(window.location.search);
  const reqRole = urlParams.get('role');
  if (reqRole) {
    const norm = reqRole.toLowerCase();
    if (norm === 'staff' || norm === 'admin' || norm === 'staffadmin') {
      selectRole('StaffAdmin');
    } else {
      selectRole('Student');
    }
  } else {
    // Default to Student
    selectRole('Student');
  }

  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const idInput = document.getElementById('collegeId');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('loginSubmitBtn');

    let identifier = idInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
      showAlert('Please enter both your College ID / Email and password.', 'error');
      return;
    }

    // Compulsory @kiet.edu domain enforcement
    if (!identifier.includes('@')) {
      identifier = `${identifier}@kiet.edu`;
    } else if (!identifier.toLowerCase().endsWith('@kiet.edu')) {
      showAlert('Login restricted: Only official @kiet.edu college IDs are allowed.', 'error');
      return;
    }

    // Button loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span style="display:inline-block; animation: spin 0.8s linear infinite; margin-right: 6px;">⟳</span> Authenticating...`;

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          college_email: identifier,
          password: password
        })
      });

      const contentType = response.headers.get('content-type') || '';
      let result;
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error('Server returned non-JSON response:', text);
        throw new Error('Server returned HTML instead of JSON. Ensure you are accessing via http://127.0.0.1:5000');
      }

      if (response.ok && result.success) {
        // Save session
        localStorage.setItem('campuscare_token', result.token);
        localStorage.setItem('campuscare_user', JSON.stringify(result.user));
        sessionStorage.setItem('campuscare_session_active', '1');

        submitBtn.innerHTML = `Login Successful ✓`;

        const pendingCategory = sessionStorage.getItem('pending_complaint_category');
        setTimeout(() => {
          let targetPage = '/dashboard.html';
          if (result.user.role === 'Staff') {
            targetPage = '/staff.html';
          } else if (result.user.role === 'Admin') {
            targetPage = '/admin.html';
          }

          if (pendingCategory && result.user.role === 'Student') {
            sessionStorage.removeItem('pending_complaint_category');
            navigateToPortal(`/complaint-form.html?category=${encodeURIComponent(pendingCategory)}`);
          } else {
            navigateToPortal(targetPage);
          }
        }, 200);
      } else {
        const errorMsg = result.message || 'Invalid college credentials. Please check and try again.';
        showAlert(errorMsg, 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = ROLE_CONFIGS[activeRole]?.submitText || 'Login';
      }
    } catch (err) {
      console.error('Login error:', err);
      showAlert(`Network connection error: Unable to reach CampusCare server (${err.message})`, 'error');
      submitBtn.disabled = false;
      submitBtn.innerText = ROLE_CONFIGS[activeRole]?.submitText || 'Login';
    }
  });
});

// Global window functions
window.selectRole = selectRole;
window.togglePassword = togglePassword;
