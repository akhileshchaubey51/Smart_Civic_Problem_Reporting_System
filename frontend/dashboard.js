/**
 * CampusCare | Student Dashboard Controller
 * Handles Profile Menu, Live DB Complaints Fetching, Password Change,
 * Issue Navigation & Authentication Session Management.
 */

let currentUser = null;
let authToken = null;

const API_BASE = (() => {
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:5000';
  if (window.location.port === '5000') return '';
  return `${window.location.protocol}//${window.location.hostname}:5000`;
})();

function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE}${cleanUrl}`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('campuscare_token');
  const userStr = localStorage.getItem('campuscare_user');

  // Strict session check: Redirect to login if user is not authenticated
  if (!authToken || !userStr) {
    localStorage.removeItem('campuscare_token');
    localStorage.removeItem('campuscare_user');
    window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login');
    return;
  }

  try {
    currentUser = JSON.parse(userStr);
    populateStudentUI(currentUser);
  } catch (e) {
    console.error('Error parsing stored user:', e);
    localStorage.removeItem('campuscare_token');
    localStorage.removeItem('campuscare_user');
    window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login');
    return;
  }

  // Load student complaints and stats on load
  loadStudentComplaints();

  // Initialize AI Chat Assistant
  initAIChatAssistant();

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
 * 3. My Complaints Modal Controller
 * Two-Screen Architecture:
 * - Screen 1: Full-Screen Complaints Overview Dashboard with Metrics Ribbon
 * - Screen 2: Dedicated Live Tracking Page with Admin Audit Timeline & Star Feedback
 */
function openMyComplaints() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.remove('show');
  resetProfileArrow();

  // Reset to Screen 1 (Overview)
  backToComplaintsList();

  const modal = document.getElementById('complaintsModal');
  if (modal) modal.classList.add('show');

  loadStudentComplaints();
}

function closeMyComplaints() {
  const modal = document.getElementById('complaintsModal');
  if (modal) modal.classList.remove('show');
  // Reset back to Screen 1 for next time
  backToComplaintsList();
}

function backToComplaintsList() {
  const overviewScreen = document.getElementById('complaintsOverviewScreen');
  const trackingScreen = document.getElementById('complaintTrackingScreen');

  if (overviewScreen) overviewScreen.style.display = 'flex';
  if (trackingScreen) trackingScreen.style.display = 'none';
}

// Cached complaints list
let studentComplaintsCache = [];

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
    const res = await fetch(`${API_BASE}/api/complaints/student`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();

    const countBadge = document.getElementById('myComplaintsCount');
    if (countBadge) countBadge.innerText = (data.complaints ? data.complaints.length : 0);

    if (!data.success || !data.complaints || data.complaints.length === 0) {
      studentComplaintsCache = [];
      container.innerHTML = `
        <div class="complaints-empty-state">
          <p style="font-size: 32px; margin-bottom: 8px;">📭</p>
          <p style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">No Grievances Lodged Yet</p>
          <p style="font-size: 13.5px; color: #64748b;">Any problems you report around campus will show up here with real-time status updates.</p>
        </div>
      `;
      return;
    }

    studentComplaintsCache = data.complaints;
    renderComplaintsOverviewScreen(data.metrics || {});
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
 * Screen 1: Render All Complaints Overview Cards & Metrics Ribbon
 */
function renderComplaintsOverviewScreen(metrics) {
  const container = document.getElementById('complaintsListContainer');
  if (!container || studentComplaintsCache.length === 0) return;

  const total = studentComplaintsCache.length;
  const inProgress = studentComplaintsCache.filter(c => c.Status === 'In Progress').length;
  const resolved = studentComplaintsCache.filter(c => c.Status === 'Resolved').length;
  const pending = studentComplaintsCache.filter(c => c.Status === 'Pending').length;

  let cardsHtml = '';
  studentComplaintsCache.forEach(item => {
    const statusClass = item.Status.replace(/\s+/g, '-');
    const statusModClass = statusClass.toLowerCase();
    const dateStr = item.CreatedAt ? new Date(item.CreatedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) : 'Recent';

    cardsHtml += `
      <div class="complaint-overview-card status-${statusModClass}" onclick="openDedicatedTrackingPage(${item.ComplaintID})">
        <div class="overview-card-header">
          <span class="overview-id-badge">#CMP-${item.ComplaintID}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11.5px; font-weight: 800; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 9999px; border: 1px solid #bfdbfe;">👍 ${item.Upvotes || 0}</span>
            <span class="priority-pill ${item.Priority}">${item.Priority}</span>
            <span class="status-badge ${statusClass}">${item.Status}</span>
          </div>
        </div>

        <div class="overview-card-title">${escapeHtml(item.Title)}</div>

        ${item.ImageAttachmentURL ? `
          <div onclick="event.stopPropagation(); viewComplaintEvidence(${item.ComplaintID})" style="margin: 10px 0 8px; display: flex; align-items: center; gap: 12px; background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 9px 12px; cursor: pointer; transition: all 0.2s ease;" title="Click to view full photo evidence">
            <img src="${resolveMediaUrl(item.ImageAttachmentURL)}" alt="Attached Evidence" style="width: 54px; height: 54px; object-fit: cover; border-radius: 8px; border: 1.5px solid #93c5fd; flex-shrink: 0;" onerror="this.onerror=null; this.src='images/cleanliness.jpg';">
            <div style="flex: 1; min-width: 0;">
              <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.5px; display: block;">📷 Attached Photo Evidence</span>
              <span style="font-size: 12px; color: #334155; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Click to expand full resolution</span>
            </div>
            <button type="button" onclick="event.stopPropagation(); viewComplaintEvidence(${item.ComplaintID})" style="font-size: 11.5px; font-weight: 800; color: #ffffff; background: #2563eb; padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; flex-shrink: 0; box-shadow: 0 2px 6px rgba(37,99,235,0.3); display: flex; align-items: center; gap: 4px;">
              <span>🔍 View Image &rarr;</span>
            </button>
          </div>
        ` : `
          <div style="margin: 6px 0; font-size: 11.5px; color: #94a3b8; font-style: italic;">
            ℹ️ No photo attached
          </div>
        `}

        <div class="overview-card-meta">
          <span>📁 ${escapeHtml(item.CategoryName || 'Campus Facility')}</span>
          <span>📍 ${escapeHtml(item.Location)}</span>
          <span>🕒 ${dateStr}</span>
        </div>

        <div class="overview-open-hint">
          <span>⚡ Click to Open Live Tracking &amp; Admin Audit</span>
          <span>Open Tracker &rarr;</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <!-- Metrics Ribbon -->
    <div class="complaints-metrics-ribbon">
      <div class="complaint-stat-pill stat-total"><span>📊</span> Total: <strong>${total}</strong></div>
      <div class="complaint-stat-pill stat-inprogress"><span>⚡</span> In Progress: <strong>${inProgress}</strong></div>
      <div class="complaint-stat-pill stat-resolved"><span>✓</span> Resolved: <strong>${resolved}</strong></div>
      <div class="complaint-stat-pill stat-pending"><span>⏳</span> Pending: <strong>${pending}</strong></div>
    </div>

    <!-- Cards Scroll Container -->
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${cardsHtml}
    </div>
  `;
}

/**
 * Screen 2: Open Dedicated Tracking Page for a Specific Complaint
 */
async function openDedicatedTrackingPage(complaintId) {
  const overviewScreen = document.getElementById('complaintsOverviewScreen');
  const trackingScreen = document.getElementById('complaintTrackingScreen');
  const bodyContainer = document.getElementById('complaintTrackingDetailContent');
  const headerBadges = document.getElementById('trackingScreenHeaderBadges');

  if (!trackingScreen || !bodyContainer) return;

  // Switch screens
  if (overviewScreen) overviewScreen.style.display = 'none';
  trackingScreen.style.display = 'flex';

  if (headerBadges) {
    headerBadges.innerHTML = `
      <span class="overview-id-badge">#CMP-${complaintId}</span>
      <span class="status-badge Pending">Loading...</span>
    `;
  }

  bodyContainer.innerHTML = `
    <div class="complaints-loading-state" style="padding: 50px 10px;">
      <div class="loading-spinner"></div>
      <p>Fetching real-time tracking timeline &amp; administrative audit logs...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/complaints/track/${complaintId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.complaint) throw new Error(data.message || 'Details not found');

    const c = data.complaint;
    const timeline = data.timeline || [];
    const statusClass = c.Status.replace(/\s+/g, '-');
    const createdStr = c.CreatedAt ? new Date(c.CreatedAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Recently';

    // Update Top Badges
    if (headerBadges) {
      headerBadges.innerHTML = `
        <span class="overview-id-badge">#CMP-${c.ComplaintID}</span>
        <span class="priority-pill ${c.Priority}">${c.Priority}</span>
        <span class="status-badge ${statusClass}">${c.Status}</span>
      `;
    }

    // Build timeline stages
    let timelineHtml = '';
    if (timeline.length === 0) {
      timelineHtml = `
        <div class="timeline-step">
          <div class="timeline-step-dot"></div>
          <div class="timeline-step-title">Grievance Registered</div>
          <div class="timeline-step-remarks">Your ticket has been logged and queued for administrative inspection.</div>
          <div class="timeline-step-time">${createdStr}</div>
        </div>
      `;
    } else {
      timeline.forEach((step, idx) => {
        let dotClass = '';
        let badgeColor = '#3b82f6';
        let badgeBg = '#eff6ff';
        let statusIcon = '🕒';

        if (step.NewStatus === 'Resolved') {
          dotClass = 'resolved';
          badgeColor = '#15803d';
          badgeBg = '#f0fdf4';
          statusIcon = '✓';
        } else if (step.NewStatus === 'In Progress') {
          dotClass = 'in-progress';
          badgeColor = '#b45309';
          badgeBg = '#fef3c7';
          statusIcon = '⚡';
        } else if (step.NewStatus === 'Rejected') {
          dotClass = 'rejected';
          badgeColor = '#b91c1c';
          badgeBg = '#fef2f2';
          statusIcon = '✕';
        }

        const stepTime = step.Timestamp ? new Date(step.Timestamp).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '';

        timelineHtml += `
          <div class="timeline-step" style="animation: slideInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: ${idx * 0.07}s;">
            <div class="timeline-step-dot ${dotClass}"></div>
            <div class="timeline-step-title">
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.5px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                ${statusIcon} ${escapeHtml(step.NewStatus)}
              </span>
              <span style="color: #475569; font-size: 13.5px; font-weight: 700;">
                by ${escapeHtml(step.UpdatedByName || 'Administrative Cell')}
              </span>
              <span style="font-size: 11.5px; color: #64748b; font-weight: 600; background: #f1f5f9; padding: 1px 8px; border-radius: 6px;">
                ${escapeHtml(step.UpdatedByRole || 'Staff')}
              </span>
            </div>
            <div class="timeline-step-remarks">${escapeHtml(step.Remarks)}</div>
            <div class="timeline-step-time">🕒 ${stepTime}</div>
          </div>
        `;
      });
    }

    // Feedback block if Resolved
    let feedbackHtml = '';
    if (c.Status === 'Resolved') {
      if (c.FeedbackRating) {
        feedbackHtml = `
          <div class="feedback-box-resolved">
            <span style="font-size: 11.5px; font-weight: 800; text-transform: uppercase; color: #16a34a; letter-spacing: 0.5px;">✓ Your Resolution Feedback Submitted</span>
            <div style="color: #f59e0b; font-size: 24px; margin: 6px 0;">${'★'.repeat(c.FeedbackRating)}${'☆'.repeat(5 - c.FeedbackRating)}</div>
            <p style="font-size: 13.5px; color: #334155; margin: 0; font-style: italic;">"${escapeHtml(c.FeedbackComments || 'Resolution confirmed.')}"</p>
          </div>
        `;
      } else {
        feedbackHtml = `
          <div class="feedback-box-resolved" id="feedbackFormCard">
            <span style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; color: #15803d; letter-spacing: 0.5px;">⭐ How was your resolution experience?</span>
            <p style="font-size: 12px; color: #475569; margin: 4px 0 10px 0;">Please rate the redressal speed and technician repair quality:</p>
            <div class="feedback-stars-row" id="feedbackStarsRow">
              <span class="feedback-star selected" onclick="setFeedbackRating(1)">★</span>
              <span class="feedback-star selected" onclick="setFeedbackRating(2)">★</span>
              <span class="feedback-star selected" onclick="setFeedbackRating(3)">★</span>
              <span class="feedback-star selected" onclick="setFeedbackRating(4)">★</span>
              <span class="feedback-star selected" onclick="setFeedbackRating(5)">★</span>
            </div>
            <textarea id="feedbackCommentInput" class="feedback-textarea" rows="2" placeholder="Leave remarks on how the issue was resolved (optional)..."></textarea>
            <button type="button" class="feedback-submit-btn" onclick="submitGrievanceFeedback(${c.ComplaintID})">Submit Official Feedback</button>
          </div>
        `;
      }
    }

    bodyContainer.innerHTML = `
      <!-- TOP PRIORITY: Filled Problem Details & Exact Campus Location -->
      <div class="tracking-top-location-card">
        <div class="location-card-main">
          <div class="location-pin-wrapper">
            <span class="location-pin-icon">📍</span>
          </div>
          <div class="location-details-box">
            <span class="location-card-label">CAMPUS PROBLEM LOCATION (REPORTED)</span>
            <div class="location-card-text">${escapeHtml(c.Location)}</div>
          </div>
        </div>
        <div class="location-card-meta">
          <span class="meta-pill category-pill">📁 ${escapeHtml(c.CategoryName)}</span>
          <span class="meta-pill sla-pill">⏱️ Target SLA: ${c.SLA_Hours}h</span>
          <span class="meta-pill time-pill">🕒 ${createdStr}</span>
        </div>
      </div>

      <!-- Grievance Statement Card (Title, Description & Evidence) -->
      <div class="tracking-detail-card">
        <div class="tracking-problem-header">
          <span class="tracking-problem-tag">Grievance Statement</span>
          <span class="tracking-reported-by">Ticket #CMP-${c.ComplaintID}</span>
        </div>
        <div class="tracking-detail-title">${escapeHtml(c.Title)}</div>
        <div class="tracking-detail-desc">${escapeHtml(c.Description)}</div>

        ${c.ImageAttachmentURL ? (() => {
          const mediaFullUrl = resolveMediaUrl(c.ImageAttachmentURL);
          const isVid = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(c.ImageAttachmentURL) || c.ImageAttachmentURL.includes('/video/');
          return `
            <div class="tracking-media-preview-section">
              <div class="tracking-media-label">
                <span>${isVid ? '🎬 Attached Video Evidence' : '📸 Attached Photo Evidence'}</span>
                <span class="tracking-media-zoom-hint" onclick="viewComplaintEvidence(${c.ComplaintID})">
                  🔍 View Fullscreen
                </span>
              </div>
              <div class="tracking-media-card" onclick="viewComplaintEvidence(${c.ComplaintID})">
                ${isVid ? `
                  <div class="tracking-media-video-wrapper">
                    <video src="${mediaFullUrl}" preload="metadata" muted class="tracking-media-thumb"></video>
                    <div class="tracking-media-overlay">
                      <div class="play-pulse-btn">
                        <span>▶</span>
                      </div>
                      <span class="overlay-text">Click to Play Video Fullscreen</span>
                    </div>
                  </div>
                ` : `
                  <div class="tracking-media-img-wrapper">
                    <img src="${mediaFullUrl}" alt="Evidence" class="tracking-media-thumb" onerror="this.onerror=null; this.src='images/cleanliness.jpg';">
                    <div class="tracking-media-overlay">
                      <div class="zoom-pulse-btn">
                        <span>🔍</span>
                      </div>
                      <span class="overlay-text">Click to Expand Fullscreen</span>
                    </div>
                  </div>
                `}
              </div>
            </div>
          `;
        })() : ''}
      </div>

      <!-- Department Tag & Assigned In-Charge Card -->
      ${c.DepartmentTag || c.AssignedToName ? `
        <div class="tracking-assignment-card">
          <div class="tracking-assignment-header">
            <span class="assignment-badge">🎯 Assigned Department &amp; In-Charge</span>
            <span class="assignment-tag">🏷️ ${escapeHtml(c.DepartmentTag || 'General Facilities')}</span>
          </div>
          <div class="tracking-assignment-body">
            <div class="assigned-officer-info">
              <div class="assigned-avatar">👤</div>
              <div>
                <div class="assigned-name">${escapeHtml(c.AssignedToName || 'Department Maintenance Cell')}</div>
                <div class="assigned-role">${escapeHtml(c.AssignedToDepartment || 'Campus Staff / Technical In-Charge')} ${c.AssignedToEmail ? `&bull; <span style="font-family: monospace;">${escapeHtml(c.AssignedToEmail)}</span>` : ''}</div>
              </div>
            </div>
            ${c.AssignedNotes ? `
              <div class="assigned-directive-box">
                <strong>Admin Directive:</strong> "${escapeHtml(c.AssignedNotes)}"
              </div>
            ` : ''}
            ${c.AssignedAt ? `
              <div style="font-size: 11.5px; color: #64748b; margin-top: 6px;">
                🕒 Assigned on: ${new Date(c.AssignedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Live Process Timeline / Audit Trail -->
      <div class="tracking-timeline-box">
        <div class="tracking-timeline-title">
          <span>⚡ Live Resolution Progress &amp; Administrative Audit</span>
        </div>
        <div>
          ${timelineHtml}
        </div>
      </div>

      ${feedbackHtml}
    `;
  } catch (err) {
    bodyContainer.innerHTML = `
      <div class="complaints-empty-state">
        <p style="color: #ef4444; font-weight: 600;">Could not load ticket details.</p>
        <p style="font-size: 12px; color: #64748b;">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

let activeFeedbackRating = 5;

function setFeedbackRating(stars) {
  activeFeedbackRating = stars;
  const starEls = document.querySelectorAll('#feedbackStarsRow .feedback-star');
  starEls.forEach((el, index) => {
    if (index < stars) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

async function submitGrievanceFeedback(complaintId) {
  const commentInput = document.getElementById('feedbackCommentInput');
  const comments = commentInput ? commentInput.value.trim() : '';

  try {
    const res = await fetch(`${API_BASE}/api/complaints/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        complaint_id: complaintId,
        rating: activeFeedbackRating,
        comments: comments
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Thank you! Your resolution feedback has been submitted successfully.');
      openDedicatedTrackingPage(complaintId);
      // Refresh list cache
      loadStudentComplaints();
    } else {
      alert(data.message || 'Unable to submit feedback.');
    }
  } catch (err) {
    alert(`Error submitting feedback: ${err.message}`);
  }
}


