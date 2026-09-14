/**
 * CampusCare Split-Screen Login Controller
 * Features: Password Toggle, Role Switcher, Shake Animation Error Handling,
 * JWT Storage & Portal Redirection.
 */

let activeRole = 'Student';

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

// 2. Select Role (Student / Admin)
function selectRole(role) {
  activeRole = role;
  const title = document.querySelector('.login-card h2');
  const studentBtn = document.getElementById('role-student');
  const adminBtn = document.getElementById('role-admin');
  const idLabel = document.querySelector('label[for="collegeId"]');
  const idInput = document.getElementById('collegeId');

  if (role === 'Admin') {
    title.innerText = 'Admin / Staff Login';
    adminBtn.classList.add('active');
    studentBtn.classList.remove('active');
    idLabel.innerText = 'Admin Email / Username';
    idInput.placeholder = 'e.g. admin@kiet.edu';
  } else {
    title.innerText = 'Student Login';
    studentBtn.classList.add('active');
    adminBtn.classList.remove('active');
    idLabel.innerText = 'College ID / Email';
    idInput.placeholder = 'Enter your college ID or @kiet.edu email';
  }

  hideAlert();
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

// 5. Handle Form Submission with Real Backend Integration
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const idInput = document.getElementById('collegeId');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.querySelector('.login-submit');

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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          college_email: identifier,
          password: password
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Save session
        localStorage.setItem('campuscare_token', result.token);
        localStorage.setItem('campuscare_user', JSON.stringify(result.user));

        showAlert(`Welcome back, ${result.user.full_name}! Redirecting...`, 'success');
        submitBtn.innerHTML = `Redirecting &rarr;`;

        if (typeof CampusLoader !== 'undefined' && CampusLoader.show) {
          const roleLabel = result.user.role === 'Admin' ? 'Executive Admin Portal' : 'Student Civic Dashboard';
          CampusLoader.show(`Welcome, ${result.user.full_name}!`, `Entering ${roleLabel}...`);
        }

        // Redirect based on role and pending selection
        setTimeout(() => {
          const pendingCategory = sessionStorage.getItem('pending_complaint_category');
          if (pendingCategory && result.user.role === 'Student') {
            sessionStorage.removeItem('pending_complaint_category');
            window.location.replace(`/complaint-form?category=${encodeURIComponent(pendingCategory)}`);
            return;
          }
          if (result.user.role === 'Student') {
            window.location.replace('/dashboard');
          } else {
            window.location.replace('/admin.html');
          }
        }, 500);
      } else {
        const errorMsg = result.message || 'Invalid college credentials. Please check and try again.';
        showAlert(errorMsg, 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Login';
      }
    } catch (err) {
      console.error('Login error:', err);
      showAlert(`Network connection error: ${err.message}`, 'error');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Login';
    }
  });
});

// Inline spin animation keyframe
const styleEl = document.createElement('style');
styleEl.innerHTML = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(styleEl);


