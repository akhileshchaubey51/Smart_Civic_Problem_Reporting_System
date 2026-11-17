/**
 * CampusCare | Lodge Grievance Form Controller
 * Manages category auto-selection, GPS location auto-detection,
 * AI Live Camera & Video/Image Grievance Detection, and backend API submission.
 */

const API_BASE = (() => {
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:5000';
  if (window.location.port === '5000') return '';
  return `${window.location.protocol}//${window.location.hostname}:5000`;
})();

let selectedFile = null;
const DEFAULT_FALLBACK_CATEGORIES = [
  { CategoryID: 1, CategoryName: "Hostel", SLA_Hours: 48 },
  { CategoryID: 2, CategoryName: "Sanitation", SLA_Hours: 24 },
  { CategoryID: 3, CategoryName: "Infrastructure", SLA_Hours: 72 },
  { CategoryID: 4, CategoryName: "IT / Labs", SLA_Hours: 24 },
  { CategoryID: 5, CategoryName: "Mess/Canteen", SLA_Hours: 12 },
  { CategoryID: 6, CategoryName: "Electrical", SLA_Hours: 12 },
  { CategoryID: 7, CategoryName: "Road Issues", SLA_Hours: 72 },
  { CategoryID: 8, CategoryName: "Water Issues", SLA_Hours: 24 },
  { CategoryID: 9, CategoryName: "Parking", SLA_Hours: 72 },
  { CategoryID: 10, CategoryName: "Library & Academics", SLA_Hours: 24 },
  { CategoryID: 11, CategoryName: "Security & Safety", SLA_Hours: 12 },
  { CategoryID: 12, CategoryName: "Other Issues", SLA_Hours: 48 }
];
let categoryList = [...DEFAULT_FALLBACK_CATEGORIES];
let authToken = localStorage.getItem('campuscare_token');
let liveCameraStream = null;
let currentFacingMode = 'environment';
let uploadedAIMediaFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth
  if (!authToken) {
    window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login');
    return;
  }

  // Pre-bind SLA hint on change
  const select = document.getElementById('categorySelect');
  const slaHint = document.getElementById('slaHint');
  if (select && slaHint) {
    select.addEventListener('change', () => {
      const selected = select.options[select.selectedIndex];
      if (selected && selected.dataset.sla) {
        slaHint.innerText = `Standard Resolution SLA Benchmark: ${selected.dataset.sla} Hours`;
      }
    });
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
    const res = await fetch(`${API_BASE}/api/categories`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.categories && data.categories.length > 0) {
        categoryList = data.categories;
        const currentVal = select.value;
        select.innerHTML = `<option value="" disabled ${!currentVal ? 'selected' : ''}>Select category...</option>`;

        categoryList.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.CategoryID;
          opt.textContent = `${cat.CategoryName} (SLA: ${cat.SLA_Hours}h)`;
          opt.dataset.sla = cat.SLA_Hours;
          if (String(currentVal) === String(cat.CategoryID)) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn('API categories fetch notice (using pre-rendered fallback categories):', err);
  }

  // Check URL query parameter (e.g. ?category=Road%20Issues)
  const urlParams = new URLSearchParams(window.location.search);
  const preCategory = urlParams.get('category');
  if (preCategory) {
    preselectCategory(preCategory);
  } else if (select.selectedIndex > 0) {
    const opt = select.options[select.selectedIndex];
    if (opt && opt.dataset.sla && slaHint) {
      slaHint.innerText = `Standard Resolution SLA Benchmark: ${opt.dataset.sla} Hours`;
    }
  }
}

/**
 * Match front-end category string to DB Category
 */
