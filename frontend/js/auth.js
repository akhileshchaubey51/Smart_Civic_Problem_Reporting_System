/**
 * CampusCare Authentication Controller
 * Handles user sessions, registration, login, and role dispatching.
 */

function initAuth() {
  // If accessing admin page without active Admin session, redirect to index.html
  const isDedicatedAdminPage = window.location.pathname.includes('admin') || document.getElementById('admin-portal');
  if (isDedicatedAdminPage && (!AppState.token || !AppState.user || AppState.user.role !== 'Admin')) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/index.html');
    return;
  }

  if (AppState.token && AppState.user) {
    applyUserSession(AppState.user);
  } else {
    showAuthView();
  }

  // Bind Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Bind Register Form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
}

function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('student-portal').classList.add('hidden');
  document.getElementById('admin-portal').classList.add('hidden');
  document.getElementById('user-profile-header').classList.add('hidden');
}

function applyUserSession(user) {
  AppState.user = user;
  AppState.currentRole = user.role;

  // Update Header UI
  const profileHeader = document.getElementById('user-profile-header');
  if (profileHeader) {
    profileHeader.classList.remove('hidden');
    document.getElementById('header-user-name').innerText = user.full_name;
    document.getElementById('header-user-role').innerText = user.role;
    document.getElementById('header-user-dept').innerText = user.department || '';

    const roleBadge = document.getElementById('header-role-badge');
    if (user.role === 'Admin') {
      roleBadge.className = 'px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300 shadow-sm';
      roleBadge.innerText = 'Admin Portal';
    } else {
      roleBadge.className = 'px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-300 shadow-sm';
      roleBadge.innerText = 'Student Portal';
    }

    const headerAvatar = document.getElementById('header-user-avatar');
    if (headerAvatar) {
      const defaultAvatar = user.role === 'Admin'
        ? 'profile images/image2.jpg'
        : 'profile images/image1.jpg';
      headerAvatar.src = user.profile_image || user.ProfileImage || defaultAvatar;
    }
  }

  document.getElementById('auth-view').classList.add('hidden');

  if (user.role === 'Admin') {
    document.getElementById('student-portal').classList.add('hidden');
    document.getElementById('admin-portal').classList.remove('hidden');
    if (typeof loadAdminDashboard === 'function') {
      loadAdminDashboard();
    }
  } else {
    document.getElementById('admin-portal').classList.add('hidden');
    document.getElementById('student-portal').classList.remove('hidden');
    if (typeof loadStudentDashboard === 'function') {
      loadStudentDashboard();
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function handleLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const btn = document.getElementById('login-submit-btn');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showToast('Please enter both email and password.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Authenticating...`;

  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ college_email: email, password: password })
  });

  btn.disabled = false;
  btn.innerHTML = `Sign In <i data-lucide="arrow-right" class="w-4 h-4 ml-1 inline"></i>`;
  if (window.lucide) lucide.createIcons();

  if (res && res.ok && res.data.success) {
    AppState.token = res.data.token;
    AppState.user = res.data.user;
    localStorage.setItem('campuscare_token', res.data.token);
    localStorage.setItem('campuscare_user', JSON.stringify(res.data.user));

    showToast(`Welcome back, ${res.data.user.full_name}!`, 'success');
    applyUserSession(res.data.user);
  } else {
    const msg = res?.data?.message || 'Login failed. Please check your credentials.';
    showToast(msg, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-fullname').value.trim();
  let email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const course = document.getElementById('reg-course')?.value || 'B.Tech';
  const department = document.getElementById('reg-department').value;
  const phone = document.getElementById('reg-phone').value.trim();
  const btn = document.getElementById('reg-submit-btn');

  if (!fullName || !email || !password || !department) {
    showToast('Please fill in all mandatory fields.', 'warning');
    return;
  }

  if (fullName.length < 2) {
    showToast('Please enter your full name.', 'warning');
    return;
  }

  // Domain auto-append if roll number entered
  if (!email.includes('@')) {
    email = `${email}@kiet.edu`;
  } else if (!email.toLowerCase().endsWith('@kiet.edu')) {
    showToast('Only official @kiet.edu email addresses are permitted.', 'warning');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters long.', 'warning');
    return;
  }

  if (phone) {
    const cleanPhone = phone.replace(/[\s\-+]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      showToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Registering...`;

  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      full_name: fullName,
      college_email: email,
      password: password,
      course: course,
      department: department,
      phone: phone
    })
  });

  btn.disabled = false;
  btn.innerHTML = `Create Student Account <i data-lucide="check" class="w-4 h-4 ml-1 inline"></i>`;
  if (window.lucide) lucide.createIcons();

  if (res && res.ok && res.data.success) {
    AppState.token = res.data.token;
    AppState.user = res.data.user;
    localStorage.setItem('campuscare_token', res.data.token);
    localStorage.setItem('campuscare_user', JSON.stringify(res.data.user));

    showToast('Student account registered successfully! Logging you in...', 'success');
    applyUserSession(res.data.user);
  } else {
    const msg = res?.data?.message || 'Registration failed.';
    showToast(msg, 'error');
  }
}


function logout() {
  if (typeof CampusSignout !== 'undefined' && CampusSignout.start) {
    CampusSignout.start();
  } else {
    AppState.token = null;
    AppState.user = null;
    AppState.currentRole = null;
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/index.html');
  }
}

// Toggle between Login & Register tabs in Auth card
function switchAuthTab(tab) {
  const loginTabBtn = document.getElementById('tab-btn-login');
  const regTabBtn = document.getElementById('tab-btn-register');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');

  if (!regTabBtn || !regForm) return;

  if (tab === 'login') {
    if (loginTabBtn) loginTabBtn.className = 'flex-1 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600';
    if (regTabBtn) regTabBtn.className = 'flex-1 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700';
    if (loginForm) loginForm.classList.remove('hidden');
    if (regForm) regForm.classList.add('hidden');
  } else {
    if (regTabBtn) regTabBtn.className = 'flex-1 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600';
    if (loginTabBtn) loginTabBtn.className = 'flex-1 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700';
    if (regForm) regForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
  }
}
