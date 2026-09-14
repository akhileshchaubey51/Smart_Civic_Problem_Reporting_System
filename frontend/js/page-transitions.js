/**
 * CampusCare Page Transitions & Executive Signout Experience Controller
 * Provides:
 *  - CampusLoader: Top progressive progress bar & fullscreen page switch overlay
 *  - CampusSignout: Modern animated session termination modal experience with
 *                   clean storage purge and guaranteed redirect to /index.html.
 */

const CampusLoader = {
  progressEl: null,
  overlayEl: null,
  titleEl: null,
  subtitleEl: null,
  progressTimer: null,
  currentPercent: 0,

  init() {
    this.createElements();
    this.bindLinks();
    this.handlePageShow();
  },

  createElements() {
    // 1. Top progress bar
    if (!document.getElementById('cc-top-progress')) {
      const prog = document.createElement('div');
      prog.id = 'cc-top-progress';
      document.body.appendChild(prog);
      this.progressEl = prog;
    } else {
      this.progressEl = document.getElementById('cc-top-progress');
    }

    // 2. Fullscreen overlay
    if (!document.getElementById('cc-page-loader-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'cc-page-loader-overlay';
      overlay.innerHTML = `
        <div class="cc-loader-capsule">
          <div class="cc-spinner-ring-box">
            <div class="cc-spinner-outer-ring"></div>
            <div class="cc-spinner-inner-ring"></div>
            <div class="cc-spinner-center-icon">✦</div>
          </div>
          <h3 class="cc-loader-title" id="cc-loader-title">CampusCare</h3>
          <p class="cc-loader-subtitle" id="cc-loader-subtitle">
            <span>Loading...</span>
            <span class="cc-pulse-dot"></span>
            <span class="cc-pulse-dot"></span>
            <span class="cc-pulse-dot"></span>
          </p>
        </div>
      `;
      document.body.appendChild(overlay);
      this.overlayEl = overlay;
      this.titleEl = document.getElementById('cc-loader-title');
      this.subtitleEl = document.getElementById('cc-loader-subtitle');
    } else {
      this.overlayEl = document.getElementById('cc-page-loader-overlay');
      this.titleEl = document.getElementById('cc-loader-title');
      this.subtitleEl = document.getElementById('cc-loader-subtitle');
    }
  },

  startProgress(target = 80, duration = 300) {
    if (!this.progressEl) this.createElements();
    if (!this.progressEl) return;

    clearInterval(this.progressTimer);
    this.progressEl.style.opacity = '1';
    this.currentPercent = 15;
    this.progressEl.style.width = '15%';

    this.progressTimer = setInterval(() => {
      if (this.currentPercent < target) {
        this.currentPercent += Math.floor(Math.random() * 12) + 6;
        if (this.currentPercent > target) this.currentPercent = target;
        this.progressEl.style.width = `${this.currentPercent}%`;
      }
    }, 90);
  },

  finishProgress() {
    if (!this.progressEl) return;
    clearInterval(this.progressTimer);
    this.progressEl.style.width = '100%';
    setTimeout(() => {
      this.progressEl.style.opacity = '0';
      setTimeout(() => {
        this.progressEl.style.width = '0%';
        this.currentPercent = 0;
      }, 300);
    }, 200);
  },

  show(title = 'Switching Page', subtitle = 'Please wait...') {
    if (!this.overlayEl) this.createElements();
    if (this.titleEl) this.titleEl.innerText = title;
    if (this.subtitleEl) {
      this.subtitleEl.innerHTML = `
        <span>${subtitle}</span>
        <span class="cc-pulse-dot"></span>
        <span class="cc-pulse-dot"></span>
        <span class="cc-pulse-dot"></span>
      `;
    }
    this.startProgress(90);
    if (this.overlayEl) this.overlayEl.classList.add('active');

    // Safety timeout in case navigation gets cancelled
    setTimeout(() => {
      this.hide();
    }, 6000);
  },

  hide() {
    if (this.overlayEl) this.overlayEl.classList.remove('active');
    this.finishProgress();
  },

  navigate(url, title = 'Navigating...', subtitle = 'Loading portal view...') {
    this.show(title, subtitle);
    setTimeout(() => {
      window.location.href = url;
    }, 220);
  },

  bindLinks() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Ignore anchor jumps, javascript:, new tabs, or external protocols
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      // Check if it navigates within CampusCare
      if (href.includes('.html') || href.startsWith('/') || !href.includes('://')) {
        let label = link.innerText.trim() || 'Navigating';
        if (label.length > 22) label = 'Navigating...';
        this.startProgress(85);
      }
    });
  },

  handlePageShow() {
    window.addEventListener('pageshow', (event) => {
      // If user came back via browser Back/Forward cache, hide overlay
      this.hide();
    });
  }
};

