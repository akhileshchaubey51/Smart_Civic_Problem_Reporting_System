/**
 * CampusCare | Student Dashboard Controller
 * Handles Profile Menu, Live DB Complaints Fetching, Password Change,
 * Issue Navigation & Authentication Session Management.
 */

let currentUser = null;
let authToken = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('campuscare_token');
  const userStr = localStorage.getItem('campuscare_user');

  if (userStr) {
    try {
      currentUser = JSON.parse(userStr);
      populateStudentUI(currentUser);
    } catch (e) {
      console.error('Error parsing stored user:', e);
    }
  }

  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.querySelector('.profile-button');
    if (dropdown && dropdown.classList.contains('show')) {
      if (!dropdown.contains(e.target) && !profileBtn.contains(e.target)) {
        dropdown.classList.remove('show');
        resetProfileArrow();
      }
    }
  });

  // Close modals on Escape key or backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    }
  });
});

/**
 * Populate student navbar & profile modal with live user details
 */
function populateStudentUI(user) {
  if (!user) return;

  const name = user.full_name || 'Student';
  const email = user.email || 'student@kiet.edu';
  const dept = user.department || 'Computer Science & Engineering';
  const phone = user.phone || '—';
  
  // Dynamic course resolution: works for ALL branches/courses (B.Tech, BCA, BBA, BA, MCA, MBA, B.Pharm, M.Pharm, M.Tech)
  let course = user.course || '';
  if (!course) {
    const dLower = dept.toLowerCase();
    if (dLower.includes('bca') || (dLower.includes('computer applications') && !dLower.includes('master') && !dLower.includes('mca'))) course = 'BCA';
    else if (dLower.includes('mca') || dLower.includes('master of computer applications') || dLower.includes('computer applications')) course = 'MCA';
    else if (dLower.includes('bba') || (dLower.includes('business administration') && !dLower.includes('master') && !dLower.includes('mba'))) course = 'BBA';
    else if (dLower.includes('mba') || dLower.includes('master of business administration') || dLower.includes('management')) course = 'MBA';
    else if (dLower.includes('m.pharm')) course = 'M.Pharm';
    else if (dLower.includes('pharm')) course = 'B.Pharm';
    else if (dLower.includes('ba') || dLower.includes('humanities') || dLower.includes('arts')) course = 'BA';
    else if (dLower.includes('m.tech')) course = 'M.Tech';
    else course = 'B.Tech';
  }

  const DEFAULT_STUDENT_AVATAR = 'profile images/image1.jpg';
  const avatarUrl = user.profile_image || user.ProfileImage || DEFAULT_STUDENT_AVATAR;

  // Navbar elements
  const profileName = document.getElementById('profileName');
  const profileCourse = document.getElementById('profileCourse');
  const profilePhoto = document.getElementById('profilePhoto');
  const dropdownProfileName = document.getElementById('dropdownProfileName');
  const dropdownKietId = document.getElementById('dropdownKietId');
  const dropdownProfilePhoto = document.getElementById('dropdownProfilePhoto');
  const viewProfilePhotoImg = document.getElementById('viewProfilePhotoImg');

  if (profileName) profileName.innerText = name;
  if (profileCourse) {
    const displayTag = `${course} • ${dept}`;
    profileCourse.innerText = displayTag.length > 26 ? displayTag.substring(0, 24) + '...' : displayTag;
    profileCourse.title = `${course} (${dept})`;
  }
  if (profilePhoto) profilePhoto.src = avatarUrl;

  if (dropdownProfileName) dropdownProfileName.innerText = name;
  if (dropdownKietId) dropdownKietId.innerText = email;
  if (dropdownProfilePhoto) dropdownProfilePhoto.src = avatarUrl;
  if (viewProfilePhotoImg) viewProfilePhotoImg.src = avatarUrl;

  // Profile View Modal elements
  const vName = document.getElementById('viewStudentName');
  const vId = document.getElementById('viewStudentId');
  const vCourse = document.getElementById('viewStudentCourse');
  const vDept = document.getElementById('viewStudentDept');
  const vSem = document.getElementById('viewStudentSemester');
  const vPhone = document.getElementById('viewStudentPhone');

  if (vName) vName.innerText = name;
  if (vId) vId.innerText = email;
  if (vCourse) vCourse.innerText = course;
  if (vDept) vDept.innerText = dept;
  if (vSem) vSem.innerText = 'Enrolled Student (Academic Session 2025-26)';
  if (vPhone) vPhone.innerText = phone;
}

/**
 * 1. Toggle Profile Dropdown
 */
function toggleProfileMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('profileDropdown');
  const arrow = document.querySelector('.profile-arrow');
  if (!dropdown) return;

  dropdown.classList.toggle('show');
  if (arrow) {
    arrow.style.transform = dropdown.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function resetProfileArrow() {
  const arrow = document.querySelector('.profile-arrow');
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

/**
 * 2. Profile View Modal
 */
function openMyProfile() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.remove('show');
  resetProfileArrow();

  const modal = document.getElementById('profileViewModal');
  if (modal) modal.classList.add('show');
}

function closeMyProfile() {
  const modal = document.getElementById('profileViewModal');
  if (modal) modal.classList.remove('show');
}

/**
 * 3. My Complaints Modal & Live DB Fetching
 */
function openMyComplaints() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.remove('show');
  resetProfileArrow();

  const modal = document.getElementById('complaintsModal');
  if (modal) modal.classList.add('show');

  loadStudentComplaints();
}

function closeMyComplaints() {
  const modal = document.getElementById('complaintsModal');
  if (modal) modal.classList.remove('show');
}

async function loadStudentComplaints() {
  const container = document.getElementById('complaintsListContainer');
  if (!container) return;

  if (!authToken) {
    container.innerHTML = `
      <div class="complaints-empty-state">
        <p style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">You are browsing as a guest.</p>
        <a href="/login" class="modal-action-btn" style="display:inline-block; max-width:200px; text-decoration:none;">Login to View Tickets</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="complaints-loading-state">
      <div class="loading-spinner"></div>
      <p>Fetching your complaint history...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/complaints/student', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.success || !data.complaints || data.complaints.length === 0) {
      container.innerHTML = `
        <div class="complaints-empty-state">
          <p style="font-size: 32px; margin-bottom: 8px;">📭</p>
          <p style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">No Grievances Lodged Yet</p>
          <p style="font-size: 13.5px; color: #64748b;">Any problems you report around campus will show up here with real-time status updates.</p>
        </div>
      `;
      return;
    }

    // Render cards
    let html = '';
    data.complaints.forEach(item => {
      const statusClass = item.Status.replace(/\s+/g, '-');
      const dateStr = item.CreatedAt ? formatDateTime(item.CreatedAt) : 'Recently';

      // Stepper Stage Calculation (1: Lodged, 2: Under Review, 3: In Progress, 4: Resolved / Rejected)
      const status = item.Status;
      const isRejected = status === 'Rejected';
      let step = 1;

      if (status === 'Pending') {
        step = 2; // Under Review
      } else if (status === 'In Progress') {
        step = 3; // Work ongoing
      } else if (status === 'Resolved' || isRejected) {
        step = 4; // Finalized
      }

      // Check dates from timeline logs
      const timeline = item.Timeline || [];
      const inProgressLog = timeline.find(t => t.NewStatus === 'In Progress');
      const resolvedLog = timeline.find(t => t.NewStatus === 'Resolved' || t.NewStatus === 'Rejected');

      const lodgedTimeStr = item.CreatedAt ? new Date(item.CreatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Lodged';
      const inProgressTimeStr = inProgressLog ? new Date(inProgressLog.Timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : (step === 3 ? 'Active Now' : (step > 3 ? 'Done' : 'Queued'));
      const resolvedTimeStr = resolvedLog ? new Date(resolvedLog.Timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : (step >= 4 ? (isRejected ? 'Rejected' : 'Resolved') : (item.SLA_Hours ? `${item.SLA_Hours}h SLA` : 'Final'));

      html += `
        <div class="complaint-card">
          <div class="complaint-card-header">
            <span class="complaint-id-badge">#CMP-${item.ComplaintID}</span>
            <div class="badge-group">
              <span class="priority-pill ${item.Priority}">${item.Priority}</span>
              <span class="status-badge ${statusClass}">${item.Status}</span>
            </div>
          </div>
          <div class="complaint-card-title">${escapeHtml(item.Title)}</div>
          <div class="complaint-card-desc">${escapeHtml(item.Description)}</div>

          ${item.ImageAttachmentURL ? `
            <div class="complaint-evidence-section">
              <span class="evidence-tag-title">📸 Attached Photo Proof:</span>
              <div class="complaint-evidence-thumb" onclick="openStudentImageModal('${item.ImageAttachmentURL}', '${escapeHtml(item.Title)}')">
                <img src="${item.ImageAttachmentURL}" alt="Evidence" onerror="this.parentElement.style.display='none'">
                <div class="evidence-zoom-overlay">🔍 Click to Enlarge</div>
              </div>
            </div>
          ` : ''}

          <!-- LIVE PHASE / STAGE PROGRESS TRACKER -->
          <div class="live-stage-tracker">
            <div class="stage-tracker-header">
              <span class="tracker-title">
                <span class="live-pulse-dot"></span>
                LIVE ISSUE TRACKING &amp; PHASES:
              </span>
              <span class="current-phase-name ${statusClass}">
                Current: ${item.Status}
              </span>
            </div>

            <div class="stage-steps-bar">
              <!-- Phase 1: Lodged -->
              <div class="stage-step completed">
                <div class="step-circle"><i class="bi bi-check-lg"></i></div>
                <div class="step-meta">
                  <span class="step-name">1. Lodged</span>
                  <span class="step-sub">${lodgedTimeStr}</span>
                </div>
              </div>

              <div class="step-connector ${step >= 2 ? 'active' : ''}"></div>

              <!-- Phase 2: Under Review -->
              <div class="stage-step ${step > 2 ? 'completed' : (step === 2 ? 'in-progress' : 'pending')}">
                <div class="step-circle">${step > 2 ? '<i class="bi bi-check-lg"></i>' : (step === 2 ? '⏳' : '2')}</div>
                <div class="step-meta">
                  <span class="step-name">2. Review</span>
                  <span class="step-sub">${step === 2 ? 'Under Review' : (step > 2 ? 'Acknowledged' : 'Queued')}</span>
                </div>
              </div>

              <div class="step-connector ${step >= 3 ? 'active' : ''}"></div>

              <!-- Phase 3: Action In Progress -->
              <div class="stage-step ${step > 3 ? 'completed' : (step === 3 ? 'in-progress' : 'pending')}">
                <div class="step-circle">${step > 3 ? '<i class="bi bi-check-lg"></i>' : (step === 3 ? '🛠️' : '3')}</div>
                <div class="step-meta">
                  <span class="step-name">3. Action</span>
                  <span class="step-sub">${inProgressTimeStr}</span>
                </div>
              </div>

              <div class="step-connector ${step >= 4 ? (isRejected ? 'rejected' : 'active') : ''}"></div>

              <!-- Phase 4: Resolution -->
              <div class="stage-step ${step >= 4 ? (isRejected ? 'rejected' : 'completed') : 'pending'}">
                <div class="step-circle">${step >= 4 ? (isRejected ? '<i class="bi bi-x-lg"></i>' : '<i class="bi bi-check-lg"></i>') : '4'}</div>
                <div class="step-meta">
                  <span class="step-name">${isRejected ? '4. Rejected' : '4. Resolved'}</span>
                  <span class="step-sub">${resolvedTimeStr}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- OFFICIAL ADMIN REMARK BOX -->
          ${item.LatestAdminRemark ? `
            <div class="student-admin-remark-box">
              <div class="admin-remark-top">
                <div class="admin-remark-badge">
                  <span class="remark-icon-dot">💬</span>
                  <strong>Official Admin Remark:</strong>
                </div>
                <span class="admin-author-info">
                  👔 ${escapeHtml(item.LatestAdminName || 'Campus Admin')}
                  ${item.LatestAdminTime ? `• <span class="remark-timestamp">${formatDateTime(item.LatestAdminTime)}</span>` : ''}
                </span>
              </div>
              <div class="admin-remark-quote">
                "${escapeHtml(item.LatestAdminRemark)}"
              </div>
            </div>
          ` : `
            <div class="student-admin-remark-empty">
              <span class="empty-icon">⏳</span>
              <span>Administrative remark will appear here as soon as staff begins resolving your issue.</span>
            </div>
          `}

          <!-- EXPANDABLE FULL LIFECYCLE AUDIT TRAIL -->
          ${timeline && timeline.length > 0 ? `
            <div class="timeline-accordion-wrap">
              <button type="button" class="timeline-toggle-btn" onclick="toggleTimelineDetail('timeline-${item.ComplaintID}', this)">
                <span>📜 View Complete Live Lifecycle History (${timeline.length} logs)</span>
                <span class="toggle-arrow">▾</span>
              </button>
              <div id="timeline-${item.ComplaintID}" class="timeline-detail-drawer hidden">
                <div class="timeline-items-list">
                  ${timeline.map(log => {
                    const isAdm = log.UpdatedByRole === 'Admin';
                    const dotClass = isAdm ? 'admin-dot' : 'student-dot';
                    return `
                      <div class="timeline-item-row">
                        <div class="timeline-marker ${dotClass}"></div>
                        <div class="timeline-content-card">
                          <div class="timeline-card-header">
                            <span class="timeline-user-badge ${isAdm ? 'is-admin' : 'is-student'}">
                              ${isAdm ? '👔 Admin: ' : '🎓 Student: '} ${escapeHtml(log.UpdatedByName || (isAdm ? 'Campus Admin' : 'Student'))}
                            </span>
                            <span class="timeline-date">${formatDateTime(log.Timestamp)}</span>
                          </div>
                          ${log.Remarks ? `
                            <div class="timeline-remark-body">
                              ${isAdm ? '<strong>Admin Remark:</strong> ' : ''}"${escapeHtml(log.Remarks)}"
                            </div>
                          ` : ''}
                          <div class="timeline-status-shift">
                            ${log.PreviousStatus ? `Status Shift: <span class="badge-prev">${log.PreviousStatus}</span> &rarr; <span class="badge-next">${log.NewStatus}</span>` : `Initial Registration: <span class="badge-next">${log.NewStatus}</span>`}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          <div class="complaint-card-footer">
            <span>📍 ${escapeHtml(item.Location)}</span>
            <span>🕒 Lodged: ${dateStr}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load complaints:', err);
    container.innerHTML = `
      <div class="complaints-empty-state">
        <p style="color: #ef4444; font-weight: 600;">Unable to load complaints at this moment.</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Format ISO datetime string for clean Indian English display
 */
function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return isoStr;
  }
}

/**
 * Toggle Timeline Detail Drawer
 */
function toggleTimelineDetail(drawerId, btn) {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;
  const isHidden = drawer.classList.contains('hidden');
  if (isHidden) {
    drawer.classList.remove('hidden');
    if (btn) {
      const arrow = btn.querySelector('.toggle-arrow');
      if (arrow) arrow.innerText = '▴';
    }
  } else {
    drawer.classList.add('hidden');
    if (btn) {
      const arrow = btn.querySelector('.toggle-arrow');
      if (arrow) arrow.innerText = '▾';
    }
  }
}

/**
 * Open Evidence Photo Lightbox for Student
 */
function openStudentImageModal(imageUrl, title) {
  const modal = document.getElementById('studentImageModal');
  const img = document.getElementById('studentModalImage');
  const titleEl = document.getElementById('studentModalImageTitle');

  if (!modal || !img) return;

  img.src = imageUrl;
  if (titleEl) titleEl.innerText = `Evidence: ${title || 'Attached Photo'}`;
  modal.classList.add('show');
}

function closeStudentImageModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.closest('button')) return;
  const modal = document.getElementById('studentImageModal');
  const img = document.getElementById('studentModalImage');
  if (modal) modal.classList.remove('show');
  if (img) img.src = '';
}


/**
 * 4. Change Password Modal
 */
function openChangePassword() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.remove('show');
  resetProfileArrow();

  const msg = document.getElementById('passwordMessage');
  if (msg) {
    msg.innerText = '';
    msg.className = 'password-message';
  }

  const currentInput = document.getElementById('currentPassword');
  const newInput = document.getElementById('newPassword');
  const confirmInput = document.getElementById('confirmPassword');
  if (currentInput) currentInput.value = '';
  if (newInput) newInput.value = '';
  if (confirmInput) confirmInput.value = '';

  const modal = document.getElementById('passwordModal');
  if (modal) modal.classList.add('show');
}

function closeChangePassword() {
  const modal = document.getElementById('passwordModal');
  if (modal) modal.classList.remove('show');
}

async function changePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const msg = document.getElementById('passwordMessage');

  if (!currentPassword || !newPassword || !confirmPassword) {
    showPasswordMessage('Please fill all password fields.', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showPasswordMessage('New password must be at least 6 characters long.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showPasswordMessage('New passwords do not match. Please verify.', 'error');
    return;
  }

  if (!authToken) {
    showPasswordMessage('Please login first to update password.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showPasswordMessage('✓ Password changed successfully!', 'success');
      setTimeout(() => {
        closeChangePassword();
      }, 1400);
    } else {
      showPasswordMessage(data.message || 'Failed to change password.', 'error');
    }
  } catch (err) {
    showPasswordMessage(`Network error: ${err.message}`, 'error');
  }
}

function showPasswordMessage(text, type) {
  const msg = document.getElementById('passwordMessage');
  if (!msg) return;
  msg.innerText = text;
  msg.className = `password-message ${type}`;
}

/**
 * 5. Logout User
 */
function logoutUser() {
    if (typeof CampusSignout !== 'undefined' && CampusSignout.start) {
        CampusSignout.start();
    } else {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('/index.html');
    }
}

/**
 * 6. Issue Reporting Navigation
 */
function openComplaintPage(category) {
  const target = `complaint-form.html?category=${encodeURIComponent(category)}`;
  if (typeof CampusLoader !== 'undefined' && CampusLoader.navigate) {
    CampusLoader.navigate(target, 'Opening Grievance Form', `Preparing ${category || 'Campus'} report desk...`);
  } else {
    window.location.href = target;
  }
}

/**
 * 7. Smooth Scroll Helper
 */
function scrollToIssues() {
  const section = document.getElementById('issues');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Helper to prevent XSS in dynamic rendering
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