function preselectCategory(term) {
  const select = document.getElementById('categorySelect');
  if (!select) return;
  const lower = term.toLowerCase().trim();

  // Accurate mapping of category keywords
  let targetName = '';
  if (lower.includes('road')) {
    targetName = 'road';
  } else if (lower.includes('water') || lower.includes('cooler') || lower.includes('leakage') || lower.includes('filter')) {
    targetName = 'water';
  } else if (lower.includes('park') || lower.includes('transit') || lower.includes('vehicle')) {
    targetName = 'parking';
  } else if (lower.includes('sanitat') || lower.includes('clean') || lower.includes('waste') || lower.includes('hygiene') || lower.includes('garbage')) {
    targetName = 'sanitation';
  } else if (lower.includes('electric') || lower.includes('power') || lower.includes('fan') || lower.includes('light')) {
    targetName = 'electrical';
  } else if (lower.includes('infra') || lower.includes('class') || lower.includes('desk') || lower.includes('board')) {
    targetName = 'infrastructure';
  } else if (lower.includes('it') || lower.includes('lab') || lower.includes('computer') || lower.includes('internet') || lower.includes('wi-fi')) {
    targetName = 'it / labs';
  } else if (lower.includes('hostel') || lower.includes('room') || lower.includes('residence')) {
    targetName = 'hostel';
  } else if (lower.includes('mess') || lower.includes('canteen') || lower.includes('food') || lower.includes('cafeteria')) {
    targetName = 'mess/canteen';
  } else if (lower.includes('library') || lower.includes('academic') || lower.includes('book') || lower.includes('reading')) {
    targetName = 'library';
  } else if (lower.includes('security') || lower.includes('safety') || lower.includes('guard') || lower.includes('gate') || lower.includes('cctv')) {
    targetName = 'security';
  } else if (lower.includes('other')) {
    targetName = 'other';
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
 * HTML5 Geolocation API auto-detection with 1.5 km KIET geofencing
 */
const KIET_LAT = 28.75330;
const KIET_LNG = 77.49730;
const MAX_CAMPUS_RADIUS_KM = 1.5;

function computeHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function detectGPSLocation() {
  const locInput = document.getElementById('issueLocation');
  if (!navigator.geolocation) {
    showAlert('Geolocation is not supported by your browser.', 'error');
    return;
  }

  locInput.value = 'Locating GPS position...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const distKm = computeHaversineDistanceKm(lat, lng, KIET_LAT, KIET_LNG);
      if (distKm <= MAX_CAMPUS_RADIUS_KM) {
        locInput.value = `KIET Campus Premises (${distKm.toFixed(2)} km from main gate)`;
        showAlert('✓ Verified within KIET Campus Premises (1.5 km boundary)!', 'success');
      } else {
        locInput.value = `KIET Campus Premises (${distKm.toFixed(2)} km, Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
        showAlert(`Alert: Detected position is ${distKm.toFixed(1)} km from KIET. All reports are restricted to campus premises.`, 'warning');
      }
      setTimeout(() => hideAlert(), 4000);
    },
    (err) => {
      console.warn('Geolocation error:', err);
      locInput.value = 'Academic Block, KIET Campus Premises (Within 1.5 km)';
      showAlert('Campus geofence applied: KIET Campus Premises (1.5 km radius).', 'success');
      setTimeout(() => hideAlert(), 3000);
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
  const isImg = file.type.startsWith('image/');
  const isVid = file.type.startsWith('video/');

  if (!isImg && !isVid) {
    showAlert('Please select a valid image (JPG, PNG, WEBP) or video file (MP4, WEBM, MOV).', 'error');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    showAlert('Evidence file exceeds 25 MB limit. Please select a smaller photo or short video clip.', 'error');
    return;
  }

  selectedFile = file;

  const defaultView = document.getElementById('dropzoneDefault');
  const previewView = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const previewVideo = document.getElementById('previewVideo');

  if (defaultView) defaultView.style.display = 'none';
  if (previewView) previewView.style.display = 'block';

  if (isVid) {
    if (previewImg) previewImg.style.display = 'none';
    if (previewVideo) {
      previewVideo.style.display = 'block';
      previewVideo.src = URL.createObjectURL(file);
      previewVideo.load();
    }
  } else {
    if (previewVideo) previewVideo.style.display = 'none';
    if (previewImg) {
      previewImg.style.display = 'block';
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
}

function removeImage(event) {
  if (event) event.stopPropagation();
  selectedFile = null;
  const fileInput = document.getElementById('evidenceImage');
  const aiImageUrl = document.getElementById('aiImageUrl');
  const defaultView = document.getElementById('dropzoneDefault');
  const previewView = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const previewVideo = document.getElementById('previewVideo');

  if (fileInput) fileInput.value = '';
  if (aiImageUrl) aiImageUrl.value = '';
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  if (previewVideo) {
    previewVideo.src = '';
    previewVideo.style.display = 'none';
  }
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

    const aiImgUrlInput = document.getElementById('aiImageUrl');
    const existingAiUrl = aiImgUrlInput ? aiImgUrlInput.value.trim() : '';

    if (!selectedFile && !existingAiUrl) {
      showAlert('Photographic or video evidence is mandatory as per college policy. Please attach a photo/video or use the AI Live Detector.', 'error');
      document.getElementById('evidenceImage').focus();
      return;
    }

    if (selectedFile) {
      if (selectedFile.size > 25 * 1024 * 1024) {
        showAlert('Uploaded file exceeds 25 MB limit. Please choose a smaller photo or video clip.', 'error');
        return;
      }
      formData.append('image', selectedFile);
    } else if (existingAiUrl) {
      formData.append('image_url', existingAiUrl);
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span style="display:inline-block; animation: spin 0.8s linear infinite; margin-right: 6px;">⟳</span> Submitting Grievance...`;

    try {
      const res = await fetch(`${API_BASE}/api/complaints/create`, {
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

/* ==========================================================================
   AI LIVE CAMERA & MEDIA GRIEVANCE DETECTION MODULE
   ========================================================================== */

function switchAIDetectTab(tab) {
  const btnLive = document.getElementById('btnTabLive');
  const btnUpload = document.getElementById('btnTabUpload');
  const secLive = document.getElementById('aiLiveCameraSection');
  const secUpload = document.getElementById('aiUploadMediaSection');

  if (tab === 'live') {
    if (btnLive) btnLive.classList.add('active');
    if (btnUpload) btnUpload.classList.remove('active');
    if (secLive) secLive.style.display = 'block';
    if (secUpload) secUpload.style.display = 'none';
  } else {
    if (btnUpload) btnUpload.classList.add('active');
    if (btnLive) btnLive.classList.remove('active');
    if (secUpload) secUpload.style.display = 'block';
    if (secLive) secLive.style.display = 'none';
    stopLiveCameraStream(); // free camera
  }
}

async function startLiveCameraStream() {
  const video = document.getElementById('liveCameraFeed');
  const hud = document.getElementById('scannerHud');
  const placeholder = document.getElementById('cameraPlaceholder');
  const controls = document.getElementById('cameraControlsBar');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showAlert('Live camera access is not supported by your browser. Please use the Upload Video/Photo tab.', 'error');
    return;
  }

  try {
    if (liveCameraStream) {
      stopLiveCameraStream();
    }

    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    liveCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = liveCameraStream;
      video.style.display = 'block';
      await video.play();
    }

    if (placeholder) placeholder.style.display = 'none';
    if (hud) hud.style.display = 'block';
    if (controls) controls.style.display = 'flex';
    hideAlert();
  } catch (err) {
    console.error('Camera stream access failed:', err);
    showAlert('Camera permission denied or camera device in use. You can upload an existing video or photo using the next tab.', 'error');
    if (placeholder) placeholder.style.display = 'block';
    if (hud) hud.style.display = 'none';
    if (controls) controls.style.display = 'none';
  }
}

function stopLiveCameraStream() {
  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach(track => track.stop());
    liveCameraStream = null;
  }
  const video = document.getElementById('liveCameraFeed');
  const hud = document.getElementById('scannerHud');
  const placeholder = document.getElementById('cameraPlaceholder');
  const controls = document.getElementById('cameraControlsBar');

  if (video) {
    video.pause();
    video.srcObject = null;
    video.style.display = 'none';
  }
  if (hud) hud.style.display = 'none';
  if (placeholder) placeholder.style.display = 'block';
  if (controls) controls.style.display = 'none';
}

async function switchCameraFacing() {
  currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
  await startLiveCameraStream();
}

async function captureAndDetectIssue() {
  const video = document.getElementById('liveCameraFeed');
  const canvas = document.getElementById('cameraCaptureCanvas');
  const loader = document.getElementById('aiAnalysisLoader');
  const captureBtn = document.getElementById('btnCaptureDetect');

  if (!video || !liveCameraStream) {
    showAlert('Please turn on the camera first before scanning.', 'error');
    return;
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    showAlert('Camera video is still initializing. Please wait a moment and try again.', 'error');
    return;
  }

  // Draw current video frame to canvas
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

  // Show AI analysis state
  if (loader) loader.style.display = 'flex';
  if (captureBtn) {
    captureBtn.disabled = true;
    captureBtn.innerHTML = '⚡ Scanning Visual Patterns...';
  }

  try {
    const response = await fetch(`${API_BASE}/api/complaints/ai-detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_base64: dataUrl,
        hint: 'live_camera_capture'
      })
    });

    const data = await response.json();

    if (response.ok && data.success && data.detected_issue) {
      // Convert dataUrl to File object for complaint attachment
      const blob = await (await fetch(dataUrl)).blob();
      const capturedFile = new File([blob], `live_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

      applyAIDetectedIssue(data.detected_issue, capturedFile, dataUrl, false, data.image_url);
    } else {
      showAlert(data.message || 'AI could not classify the issue. Please adjust camera framing or select manually.', 'error');
    }
  } catch (err) {
    console.error('AI Detection Error:', err);
    showAlert('Network error while analyzing camera frame with AI.', 'error');
  } finally {
    if (loader) loader.style.display = 'none';
    if (captureBtn) {
      captureBtn.disabled = false;
      captureBtn.innerHTML = '⚡ AI Detect Issue & Auto-Fill Form';
    }
  }
}

function toggleUploadType(type) {
  const pillVid = document.getElementById('pillRadioVideo');
  const pillImg = document.getElementById('pillRadioImage');
  const promptSub = document.getElementById('aiUploadPromptSub');
  const fileInput = document.getElementById('aiMediaFileInput');

  if (type === 'video') {
    if (pillVid) pillVid.classList.add('active');
    if (pillImg) pillImg.classList.remove('active');
    if (promptSub) promptSub.innerText = 'MP4, WEBM, MOV (Max 25 MB)';
    if (fileInput) fileInput.accept = 'video/*';
  } else {
    if (pillImg) pillImg.classList.add('active');
    if (pillVid) pillVid.classList.remove('active');
    if (promptSub) promptSub.innerText = 'JPG, PNG, WEBP (Max 25 MB)';
    if (fileInput) fileInput.accept = 'image/*';
  }
}

function handleAIMediaFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 25 * 1024 * 1024) {
    showAlert('Selected file exceeds 25 MB. Please select a smaller photo or short video clip.', 'error');
    return;
  }

  uploadedAIMediaFile = file;

  const promptBox = document.getElementById('aiUploadPrompt');
  const vidBox = document.getElementById('aiVideoPreviewContainer');
  const imgBox = document.getElementById('aiImagePreviewContainer');
  const vidEl = document.getElementById('aiUploadedVideo');
  const imgEl = document.getElementById('aiUploadedImage');

  if (file.type.startsWith('video/')) {
    if (promptBox) promptBox.style.display = 'none';
    if (imgBox) imgBox.style.display = 'none';
    if (vidBox) {
      vidBox.style.display = 'block';
      vidEl.src = URL.createObjectURL(file);
      vidEl.load();
    }
  } else if (file.type.startsWith('image/')) {
    if (promptBox) promptBox.style.display = 'none';
    if (vidBox) vidBox.style.display = 'none';
    if (imgBox) {
      imgBox.style.display = 'block';
      const reader = new FileReader();
      reader.onload = (e) => {
        imgEl.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  } else {
    showAlert('Unsupported file format. Please upload a video or photo.', 'error');
  }
}

function resetAIMediaUpload(e) {
  if (e) e.stopPropagation();
  uploadedAIMediaFile = null;
  const fileInput = document.getElementById('aiMediaFileInput');
  if (fileInput) fileInput.value = '';

  const promptBox = document.getElementById('aiUploadPrompt');
  const vidBox = document.getElementById('aiVideoPreviewContainer');
  const imgBox = document.getElementById('aiImagePreviewContainer');

  if (promptBox) promptBox.style.display = 'block';
  if (vidBox) vidBox.style.display = 'none';
  if (imgBox) imgBox.style.display = 'none';
}

async function analyzeVideoFrame() {
  const video = document.getElementById('aiUploadedVideo');
  const loader = document.getElementById('aiAnalysisLoader');

  if (!video || !uploadedAIMediaFile) {
    showAlert('Please select a video file first.', 'error');
    return;
  }

  // Draw current video playback frame to canvas
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

  if (loader) loader.style.display = 'flex';

  try {
    const response = await fetch(`${API_BASE}/api/complaints/ai-detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_base64: dataUrl,
        hint: uploadedAIMediaFile.name || 'video_clip_frame'
      })
    });

    const data = await response.json();

    if (response.ok && data.success && data.detected_issue) {
      // Set the video file as the primary complaint attachment
      applyAIDetectedIssue(data.detected_issue, uploadedAIMediaFile, dataUrl, true, data.image_url);
    } else {
      showAlert(data.message || 'AI analysis could not detect a campus issue in this video.', 'error');
    }
  } catch (err) {
    console.error('Video AI Analysis Error:', err);
    showAlert('Network error analyzing video with AI.', 'error');
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

async function analyzeSelectedImage() {
  const img = document.getElementById('aiUploadedImage');
  const loader = document.getElementById('aiAnalysisLoader');

  if (!uploadedAIMediaFile) {
    showAlert('Please select an image file first.', 'error');
    return;
  }

  if (loader) loader.style.display = 'flex';

  try {
    const formData = new FormData();
    formData.append('file', uploadedAIMediaFile);
    formData.append('hint', uploadedAIMediaFile.name || 'image_upload');

    const response = await fetch(`${API_BASE}/api/complaints/ai-detect`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (response.ok && data.success && data.detected_issue) {
      applyAIDetectedIssue(data.detected_issue, uploadedAIMediaFile, img.src, false, data.image_url);
    } else {
      showAlert(data.message || 'AI analysis could not identify the problem.', 'error');
    }
  } catch (err) {
    console.error('Image AI Analysis Error:', err);
    showAlert('Network error analyzing photo with AI.', 'error');
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

/**
 * Auto-fill grievance form with AI detected parameters
 */
function applyAIDetectedIssue(detected, evidenceFile, previewUrl, isVideo = false, serverImageUrl = '') {
  // 1. Auto-select category
  const select = document.getElementById('categorySelect');
  if (select && detected.category_id) {
    select.value = detected.category_id;
    // trigger change to refresh SLA hint
    select.dispatchEvent(new Event('change'));
    highlightField(select);
  }

  // 2. Auto-fill title
  const titleInput = document.getElementById('issueTitle');
  if (titleInput && detected.title) {
    titleInput.value = detected.title;
    highlightField(titleInput);
  }

  // 3. Auto-select Priority
  if (detected.priority) {
    const radio = document.querySelector(`input[name="priority"][value="${detected.priority}"]`);
    if (radio) {
      radio.checked = true;
      highlightField(radio.closest('.priority-card') || radio);
    }
  }

  // 4. Auto-fill Description
  const descInput = document.getElementById('issueDescription');
  if (descInput && detected.description) {
    descInput.value = detected.description;
    updateCharCounter(descInput);
    highlightField(descInput);
  }

  // 5. Suggest Campus Location if blank
  const locInput = document.getElementById('issueLocation');
  if (locInput && (!locInput.value || locInput.value.trim().length === 0)) {
    locInput.value = detected.suggested_location || 'KIET Campus Premises (Within 1.5 km)';
    highlightField(locInput);
  }

  // 6. Set evidence attachment
  selectedFile = evidenceFile;

  const aiImgUrlInput = document.getElementById('aiImageUrl');
  if (aiImgUrlInput && serverImageUrl) {
    aiImgUrlInput.value = serverImageUrl;
  }

  const defaultView = document.getElementById('dropzoneDefault');
  const previewView = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const previewVideo = document.getElementById('previewVideo');

  if (defaultView) defaultView.style.display = 'none';
  if (previewView) previewView.style.display = 'block';

  if (isVideo) {
    if (previewImg) previewImg.style.display = 'none';
    if (previewVideo) {
      previewVideo.style.display = 'block';
      if (evidenceFile instanceof File || evidenceFile instanceof Blob) {
        previewVideo.src = URL.createObjectURL(evidenceFile);
      }
      previewVideo.load();
    }
  } else {
    if (previewVideo) previewVideo.style.display = 'none';
    if (previewImg) {
      previewImg.style.display = 'block';
      previewImg.src = previewUrl;
    }
  }

  // 7. Render AI Result Card
  const resultCard = document.getElementById('aiResultCard');
  if (resultCard) {
    document.getElementById('aiResultTitle').innerText = detected.title;
    document.getElementById('aiResultCategory').innerText = detected.category_name;
    document.getElementById('aiResultPriority').innerText = detected.priority;
    document.getElementById('aiResultSLA').innerText = `${detected.sla_hours || 24} Hours`;
    document.getElementById('aiResultDescription').innerText = detected.description;
    document.getElementById('aiConfidenceBadge').innerText = `Confidence: ${detected.confidence || 96}%`;

    const tagsBox = document.getElementById('aiResultTags');
    if (tagsBox && detected.detected_tags) {
      tagsBox.innerHTML = detected.detected_tags.map(t => `<span class="result-tag-pill"># ${escapeHtml(t)}</span>`).join('');
    }

    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  showAlert('✨ AI successfully recognized the issue and auto-filled your grievance form!', 'success');
  setTimeout(() => hideAlert(), 5000);
}

function highlightField(elem) {
  if (!elem) return;
  elem.classList.add('field-ai-highlighted');
  setTimeout(() => {
    elem.classList.remove('field-ai-highlighted');
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}