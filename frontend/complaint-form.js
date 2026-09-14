/**
 * CampusCare | Lodge Grievance Form Controller
 * Manages category auto-selection, GPS location auto-detection,
 * drag-and-drop photo evidence preview, and backend API submission.
 */

let selectedFile = null;
let categoryList = [];
let authToken = localStorage.getItem('campuscare_token');

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  if (!authToken) {
    showAlert('Please log in with your @kiet.edu account to lodge a grievance.', 'error');
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.innerText = 'Login Required';
      submitBtn.onclick = () => window.location.href = '/login';
    }
  }

  // Load categories from database API
  await loadCategories();

  // Setup file uploader drag & drop
  setupDropzone();

  // Handle form submission
  setupFormSubmit();
});

/**
 * Load categories from SQL Server and match URL query param
 */
async function loadCategories() {
  const select = document.getElementById('categorySelect');
  const slaHint = document.getElementById('slaHint');
  if (!select) return;

  try {
    const res = await fetch('/api/categories');
    const data = await res.json();

    if (res.ok && data.success) {
      categoryList = data.categories || [];
      select.innerHTML = `<option value="" disabled selected>Select category...</option>`;

      categoryList.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.CategoryID;
        opt.textContent = `${cat.CategoryName} (SLA: ${cat.SLA_Hours}h)`;
        opt.dataset.sla = cat.SLA_Hours;
        select.appendChild(opt);
      });

      // Check URL query parameter (e.g. ?category=Road%20Issues)
      const urlParams = new URLSearchParams(window.location.search);
      const preCategory = urlParams.get('category');

      if (preCategory) {
        preselectCategory(preCategory);
      }

      select.addEventListener('change', () => {
        const selected = select.options[select.selectedIndex];
        if (selected && selected.dataset.sla) {
          slaHint.innerText = `Standard Resolution SLA Benchmark: ${selected.dataset.sla} Hours`;
        }
      });
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
    showAlert('Could not load categories from server.', 'error');
  }
}

/**
 * Match front-end category string to DB Category
 */
function preselectCategory(term) {
  const select = document.getElementById('categorySelect');
  const lower = term.toLowerCase();

  // Mapping card names to DB categories
  let targetName = '';
  if (lower.includes('other')) {
    targetName = 'other';
  } else if (lower.includes('security') || lower.includes('safety') || lower.includes('cctv')) {
    targetName = 'security';
  } else if (lower.includes('library') || lower.includes('academic') || lower.includes('reading')) {
    targetName = 'library';
  } else if (lower.includes('transport') || lower.includes('bus')) {
    targetName = 'transport';
  } else if (lower.includes('sports') || lower.includes('gym') || lower.includes('ground')) {
    targetName = 'sports';
  } else if (lower.includes('road') || lower.includes('parking') || lower.includes('infrastructure')) {
    targetName = 'infrastructure';
  } else if (lower.includes('water') || lower.includes('cleanliness') || lower.includes('sanitation')) {
    targetName = 'sanitation';
  } else if (lower.includes('electric')) {
    targetName = 'electrical';
  } else if (lower.includes('internet') || lower.includes('wi-fi') || lower.includes('lab')) {
    targetName = 'it / labs';
  } else if (lower.includes('hostel')) {
    targetName = 'hostel';
  } else if (lower.includes('mess') || lower.includes('canteen')) {
    targetName = 'mess/canteen';
  }

  for (let i = 0; i < select.options.length; i++) {
    const optText = select.options[i].text.toLowerCase();
    if (targetName && optText.includes(targetName)) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change'));
      break;
    }
  }
}

/**
 * HTML5 Geolocation API auto-detection
 */
function detectGPSLocation() {
  const locInput = document.getElementById('issueLocation');
  if (!navigator.geolocation) {
    showAlert('Geolocation is not supported by your browser.', 'error');
    return;
  }

  locInput.value = 'Locating GPS position...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      locInput.value = `GPS: ${lat}, ${lng} (KIET Campus)`;
      showAlert('✓ Campus GPS location detected successfully!', 'success');
      setTimeout(() => hideAlert(), 3000);
    },
    (err) => {
      console.warn('Geolocation error:', err);
      locInput.value = '';
      showAlert('Unable to auto-detect GPS. Please type the campus location manually.', 'error');
    },
    { timeout: 8000 }
  );
}

