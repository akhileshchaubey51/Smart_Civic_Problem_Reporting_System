/**
 * CampusCare Student Portal Controller
 * Manages Dashboard metrics, Complaint submission with live image preview,
 * Step-by-step resolution tracking, and 5-Star feedback ratings.
 */

let selectedPriority = 'Medium';
let currentActiveFeedbackId = null;

async function loadStudentDashboard() {
  await loadCategories();
  await loadStudentComplaints();
  initStudentPrioritySelector();
  initStudentImageDropzone();
}

// Load Categories for dropdown
async function loadCategories() {
  const res = await apiFetch('/api/categories');
  if (res && res.ok && res.data.success) {
    AppState.categories = res.data.categories;
    const select = document.getElementById('complaint-category');
    if (select) {
      select.innerHTML = `<option value="" disabled selected>Select an Issue Category</option>` +
        AppState.categories.map(c => `<option value="${c.CategoryID}">${c.CategoryName} (SLA: ${c.SLA_Hours}h)</option>`).join('');
    }
  }
}

// Setup Interactive Priority Pill Selector
function initStudentPrioritySelector() {
  const container = document.getElementById('priority-selector-group');
  if (!container) return;

  const buttons = container.querySelectorAll('.priority-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      buttons.forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-blue-600', 'font-bold'));
      btn.classList.add('ring-2', 'ring-offset-2', 'ring-blue-600', 'font-bold');
      selectedPriority = btn.dataset.priority;
    };
  });
}

// Setup Image Upload with Drag & Drop and Preview
function initStudentImageDropzone() {
  const fileInput = document.getElementById('complaint-image-file');
  const dropzone = document.getElementById('image-dropzone');
  const previewBox = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('image-preview');
  const removeBtn = document.getElementById('btn-remove-image');

  if (!fileInput || !dropzone) return;

  dropzone.onclick = () => fileInput.click();

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-500', 'bg-blue-50/50');
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove('border-blue-500', 'bg-blue-50/50');
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50/50');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      renderImagePreview(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) {
      renderImagePreview(fileInput.files[0]);
    }
  };

  if (removeBtn) {
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      fileInput.value = '';
      previewBox.classList.add('hidden');
      dropzone.classList.remove('hidden');
    };
  }

  function renderImagePreview(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG, JPG, WEBP).', 'warning');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.src = ev.target.result;
      dropzone.classList.add('hidden');
      previewBox.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