/**
 * View evidence for a specific complaint by ComplaintID
 */
function viewComplaintEvidence(complaintId) {
  const item = (studentComplaintsCache || []).find(c => c.ComplaintID == complaintId);
  if (!item || !item.ImageAttachmentURL) {
    console.warn('No attachment found for complaint ID:', complaintId);
    return;
  }
  openStudentImageModal(item.ImageAttachmentURL, item.Title);
}
window.viewComplaintEvidence = viewComplaintEvidence;

/**
 * Open Evidence Media (Photo or Video) Lightbox for Student
 */
function openStudentImageModal(mediaUrl, title) {
  // If first argument is a numeric complaint ID
  if (typeof mediaUrl === 'number' || (typeof mediaUrl === 'string' && /^\d+$/.test(mediaUrl) && !mediaUrl.includes('/'))) {
    const cid = parseInt(mediaUrl, 10);
    const found = (studentComplaintsCache || []).find(c => c.ComplaintID === cid);
    if (found && found.ImageAttachmentURL) {
      mediaUrl = found.ImageAttachmentURL;
      title = found.Title;
    }
  }

  const modal = document.getElementById('studentImageModal');
  const img = document.getElementById('studentModalImage');
  const video = document.getElementById('studentModalVideo');
  const titleEl = document.getElementById('studentModalImageTitle');
  const badgeEl = document.getElementById('studentModalMediaBadge');

  if (!modal) {
    console.error('Modal element #studentImageModal not found');
    return;
  }

  const resolvedUrl = resolveMediaUrl(mediaUrl);
  const isVideo = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(mediaUrl) || (typeof mediaUrl === 'string' && mediaUrl.includes('/video/'));

  if (isVideo) {
    if (img) {
      img.style.display = 'none';
      img.src = '';
    }
    if (video) {
      video.style.display = 'block';
      video.src = resolvedUrl;
      video.load();
      video.play().catch(() => {});
    }
    if (badgeEl) badgeEl.innerHTML = '🎬 Video Evidence';
  } else {
    if (video) {
      video.pause();
      video.style.display = 'none';
      video.src = '';
    }
    if (img) {
      img.style.display = 'block';
      img.src = resolvedUrl;
    }
    if (badgeEl) badgeEl.innerHTML = '📷 Visual Proof';
  }

  if (titleEl) titleEl.innerText = title ? `Evidence: ${title}` : 'Attached Visual Proof';
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeStudentImageModal(e) {
  if (e && e.target && e.target !== e.currentTarget && !e.target.closest('button')) return;
  const modal = document.getElementById('studentImageModal');
  const img = document.getElementById('studentModalImage');
  const video = document.getElementById('studentModalVideo');

  if (video) {
    video.pause();
    video.src = '';
  }
  if (img) {
    img.src = '';
  }
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

// Global Escape Key to cut / close lightbox immediately
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeStudentImageModal();
  }
});

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
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
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

