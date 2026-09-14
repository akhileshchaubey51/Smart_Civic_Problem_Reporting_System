/**
 * CampusCare Landing Page Controller
 * KIET Smart Civic Problem Reporting System
 */

// 1. Navigation Redirect to Login
function goToLogin() {
  if (typeof CampusLoader !== 'undefined' && CampusLoader.navigate) {
    CampusLoader.navigate('/login', 'Opening Login Portal', 'Redirecting to official KIET account authentication...');
  } else {
    window.location.href = '/login';
  }
}

// 2. Open Login Required Modal
function loginRequired(issueCategory = '') {
  const token = localStorage.getItem('campuscare_token');
  if (token) {
    // If user is already authenticated, take them directly to the grievance lodge form
    const targetUrl = `/complaint-form?category=${encodeURIComponent(issueCategory || '')}`;
    if (typeof CampusLoader !== 'undefined' && CampusLoader.navigate) {
      CampusLoader.navigate(targetUrl, 'Loading Grievance Desk', `Preparing ${issueCategory || 'Campus'} reporting form...`);
    } else {
      window.location.href = targetUrl;
    }
    return;
  }

  if (issueCategory) {
    sessionStorage.setItem('pending_complaint_category', issueCategory);
  }

  const modal = document.getElementById('loginPopup');
  if (!modal) return;

  const descElement = document.getElementById('loginPopupDesc');
  if (descElement) {
    if (issueCategory) {
      descElement.innerHTML = `Please login with your official college ID to report <strong>${issueCategory}</strong>.`;
    } else {
      descElement.innerText = 'Please login with your college ID to report a campus issue.';
    }
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

// 3. Close Login Required Modal
function closeLoginPopup() {
  const modal = document.getElementById('loginPopup');
  if (!modal) return;

  modal.classList.remove('active');
  document.body.style.overflow = ''; // Restore background scrolling
}

// Close modal when clicking on backdrop
window.addEventListener('click', function (e) {
  const modal = document.getElementById('loginPopup');
  if (modal && e.target === modal) {
    closeLoginPopup();
  }
});

// Close modal on 'Escape' key
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeLoginPopup();
  }
});

// 4. Smooth Anchor Link Scrolling & Active Nav Highlighting
document.addEventListener('DOMContentLoaded', function () {
  const navLinks = document.querySelectorAll('.nav-link[href^="#"], .dropdown-item[href^="#"]');
  
  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 70;
          const announcementHeight = document.querySelector('.announcement')?.offsetHeight || 40;
          const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - (navbarHeight + announcementHeight - 10);
          
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });

          // Close mobile navbar collapse if open
          const navbarCollapse = document.getElementById('navbarContent');
          if (navbarCollapse && navbarCollapse.classList.contains('show')) {
            const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
            if (bsCollapse) bsCollapse.hide();
          }
        }
      }
    });
  });

  // Marquee Continuous Pause on Hover
  const marquee = document.querySelector('.marquee-container');
  if (marquee) {
    marquee.addEventListener('mouseenter', () => {
      const content = marquee.querySelectorAll('.marquee-content');
      content.forEach(c => c.style.animationPlayState = 'paused');
    });
    marquee.addEventListener('mouseleave', () => {
      const content = marquee.querySelectorAll('.marquee-content');
      content.forEach(c => c.style.animationPlayState = 'running');
    });
  }
});