// Submit New Complaint Workflow
async function submitComplaint(e) {
  e.preventDefault();
  const form = document.getElementById('new-complaint-form');
  const btn = document.getElementById('submit-complaint-btn');

  const title = document.getElementById('complaint-title').value.trim();
  const categoryId = document.getElementById('complaint-category').value;
  const location = document.getElementById('complaint-location').value.trim();
  const description = document.getElementById('complaint-description').value.trim();
  const fileInput = document.getElementById('complaint-image-file');

  if (!title || !categoryId || !location || !description) {
    showToast('Please fill in all mandatory fields.', 'warning');
    return;
  }

  if (title.length < 5) {
    showToast('Title must be at least 5 characters.', 'warning');
    document.getElementById('complaint-title').focus();
    return;
  }

  if (location.length < 3) {
    showToast('Location must specify block, floor, or room (at least 3 characters).', 'warning');
    document.getElementById('complaint-location').focus();
    return;
  }

  if (description.length < 15) {
    showToast('Description is too brief. Please enter at least 15 characters.', 'warning');
    document.getElementById('complaint-description').focus();
    return;
  }

  if (fileInput.files && fileInput.files[0]) {
    if (fileInput.files[0].size > 10 * 1024 * 1024) {
      showToast('Uploaded image exceeds 10 MB limit.', 'warning');
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Submitting Grievance...`;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category_id', categoryId);
  formData.append('location', location);
  formData.append('priority', selectedPriority);
  formData.append('description', description);

  if (fileInput.files && fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  const res = await apiFetch('/api/complaints/create', {
    method: 'POST',
    body: formData
  });

  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="send" class="w-4 h-4 mr-1.5 inline"></i> Register Grievance`;
  if (window.lucide) lucide.createIcons();

  if (res && res.ok && res.data.success) {
    showToast('Grievance lodged successfully! Tracking ID generated.', 'success');
    form.reset();
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('image-dropzone').classList.remove('hidden');
    
    // Refresh student dashboard and switch to grievances tab
    await loadStudentComplaints();
    switchStudentTab('my-complaints');
  } else {
    showToast(res?.data?.message || 'Failed to submit grievance.', 'error');
  }
}

// Fetch and Render Student Complaints
async function loadStudentComplaints() {
  const container = document.getElementById('student-complaints-list');
  if (!container) return;

  container.innerHTML = `<div class="p-8 text-center text-slate-400"><span class="animate-spin inline-block mr-2">⟳</span> Loading your grievances...</div>`;

  const res = await apiFetch('/api/complaints/student');
  if (!res || !res.ok || !res.data.success) {
    container.innerHTML = `<div class="p-8 text-center text-rose-500">Failed to load grievances.</div>`;
    return;
  }

  const { metrics, complaints } = res.data;

  // Update Metric Cards
  document.getElementById('metric-student-total').innerText = metrics.total;
  document.getElementById('metric-student-pending').innerText = metrics.pending;
  document.getElementById('metric-student-in-progress').innerText = metrics.in_progress;
  document.getElementById('metric-student-resolved').innerText = metrics.resolved;

  if (complaints.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-xl p-12 text-center border border-slate-200">
        <i data-lucide="clipboard-check" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
        <h4 class="text-base font-semibold text-slate-700">No grievances logged yet</h4>
        <p class="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Have an issue in your hostel, classroom, or lab? Raise a new grievance ticket to get it resolved.</p>
        <button onclick="switchStudentTab('lodge-complaint')" class="mt-4 inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          <i data-lucide="plus" class="w-4 h-4 mr-1.5"></i> Lodge New Grievance
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = complaints.map(c => {
    const isResolved = c.Status === 'Resolved';
    const hasFeedback = c.FeedbackRating != null;

    return `
      <div class="bg-white rounded-xl p-5 border border-slate-200 hover:border-slate-300 transition-all shadow-sm hover:shadow">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-3.5">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono font-bold text-slate-400">#TKT-${c.ComplaintID}</span>
              ${getStatusBadge(c.Status)}
              ${getPriorityBadge(c.Priority)}
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">${c.CategoryName}</span>
            </div>
            <h4 class="text-base font-bold text-slate-800">${escapeHtml(c.Title)}</h4>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="openTrackModal(${c.ComplaintID})" class="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1">
              <i data-lucide="activity" class="w-3.5 h-3.5"></i> Track Progress
            </button>
            ${isResolved && !hasFeedback ? `
              <button onclick="openFeedbackModal(${c.ComplaintID}, '${escapeHtml(c.Title)}')" class="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1">
                <i data-lucide="star" class="w-3.5 h-3.5"></i> Rate Resolution
              </button>
            ` : ''}
          </div>
        </div>

        <p class="text-sm text-slate-600 mb-3 line-clamp-2">${escapeHtml(c.Description)}</p>

        ${c.LatestAdminRemark ? `
          <div class="mb-3.5 p-3 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs shadow-sm">
            <div class="flex items-center justify-between text-amber-900 font-bold mb-1.5">
              <span class="flex items-center gap-1.5">
                <i data-lucide="message-square" class="w-3.5 h-3.5 text-amber-600"></i>
                Official Admin Remark:
              </span>
              <span class="text-[11px] font-semibold text-amber-700">
                👔 ${escapeHtml(c.LatestAdminName || 'Campus Admin')} ${c.LatestAdminTime ? `• ${formatDate(c.LatestAdminTime)}` : ''}
              </span>
            </div>
            <p class="text-slate-900 font-semibold pl-2.5 border-l-2 border-amber-500 italic text-[12.5px]">"${escapeHtml(c.LatestAdminRemark)}"</p>
          </div>
        ` : ''}

        ${c.ImageAttachmentURL ? `
          <div class="mb-3.5 flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <div class="w-16 h-12 rounded overflow-hidden bg-slate-200 shrink-0 cursor-pointer border border-slate-300 relative group" onclick="openImageLightbox('${c.ImageAttachmentURL}', '${escapeHtml(c.Title)}')">
              <img src="${c.ImageAttachmentURL}" alt="Evidence" class="w-full h-full object-cover group-hover:scale-110 transition-transform" onerror="this.closest('.flex').style.display='none'">
              <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">🔍</div>
            </div>
            <div>
              <span class="text-xs font-semibold text-slate-700 block">Attached Evidence Photo</span>
              <button type="button" onclick="openImageLightbox('${c.ImageAttachmentURL}', '${escapeHtml(c.Title)}')" class="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium mt-0.5">
                <i data-lucide="zoom-in" class="w-3 h-3"></i> View Full Resolution
              </button>
            </div>
          </div>
        ` : ''}

        <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i> ${escapeHtml(c.Location)}</span>
            <span class="flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i> SLA: ${c.SLA_Hours} hrs</span>
          </div>
          <div class="flex items-center gap-3">
            ${hasFeedback ? `
              <span class="flex items-center text-amber-500 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                ★ ${c.FeedbackRating}/5 (${escapeHtml(c.FeedbackComments || 'Rated')})
              </span>
            ` : ''}
            <span>Reported on ${formatDate(c.CreatedAt)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// Track Modal Stepper & Timeline
async function openTrackModal(complaintId) {
  const modal = document.getElementById('track-modal');
  modal.classList.remove('hidden');

  const content = document.getElementById('track-modal-content');
  content.innerHTML = `<div class="p-8 text-center text-slate-400"><span class="animate-spin inline-block mr-2">⟳</span> Fetching resolution timeline...</div>`;

  const res = await apiFetch(`/api/complaints/track/${complaintId}`);
  if (!res || !res.ok || !res.data.success) {
    content.innerHTML = `<div class="p-8 text-center text-rose-500">Failed to load ticket timeline.</div>`;
    return;
  }

  const { complaint, timeline } = res.data;
  const status = complaint.Status;

  // Calculate Stepper Status
  let step = 1;
  let trackWidth = '0%';
  let isRejected = status === 'Rejected';

  if (status === 'Pending') {
    step = 2;
    trackWidth = '33%';
  } else if (status === 'In Progress') {
    step = 3;
    trackWidth = '66%';
  } else if (status === 'Resolved') {
    step = 4;
    trackWidth = '100%';
  } else if (isRejected) {
    step = 4;
    trackWidth = '100%';
  }

  content.innerHTML = `
    <!-- Header -->
    <div class="flex items-start justify-between border-b border-slate-200 pb-4 mb-5">
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-xs font-mono font-bold text-slate-400">#TKT-${complaint.ComplaintID}</span>
          ${getStatusBadge(complaint.Status)}
          ${getPriorityBadge(complaint.Priority)}
          <span class="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">${complaint.CategoryName}</span>
        </div>
        <h3 class="text-lg font-bold text-slate-900">${escapeHtml(complaint.Title)}</h3>
        <p class="text-xs text-slate-500 mt-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 inline text-slate-400"></i> ${escapeHtml(complaint.Location)} &bull; Reported by ${escapeHtml(complaint.StudentName)} (${escapeHtml(complaint.StudentDepartment)})</p>
      </div>
      <button onclick="closeTrackModal()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Stepper Progress Bar -->
    <div class="stepper-container px-4">
      <div class="stepper-track"></div>
      <div class="stepper-progress" style="width: ${trackWidth}; background-color: ${isRejected ? '#ef4444' : '#2563eb'};"></div>

      <div class="step-node">
        <div class="step-circle completed"><i data-lucide="check" class="w-4 h-4"></i></div>
        <span class="step-label active">Submitted</span>
      </div>

      <div class="step-node">
        <div class="step-circle ${step >= 2 ? (step > 2 ? 'completed' : 'active') : ''}">
          ${step > 2 ? '<i data-lucide="check" class="w-4 h-4"></i>' : '2'}
        </div>
        <span class="step-label ${step >= 2 ? 'active' : ''}">Pending Review</span>
      </div>

      <div class="step-node">
        <div class="step-circle ${step >= 3 ? (step > 3 ? 'completed' : 'active') : ''}">
          ${step > 3 ? '<i data-lucide="check" class="w-4 h-4"></i>' : '3'}
        </div>
        <span class="step-label ${step >= 3 ? 'active' : ''}">In Progress</span>
      </div>

      <div class="step-node">
        <div class="step-circle ${step >= 4 ? (isRejected ? 'rejected' : 'completed') : ''}">
          ${step >= 4 ? (isRejected ? '<i data-lucide="x" class="w-4 h-4"></i>' : '<i data-lucide="check" class="w-4 h-4"></i>') : '4'}
        </div>
        <span class="step-label ${step >= 4 ? 'active' : ''}">${isRejected ? 'Rejected' : 'Resolved'}</span>
      </div>
    </div>

    <!-- Details Section -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
      <div class="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Description & Notes</h5>
        <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(complaint.Description)}</p>
      </div>

      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
        <div>
          <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Resolution SLA</h5>
          <div class="text-lg font-bold text-slate-800">${complaint.SLA_Hours} Hours Target</div>
          <p class="text-xs text-slate-500 mt-1">Expected resolution based on category benchmark.</p>
        </div>
        ${complaint.FeedbackRating ? `
          <div class="mt-3 pt-3 border-t border-slate-200">
            <span class="text-xs font-semibold text-slate-500">Student Rating:</span>
            <div class="text-amber-500 font-bold text-sm">★ ${complaint.FeedbackRating}/5.0</div>
            <p class="text-xs italic text-slate-600">"${escapeHtml(complaint.FeedbackComments || '')}"</p>
          </div>
        ` : ''}
      </div>
    </div>

    ${complaint.ImageAttachmentURL ? `
      <div class="mb-6">
        <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Attached Visual Evidence</h5>
        <a href="${complaint.ImageAttachmentURL}" target="_blank" class="block max-w-sm rounded-xl overflow-hidden border border-slate-200 hover:opacity-95 transition-opacity">
          <img src="${complaint.ImageAttachmentURL}" alt="Evidence Photo" class="w-full h-48 object-cover">
        </a>
      </div>
    ` : ''}

    <!-- Timeline History -->
    <div>
      <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Audit Trail & Timeline Logs</h5>
      <div class="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        ${timeline.map(item => `
          <div class="relative">
            <div class="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white"></div>
            <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs">
              <div class="flex items-center justify-between text-slate-400 mb-1">
                <span class="font-semibold text-slate-700">${escapeHtml(item.UpdatedByName)} (${item.UpdatedByRole})</span>
                <span>${formatDate(item.Timestamp)}</span>
              </div>
              <p class="text-slate-800 font-medium">${escapeHtml(item.Remarks)}</p>
              ${item.PreviousStatus ? `
                <div class="mt-1 text-slate-500">Status changed: <span class="font-mono">${item.PreviousStatus}</span> &rarr; <span class="font-mono font-bold text-slate-700">${item.NewStatus}</span></div>
              ` : `
                <div class="mt-1 text-slate-500">Initial ticket status: <span class="font-mono font-bold text-slate-700">${item.NewStatus}</span></div>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function closeTrackModal() {
  document.getElementById('track-modal').classList.add('hidden');
}

// 5-Star Feedback Modal
function openFeedbackModal(complaintId, title) {
  currentActiveFeedbackId = complaintId;
  document.getElementById('feedback-ticket-title').innerText = title;
  document.getElementById('feedback-comments').value = '';
  
  // Clear star radio
  const radios = document.querySelectorAll('input[name="rating"]');
  radios.forEach(r => r.checked = false);

  document.getElementById('feedback-modal').classList.remove('hidden');
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('hidden');
  currentActiveFeedbackId = null;
}

async function submitFeedback(e) {
  e.preventDefault();
  if (!currentActiveFeedbackId) return;

  const ratingRadio = document.querySelector('input[name="rating"]:checked');
  if (!ratingRadio) {
    showToast('Please select a star rating (1 to 5).', 'warning');
    return;
  }

  const rating = ratingRadio.value;
  const comments = document.getElementById('feedback-comments').value.trim();
  const btn = document.getElementById('feedback-submit-btn');

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Submitting...`;

  const res = await apiFetch('/api/complaints/feedback', {
    method: 'POST',
    body: JSON.stringify({
      complaint_id: currentActiveFeedbackId,
      rating: parseInt(rating),
      comments: comments
    })
  });

  btn.disabled = false;
  btn.innerHTML = `Submit Feedback`;

  if (res && res.ok && res.data.success) {
    showToast('Thank you for rating our resolution service!', 'success');
    closeFeedbackModal();
    await loadStudentComplaints();
  } else {
    showToast(res?.data?.message || 'Could not submit feedback.', 'error');
  }
}

// Tab switcher for Student Portal
function switchStudentTab(tab) {
  const tabLodge = document.getElementById('student-tab-lodge');
  const tabMy = document.getElementById('student-tab-my');
  const viewLodge = document.getElementById('student-view-lodge');
  const viewMy = document.getElementById('student-view-my');

  if (tab === 'lodge-complaint') {
    tabLodge.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-blue-600 text-white shadow-sm';
    tabMy.className = 'px-4 py-2 font-medium text-sm rounded-lg text-slate-600 hover:bg-slate-100';
    viewLodge.classList.remove('hidden');
    viewMy.classList.add('hidden');
  } else {
    tabMy.className = 'px-4 py-2 font-semibold text-sm rounded-lg bg-blue-600 text-white shadow-sm';
    tabLodge.className = 'px-4 py-2 font-medium text-sm rounded-lg text-slate-600 hover:bg-slate-100';
    viewMy.classList.remove('hidden');
    viewLodge.classList.add('hidden');
    loadStudentComplaints();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
