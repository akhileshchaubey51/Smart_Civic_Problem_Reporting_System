/**
 * KIET CampusCare | Staff & Department Resolution Portal Controller
 * Manages Staff KPI metrics, Assigned Tasks processing, All Department
 * Issues inspection, Real-Time Task Notifications, and Media Evidence Viewer.
 */

let currentStaffUser = null;
let authToken = null;
let staffMyTasksCache = [];
let staffAllIssuesCache = [];
let staffNotifsCache = [];
let debounceTimer = null;

const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000'))
  ? 'http://127.0.0.1:5000'
  : '';

function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE}${cleanUrl}`;
}
window.resolveMediaUrl = resolveMediaUrl;

document.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('campuscare_token');
  const userStr = localStorage.getItem('campuscare_user');

  if (!authToken || !userStr) {
    window.location.replace('/login.html');
    return;
  }

  try {
    currentStaffUser = JSON.parse(userStr);
  } catch (e) {
    console.error('Invalid user session:', e);
    window.location.replace('/login.html');
    return;
  }

  // Populate staff profile in navbar & hero
  initStaffProfile();

  // Load KPI overview, tasks, and notifications
  loadStaffOverview();
  loadStaffMyTasks();
  loadStaffAllIssues();
  loadStaffNotifications();

  // Poll notifications every 20 seconds
  setInterval(loadStaffNotifications, 20000);

  // Close notification drawer when clicking outside
  document.addEventListener('click', (e) => {
    const drawer = document.getElementById('staffNotifDrawer');
    const btn = document.getElementById('staffNotifBtn');
    if (drawer && drawer.classList.contains('show')) {
      if (!drawer.contains(e.target) && !btn.contains(e.target)) {
        drawer.classList.remove('show');
      }
    }
  });

  // ESC key for lightboxes and modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStaffLightbox();
      closeStaffDetailModal();
    }
  });
});

/**
 * 1. Initialize Staff Profile Info
 */
function initStaffProfile() {
  if (!currentStaffUser) return;

  const nameEl = document.getElementById('staffFullName');
  const deptEl = document.getElementById('staffDeptRole');
  const avatarEl = document.getElementById('staffAvatarImg');
  const heroHeading = document.getElementById('staffHeroHeading');
  const heroDept = document.getElementById('staffHeroDeptName');

  const fullName = currentStaffUser.full_name || currentStaffUser.FullName || 'Staff Member';
  const dept = currentStaffUser.department || currentStaffUser.Department || 'Campus Maintenance';
  const role = currentStaffUser.role || currentStaffUser.Role || 'Staff';
  let avatar = currentStaffUser.profile_image || currentStaffUser.ProfileImage;
  if (!avatar || avatar.includes('logo.jpg')) {
    avatar = '/profile images/image13.jpg';
  }

  if (nameEl) nameEl.innerText = fullName;
  if (deptEl) deptEl.innerText = `${dept} (${role})`;
  if (avatarEl) avatarEl.src = avatar;
  if (heroHeading) heroHeading.innerText = `Welcome, ${fullName.split(' ')[0]}!`;
  if (heroDept) heroDept.innerText = dept;
}

/**
 * 2. Fetch Staff KPI Overview
 */
async function loadStaffOverview() {
  try {
    const res = await fetch(`${API_BASE}/api/staff/overview`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && data.kpi) {
      const k = data.kpi;
      document.getElementById('kpiMyTotal').innerText = k.total_assigned;
      document.getElementById('kpiMyPending').innerText = k.pending_tasks;
      document.getElementById('kpiMyInProgress').innerText = k.in_progress_tasks;
      document.getElementById('kpiMyResolved').innerText = k.resolved_tasks;
      document.getElementById('kpiCollegeTotal').innerText = k.college_issues;

      // Update badge counts on tabs
      document.getElementById('tabCountMyTasks').innerText = k.total_assigned;
      document.getElementById('tabCountAllIssues').innerText = k.college_issues;
      document.getElementById('tabCountNotifs').innerText = k.unread_notifications;

      const notifBadge = document.getElementById('staffNotifBadge');
      if (notifBadge) {
        notifBadge.innerText = k.unread_notifications;
        notifBadge.style.display = k.unread_notifications > 0 ? 'flex' : 'none';
      }
    }
  } catch (err) {
    console.warn('Overview fetch error:', err);
  }
}

/**
 * 3. Load My Assigned Tasks (Actionable Tab)
 */
async function loadStaffMyTasks() {
  const container = document.getElementById('staffMyTasksContainer');
  if (!container) return;

  const status = document.getElementById('filterMyTaskStatus')?.value || 'all';

  container.innerHTML = `
    <div class="staff-loading" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
      <div class="staff-spinner" style="width:36px; height:36px; margin:0 auto 12px; border:3px solid #e2e8f0; border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      <p style="color: #64748b; font-weight: 600;">Loading tasks tagged to your ID...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/staff/my-tasks?status=${encodeURIComponent(status)}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      container.innerHTML = `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #ef4444;">Failed to load assigned tasks.</div>`;
      return;
    }

    staffMyTasksCache = data.tasks || [];
    renderStaffMyTasks(staffMyTasksCache);
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #ef4444;">Network error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderStaffMyTasks(tasks) {
  const container = document.getElementById('staffMyTasksContainer');
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = `
      <div style="padding: 50px 20px; text-align: center; background: #ffffff; border-radius: 16px; border: 1.5px dashed #cbd5e1; width: 100%;">
        <span style="font-size: 40px;">🎉</span>
        <h3 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 8px 0 4px;">No Assigned Tasks Pending</h3>
        <p style="font-size: 15px; color: #64748b;">You do not currently have any grievance tickets assigned to your ID matching this filter.</p>
      </div>
    `;
    return;
  }

  let html = '';
  tasks.forEach(t => {
    const statusClass = (t.Status || 'Pending').replace(/\s+/g, '-');
    const isVid = t.ImageAttachmentURL && (/\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(t.ImageAttachmentURL) || t.ImageAttachmentURL.includes('/video/'));
    const submittedDateStr = t.CreatedAt ? new Date(t.CreatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    html += `
      <div class="staff-vertical-task-card">
        <div class="staff-card-top-bar">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="task-id-badge">#CMP-${t.ComplaintID}</span>
            <span class="priority-pill priority-${t.Priority}">${t.Priority}</span>
            <span class="staff-category-pill">${escapeHtml(t.CategoryName || 'General')}</span>
            ${t.DepartmentTag ? `<span class="task-tag-badge">🏷️ Tag: ${escapeHtml(t.DepartmentTag)}</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="status-badge status-${statusClass}">${t.Status}</span>
            <span class="task-sla-pill">⏳ ${t.SLA_Hours}h SLA</span>
          </div>
        </div>

        <div class="staff-card-body">
          <h3 class="task-title">${escapeHtml(t.Title)}</h3>
          <p class="task-desc">${escapeHtml(t.Description)}</p>

          <div class="staff-card-meta-line">
            <div class="staff-meta-chip">
              <span class="chip-label">📍 Location:</span>
              <span class="chip-val">${escapeHtml(t.Location)}</span>
            </div>
            <div class="staff-meta-chip">
              <span class="chip-label">👤 Student:</span>
              <span class="chip-val">${escapeHtml(t.StudentName)} (${escapeHtml(t.StudentDepartment || 'Student')})</span>
            </div>
            <div class="staff-meta-chip">
              <span class="chip-label">🕒 Submitted:</span>
              <span class="chip-val">${submittedDateStr}</span>
            </div>
          </div>

          ${t.AssignedNotes ? `
            <div class="task-directive-box" style="margin-top: 4px;">
              <strong>📋 Admin Assignment Directive:</strong> "${escapeHtml(t.AssignedNotes)}"
            </div>
          ` : ''}
        </div>

        <div class="staff-card-footer">
          <div style="display:flex; align-items:center; gap:10px;">
            ${t.ImageAttachmentURL ? `
              <button type="button" class="staff-media-btn" onclick="openStaffLightbox('${resolveMediaUrl(t.ImageAttachmentURL)}', '${escapeHtml(t.Title).replace(/'/g, "\\'")}')">
                ${isVid ? '🎬 Attached Video (Click to Preview)' : '📷 Attached Photo (Click to Preview)'}
              </button>
            ` : '<span style="font-size:14px; color:#94a3b8; font-style:italic;">No Media Attached</span>'}
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="staff-manage-action-btn" onclick="openStaffManageModal(${t.ComplaintID})">
              <span>⚙️</span> Manage Task &rarr;
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * 4. Submit Task Update Action (In Progress or Resolved)
 */
async function submitStaffTaskAction(complaintId) {
  const statusEl = document.getElementById(`statusSelect_${complaintId}`);
  const remarksEl = document.getElementById(`remarksInput_${complaintId}`);

  const status = statusEl ? statusEl.value : 'In Progress';
  const remarks = remarksEl ? remarksEl.value.trim() : '';

  if (!remarks || remarks.length < 5) {
    alert('Please enter action remarks explaining what work was completed (minimum 5 characters).');
    if (remarksEl) remarksEl.focus();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/staff/update-task/${complaintId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status, remarks })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✓ Task #CMP-${complaintId} updated to "${status}". Action logged to timeline.`);
      // Refresh my tasks and overview
      loadStaffMyTasks();
      loadStaffOverview();
    } else {
      alert(data.message || 'Failed to update task.');
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

/**
 * 5. Load All Department Issues & Staff Assignments (Tab 2)
 */
function debounceLoadAllIssues() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadStaffAllIssues, 300);
}

async function loadStaffAllIssues() {
  const tbody = document.getElementById('staffAllIssuesTableBody');
  if (!tbody) return;

  const search = document.getElementById('filterAllSearch')?.value.trim() || '';
  const dept = document.getElementById('filterAllDept')?.value || 'all';
  const status = document.getElementById('filterAllStatus')?.value || 'all';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (dept && dept !== 'all') params.append('department', dept);
  if (status && status !== 'all') params.append('status', status);

  tbody.innerHTML = `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #64748b;">Loading college grievances and staff assignments...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/staff/all-issues?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding: 30px; text-align: center; color: #ef4444;">Failed to fetch department issues.</td></tr>`;
      return;
    }

    staffAllIssuesCache = data.issues || [];
    renderStaffAllIssuesTable(staffAllIssuesCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding: 30px; text-align: center; color: #ef4444;">Network error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderStaffAllIssuesTable(issues) {
  const tbody = document.getElementById('staffAllIssuesTableBody');
  if (!tbody) return;

  if (issues.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding: 40px; text-align: center; color: #64748b; font-weight: 600;">No grievance issues found matching the selected filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = issues.map(c => {
    const statusClass = (c.Status || 'Pending').replace(/\s+/g, '-');
    const isVid = c.ImageAttachmentURL && (/\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(c.ImageAttachmentURL) || c.ImageAttachmentURL.includes('/video/'));

    return `
      <tr>
        <td>
          <div style="font-weight: 900; color: #1e40af;">#CMP-${c.ComplaintID}</div>
          <span class="priority-pill priority-${c.Priority}">${c.Priority}</span>
        </td>

        <td style="text-align: center;">
          ${c.ImageAttachmentURL ? `
            <div style="width: 44px; height: 34px; border-radius: 6px; overflow: hidden; margin: 0 auto; cursor: pointer; border: 1px solid #cbd5e1;" onclick="openStaffLightbox('${resolveMediaUrl(c.ImageAttachmentURL)}', '${escapeHtml(c.Title).replace(/'/g, "\\'")}')">
              ${isVid ? `
                <div style="background:#0f172a; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">▶</div>
              ` : `
                <img src="${resolveMediaUrl(c.ImageAttachmentURL)}" alt="Proof" style="width:100%; height:100%; object-fit:cover;">
              `}
            </div>
          ` : '<span style="color:#94a3b8; font-size:12px;">—</span>'}
        </td>

        <td>
          <div style="font-weight: 800; color: #0f172a; font-size: 14px;">${escapeHtml(c.Title)}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">📍 ${escapeHtml(c.Location)}</div>
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">📁 ${escapeHtml(c.CategoryName)} &bull; SLA: ${c.SLA_Hours}h</div>
        </td>

        <td>
          ${c.DepartmentTag ? `
            <span class="table-tag-pill">🏷️ ${escapeHtml(c.DepartmentTag)}</span>
          ` : `
            <span style="color:#94a3b8; font-size:12px; font-style:italic;">General / Unspecified</span>
          `}
        </td>

        <td>
          ${c.AssignedToName ? `
            <div class="table-assigned-user">
              <div class="table-assigned-avatar">👤</div>
              <div>
                <div style="font-weight: 850; color: #0f172a; font-size: 13.5px;">${escapeHtml(c.AssignedToName)}</div>
                <div style="font-size: 11px; color: #64748b;">${escapeHtml(c.AssignedToDepartment || 'Campus Staff')}</div>
              </div>
            </div>
          ` : `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:800; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:6px;">
              ⏳ Unassigned
            </span>
          `}
        </td>

        <td>
          <div style="font-weight: 700; color: #334155; font-size: 13px;">${escapeHtml(c.StudentName || 'Student')}</div>
          <div style="font-size: 11px; color: #64748b;">${escapeHtml(c.StudentDepartment || '')}</div>
        </td>

        <td>
          <span class="status-badge status-${statusClass}">${c.Status}</span>
        </td>

        <td style="text-align: right;">
          <button type="button" class="table-view-btn" onclick="openStaffDetailModal(${c.ComplaintID})">
            Inspect &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 6. Load Staff Notifications (Drawer & Tab 3)
 */
async function loadStaffNotifications() {
  try {
    const res = await fetch(`${API_BASE}/api/staff/notifications`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && data.notifications) {
      staffNotifsCache = data.notifications;
      const unreadCount = data.unread_count || 0;

      // Update badge
      const badge = document.getElementById('staffNotifBadge');
      if (badge) {
        badge.innerText = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      }

      const tabPill = document.getElementById('tabCountNotifs');
      if (tabPill) tabPill.innerText = unreadCount;

      renderStaffNotifDrawer(staffNotifsCache);
      renderStaffNotifFeed(staffNotifsCache);
    }
  } catch (err) {
    console.warn('Notifications fetch error:', err);
  }
}

function renderStaffNotifDrawer(notifs) {
  const container = document.getElementById('staffNotifList');
  if (!container) return;

  if (notifs.length === 0) {
    container.innerHTML = `<div class="notif-empty">No task assignment notifications.</div>`;
    return;
  }

  container.innerHTML = notifs.slice(0, 15).map(n => `
    <div class="notif-card ${n.IsRead ? '' : 'unread'}" onclick="handleNotifClick(${n.NotificationID}, ${n.ComplaintID})">
      <div class="notif-card-title">${escapeHtml(n.Title)}</div>
      <div class="notif-card-msg">${escapeHtml(n.Message)}</div>
      <div class="notif-card-time">🕒 ${n.CreatedAt ? new Date(n.CreatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</div>
    </div>
  `).join('');
}

function renderStaffNotifFeed(notifs) {
  const container = document.getElementById('staffFullNotifContainer');
  if (!container) return;

  if (notifs.length === 0) {
    container.innerHTML = `
      <div style="padding: 50px 20px; text-align: center; background: #ffffff; border-radius: 16px; border: 1.5px dashed #cbd5e1;">
        <span style="font-size: 36px;">🔔</span>
        <h3 style="font-size: 16px; font-weight: 850; color: #0f172a; margin-top: 8px;">No Assignment Notifications</h3>
        <p style="font-size: 13px; color: #64748b;">Whenever administration tags or assigns a ticket to your ID, you will be notified here immediately.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notifs.map(n => `
    <div class="notif-card ${n.IsRead ? '' : 'unread'}" style="padding: 16px; margin-bottom: 10px;" onclick="handleNotifClick(${n.NotificationID}, ${n.ComplaintID})">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 14.5px; font-weight: 850; color: #1e3a8a;">${escapeHtml(n.Title)}</span>
        <span style="font-size: 11px; font-weight: 800; background: ${n.IsRead ? '#e2e8f0' : '#fee2e2'}; color: ${n.IsRead ? '#475569' : '#b91c1c'}; padding: 2px 8px; border-radius: 9999px;">
          ${n.IsRead ? 'Read' : 'New Assignment'}
        </span>
      </div>
      <p style="font-size: 13.5px; color: #334155; line-height: 1.5;">${escapeHtml(n.Message)}</p>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11.5px; color: #64748b;">
        <span>🕒 Received: ${n.CreatedAt ? new Date(n.CreatedAt).toLocaleString('en-IN') : 'Recent'}</span>
        ${n.ComplaintID ? `<span style="font-weight: 800; color: #2563eb;">Open Ticket #CMP-${n.ComplaintID} &rarr;</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function handleNotifClick(notifId, complaintId) {
  try {
    await fetch(`${API_BASE}/api/staff/notifications/read/${notifId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    loadStaffNotifications();
  } catch (e) {}

  if (complaintId) {
    openStaffDetailModal(complaintId);
  }
}

async function markAllStaffNotifsRead() {
  try {
    const res = await fetch(`${API_BASE}/api/staff/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      loadStaffNotifications();
    }
  } catch (e) {}
}

function toggleStaffNotifDrawer() {
  const drawer = document.getElementById('staffNotifDrawer');
  if (drawer) drawer.classList.toggle('show');
}

/**
 * 7. Tab Switcher
 */
function switchStaffTab(tabName, filterStatus) {
  const secMyTasks = document.getElementById('sectionMyTasks');
  const secAllIssues = document.getElementById('sectionAllIssues');
  const secNotifs = document.getElementById('sectionNotifs');

  const btnMyTasks = document.getElementById('tabBtnMyTasks');
  const btnAllIssues = document.getElementById('tabBtnAllIssues');
  const btnNotifs = document.getElementById('tabBtnNotifs');

  // Deactivate tabs
  btnMyTasks.classList.remove('active');
  btnAllIssues.classList.remove('active');
  btnNotifs.classList.remove('active');

  secMyTasks.style.display = 'none';
  secAllIssues.style.display = 'none';
  secNotifs.style.display = 'none';

  if (tabName === 'all-issues') {
    btnAllIssues.classList.add('active');
    secAllIssues.style.display = 'flex';
    loadStaffAllIssues();
  } else if (tabName === 'notifs') {
    btnNotifs.classList.add('active');
    secNotifs.style.display = 'flex';
    loadStaffNotifications();
  } else {
    btnMyTasks.classList.add('active');
    secMyTasks.style.display = 'flex';
    if (filterStatus) {
      const select = document.getElementById('filterMyTaskStatus');
      if (select) select.value = filterStatus;
    }
    loadStaffMyTasks();
  }
}

/**
 * 8. Manage Task & Resolution Modal (Commit & Push Workspace)
 */
async function openStaffManageModal(complaintId) {
  const modal = document.getElementById('staffDetailModal');
  const content = document.getElementById('staffDetailModalContent');
  const badge = document.getElementById('modalTicketBadge');
  const title = document.getElementById('modalTicketTitle');

  if (!modal || !content) return;
  modal.style.display = 'flex';

  if (badge) badge.innerText = `#CMP-${complaintId}`;
  if (title) title.innerText = 'Loading Task & Resolution Workspace...';

  content.innerHTML = `
    <div style="text-align:center; padding:40px; color:#64748b;">
      <div class="staff-spinner" style="width:36px; height:36px; margin:0 auto 12px; border:3px solid #e2e8f0; border-top-color:#1e40af; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      Loading ticket details, action panel and timeline...
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/complaints/track/${complaintId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok || !data.success || !data.complaint) {
      content.innerHTML = `<div style="color:#ef4444; padding:20px;">Could not load ticket details.</div>`;
      return;
    }

    const c = data.complaint;
    const timeline = data.timeline || [];
    const isVid = c.ImageAttachmentURL && (/\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(c.ImageAttachmentURL) || c.ImageAttachmentURL.includes('/video/'));

    if (title) title.innerText = c.Title;

    const statusClass = (c.Status || 'Pending').replace(/\s+/g, '-');

    let timelineHtml = timeline.map(step => `
      <div style="border-left: 3px solid #1e40af; padding-left: 14px; margin-bottom: 14px; position: relative;">
        <div style="position: absolute; left: -7px; top: 2px; width: 11px; height: 11px; border-radius: 50%; background: #1e40af;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
          <span style="font-weight: 700; font-size: 14.5px; color: #0f172a;">${escapeHtml(step.NewStatus)} &bull; by ${escapeHtml(step.UpdatedByName)} (${escapeHtml(step.UpdatedByRole)})</span>
          <span style="font-size: 12px; color: #64748b;">🕒 ${step.Timestamp ? new Date(step.Timestamp).toLocaleString('en-IN') : ''}</span>
        </div>
        <p style="font-size: 14px; color: #334155; margin-top: 4px; line-height: 1.5;">${escapeHtml(step.Remarks)}</p>
      </div>
    `).join('');

    content.innerHTML = `
      <!-- 1. TICKET BRIEF & CONTEXT -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:18px; margin-bottom:18px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="task-id-badge">#CMP-${c.ComplaintID}</span>
            <span class="priority-pill priority-${c.Priority}">${c.Priority} Priority</span>
            <span class="status-badge status-${statusClass}">${c.Status}</span>
          </div>
          <span class="task-sla-pill">⏳ ${c.SLA_Hours} Hours SLA Target</span>
        </div>

        <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 6px; line-height: 1.4;">${escapeHtml(c.Title)}</h3>
        <p style="font-size: 14px; color: #475569; line-height: 1.55; margin-bottom: 12px;">${escapeHtml(c.Description)}</p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; font-size:14px;">
          <div><strong style="color:#64748b;">Location:</strong> <span>📍 ${escapeHtml(c.Location)}</span></div>
          <div><strong style="color:#64748b;">Category:</strong> <span>📁 ${escapeHtml(c.CategoryName)}</span></div>
          <div><strong style="color:#64748b;">Student:</strong> <span>👤 ${escapeHtml(c.StudentName)} (${escapeHtml(c.StudentEmail)})</span></div>
          <div><strong style="color:#64748b;">Student Phone:</strong> <span>📞 ${escapeHtml(c.StudentPhone || 'Not provided')}</span></div>
        </div>

        ${c.DepartmentTag || c.AssignedNotes ? `
          <div style="margin-top:12px; padding:10px 14px; background:#fdf4ff; border:1.5px dashed #d8b4fe; border-radius:10px; font-size:14px; color:#6b21a8;">
            ${c.DepartmentTag ? `<div>🏷️ <strong>Department Tag:</strong> ${escapeHtml(c.DepartmentTag)}</div>` : ''}
            ${c.AssignedNotes ? `<div style="margin-top:4px;">📋 <strong>Admin Directive:</strong> "${escapeHtml(c.AssignedNotes)}"</div>` : ''}
          </div>
        ` : ''}

        ${c.ImageAttachmentURL ? `
          <div style="margin-top:12px;">
            <button type="button" class="staff-media-btn" onclick="openStaffLightbox('${resolveMediaUrl(c.ImageAttachmentURL)}', '${escapeHtml(c.Title).replace(/'/g, "\\'")}')">
              ${isVid ? '🎬 Attached Video Evidence (Click to Play Fullscreen)' : '📷 Attached Photo Evidence (Click to View Fullscreen)'}
            </button>
          </div>
        ` : ''}
      </div>

      <!-- 2. ACTION & COMMIT WORKSPACE (Pushed inside modal!) -->
      <div class="staff-manage-modal-action-box">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:6px;">
          <span style="font-size:16.5px; font-weight:700; color:#1e40af;">⚡ In-Charge Action &amp; Status Push</span>
          <span style="font-size:13px; color:#475569; font-weight:600;">Update will immediately reflect to Student &amp; Administration</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="display:block; font-size:13.5px; font-weight:700; color:#334155; margin-bottom:6px;">Update Ticket Status *</label>
            <select id="modalStatusSelect" class="staff-select" style="width:100%; font-size:14px; font-weight:600; padding:9px 13px; border-radius:8px; border:1.5px solid #cbd5e1; background:#ffffff;">
              <option value="In Progress" ${c.Status === 'In Progress' ? 'selected' : ''}>⚡ In Progress (Work Started / Technicians Dispatched)</option>
              <option value="Resolved" ${c.Status === 'Resolved' ? 'selected' : ''}>✓ Resolved (Problem Fixed &amp; Tested on Site)</option>
              <option value="Pending" ${c.Status === 'Pending' ? 'selected' : ''}>⏳ Pending (Awaiting Spare Parts / Follow-up)</option>
            </select>
          </div>

          <div>
            <label style="display:block; font-size:16px; font-weight:700; color:#334155; margin-bottom:6px;">Staff Action Remarks / Resolution Message *</label>
            <textarea id="modalRemarksInput" class="task-action-textarea" rows="3" placeholder="Enter resolution remarks or action message (e.g. Water cooler compressor replaced, new filter installed, cooling tested and functioning properly)..."></textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" class="staff-cancel-btn" onclick="closeStaffDetailModal()">Cancel</button>
            <button type="button" id="modalCommitBtn" class="staff-modal-commit-btn" onclick="submitStaffModalTaskAction(${c.ComplaintID})">
              🚀 Commit &amp; Push Update &rarr;
            </button>
          </div>
        </div>
      </div>

      <!-- 3. TIMELINE & AUDIT TRAIL -->
      <div style="margin-top:16px;">
        <h4 style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; margin-bottom:12px;">
          ⚡ Chronological Audit Trail &amp; Technician Actions
        </h4>
        <div>
          ${timelineHtml || '<div style="font-size:14px; color:#94a3b8; font-style:italic;">No audit timeline logs recorded yet.</div>'}
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444; padding:20px;">Network error: ${escapeHtml(err.message)}</div>`;
  }
}

const openStaffDetailModal = openStaffManageModal;

async function submitStaffModalTaskAction(complaintId) {
  const statusEl = document.getElementById('modalStatusSelect');
  const remarksEl = document.getElementById('modalRemarksInput');
  const commitBtn = document.getElementById('modalCommitBtn');

  const status = statusEl ? statusEl.value : 'In Progress';
  const remarks = remarksEl ? remarksEl.value.trim() : '';

  if (!remarks || remarks.length < 5) {
    alert('Please enter action remarks or technical message explaining the resolution (minimum 5 characters).');
    if (remarksEl) remarksEl.focus();
    return;
  }

  if (commitBtn) {
    commitBtn.disabled = true;
    commitBtn.innerHTML = `⏳ Pushing Update...`;
  }

  try {
    const res = await fetch(`${API_BASE}/api/staff/update-task/${complaintId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ status, remarks })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.message || 'Failed to update task.');
      if (commitBtn) {
        commitBtn.disabled = false;
        commitBtn.innerHTML = `🚀 Commit &amp; Push Update &rarr;`;
      }
      return;
    }

    alert(`Success: ${data.message || 'Task status updated and pushed successfully!'}`);
    loadStaffOverview();
    loadStaffMyTasks();
    if (document.getElementById('sectionAllIssues')?.style.display !== 'none') {
      loadStaffAllIssues();
    }
    // Re-render modal to reflect new status and timeline log
    openStaffManageModal(complaintId);
  } catch (err) {
    alert(`Network error: ${err.message}`);
    if (commitBtn) {
      commitBtn.disabled = false;
      commitBtn.innerHTML = `🚀 Commit &amp; Push Update &rarr;`;
    }
  }
}

function closeStaffDetailModal() {
  const modal = document.getElementById('staffDetailModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 9. Cinema Lightbox Media Viewer
 */
function openStaffLightbox(mediaUrl, title) {
  const modal = document.getElementById('staffMediaLightbox');
  const img = document.getElementById('lightboxImg');
  const video = document.getElementById('lightboxVideo');
  const titleEl = document.getElementById('lightboxMediaTitle');
  const badgeEl = document.getElementById('lightboxMediaBadge');

  if (!modal) return;
  const resolvedUrl = resolveMediaUrl(mediaUrl);
  const isVideo = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(mediaUrl) || (typeof mediaUrl === 'string' && mediaUrl.includes('/video/'));

  if (isVideo) {
    if (img) { img.style.display = 'none'; img.src = ''; }
    if (video) {
      video.style.display = 'block';
      video.src = resolvedUrl;
      video.load();
      video.play().catch(() => {});
    }
    if (badgeEl) badgeEl.innerHTML = '🎬 Video Evidence';
  } else {
    if (video) { video.pause(); video.style.display = 'none'; video.src = ''; }
    if (img) {
      img.style.display = 'block';
      img.src = resolvedUrl;
    }
    if (badgeEl) badgeEl.innerHTML = '📸 Photo Evidence';
  }

  if (titleEl) titleEl.innerText = title ? `Evidence: ${title}` : 'Attached Media Evidence';
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeStaffLightbox() {
  const modal = document.getElementById('staffMediaLightbox');
  const video = document.getElementById('lightboxVideo');
  if (video) video.pause();
  if (modal) modal.style.display = 'none';
}

/**
 * 10. Logout Staff
 */
function logoutStaff() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('/login.html');
}

/**
 * XSS prevention helper
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Global window bindings
window.switchStaffTab = switchStaffTab;
window.loadStaffMyTasks = loadStaffMyTasks;
window.loadStaffAllIssues = loadStaffAllIssues;
window.submitStaffTaskAction = submitStaffTaskAction;
window.openStaffLightbox = openStaffLightbox;
window.closeStaffLightbox = closeStaffLightbox;
window.openStaffDetailModal = openStaffDetailModal;
window.openStaffManageModal = openStaffManageModal;
window.submitStaffModalTaskAction = submitStaffModalTaskAction;
window.closeStaffDetailModal = closeStaffDetailModal;
window.toggleStaffNotifDrawer = toggleStaffNotifDrawer;
window.handleNotifClick = handleNotifClick;
window.markAllStaffNotifsRead = markAllStaffNotifsRead;
window.logoutStaff = logoutStaff;
window.debounceLoadAllIssues = debounceLoadAllIssues;
