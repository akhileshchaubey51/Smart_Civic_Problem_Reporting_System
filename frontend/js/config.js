/**
 * CampusCare Global Config, State Store, & API Fetch Utility
 */

const AppState = {
  token: localStorage.getItem('campuscare_token') || null,
  user: JSON.parse(localStorage.getItem('campuscare_user') || 'null'),
  currentRole: null, // 'Student' or 'Admin'
  categories: []
};

// Notification Toast Manager
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-item';

  let bgClass = 'bg-slate-900 text-white border border-slate-700';
  let iconHtml = `<i data-lucide="info" class="w-5 h-5 text-blue-400 shrink-0"></i>`;

  if (type === 'success') {
    bgClass = 'bg-emerald-900/95 text-emerald-100 border border-emerald-700';
    iconHtml = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-300 shrink-0"></i>`;
  } else if (type === 'error') {
    bgClass = 'bg-rose-900/95 text-rose-100 border border-rose-700';
    iconHtml = `<i data-lucide="alert-circle" class="w-5 h-5 text-rose-300 shrink-0"></i>`;
  } else if (type === 'warning') {
    bgClass = 'bg-amber-900/95 text-amber-100 border border-amber-700';
    iconHtml = `<i data-lucide="alert-triangle" class="w-5 h-5 text-amber-300 shrink-0"></i>`;
  }

  toast.className += ` ${bgClass}`;
  toast.innerHTML = `
    ${iconHtml}
    <div class="flex-1 text-sm font-medium leading-snug">${message}</div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white ml-2">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Unified API Fetcher with Token Injection
async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};

  if (AppState.token) {
    headers['Authorization'] = `Bearer ${AppState.token}`;
  }

  // If body is NOT FormData, set JSON content type
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  options.headers = headers;

  try {
    const response = await fetch(endpoint, options);
    
    // Check for 401 Unauthorized
    if (response.status === 401) {
      // Clear all invalid session credentials and redirect to landing
      AppState.token = null;
      AppState.user = null;
      AppState.currentRole = null;
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/index.html');
      return null;
    }

    // Handle CSV or non-json
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      return response;
    }

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    console.error('API Fetch Error:', err);
    showToast(`Network error: ${err.message}`, 'error');
    return { ok: false, status: 0, data: { success: false, message: err.message } };
  }
}

// Format ISO UTC Date to Readable Local String
function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Render Status Badge HTML
function getStatusBadge(status) {
  const s = status || 'Pending';
  switch (s) {
    case 'Pending':
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-pending"><span class="w-1.5 h-1.5 mr-1.5 bg-amber-500 rounded-full animate-pulse"></span>Pending</span>`;
    case 'In Progress':
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-in-progress"><span class="w-1.5 h-1.5 mr-1.5 bg-sky-500 rounded-full"></span>In Progress</span>`;
    case 'Resolved':
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-resolved"><span class="w-1.5 h-1.5 mr-1.5 bg-emerald-500 rounded-full"></span>Resolved</span>`;
    case 'Rejected':
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-rejected"><span class="w-1.5 h-1.5 mr-1.5 bg-rose-500 rounded-full"></span>Rejected</span>`;
    default:
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${s}</span>`;
  }
}

// Render Priority Badge HTML
function getPriorityBadge(priority) {
  const p = priority || 'Low';
  switch (p) {
    case 'Emergency':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold badge-emergency uppercase tracking-wider"><i data-lucide="flame" class="w-3 h-3 mr-1 inline"></i>Emergency</span>`;
    case 'High':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold badge-high">High</span>`;
    case 'Medium':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold badge-medium">Medium</span>`;
    case 'Low':
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold badge-low">Low</span>`;
    default:
      return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-800">${p}</span>`;
  }
}