/* ==========================================================================
   8. AI GRIEVANCE ASSISTANT CHATBOT CONTROLLER
   - Pure English Conversational Assistant (Strictly No Hindi / Hinglish)
   - Step 1: Auto-detects Student & prompts for College Issue (Full Category Chips)
   - Step 2: Asks for specific issue details (Clickable sub-issue chips or typing)
   - Step 3: Compulsory Campus Geofencing (1.5 km KIET Radius / GPS / Block Chips)
   - Step 4: Priority Level Selection (Low, Medium, High, Emergency)
   - Step 5: Compulsory Photo / Video Evidence Upload (Max 25 MB)
   - Step 6: Confirmation Prompt & Direct Submission to College Admin
   ========================================================================== */

const KIET_LAT = 28.75330;
const KIET_LNG = 77.49730;
const MAX_CAMPUS_RADIUS_KM = 1.5;

const CAMPUS_ISSUE_CATEGORIES = [
  {
    id: 8,
    name: 'Water Issues',
    chip: '💧 Water & RO Coolers',
    examples: [
      'Water cooler not cooling / warm water',
      'Water leakage on floor from cooler pipe',
      'Drinking water filter tap broken or leaking',
      'No running water supply in washroom'
    ]
  },
  {
    id: 6,
    name: 'Electrical',
    chip: '❄️ AC, Ceiling Fans & Ventilation',
    examples: [
      'Classroom ceiling fan making loud noise or stopped',
      'AC unit not turning on or cooling poorly',
      'Exhaust fan in lab / washroom out of order'
    ]
  },
  {
    id: 6,
    name: 'Electrical',
    chip: '⚡ Electricity, Lighting & Sockets',
    examples: [
      'Tube lights / lights flickering or burnt out',
      'Power switchboard / socket sparking or broken',
      'Power outage in academic floor or corridor'
    ]
  },
  {
    id: 2,
    name: 'Sanitation',
    chip: '🧹 Washrooms & Cleanliness',
    examples: [
      'Washroom dirty / needs urgent sanitization',
      'Corridor dustbins overflowing with waste',
      'Liquid handwash dispenser empty in washroom'
    ]
  },
  {
    id: 4,
    name: 'IT / Labs',
    chip: '📶 Campus Wi-Fi & Internet',
    examples: [
      'Campus Wi-Fi login portal page not opening',
      'Extremely slow internet speeds / connection dropping',
      'Wi-Fi router disconnected in block'
    ]
  },
  {
    id: 4,
    name: 'IT / Labs',
    chip: '🖥️ Computer Labs & Projectors',
    examples: [
      'Classroom digital projector display blur or not working',
      'Lab workstation PC OS crash / keyboard / mouse faulty',
      'Software required for practical lab missing'
    ]
  },
  {
    id: 10,
    name: 'Library & Academics',
    chip: '📚 Academics, Timetable & Study',
    examples: [
      'Lecture timetable clash or room confusion',
      'Course study notes / syllabus access inquiry',
      'Library reading room seating or AC issue'
    ]
  },
  {
    id: 10,
    name: 'Library & Academics',
    chip: '👨‍🏫 Faculty & Lecture Guidance',
    examples: [
      'Need academic counseling or mentor assistance',
      'Assigned lab batch schedule coordination issue',
      'Lecture schedule clarification needed'
    ]
  },
  {
    id: 1,
    name: 'Hostel',
    chip: '🏠 Hostel Rooms & Geysers',
    examples: [
      'Hostel bathroom hot water geyser not working',
      'Room door lock or window latch broken',
      'Hostel floor water cooler out of order'
    ]
  },
  {
    id: 5,
    name: 'Mess/Canteen',
    chip: '🍽️ Mess Food Quality & Cafeteria',
    examples: [
      'Mess dining food quality or hygiene complaint',
      'Drinking water dispenser empty in canteen',
      'Food serving utensils cleanliness concern'
    ]
  },
  {
    id: 7,
    name: 'Road Issues',
    chip: '🚧 Road Hazards & Pavements',
    examples: [
      'Pothole on campus internal road causing hazard',
      'Damaged pavement / paver blocks near entrance',
      'Water stagnation on road pathway'
    ]
  },
  {
    id: 9,
    name: 'Parking',
    chip: '🚗 Vehicle Parking & Stands',
    examples: [
      'Student two-wheeler parking overcrowding',
      'Unauthorized vehicle blocking pathway',
      'Bicycle stand shade or rack damaged'
    ]
  },
  {
    id: 11,
    name: 'Security & Safety',
    chip: '🛡️ Campus Security & Safety',
    examples: [
      'Perimeter area without street lighting at night',
      'CCTV camera angle broken or damaged',
      'Campus gate safety or vigilance concern'
    ]
  },
  {
    id: 3,
    name: 'Infrastructure',
    chip: '🏢 Desks, Benches & Civil Works',
    examples: [
      'Broken classroom desk, chair or study bench',
      'Classroom door handle broken or jammed',
      'Staircase handrail loose or damaged'
    ]
  },
  {
    id: 12,
    name: 'Other Issues',
    chip: '📌 Other Campus Concerns',
    examples: [
      'General campus administrative inquiry',
      'Campus lost and found property report',
      'Sports ground or equipment maintenance'
    ]
  }
];