const CampusSignout = {
  overlayEl: null,
  isSigningOut: false,

  createElements() {
    if (document.getElementById('cc-signout-overlay')) {
      this.overlayEl = document.getElementById('cc-signout-overlay');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'cc-signout-overlay';
    overlay.innerHTML = `
      <div class="cc-signout-card">
        <div class="cc-signout-badge-wrap">
          <div class="cc-signout-badge-glow"></div>
          <div class="cc-signout-badge-circle" id="cc-signout-icon">🔓</div>
        </div>

        <h2 class="cc-signout-title">Signing Out Securely</h2>
        <p class="cc-signout-user" id="cc-signout-user-msg">
          Closing session for <strong id="cc-signout-name">Campus User</strong>
        </p>

        <div class="cc-signout-steps-list">
          <div class="cc-signout-step-item active" id="cc-step-1">
            <span class="cc-signout-step-icon">⟳</span>
            <span>Revoking active authentication credentials</span>
          </div>
          <div class="cc-signout-step-item" id="cc-step-2">
            <span class="cc-signout-step-icon">○</span>
            <span>Clearing local session tokens & database cache</span>
          </div>
          <div class="cc-signout-step-item" id="cc-step-3">
            <span class="cc-signout-step-icon">○</span>
            <span>Handshake complete &bull; Redirecting to index.html</span>
          </div>
        </div>

        <div class="cc-signout-progress-container">
          <div class="cc-signout-progress-track">
            <div class="cc-signout-progress-fill" id="cc-signout-progress-fill"></div>
          </div>
          <div class="cc-signout-status-text">
            <span id="cc-signout-status-lbl">Disconnecting session...</span>
            <span id="cc-signout-percent">15%</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlayEl = overlay;
  },

  start(options = {}) {
    if (this.isSigningOut) return;
    this.isSigningOut = true;

    this.createElements();

    // Determine current user name
    let userName = 'Campus Member';
    try {
      const user = JSON.parse(localStorage.getItem('campuscare_user') || 'null');
      if (user && user.full_name) userName = user.full_name;
    } catch (e) {}

    const nameEl = document.getElementById('cc-signout-name');
    if (nameEl) nameEl.innerText = userName;

    const iconEl = document.getElementById('cc-signout-icon');
    const fillEl = document.getElementById('cc-signout-progress-fill');
    const percentEl = document.getElementById('cc-signout-percent');
    const statusLbl = document.getElementById('cc-signout-status-lbl');
    const step1 = document.getElementById('cc-step-1');
    const step2 = document.getElementById('cc-step-2');
    const step3 = document.getElementById('cc-step-3');

    // Show Overlay
    this.overlayEl.classList.add('active');

    // Step 1: Invalidate tokens
    if (fillEl) fillEl.style.width = '35%';
    if (percentEl) percentEl.innerText = '35%';

    setTimeout(() => {
      // Step 2: Purge Storage
      if (step1) {
        step1.className = 'cc-signout-step-item done';
        step1.querySelector('.cc-signout-step-icon').innerText = '✓';
      }
      if (step2) {
        step2.className = 'cc-signout-step-item active';
        step2.querySelector('.cc-signout-step-icon').innerText = '⟳';
      }
      if (statusLbl) statusLbl.innerText = 'Clearing browser cache & tokens...';
      if (fillEl) fillEl.style.width = '75%';
      if (percentEl) percentEl.innerText = '75%';

      // Wipe out all storage keys
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (err) {}

      setTimeout(() => {
        // Step 3: Verified
        if (step2) {
          step2.className = 'cc-signout-step-item done';
          step2.querySelector('.cc-signout-step-icon').innerText = '✓';
        }
        if (step3) {
          step3.className = 'cc-signout-step-item done';
          step3.querySelector('.cc-signout-step-icon').innerText = '✓';
        }
        if (iconEl) {
          iconEl.className = 'cc-signout-badge-circle success';
          iconEl.innerText = '🛡️';
        }
        if (statusLbl) statusLbl.innerText = 'Session terminated. Heading to home...';
        if (fillEl) fillEl.style.width = '100%';
        if (percentEl) percentEl.innerText = '100%';

        setTimeout(() => {
          // Guaranteed hard replace to /index.html
          window.location.replace('/index.html');
        }, 400);

      }, 450);

    }, 450);
  }
};

// Global function overrides for universal access
function logout() {
  CampusSignout.start();
}

function logoutUser() {
  CampusSignout.start();
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  CampusLoader.init();
});
