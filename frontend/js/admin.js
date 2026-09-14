/**
 * CampusCare Administrator Portal Controller
 * Manages Real-time KPI Cards, Interactive Chart.js Visualizations,
 * Filterable/Searchable Data Table with Pagination, Status Transition Modals,
 * and Administrative CSV Report Exporting.
 */

let currentAdminPage = 1;
let currentAdminLimit = 10;
let categoryChartInstance = null;
let priorityChartInstance = null;
let deptChartInstance = null;
let activeAdminComplaintId = null;

async function loadAdminDashboard() {
  await fetchAndRenderStats();
  await loadAdminCategoriesFilter();
  await loadAdminComplaints(1);
}

// Fetch and Populate Category Filter
async function loadAdminCategoriesFilter() {
  const select = document.getElementById('admin-filter-category');
  if (!select) return;

  const res = await apiFetch('/api/categories');
  if (res && res.ok && res.data.success) {
    select.innerHTML = `<option value="all">All Categories</option>` +
      res.data.categories.map(c => `<option value="${c.CategoryID}">${c.CategoryName}</option>`).join('');
  }
}

// Fetch KPI metrics and render Chart.js graphs
async function fetchAndRenderStats() {
  const res = await apiFetch('/api/admin/stats');
  if (!res || !res.ok || !res.data.success) return;

  const { kpi, categories, priorities, departments } = res.data;

  // Render KPI Cards
  document.getElementById('admin-kpi-total').innerText = kpi.total;
  document.getElementById('admin-kpi-pending').innerText = kpi.pending;
  document.getElementById('admin-kpi-in-progress').innerText = kpi.in_progress;
  document.getElementById('admin-kpi-resolved').innerText = kpi.resolved;
  document.getElementById('admin-kpi-resolution-rate').innerText = `${kpi.resolution_rate}%`;
  document.getElementById('admin-kpi-sla-overdue').innerText = kpi.sla_overdue;
  document.getElementById('admin-kpi-avg-rating').innerText = kpi.avg_rating > 0 ? `★ ${kpi.avg_rating}` : 'N/A';

  // Render Category Chart
  renderCategoryChart(categories);

  // Render Priority Chart
  renderPriorityChart(priorities);

  // Render Department Chart
  renderDepartmentChart(departments);
}

// Chart 1: Categories Bar Chart
function renderCategoryChart(data) {
  const ctx = document.getElementById('chart-categories');
  if (!ctx) return;

  if (categoryChartInstance) categoryChartInstance.destroy();

  const labels = data.map(d => d.CategoryName);
  const totalCounts = data.map(d => d.TotalIssues);
  const resolvedCounts = data.map(d => d.ResolvedIssues);

  categoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Total Reported',
          data: totalCounts,
          backgroundColor: '#3b82f6',
          borderRadius: 6
        },
        {
          label: 'Resolved',
          data: resolvedCounts,
          backgroundColor: '#10b981',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11, family: 'Inter, system-ui' } } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

// Chart 2: Priority Distribution Doughnut
function renderPriorityChart(data) {
  const ctx = document.getElementById('chart-priorities');
  if (!ctx) return;

  if (priorityChartInstance) priorityChartInstance.destroy();

  const priorityOrder = ['Emergency', 'High', 'Medium', 'Low'];
  const colors = {
    'Emergency': '#991b1b',
    'High': '#ef4444',
    'Medium': '#f59e0b',
    'Low': '#64748b'
  };

  const map = {};
  data.forEach(d => { map[d.Priority] = d.Count; });

  const labels = priorityOrder;
  const counts = priorityOrder.map(p => map[p] || 0);

  priorityChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: priorityOrder.map(p => colors[p]),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
      },
      cutout: '65%'
    }
  });
}