let chatState = {
  step: 'STEP_CATEGORY', // 'STEP_CATEGORY', 'STEP_DESCRIPTION', 'STEP_LOCATION', 'STEP_PRIORITY', 'STEP_MEDIA', 'STEP_CONFIRM', 'SUBMITTING'
  categoryName: '',
  categoryId: 12,
  description: '',
  title: '',
  location: '',
  locationVerified: false,
  priority: 'Medium',
  selectedMediaFile: null,
  mediaPreviewUrl: null,
  mediaType: 'image'
};

function openAIChatWidget() {
  const widget = document.getElementById('campusCareChatWidget');
  if (widget) {
    widget.classList.add('open');
    const input = document.getElementById('chatTextInput');
    if (input) input.focus();
  }
}

function toggleAIChatWidget() {
  const widget = document.getElementById('campusCareChatWidget');
  if (!widget) return;
  if (widget.classList.contains('open')) {
    widget.classList.remove('open');
  } else {
    widget.classList.add('open');
    const input = document.getElementById('chatTextInput');
    if (input) input.focus();
  }
}

function resetChatState() {
  chatState = {
    step: 'STEP_CATEGORY',
    categoryName: '',
    categoryId: 12,
    description: '',
    title: '',
    location: '',
    locationVerified: false,
    priority: 'Medium',
    selectedMediaFile: null,
    mediaPreviewUrl: null,
    mediaType: 'image'
  };
}

function initAIChatAssistant() {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const studentName = (currentUser && currentUser.full_name) ? currentUser.full_name : 'Student';
  const studentDept = (currentUser && currentUser.department) ? currentUser.department : 'KIET Student';

  resetChatState();

  const chipsHtml = CAMPUS_ISSUE_CATEGORIES.map(cat => 
    `<span class="chat-chip" onclick="handleCategorySelected('${escapeHtml(cat.name)}', ${cat.id})">${escapeHtml(cat.chip)}</span>`
  ).join('');

  container.innerHTML = `
    <div class="chat-msg bot">
      <div class="chat-bubble">
        Hello <strong>${escapeHtml(studentName)}</strong>! 👋 I am your <strong>CampusCare AI Grievance Assistant</strong>.
        <br><br>
        I have already loaded your verified student record (<em>${escapeHtml(studentDept)}</em>). <strong>You do not need to fill lengthy forms.</strong>
        <br><br>
        What issue or problem are you experiencing on campus today?
        <br><br>
        Please select your issue type from the options below, or type it in English:
      </div>
      <div class="chat-timestamp">Just now</div>
      <div class="chat-chips-group">
        ${chipsHtml}
      </div>
    </div>
  `;
}

/**
 * Handle category selection (chip or text)
 */
function handleCategorySelected(categoryName, categoryId) {
  chatState.categoryName = categoryName;
  chatState.categoryId = categoryId;
  chatState.step = 'STEP_DESCRIPTION';

  const catObj = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === categoryName && c.id === categoryId) 
    || CAMPUS_ISSUE_CATEGORIES.find(c => c.name === categoryName) 
    || CAMPUS_ISSUE_CATEGORIES[0];

  const examplesHtml = (catObj.examples || []).map(ex => 
    `<span class="chat-chip" onclick="handleQuickDescriptionChip('${escapeHtml(ex)}')">${escapeHtml(ex)}</span>`
  ).join('');

  appendBotChatMessage(`
    You selected <strong>${escapeHtml(categoryName)}</strong>. ✍️
    <br><br>
    <strong>Please describe the specific issue or problem you are facing:</strong>
    <br>
    <span style="display:inline-block; margin-top:4px; font-size:12px; color:#2563eb; font-weight:700;">📌 Minimum 15 characters required</span>
    <br><br>
    Please click one of the common issue descriptions below, or type your problem in detail:
    <div class="chat-chips-group" style="margin-top: 10px;">
      ${examplesHtml}
    </div>
  `);
}

function handleQuickDescriptionChip(descText) {
  const input = document.getElementById('chatTextInput');
  if (input) input.value = descText;
  sendUserChatMessage();
}

/**
 * Main Message Dispatcher
 */
function sendUserChatMessage() {
  const input = document.getElementById('chatTextInput');
  if (!input) return;
  const rawText = input.value.trim();
  if (!rawText) return;

  // Append user message
  appendUserChatMessage(rawText);
  input.value = '';

  processChatAssistantLogic(rawText);
}

function appendUserChatMessage(text) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg user';
  msgDiv.innerHTML = `
    <div class="chat-bubble">${escapeHtml(text)}</div>
    <div class="chat-timestamp">Just now</div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function appendBotChatMessage(htmlContent) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg bot';
  msgDiv.innerHTML = `
    <div class="chat-bubble">${htmlContent}</div>
    <div class="chat-timestamp">Just now</div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Intelligent Conversational Flow Handler (Pure English)
 */