/**
 * Setup Drag & Drop File Upload
 */
function setupDropzone() {
  const fileInput = document.getElementById('evidenceImage');
  const dropzone = document.getElementById('dropzone');
  const defaultView = document.getElementById('dropzoneDefault');
  const previewView = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');

  if (!fileInput || !dropzone) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleSelectedFile(file);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#1d4ed8';
    dropzone.style.background = '#eff6ff';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#cbd5e1';
    dropzone.style.background = '#f8fafc';

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function handleSelectedFile(file) {
  if (!file.type.startsWith('image/')) {
    showAlert('Please select an image file (JPG, PNG, WEBP).', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showAlert('Image exceeds maximum file size limit (10 MB).', 'error');
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const defaultView = document.getElementById('dropzoneDefault');
    const previewView = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    if (previewImg && previewView && defaultView) {
      previewImg.src = e.target.result;
      defaultView.style.display = 'none';
      previewView.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function removeImage(event) {
  if (event) event.stopPropagation();
  selectedFile = null;
  const fileInput = document.getElementById('evidenceImage');
  const defaultView = document.getElementById('dropzoneDefault');
  const previewView = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewView) previewView.style.display = 'none';
  if (defaultView) defaultView.style.display = 'block';
}

function updateCharCounter(el) {
  const counter = document.getElementById('descCharCount');
  if (!counter) return;
  const len = (el.value || '').trim().length;
  counter.innerText = `${len} / 2000`;
  if (len < 15) {
    counter.style.color = '#ef4444';
  } else {
    counter.style.color = '#10b981';
  }
}

/**
 * Handle Form Submission
 */
function setupFormSubmit() {
  const form = document.getElementById('complaintForm');
  const submitBtn = document.getElementById('submitBtn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    if (!authToken) {
      showAlert('Authentication required. Redirecting to login...', 'error');
      setTimeout(() => window.location.href = '/login', 1000);
      return;
    }

    const categoryId = document.getElementById('categorySelect').value;
    const title = document.getElementById('issueTitle').value.trim();
    const location = document.getElementById('issueLocation').value.trim();
    const description = document.getElementById('issueDescription').value.trim();
    const priority = document.querySelector('input[name="priority"]:checked')?.value || 'Medium';

    if (!categoryId || !title || !location || !description) {
      showAlert('Please fill in all mandatory fields marked with *.', 'error');
      return;
    }

    if (title.length < 5) {
      showAlert('Title is too short. Please provide at least 5 characters.', 'error');
      document.getElementById('issueTitle').focus();
      return;
    }

    if (location.length < 3) {
      showAlert('Location is too short. Please specify the block, floor, or lab.', 'error');
      document.getElementById('issueLocation').focus();
      return;
    }

    if (description.length < 15) {
      showAlert('Description is too brief. Please provide at least 15 characters explaining the issue.', 'error');
      document.getElementById('issueDescription').focus();
      return;
    }

    // Build FormData
    const formData = new FormData();
    formData.append('category_id', categoryId);
    formData.append('title', title);
    formData.append('location', location);
    formData.append('description', description);
    formData.append('priority', priority);

    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        showAlert('Uploaded image exceeds 10 MB limit. Please choose a smaller photo.', 'error');
        return;
      }
      formData.append('image', selectedFile);
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span style="display:inline-block; animation: spin 0.8s linear infinite; margin-right: 6px;">⟳</span> Submitting Grievance...`;

    try {
      const res = await fetch('/api/complaints/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Show success modal
        document.getElementById('successTicketId').innerText = `#CMP-${data.complaint_id}`;
        document.getElementById('successSla').innerText = `${data.sla_hours || 48} Hours`;
        document.getElementById('successModal').classList.add('show');
      } else {
        showAlert(data.message || 'Failed to submit grievance. Please verify your details.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Grievance →';
      }
    } catch (err) {
      console.error('Submission error:', err);
      showAlert(`Network communication error: ${err.message}`, 'error');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Submit Grievance →';
    }
  });
}

/**
 * Alert Helpers
 */
function showAlert(msg, type = 'error') {
  const box = document.getElementById('formAlert');
  if (!box) return;
  box.className = `alert-box ${type}`;
  box.innerText = msg;
}

function hideAlert() {
  const box = document.getElementById('formAlert');
  if (box) {
    box.style.display = 'none';
  }
}