// Chart 3: Department Breakdown Horizontal Bar
function renderDepartmentChart(data) {
  const ctx = document.getElementById('chart-departments');
  if (!ctx) return;

  if (deptChartInstance) deptChartInstance.destroy();

  const labels = data.map(d => d.Department);
  const counts = data.map(d => d.Count);

  deptChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tickets Raised',
        data: counts,
        backgroundColor: '#8b5cf6',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

// Fetch & Render Filterable Complaints Table
async function loadAdminComplaints(page = 1) {
  currentAdminPage = page;
  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400"><span class="animate-spin inline-block mr-2">⟳</span> Loading complaints...</td></tr>`;

  const search = document.getElementById('admin-search-input')?.value || '';
  const status = document.getElementById('admin-filter-status')?.value || 'all';
  const categoryId = document.getElementById('admin-filter-category')?.value || 'all';
  const priority = document.getElementById('admin-filter-priority')?.value || 'all';

  const params = new URLSearchParams({
    page: page,
    limit: currentAdminLimit,
    search: search,
    status: status,
    category_id: categoryId,
    priority: priority
  });

  const res = await apiFetch(`/api/admin/all-complaints?${params.toString()}`);
  if (!res || !res.ok || !res.data.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500">Failed to load complaints.</td></tr>`;
    return;
  }

  const { complaints, pagination } = res.data;

  // Update Pagination Controls
  document.getElementById('admin-page-info').innerText = `Page ${pagination.page} of ${pagination.total_pages} (${pagination.total_records} records)`;
  document.getElementById('admin-prev-page').disabled = pagination.page <= 1;
  document.getElementById('admin-next-page').disabled = pagination.page >= pagination.total_pages;

  if (complaints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-500">No complaints found matching current criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = complaints.map(c => `
    <tr class="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
      <td class="py-3.5 px-4">
        <span class="font-mono text-xs font-bold text-slate-500">#TKT-${c.ComplaintID}</span>
      </td>
      <td class="py-3.5 px-3 text-center">
        ${c.ImageAttachmentURL ? `
          <div class="evidence-thumb-container mx-auto" onclick="openImageLightbox('${c.ImageAttachmentURL}', '${escapeHtml(c.Title)}')" title="Click to view photo evidence">
            <img src="${c.ImageAttachmentURL}" alt="Proof" onerror="this.parentElement.innerHTML='<span class=\\'text-slate-300 text-xs font-mono\\'>—</span>'">
            <div class="thumb-overlay">🔍</div>
          </div>
        ` : `
          <span class="text-slate-300 text-xs font-mono">—</span>
        `}
      </td>
      <td class="py-3.5 px-4">
        <div class="font-semibold text-slate-800 text-sm">${escapeHtml(c.Title)}</div>
        <div class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
          <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i> ${escapeHtml(c.Location)}
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="text-xs font-medium text-slate-700">${escapeHtml(c.CategoryName)}</div>
        ${c.IsSLAOverdue ? `
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse mt-0.5">
            <i data-lucide="alert-circle" class="w-2.5 h-2.5 mr-0.5"></i> SLA BREACH (${c.AgeHours}h / ${c.SLA_Hours}h)
          </span>
        ` : `
          <div class="text-[11px] text-slate-400">SLA: ${c.SLA_Hours}h</div>
        `}
      </td>
      <td class="py-3.5 px-4">
        ${getPriorityBadge(c.Priority)}
      </td>
      <td class="py-3.5 px-4">
        <div class="text-xs font-semibold text-slate-800">${escapeHtml(c.StudentName)}</div>
        <div class="text-[11px] text-slate-500">${escapeHtml(c.StudentDepartment)}</div>
        <div class="text-[10px] text-slate-400">${escapeHtml(c.StudentEmail)}</div>
      </td>
      <td class="py-3.5 px-4">
        ${getStatusBadge(c.Status)}
        ${c.FeedbackRating ? `
          <div class="text-xs text-amber-500 font-bold mt-1">★ ${c.FeedbackRating}/5</div>
        ` : ''}
      </td>
      <td class="py-3.5 px-4 text-right">
        <button onclick="openAdminActionModal(${c.ComplaintID})" class="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="sliders" class="w-3.5 h-3.5"></i> Manage
        </button>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// Open Admin Modal to Review & Update Status
async function openAdminActionModal(complaintId) {
  activeAdminComplaintId = complaintId;
  const modal = document.getElementById('admin-action-modal');
  modal.classList.remove('hidden');

  const content = document.getElementById('admin-action-content');
  content.innerHTML = `<div class="p-8 text-center text-slate-400"><span class="animate-spin inline-block mr-2">⟳</span> Loading grievance details...</div>`;

  const res = await apiFetch(`/api/complaints/track/${complaintId}`);
  if (!res || !res.ok || !res.data.success) {
    content.innerHTML = `<div class="p-8 text-center text-rose-500">Failed to load grievance details.</div>`;
    return;
  }

  const { complaint, timeline } = res.data;

  content.innerHTML = `
    <!-- Top Details -->
    <div class="flex items-start justify-between border-b border-slate-200 pb-4 mb-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-mono font-bold text-slate-400">#TKT-${complaint.ComplaintID}</span>
          ${getStatusBadge(complaint.Status)}
          ${getPriorityBadge(complaint.Priority)}
          <span class="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">${complaint.CategoryName}</span>
        </div>
        <h3 class="text-lg font-bold text-slate-900">${escapeHtml(complaint.Title)}</h3>
        <p class="text-xs text-slate-500 mt-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 inline text-slate-400"></i> Location: ${escapeHtml(complaint.Location)}</p>
      </div>
      <button onclick="closeAdminActionModal()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Student & Ticket Overview -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div class="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
        <span class="font-bold text-slate-500 uppercase tracking-wider block mb-1">Student Contact</span>
        <div><span class="text-slate-500">Name:</span> <strong class="text-slate-800">${escapeHtml(complaint.StudentName)}</strong></div>
        <div><span class="text-slate-500">Email:</span> <strong class="text-slate-800">${escapeHtml(complaint.StudentEmail)}</strong></div>
        <div><span class="text-slate-500">Dept:</span> <strong class="text-slate-800">${escapeHtml(complaint.StudentDepartment)}</strong></div>
        <div><span class="text-slate-500">Phone:</span> <strong class="text-slate-800">${escapeHtml(complaint.StudentPhone || 'Not provided')}</strong></div>
      </div>

      <div class="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
        <span class="font-bold text-slate-500 uppercase tracking-wider block mb-1">Service SLA & Timeline</span>
        <div><span class="text-slate-500">Resolution SLA:</span> <strong class="text-slate-800">${complaint.SLA_Hours} Hours</strong></div>
        <div><span class="text-slate-500">Raised At:</span> <strong class="text-slate-800">${formatDate(complaint.CreatedAt)}</strong></div>
        <div><span class="text-slate-500">Last Updated:</span> <strong class="text-slate-800">${formatDate(complaint.UpdatedAt)}</strong></div>
        ${complaint.FeedbackRating ? `
          <div><span class="text-slate-500">Feedback:</span> <strong class="text-amber-600">★ ${complaint.FeedbackRating}/5 - "${escapeHtml(complaint.FeedbackComments || '')}"</strong></div>
        ` : ''}
      </div>
    </div>

    <!-- Description -->
    <div class="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs mb-4">
      <span class="font-bold text-slate-500 uppercase tracking-wider block mb-1">Description</span>
      <p class="text-slate-700 leading-relaxed text-sm">${escapeHtml(complaint.Description)}</p>
    </div>

    <!-- Image Attachment -->
    ${complaint.ImageAttachmentURL ? `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Attached Evidence Photo</span>
          <span class="text-[11px] text-blue-600 font-semibold cursor-pointer" onclick="openImageLightbox('${complaint.ImageAttachmentURL}', '${escapeHtml(complaint.Title)}')">🔍 View Full Size</span>
        </div>
        <div onclick="openImageLightbox('${complaint.ImageAttachmentURL}', '${escapeHtml(complaint.Title)}')" class="cursor-pointer inline-block rounded-xl overflow-hidden border border-slate-200 max-w-sm group relative shadow-sm hover:shadow">
          <img src="${complaint.ImageAttachmentURL}" alt="Evidence" class="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300">
          <div class="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
            🔍 Click to Enlarge
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Status Update Form -->
    <div class="bg-blue-50/80 p-5 rounded-2xl border border-blue-200 mb-6 shadow-sm">
      <h4 class="text-base font-extrabold text-blue-950 font-display mb-3.5 flex items-center gap-2">
        <i data-lucide="edit-3" class="w-5 h-5 text-blue-600"></i> Update Resolution Status & Log Remarks
      </h4>
      <form onsubmit="handleAdminStatusUpdate(event)" class="space-y-3.5">
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Target Status *</label>
          <select id="update-target-status" class="w-full text-sm font-semibold px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 transition-all">
            <option value="Pending" ${complaint.Status === 'Pending' ? 'selected' : ''}>Pending (Awaiting Action)</option>
            <option value="In Progress" ${complaint.Status === 'In Progress' ? 'selected' : ''}>In Progress (Work Dispatched)</option>
            <option value="Resolved" ${complaint.Status === 'Resolved' ? 'selected' : ''}>Resolved (Issue Addressed)</option>
            <option value="Rejected" ${complaint.Status === 'Rejected' ? 'selected' : ''}>Rejected (Invalid / Non-actionable)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Administrative Remarks / Action Notes *</label>
          <textarea id="update-status-remarks" rows="3" required placeholder="State actions taken, technician assigned, or resolution notes..." class="w-full text-sm px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 transition-all"></textarea>
        </div>
        <div class="flex justify-end gap-2.5 pt-2">
          <button type="button" onclick="closeAdminActionModal()" class="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" id="admin-update-submit-btn" class="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-md hover:shadow-blue-500/25 flex items-center gap-1.5 transition-all">
            <i data-lucide="save" class="w-4 h-4"></i> Commit Status Update
          </button>
        </div>
      </form>
    </div>

    <!-- Timeline History -->
    <div>
      <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Audit Trail / History Logs</h5>
      <div class="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 max-h-60 overflow-y-auto pr-2">
        ${timeline.map(item => `
          <div class="relative text-xs">
            <div class="absolute -left-6 top-1.5 w-2 h-2 rounded-full bg-blue-600 border border-white"></div>
            <div class="bg-white p-2.5 rounded-lg border border-slate-200">
              <div class="flex items-center justify-between text-slate-400 mb-0.5">
                <span class="font-semibold text-slate-700">${escapeHtml(item.UpdatedByName)} (${item.UpdatedByRole})</span>
                <span>${formatDate(item.Timestamp)}</span>
              </div>
              <p class="text-slate-800 font-medium">${escapeHtml(item.Remarks)}</p>
              ${item.PreviousStatus ? `
                <div class="mt-0.5 text-slate-500 text-[11px]">Changed: <span class="font-mono">${item.PreviousStatus}</span> &rarr; <strong class="text-slate-700">${item.NewStatus}</strong></div>
              ` : `
                <div class="mt-0.5 text-slate-500 text-[11px]">Initial: <strong>${item.NewStatus}</strong></div>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function closeAdminActionModal() {
  document.getElementById('admin-action-modal').classList.add('hidden');
  activeAdminComplaintId = null;
}

// Commit Status Update Form
async function handleAdminStatusUpdate(e) {
  e.preventDefault();
  if (!activeAdminComplaintId) return;

  const newStatus = document.getElementById('update-target-status').value;
  const remarks = document.getElementById('update-status-remarks').value.trim();
  const btn = document.getElementById('admin-update-submit-btn');

  if (!newStatus || !remarks) {
    showToast('Please provide both new status and update remarks.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Updating...`;

  const res = await apiFetch(`/api/admin/update-status/${activeAdminComplaintId}`, {
    method: 'PUT',
    body: JSON.stringify({
      new_status: newStatus,
      remarks: remarks
    })
  });

  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5 inline"></i> Commit Status Update`;

  if (res && res.ok && res.data.success) {
    showToast(res.data.message, 'success');
    closeAdminActionModal();
    await fetchAndRenderStats();
    await loadAdminComplaints(currentAdminPage);
  } else {
    showToast(res?.data?.message || 'Failed to update status.', 'error');
  }
}

// Export Grievance Table Data to CSV
async function exportComplaintsCSV() {
  const search = document.getElementById('admin-search-input')?.value || '';
  const status = document.getElementById('admin-filter-status')?.value || 'all';
  const categoryId = document.getElementById('admin-filter-category')?.value || 'all';
  const priority = document.getElementById('admin-filter-priority')?.value || 'all';

  const params = new URLSearchParams({
    search: search,
    status: status,
    category_id: categoryId,
    priority: priority
  });

  showToast('Preparing grievance CSV report export...', 'info');

  try {
    const response = await fetch(`/api/admin/export-csv?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${AppState.token}`
      }
    });

    if (!response.ok) throw new Error('Failed to generate CSV');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CampusCare_Grievances_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('Grievance CSV report downloaded successfully.', 'success');
  } catch (err) {
    showToast(`Export error: ${err.message}`, 'error');
  }
}

/* ==========================================================================
   Admin View Switcher: Grievance Engine vs User Directory
   ========================================================================== */
function switchAdminPortalTab(tab) {
  const tabGrievances = document.getElementById('admin-tab-grievances');
  const tabUsers = document.getElementById('admin-tab-users');
  const secGrievances = document.getElementById('admin-section-grievances');
  const secUsers = document.getElementById('admin-section-users');

  if (!tabGrievances || !tabUsers || !secGrievances || !secUsers) return;

  if (typeof CampusLoader !== 'undefined' && CampusLoader.startProgress) {
    CampusLoader.startProgress(65);
    setTimeout(() => CampusLoader.finishProgress(), 300);
  }

  if (tab === 'users') {
    tabUsers.classList.add('active');
    tabGrievances.classList.remove('active');
    secUsers.classList.remove('hidden');
    secGrievances.classList.add('hidden');
    secUsers.classList.remove('tab-content-enter');
    void secUsers.offsetWidth; // Trigger reflow
    secUsers.classList.add('tab-content-enter');
    loadAdminUsers();
  } else {
    tabGrievances.classList.add('active');
    tabUsers.classList.remove('active');
    secGrievances.classList.remove('hidden');
    secUsers.classList.add('hidden');
    secGrievances.classList.remove('tab-content-enter');
    void secGrievances.offsetWidth; // Trigger reflow
    secGrievances.classList.add('tab-content-enter');
  }

  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   Admin User Directory Roster Fetching & Rendering
   ========================================================================== */
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-table-body');
  const countBadge = document.getElementById('admin-users-count-badge');
  if (!tbody) return;

  const search = document.getElementById('admin-users-search')?.value.trim() || '';
  const role = document.getElementById('admin-users-filter-role')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (role) params.append('role', role);

  tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400"><span class="animate-spin inline-block mr-2">⟳</span> Fetching college users roster...</td></tr>`;

  const res = await apiFetch(`/api/admin/users?${params.toString()}`);
  if (!res || !res.ok || !res.data.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500">Failed to load user records.</td></tr>`;
    return;
  }

  const { users, total } = res.data;
  if (countBadge) countBadge.innerText = `${total} User${total === 1 ? '' : 's'}`;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-500">No users found matching current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isStudent = u.Role === 'Student';
    const roleBadgeClass = isStudent 
      ? 'bg-blue-100 text-blue-700 border-blue-200' 
      : 'bg-purple-100 text-purple-700 border-purple-200';
    const avatarLetter = (u.FullName || 'U').charAt(0).toUpperCase();

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-slate-400">#UID-${u.UserID}</td>
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full ${isStudent ? 'bg-blue-600' : 'bg-purple-600'} text-white font-bold text-xs flex items-center justify-center shrink-0">
              ${avatarLetter}
            </div>
            <div>
              <strong class="text-slate-800 text-sm block">${escapeHtml(u.FullName)}</strong>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4 font-mono text-xs text-blue-600 font-semibold">${escapeHtml(u.CollegeEmail)}</td>
        <td class="py-3.5 px-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${roleBadgeClass}">
            ${u.Role}
          </span>
        </td>
        <td class="py-3.5 px-4 text-xs font-medium text-slate-700">
          ${u.Course ? `<span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 mr-1.5">${escapeHtml(u.Course)}</span>` : ''}
          ${escapeHtml(u.Department || '—')}
        </td>
        <td class="py-3.5 px-4 text-xs text-slate-500 font-mono">${escapeHtml(u.Phone || '—')}</td>
        <td class="py-3.5 px-4 text-right text-xs text-slate-400">${formatDate(u.CreatedAt)}</td>
      </tr>
    `;
  }).join('');
}

/* ==========================================================================
   Add User Modal & Logic
   ========================================================================== */
function openAddUserModal() {
  const modal = document.getElementById('admin-add-user-modal');
  const alertBox = document.getElementById('add-user-alert');
  if (alertBox) {
    alertBox.className = 'hidden';
    alertBox.innerText = '';
  }

  // Clear inputs
  document.getElementById('new-user-name').value = '';
  document.getElementById('new-user-email').value = '';
  document.getElementById('new-user-password').value = '';
  const courseSel = document.getElementById('new-user-course');
  if (courseSel) courseSel.selectedIndex = 0;
  document.getElementById('new-user-department').selectedIndex = 0;
  document.getElementById('new-user-phone').value = '';

  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeAddUserModal() {
  const modal = document.getElementById('admin-add-user-modal');
  if (modal) modal.classList.add('hidden');
}

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('new-user-password');
  if (input) {
    input.value = pwd;
    input.type = 'text';
    showToast('Strong password generated and applied.', 'info');
  }
}

function toggleNewUserPassword() {
  const input = document.getElementById('new-user-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleAddUserSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('add-user-alert');
  const submitBtn = document.getElementById('add-user-submit-btn');

  const role = document.querySelector('input[name="new-user-role"]:checked')?.value || 'Student';
  const fullName = document.getElementById('new-user-name').value.trim();
  let email = document.getElementById('new-user-email').value.trim();
  const course = document.getElementById('new-user-course')?.value || 'B.Tech';
  const department = document.getElementById('new-user-department').value;
  const phone = document.getElementById('new-user-phone').value.trim();
  const password = document.getElementById('new-user-password').value;

  if (!fullName || !email || !department || !password) {
    showAlertInModal('Please fill in all mandatory fields.', 'error');
    return;
  }

  if (fullName.length < 2) {
    showAlertInModal('Please enter a valid full name (at least 2 characters).', 'error');
    return;
  }

  // Domain auto-append if roll number entered
  if (!email.includes('@')) {
    email = `${email}@kiet.edu`;
  } else if (!email.toLowerCase().endsWith('@kiet.edu')) {
    showAlertInModal('Compulsory domain restricted: Email must end with @kiet.edu', 'error');
    return;
  }

  if (password.length < 6) {
    showAlertInModal('Password must be at least 6 characters long.', 'error');
    return;
  }

  if (phone) {
    const cleanPhone = phone.replace(/[\s\-+]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      showAlertInModal('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="animate-spin inline-block mr-2">⟳</span> Creating Account...`;

  try {
    const res = await apiFetch('/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        college_email: email,
        password: password,
        role: role,
        course: course,
        department: department,
        phone: phone
      })
    });

    if (res && res.ok && res.data.success) {
      showToast(res.data.message || 'User created successfully!', 'success');
      closeAddUserModal();
      // If currently viewing users tab, refresh the roster
      const secUsers = document.getElementById('admin-section-users');
      if (secUsers && !secUsers.classList.contains('hidden')) {
        await loadAdminUsers();
      }
    } else {
      showAlertInModal(res?.data?.message || 'Failed to create user.', 'error');
    }
  } catch (err) {
    showAlertInModal(`Error: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Create User Account &rarr;`;
  }
}

function showAlertInModal(msg, type) {
  const alertBox = document.getElementById('add-user-alert');
  if (!alertBox) return;
  alertBox.className = type === 'error' 
    ? 'mb-4 p-3 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200' 
    : 'mb-4 p-3 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
  alertBox.innerText = msg;
  alertBox.classList.remove('hidden');
}

/* ==========================================================================
   Full-Screen Image Lightbox
   ========================================================================== */
function openImageLightbox(imageUrl, title = 'Evidence Photo') {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');

  if (!modal || !img) return;

  img.src = imageUrl;
  if (titleEl) titleEl.innerHTML = `<i data-lucide="image" class="w-4 h-4 text-blue-600 inline"></i> Evidence Photo: ${escapeHtml(title)}`;
  modal.classList.add('show');
  if (window.lucide) lucide.createIcons();
}

function closeImageLightbox(e) {
  if (e && e.target !== e.currentTarget && !e.target.closest('button')) return;
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal) modal.classList.remove('show');
  if (img) img.src = '';
}