function processChatAssistantLogic(userText) {
  const lower = userText.toLowerCase();

  // STEP 6: Confirmation Step
  if (chatState.step === 'STEP_CONFIRM') {
    if (lower === 'yes' || lower === 'y' || lower === 'submit' || lower === 'confirm' || lower.includes('yes') || lower.includes('submit')) {
      submitChatGrievanceToAdmin();
    } else if (lower === 'no' || lower === 'cancel') {
      appendBotChatMessage(`Grievance filing cancelled. Feel free to select any issue whenever you need campus assistance.`);
      resetChatState();
    } else {
      // If user typed an updated/revised description (>= 15 characters)
      if (userText.trim().length >= 15) {
        chatState.description = userText.trim();
        chatState.title = `${chatState.categoryName}: ${userText.length > 55 ? userText.substring(0, 52) + '...' : userText}`;
        appendBotChatMessage(`
          <div style="background: #eff6ff; border: 1.5px solid #93c5fd; border-radius: 10px; padding: 10px; margin-bottom: 8px;">
            ✅ <strong>Description updated successfully!</strong> (${chatState.description.length} characters)
            <div style="margin-top: 4px; font-size: 12.5px; color: #1e3a8a;"><em>"${escapeHtml(chatState.description)}"</em></div>
          </div>
        `);
        // Refresh summary and ask to confirm
        advanceToConfirmationStep();
      } else {
        appendBotChatMessage(`
          ⚠️ <strong>Description too brief:</strong> Please write at least 15 characters to describe the issue properly (currently ${userText.trim().length}/15 chars).
          <br><br>
          Or type <strong>Yes</strong> to submit with existing details, or <strong>Cancel</strong>.
        `);
      }
    }
    return;
  }

  // STEP 5: Visual Media Evidence Step
  if (chatState.step === 'STEP_MEDIA') {
    appendBotChatMessage(`
      ⚠️ <strong>Visual Proof is Compulsory:</strong> College regulations strictly require a photo or video before maintenance teams are dispatched.
      <br><br>
      Please click the button below to upload your image or video:
      <div style="margin-top: 10px;">
        <button type="button" class="chat-geo-btn" style="background:#2563eb; color:#ffffff; border-color:#2563eb;" onclick="document.getElementById('chatHiddenFileInput').click()">
          📷 Attach Photo or Video Evidence
        </button>
      </div>
    `);
    return;
  }

  // STEP 4: Priority Level Step
  if (chatState.step === 'STEP_PRIORITY') {
    if (lower.includes('emergency')) {
      chatState.priority = 'Emergency';
    } else if (lower.includes('high')) {
      chatState.priority = 'High';
    } else if (lower.includes('low')) {
      chatState.priority = 'Low';
    } else {
      chatState.priority = 'Medium';
    }
    advanceToMediaStep();
    return;
  }

  // STEP 3: Campus Location Step
  if (chatState.step === 'STEP_LOCATION') {
    handleUserProvidedLocation(userText);
    return;
  }

  // STEP 2: Description Step
  if (chatState.step === 'STEP_DESCRIPTION') {
    const trimmedDesc = userText.trim();
    if (trimmedDesc.length < 15) {
      appendBotChatMessage(`
        ⚠️ <strong>Description too brief (${trimmedDesc.length}/15 characters):</strong>
        <br>
        Please enter at least 15 characters describing the problem in detail so our campus maintenance teams can investigate and resolve it quickly.
      `);
      return;
    }

    chatState.description = trimmedDesc;
    chatState.title = `${chatState.categoryName}: ${trimmedDesc.length > 55 ? trimmedDesc.substring(0, 52) + '...' : trimmedDesc}`;

    // Auto-Escalation Hazard NLP Keyword Detection
    const EMERGENCY_KEYWORDS = [
      'fire', 'spark', 'electric shock', 'short circuit', 'burning', 'blast',
      'cylinder', 'live wire', 'flood', 'collapse', 'assault', 'ragging',
      'fracture', 'bleeding', 'poison', 'gas leak', 'smoke'
    ];
    const hasEmergency = EMERGENCY_KEYWORDS.some(kw => lower.includes(kw));
    if (hasEmergency) {
      chatState.priority = 'Emergency';
      appendBotChatMessage(`
        <div class="chat-emergency-banner">
          🚨 <strong>CRITICAL HAZARD DETECTED!</strong><br>
          Our AI system detected high-risk emergency terms in your description. Your grievance is automatically elevated to <strong>EMERGENCY Priority</strong> for instant administrative vigilance and swift dispatch.
        </div>
      `);
    }

    advanceToLocationStep();
    return;
  }

  // STEP 1: Category Selection Step (User typed instead of clicking a chip)
  if (chatState.step === 'STEP_CATEGORY') {
    let matchedCat = null;

    if (lower.includes('water') || lower.includes('cooler') || lower.includes('tap') || lower.includes('drinking') || lower.includes('ro ')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Water Issues');
    } else if (lower.includes('fan') || lower.includes('ac ') || lower.includes('air condition') || lower.includes('cooler')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('AC'));
    } else if (lower.includes('light') || lower.includes('power') || lower.includes('electric') || lower.includes('socket') || lower.includes('switch') || lower.includes('wire')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('Electricity'));
    } else if (lower.includes('clean') || lower.includes('washroom') || lower.includes('toilet') || lower.includes('dustbin') || lower.includes('sanitat') || lower.includes('hygiene') || lower.includes('garbage')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Sanitation');
    } else if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet') || lower.includes('lan') || lower.includes('network')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('Wi-Fi'));
    } else if (lower.includes('lab') || lower.includes('computer') || lower.includes('pc') || lower.includes('projector') || lower.includes('software')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('Computer Labs'));
    } else if (lower.includes('teacher') || lower.includes('faculty') || lower.includes('professor') || lower.includes('lecture') || lower.includes('guidance')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('Faculty'));
    } else if (lower.includes('academic') || lower.includes('study') || lower.includes('timetable') || lower.includes('syllabus') || lower.includes('notes') || lower.includes('exam')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.chip.includes('Academics'));
    } else if (lower.includes('hostel') || lower.includes('geyser') || lower.includes('room') || lower.includes('warden')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Hostel');
    } else if (lower.includes('mess') || lower.includes('canteen') || lower.includes('food') || lower.includes('cafeteria') || lower.includes('dining')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Mess/Canteen');
    } else if (lower.includes('road') || lower.includes('pothole') || lower.includes('pathway') || lower.includes('pavement')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Road Issues');
    } else if (lower.includes('park') || lower.includes('vehicle') || lower.includes('bike') || lower.includes('car') || lower.includes('cycle')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Parking');
    } else if (lower.includes('security') || lower.includes('safety') || lower.includes('guard') || lower.includes('gate') || lower.includes('cctv')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Security & Safety');
    } else if (lower.includes('desk') || lower.includes('bench') || lower.includes('chair') || lower.includes('furniture') || lower.includes('door') || lower.includes('window')) {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Infrastructure');
    } else {
      matchedCat = CAMPUS_ISSUE_CATEGORIES.find(c => c.name === 'Other Issues');
    }

    if (matchedCat) {
      handleCategorySelected(matchedCat.name, matchedCat.id);
    }
  }
}

/**
 * Step 3: Advance to Location
 */
function advanceToLocationStep() {
  chatState.step = 'STEP_LOCATION';

  appendBotChatMessage(`
    Issue noted: <em>"${escapeHtml(chatState.description)}"</em>
    <br><br>
    📍 <strong>Where on campus is this issue located?</strong>
    <br>
    (College policy requires grievances to be situated within the <strong>1.5 km KIET Campus boundary</strong>).
    <br><br>
    Click below to Auto-Detect your campus GPS or select your campus block:
    <div class="chat-location-card">
      <button type="button" class="chat-geo-btn" onclick="triggerChatGPSDetection()">
        📍 Auto-Detect KIET Campus Location
      </button>
      <div id="chatGeoStatusText" class="chat-geo-status">GPS verification (1.5 km KIET campus radius)</div>
    </div>
    <div class="chat-chips-group">
      <span class="chat-chip" onclick="handleQuickLocationChip('Academic Block A & B (KIET Campus)')">🏢 Academic Block A &amp; B</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Pharmacy & MBA Block (KIET Campus)')">💊 Pharmacy &amp; MBA Block</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Boys Hostel Campus (KIET Campus)')">🏠 Boys Hostel Campus</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Girls Hostel Campus (KIET Campus)')">🏡 Girls Hostel Campus</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Central Library & Reading Hall (KIET Campus)')">📚 Central Library</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Main Cafeteria & Canteen (KIET Campus)')">☕ Main Cafeteria</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Sports Complex & Ground (KIET Campus)')">⚽ Sports Complex</span>
      <span class="chat-chip" onclick="handleQuickLocationChip('Campus Main Entrance Gate 1 / 2 (KIET Campus)')">🚪 Campus Main Gate</span>
    </div>
  `);
}

/**
 * GPS auto-detection with Haversine distance verification
 */
function triggerChatGPSDetection() {
  const statusEl = document.getElementById('chatGeoStatusText');
  if (statusEl) statusEl.innerText = 'Detecting current GPS coordinates...';

  if (!navigator.geolocation) {
    if (statusEl) statusEl.innerText = 'GPS not supported by browser. Please select a campus block below.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const distKm = computeHaversineDistanceKm(lat, lng, KIET_LAT, KIET_LNG);

      if (distKm <= MAX_CAMPUS_RADIUS_KM) {
        const verifiedLoc = `KIET Campus Premises (${distKm.toFixed(2)} km from center, Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        chatState.location = verifiedLoc;
        chatState.locationVerified = true;
        if (statusEl) {
          statusEl.className = 'chat-geo-status verified';
          statusEl.innerHTML = `✓ Verified within KIET Campus (${distKm.toFixed(2)} km &le; 1.5 km)`;
        }
        checkDuplicateAndAdvance();
      } else {
        // Outside 1.5 km boundary
        if (statusEl) {
          statusEl.style.color = '#dc2626';
          statusEl.innerText = `Outside Campus (${distKm.toFixed(1)} km from KIET). Allowed within 1.5 km only. Please select a campus block below.`;
        }
        appendBotChatMessage(`
          ⚠️ <strong>Location Alert</strong>: Detected location is ${distKm.toFixed(1)} km away from KIET. Under college regulations, grievances must be situated inside the 1.5 km campus boundary.
          <br><br>
          Please select your campus block using the quick chips below:
        `);
      }
    },
    (err) => {
      // Fallback for permissions denied on desktop
      const defaultLoc = 'Academic Block, KIET Campus Premises (Within 1.5 km)';
      chatState.location = defaultLoc;
      chatState.locationVerified = true;
      if (statusEl) {
        statusEl.className = 'chat-geo-status verified';
        statusEl.innerHTML = `✓ Geofenced to KIET Campus Premises (1.5 km radius)`;
      }
      checkDuplicateAndAdvance();
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

function handleQuickLocationChip(locText) {
  chatState.location = locText;
  chatState.locationVerified = true;
  checkDuplicateAndAdvance();
}

function handleUserProvidedLocation(userText) {
  chatState.location = `${userText.trim()} (Reported at KIET Campus Premises - Within 1.5 km)`;
  chatState.locationVerified = true;
  checkDuplicateAndAdvance();
}

/**
 * AI Duplicate Issue Detection Engine
 * Cross-references active complaints (Pending & In Progress) at same location or category
 */
async function checkDuplicateAndAdvance() {
  if (!authToken) {
    advanceToPriorityStep();
    return;
  }

  appendBotChatMessage(`🔍 <em>AI is cross-referencing active college tickets to check for duplicate reports...</em>`);

  try {
    const res = await fetch(`${API_BASE}/api/complaints/check-duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        category_id: chatState.categoryId,
        location: chatState.location,
        description: chatState.description
      })
    });

    const data = await res.json();
    if (data.success && data.duplicate_found && data.matches && data.matches.length > 0) {
      const match = data.matches[0];
      appendBotChatMessage(`
        <div class="chat-duplicate-box">
          <div class="chat-duplicate-header">
            <span>⚠️</span> Active Grievance Already Reported Here!
          </div>
          <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.4;">
            Our AI detected that a similar active ticket was already lodged at this location:
          </p>
          <div class="chat-duplicate-ticket">
            <strong>#CMP-${match.ComplaintID}: ${escapeHtml(match.Title)}</strong>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              📍 Location: <strong>${escapeHtml(match.Location)}</strong> &bull; Status: <span style="color:#b45309; font-weight:700;">${match.Status}</span>
            </div>
            <div style="font-size: 11.5px; color: #1d4ed8; margin-top: 4px; font-weight: 800;">
              👍 Current Endorsements: ${match.Upvotes || 0} student(s) supported this
            </div>
          </div>
          <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px;">
            Would you like to <strong>Upvote / Support</strong> this existing ticket to escalate its priority with Admin, instead of creating a duplicate?
          </div>
          <div class="chat-duplicate-actions">
            <button type="button" class="chat-btn-upvote" onclick="handleUpvoteFromChat(${match.ComplaintID})">
              👍 Upvote Existing Ticket (#CMP-${match.ComplaintID})
            </button>
            <button type="button" class="chat-btn-continue-new" onclick="advanceToPriorityStep()">
              📝 File New Ticket Anyway &rarr;
            </button>
          </div>
        </div>
      `);
      return;
    }
  } catch (err) {
    console.warn('Duplicate check error:', err);
  }

  advanceToPriorityStep();
}

/**
 * Handle Upvoting from AI Chat
 */
async function handleUpvoteFromChat(complaintId) {
  if (!authToken) {
    appendBotChatMessage(`⚠️ Please login to upvote tickets.`);
    return;
  }

  appendBotChatMessage(`⏳ Registering your endorsement for ticket #CMP-${complaintId}...`);

  try {
    const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/upvote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      appendBotChatMessage(`
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 14px; padding: 14px; color: #166534;">
          <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">🎉 Ticket Upvoted Successfully!</div>
          <div style="font-size: 12px; line-height: 1.5;">
            Your endorsement has been added to ticket <strong>#CMP-${complaintId}</strong>.
            <br>
            <strong>Total Endorsements:</strong> ${data.upvotes} students.
            <br>
            The College Administration prioritizes tickets with higher student endorsements.
          </div>
          <div style="margin-top: 10px;">
            <button type="button" class="chat-btn-submit" style="background:#16a34a; font-size:11.5px; padding:6px 12px;" onclick="openMyComplaints()">
              📋 View in My Complaints
            </button>
          </div>
        </div>
      `);
      resetChatState();
      loadStudentComplaints();
    } else {
      appendBotChatMessage(`ℹ️ ${data.message || 'Could not register upvote.'}`);
      advanceToPriorityStep();
    }
  } catch (err) {
    appendBotChatMessage(`❌ Network error while upvoting: ${err.message}`);
    advanceToPriorityStep();
  }
}

/**
 * Step 4: Advance to Priority
 */
function advanceToPriorityStep() {
  chatState.step = 'STEP_PRIORITY';

  if (chatState.priority === 'Emergency') {
    appendBotChatMessage(`
      Location verified: <strong>${escapeHtml(chatState.location)}</strong>.
      <br><br>
      🚨 Priority is currently locked to <strong>EMERGENCY</strong> due to high-risk hazard keywords detected.
      <br><br>
      You can proceed directly to attach evidence or confirm priority level:
      <div class="chat-chips-group" style="margin-top: 10px;">
        <span class="chat-chip" style="background:#fef2f2; border-color:#ef4444; color:#dc2626; font-weight:800;" onclick="handleQuickPriorityChip('Emergency')">🚨 Confirm EMERGENCY Priority</span>
        <span class="chat-chip" onclick="handleQuickPriorityChip('High')">🟠 Change to High</span>
        <span class="chat-chip" onclick="handleQuickPriorityChip('Medium')">🟡 Change to Medium</span>
      </div>
    `);
    return;
  }

  appendBotChatMessage(`
    Location verified: <strong>${escapeHtml(chatState.location)}</strong>.
    <br><br>
    ⚡ <strong>Please select the priority level for this grievance:</strong>
    <div class="chat-chips-group" style="margin-top: 10px;">
      <span class="chat-chip" onclick="handleQuickPriorityChip('Low')">🟢 Low (Routine maintenance / inquiry)</span>
      <span class="chat-chip" onclick="handleQuickPriorityChip('Medium')">🟡 Medium (Standard 24-48h redressal)</span>
      <span class="chat-chip" onclick="handleQuickPriorityChip('High')">🟠 High (Urgent classroom / facility issue)</span>
      <span class="chat-chip" onclick="handleQuickPriorityChip('Emergency')">🔴 Emergency (Immediate hazard / power failure / safety)</span>
    </div>
  `);
}

function handleQuickPriorityChip(priorityText) {
  chatState.priority = priorityText;
  advanceToMediaStep();
}

/**
 * Step 5: Advance to Compulsory Photo/Video Evidence
 */
function advanceToMediaStep() {
  chatState.step = 'STEP_MEDIA';

  appendBotChatMessage(`
    Priority recorded: <strong>${escapeHtml(chatState.priority)}</strong>.
    <br><br>
    📷 <strong>Compulsory Visual Evidence:</strong>
    <br>
    Official college policy requires photo or video proof before maintenance staff can be dispatched.
    <br><br>
    Please click below to attach an image or video:
    <div class="chat-photo-card" id="chatPhotoCardBox">
      <label class="chat-upload-label" onclick="document.getElementById('chatHiddenFileInput').click()">
        📷 Attach Photo or Video Evidence
      </label>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Supported: JPG, PNG, WEBP, MP4, WEBM (Max 25 MB)</div>
      <div id="chatPhotoPreviewContainer" style="display: none; margin-top: 10px;"></div>
    </div>
  `);
}

/**
 * Handle media file selection in chat (Photo or Video)
 */
function handleChatMediaSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  // Validate size (max 25 MB)
  if (file.size > 25 * 1024 * 1024) {
    appendBotChatMessage(`⚠️ File size exceeds 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller photo or video.`);
    return;
  }

  chatState.selectedMediaFile = file;
  const isVideo = file.type.startsWith('video/');
  chatState.mediaType = isVideo ? 'video' : 'image';

  const reader = new FileReader();
  reader.onload = function(evt) {
    chatState.mediaPreviewUrl = evt.target.result;
    const cardBox = document.getElementById('chatPhotoCardBox');
    if (cardBox) cardBox.classList.add('attached');

    const previewContainer = document.getElementById('chatPhotoPreviewContainer');
    if (previewContainer) {
      previewContainer.style.display = 'block';
      const previewEl = isVideo
        ? `<video controls src="${evt.target.result}" style="width:100%; max-height:130px; border-radius:8px;"></video>`
        : `<img src="${evt.target.result}" alt="Preview" style="width:100%; max-height:130px; object-fit:cover; border-radius:8px;">`;

      previewContainer.innerHTML = `
        <div class="chat-preview-box">
          ${previewEl}
          <button type="button" class="chat-remove-photo-btn" onclick="removeChatMedia()" title="Remove evidence">&times;</button>
        </div>
        <div style="font-size: 11.5px; font-weight: 700; color: #16a34a; margin-top: 6px;">
          ✓ ${isVideo ? 'Video' : 'Photo'} attached (${Math.round(file.size / 1024)} KB)
        </div>
      `;
    }

    advanceToConfirmationStep();
  };
  reader.readAsDataURL(file);
}

// Alias for backwards compatibility
const handleChatImageSelected = handleChatMediaSelected;

function removeChatMedia() {
  chatState.selectedMediaFile = null;
  chatState.mediaPreviewUrl = null;
  const input = document.getElementById('chatHiddenFileInput');
  if (input) input.value = '';

  const cardBox = document.getElementById('chatPhotoCardBox');
  if (cardBox) cardBox.classList.remove('attached');

  const previewContainer = document.getElementById('chatPhotoPreviewContainer');
  if (previewContainer) {
    previewContainer.style.display = 'none';
    previewContainer.innerHTML = '';
  }
}

/**
 * Step 6: Confirmation Prompt Before Submitting to Admin
 */
function advanceToConfirmationStep() {
  chatState.step = 'STEP_CONFIRM';

  const studentName = (currentUser && currentUser.full_name) ? currentUser.full_name : 'Student';
  const studentEmail = (currentUser && currentUser.email) ? currentUser.email : 'student@kiet.edu';

  appendBotChatMessage(`
    <div class="chat-confirm-box">
      <div class="chat-confirm-header">📋 Grievance Ticket Summary:</div>
      <div class="chat-confirm-list">
        <div><strong>Student:</strong> ${escapeHtml(studentName)} (${escapeHtml(studentEmail)})</div>
        <div><strong>Category:</strong> ${escapeHtml(chatState.categoryName)}</div>
        <div><strong>Description:</strong> ${escapeHtml(chatState.description)}</div>
        <div><strong>Location:</strong> ${escapeHtml(chatState.location)}</div>
        <div><strong>Priority:</strong> ${escapeHtml(chatState.priority)}</div>
        <div><strong>Evidence:</strong> <span style="color:#16a34a; font-weight:700;">✓ Attached (${chatState.selectedMediaFile ? chatState.selectedMediaFile.name : 'Proof'})</span></div>
      </div>

      <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
        👉 Would you like to submit this grievance to the Admin?
      </div>
      <div style="font-size: 11.5px; color: #64748b; margin-bottom: 12px;">
        (Type 'Yes' to submit or click the button below)
      </div>

      <div class="chat-confirm-actions">
        <button type="button" class="chat-btn-submit" onclick="submitChatGrievanceToAdmin()">
          ✓ Yes, Submit to Admin
        </button>
        <button type="button" class="chat-btn-cancel" onclick="cancelChatGrievance()">
          ✕ Cancel
        </button>
      </div>
    </div>
  `);
}

function cancelChatGrievance() {
  appendBotChatMessage(`Grievance submission cancelled. You can select an issue anytime to start again.`);
  resetChatState();
}

/**
 * Submit Grievance Directly to Admin Endpoint via FormData
 */
async function submitChatGrievanceToAdmin() {
  if (chatState.step === 'SUBMITTING') return;
  chatState.step = 'SUBMITTING';

  if (!authToken) {
    appendBotChatMessage(`⚠️ Please login with your official college credentials to submit a grievance ticket.`);
    return;
  }

  if (!chatState.selectedMediaFile) {
    chatState.step = 'STEP_MEDIA';
    appendBotChatMessage(`⚠️ <strong>Photo or video evidence is compulsory!</strong> Please attach proof before submitting.`);
    return;
  }

  appendBotChatMessage(`⏳ <strong>Dispatching ticket to College Admin...</strong> Please wait a moment.`);

  try {
    const formData = new FormData();
    formData.append('title', chatState.title || `${chatState.categoryName} Redressal Request`);
    formData.append('category_id', chatState.categoryId);
    formData.append('description', chatState.description);
    formData.append('location', chatState.location);
    formData.append('priority', chatState.priority);
    formData.append('image', chatState.selectedMediaFile);

    const res = await fetch(`${API_BASE}/api/complaints/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();

    if (res.ok && data.success) {
      appendBotChatMessage(`
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 14px; padding: 14px; color: #166534;">
          <div style="font-size: 15px; font-weight: 800; margin-bottom: 6px;">🎉 Grievance Submitted Successfully!</div>
          <div style="font-size: 12.5px; line-height: 1.5;">
            Your ticket <strong>#CMP-${data.complaint_id}</strong> has been officially logged with the College Administration.
            <br>
            <strong>Standard SLA:</strong> ${data.sla_hours || 24} Hours.
          </div>
          <div style="margin-top: 10px;">
            <button type="button" class="chat-btn-submit" style="background:#16a34a; font-size:12px; padding:7px 14px;" onclick="openMyComplaints()">
              📋 View in My Complaints
            </button>
          </div>
        </div>
      `);

      resetChatState();
      // Refresh complaints list and stats
      loadStudentComplaints();
    } else {
      chatState.step = 'STEP_CONFIRM';
      appendBotChatMessage(`
        <div style="background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 12px; padding: 12px; color: #991b1b;">
          <strong>❌ Submission Error:</strong> ${escapeHtml(data.message || 'Please check and try again.')}
          <div style="margin-top: 6px; font-size: 12px; color: #7f1d1d;">
            💡 <em>You can directly type a new detailed description (at least 15 characters) below, or type <strong>Yes</strong> to retry submitting.</em>
          </div>
        </div>
      `);
    }
  } catch (err) {
    chatState.step = 'STEP_CONFIRM';
    appendBotChatMessage(`
      <div style="background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 12px; padding: 12px; color: #991b1b;">
        <strong>❌ Network Error:</strong> ${escapeHtml(err.message)}
        <div style="margin-top: 6px; font-size: 12px;">
          Type <strong>Yes</strong> to retry or <strong>Cancel</strong> to start over.
        </div>
      </div>
    `);
  }
}

/**
 * Haversine formula calculation for KM distance
 */
function computeHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/* =====================================================
   INTERACTIVE KIET CAMPUS 2D MAP CONTROLLER (LEAFLET.JS)
===================================================== */
let campusMapInstance = null;
let allMapComplaints = [];
let mapMarkersGroup = null;
let studentBoundaryPolygon = null;
let studentBuildingsLayerGroup = null;

let studentMapLayers = {
  hybrid: null,
  streets: null,
  aerial: null
};
let currentStudentLayerKey = 'hybrid';

const STUDENT_KIET_BOUNDARY = [
  [28.7562, 77.4952],
  [28.7568, 77.4988],
  [28.7538, 77.5005],
  [28.7505, 77.5008],
  [28.7498, 77.4965],
  [28.7540, 77.4948]
];

const STUDENT_KIET_BUILDINGS = {
  block_ab: {
    name: "Block A & B (Core)",
    icon: "🏛️",
    coords: [28.7535, 77.4975],
    desc: "Academic Block A & B (CSE, IT, ECE, Central Admin Desk)"
  },
  library: {
    name: "Central Library & Aud",
    icon: "📚",
    coords: [28.7530, 77.4972],
    desc: "Central Knowledge Center, Digital Reading Halls & Main Auditorium"
  },
  pharmacy: {
    name: "KSOP Pharmacy & MBA",
    icon: "🖊️",
    coords: [28.7523, 77.4984],
    desc: "KIET School of Pharmacy & Department of Management Studies"
  },
  hostels: {
    name: "Tagore & Hostels",
    icon: "🏫",
    coords: [28.7543, 77.4968],
    desc: "Tagore Hostel, Aryabhatta Complex & Student Residential Quarters"
  },
  cafeteria: {
    name: "Cafeteria / Food Court",
    icon: "🍽️",
    coords: [28.7537, 77.4982],
    desc: "Central Food Court, Nescafe Corner & Student Recreation"
  }
};

function openCampusMapModal() {
  const modal = document.getElementById('campusMapModal');
  if (!modal) return;
  modal.classList.add('show');
  setTimeout(() => {
    initCampusCareMap();
  }, 200);
}

function closeCampusMapModal(event) {
  if (event && event.target && event.target !== document.getElementById('campusMapModal')) return;
  const modal = document.getElementById('campusMapModal');
  if (modal) modal.classList.remove('show');
}

async function initCampusCareMap() {
  const mapContainer = document.getElementById('campusCareLeafletMap');
  if (!mapContainer || !window.L) return;

  const KIET_COORDS = [28.75330, 77.49730];

  if (!campusMapInstance) {
    campusMapInstance = L.map('campusCareLeafletMap', {
      center: KIET_COORDS,
      zoom: 17,
      minZoom: 14,
      maxZoom: 20
    });

    // High-resolution Google Satellite Hybrid (with roads, places & labels matching photo)
    studentMapLayers.hybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: '&copy; Google Maps Satellite | KIET Group of Institutions'
    });

    // Modern Streets
    studentMapLayers.streets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: '&copy; Google Maps Streets | KIET Group of Institutions'
    });

    // Pure Aerial Photo
    studentMapLayers.aerial = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: '&copy; Google Maps Aerial | KIET Group of Institutions'
    });

    // Add Default Layer: Satellite Hybrid (Matching Mobile Photo)
    studentMapLayers.hybrid.addTo(campusMapInstance);

    // Cyan dashed campus perimeter polygon
    studentBoundaryPolygon = L.polygon(STUDENT_KIET_BOUNDARY, {
      color: '#38bdf8',
      weight: 3,
      dashArray: '6, 6',
      fillColor: '#0284c7',
      fillOpacity: 0.05
    }).addTo(campusMapInstance);

    // Landmark Building Badges (Dark blue badges matching photo)
    studentBuildingsLayerGroup = L.layerGroup().addTo(campusMapInstance);
    Object.keys(STUDENT_KIET_BUILDINGS).forEach(key => {
      const b = STUDENT_KIET_BUILDINGS[key];
      const icon = L.divIcon({
        className: 'kiet-student-building-badge',
        html: `
          <div style="background: rgba(15, 23, 42, 0.94); color: #ffffff; padding: 4px 10px; border-radius: 8px; border: 1.5px solid #38bdf8; font-size: 11px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 14px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 5px; cursor: pointer;">
            <span>${b.icon}</span>
            <span>${escapeHtml(b.name)}</span>
          </div>
        `,
        iconSize: [140, 28],
        iconAnchor: [70, 14]
      });
      const marker = L.marker(b.coords, { icon: icon }).addTo(studentBuildingsLayerGroup);
      marker.bindPopup(`
        <div style="font-family: inherit; padding: 6px 4px; min-width: 190px;">
          <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 4px;">${b.icon} ${escapeHtml(b.name)}</div>
          <div style="font-size: 12px; color: #475569; line-height: 1.4;">${escapeHtml(b.desc)}</div>
        </div>
      `);
    });

    mapMarkersGroup = L.layerGroup().addTo(campusMapInstance);
  }

  setTimeout(() => {
    if (campusMapInstance) {
      campusMapInstance.invalidateSize();
    }
  }, 150);

  try {
    const res = await fetch(`${API_BASE}/api/complaints/map-feed`);
    const data = await res.json();
    if (data.success && data.complaints) {
      allMapComplaints = data.complaints;
      renderCampusMapPins(allMapComplaints);
    }
  } catch (e) {
    console.error('Failed to load map complaints:', e);
  }
}

function switchStudentMapLayer(layerKey) {
  if (!campusMapInstance || !studentMapLayers[layerKey]) return;
  currentStudentLayerKey = layerKey;

  ['hybrid', 'streets', 'aerial'].forEach(k => {
    if (studentMapLayers[k] && campusMapInstance.hasLayer(studentMapLayers[k])) {
      campusMapInstance.removeLayer(studentMapLayers[k]);
    }
  });

  studentMapLayers[layerKey].addTo(campusMapInstance);

  const btnHybrid = document.getElementById('studentMapLayerHybrid');
  const btnStreets = document.getElementById('studentMapLayerStreets');
  const btnAerial = document.getElementById('studentMapLayerAerial');

  [btnHybrid, btnStreets, btnAerial].forEach(b => {
    if (b) {
      b.style.background = '#ffffff';
      b.style.color = '#334155';
      b.style.borderColor = '#cbd5e1';
    }
  });

  const activeBtn = layerKey === 'hybrid' ? btnHybrid : (layerKey === 'streets' ? btnStreets : btnAerial);
  if (activeBtn) {
    activeBtn.style.background = '#2563eb';
    activeBtn.style.color = '#ffffff';
    activeBtn.style.borderColor = '#2563eb';
  }
}

function focusStudentKIETCampus() {
  if (!campusMapInstance) return;
  campusMapInstance.flyTo([28.75330, 77.49730], 17.5, { duration: 1.0 });
}

function flyStudentToBuilding(key) {
  const b = STUDENT_KIET_BUILDINGS[key];
  if (!b || !campusMapInstance) return;
  campusMapInstance.flyTo(b.coords, 18.5, { duration: 1.2 });
}

function renderCampusMapPins(complaints) {
  if (!mapMarkersGroup || !campusMapInstance) return;
  mapMarkersGroup.clearLayers();

  const totalEl = document.getElementById('mapTotalPinsCount');
  if (totalEl) {
    totalEl.innerText = `📍 Showing ${complaints.length} Campus Issue${complaints.length === 1 ? '' : 's'}`;
  }

  complaints.forEach(c => {
    const lat = c.Latitude || 28.75330;
    const lng = c.Longitude || 77.49730;

    let pinClass = 'pin-pending';
    let pinEmoji = '🔴';
    if (c.Priority === 'Emergency') {
      pinClass = 'pin-emergency';
      pinEmoji = '🚨';
    } else if (c.Status === 'In Progress') {
      pinClass = 'pin-in-progress';
      pinEmoji = '🟡';
    } else if (c.Status === 'Resolved') {
      pinClass = 'pin-resolved';
      pinEmoji = '🟢';
    }

    const iconHtml = `<div class="campus-map-pin ${pinClass}">${pinEmoji}</div>`;
    const customIcon = L.divIcon({
      className: 'custom-div-icon',
      html: iconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });

    const statusBadgeClass = c.Status === 'In Progress' ? 'InProgress' : c.Status;
    const imgHtml = c.ImageAttachmentURL 
      ? `<img src="${c.ImageAttachmentURL}" alt="Evidence" class="map-popup-img" />` 
      : '';

    const popupHtml = `
      <div class="map-popup-card">
        <div class="map-popup-badge-row">
          <span class="map-popup-badge ${statusBadgeClass}">${c.Status}</span>
          <span style="font-size:10.5px; font-weight:750; color:#475569;">#CMP-${c.ComplaintID}</span>
        </div>
        <div class="map-popup-title">${escapeHtml(c.Title)}</div>
        <div class="map-popup-loc">📍 ${escapeHtml(c.Location)}</div>
        ${imgHtml}
        <div class="map-popup-footer">
          <span class="map-popup-upvotes">👍 ${c.Upvotes || 0} Upvotes</span>
          ${c.Status !== 'Resolved' ? `
            <button type="button" class="map-popup-btn" onclick="upvoteTicketFromMap(${c.ComplaintID})">
              👍 Upvote
            </button>
          ` : '<span style="font-size:11px; color:#15803d; font-weight:700;">✓ Resolved</span>'}
        </div>
      </div>
    `;

    const marker = L.marker([lat, lng], { icon: customIcon });
    marker.bindPopup(popupHtml);
    mapMarkersGroup.addLayer(marker);
  });
}

function filterCampusMap(status, btnElement) {
  document.querySelectorAll('.map-pill').forEach(p => p.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  if (status === 'all') {
    renderCampusMapPins(allMapComplaints);
  } else {
    const filtered = allMapComplaints.filter(c => c.Status === status);
    renderCampusMapPins(filtered);
  }
}

async function upvoteTicketFromMap(complaintId) {
  if (!authToken) {
    alert('Please login to support or upvote grievance tickets.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/upvote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`🎉 Upvote registered for Ticket #CMP-${complaintId}! Total endorsements: ${data.upvotes}`);
      initCampusCareMap();
      loadStudentComplaints();
    } else {
      alert(data.message || 'Could not register upvote.');
    }
  } catch (err) {
    alert(`Failed to upvote: ${err.message}`);
  }
}

// Global window bindings for inline HTML handlers
window.viewComplaintEvidence = viewComplaintEvidence;
window.openDedicatedTrackingPage = openDedicatedTrackingPage;
window.backToComplaintsOverview = backToComplaintsOverview;
window.openStudentImageModal = openStudentImageModal;
window.closeStudentImageModal = closeStudentImageModal;
window.openCampusMapModal = openCampusMapModal;
window.closeCampusMapModal = closeCampusMapModal;
window.switchStudentMapLayer = switchStudentMapLayer;
window.focusStudentKIETCampus = focusStudentKIETCampus;
window.flyStudentToBuilding = flyStudentToBuilding;
window.filterCampusMap = filterCampusMap;
window.upvoteTicketFromMap = upvoteTicketFromMap;
