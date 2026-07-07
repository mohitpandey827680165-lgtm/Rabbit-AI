/* ============================================================
   HERO: STARFIELD (locked — do not modify)
   ============================================================ */
(function initStarfield() {
  const canvas = document.getElementById('starfield-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, stars = [];
  const STAR_COUNT = 180;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function randBetween(a, b) { return a + Math.random() * (b - a); }
  function createStar() {
    const angle = randBetween(-0.45, 0.45);
    const speed = randBetween(0.18, 0.55);
    return { x: Math.random() * W, y: Math.random() * H, r: randBetween(0.4, 1.8), opacity: randBetween(0.25, 0.78),
      dx: Math.sin(angle) * speed, dy: -Math.cos(angle) * speed,
      color: Math.random() > 0.85 ? 'rgba(196, 181, 253, ' : 'rgba(255, 255, 255, ' };
  }
  function initStars() { stars = []; for (let i = 0; i < STAR_COUNT; i++) stars.push(createStar()); }
  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => {
      const flicker = s.opacity + Math.sin(Date.now() * 0.001 + s.x) * 0.12;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color + Math.max(0.05, Math.min(0.9, flicker)) + ')'; ctx.fill();
      s.x += s.dx; s.y += s.dy;
      if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
      if (s.x < -4) { s.x = W + 4; } if (s.x > W + 4) { s.x = -4; }
    });
    requestAnimationFrame(drawFrame);
  }
  resize(); initStars(); drawFrame();
  window.addEventListener('resize', () => { resize(); initStars(); }, { passive: true });
})();

/* ============================================================
   HERO: HAMBURGER + NAVBAR SCROLL
   ============================================================ */
const hamburger    = document.getElementById('hamburger');
const mobileDrawer = document.getElementById('mobileDrawer');
hamburger.addEventListener('click', () => {
  const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
  hamburger.setAttribute('aria-expanded', String(!isOpen));
  mobileDrawer.setAttribute('aria-hidden',  String(isOpen));
  hamburger.classList.toggle('is-open');
  mobileDrawer.classList.toggle('is-open');
});
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => { navbar.classList.toggle('scrolled', window.scrollY > 20); }, { passive: true });

/* ============================================================
   POST-HERO: SCROLL REVEAL via IntersectionObserver
   ============================================================ */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealObserver(selector, activeClass) {
  if (reducedMotion) {
    document.querySelectorAll(selector).forEach(el => el.classList.add(activeClass || 'in-view'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add(activeClass || 'in-view'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(selector).forEach(el => obs.observe(el));
}

revealObserver('.reveal');
revealObserver('.reveal-card');
revealObserver('.reveal-row');
revealObserver('.reveal-cta');

/* Demo loop observer — adds .is-animating when in view, removes when not */
if (!reducedMotion) {
  const demoObs = new IntersectionObserver((entries) => {
    entries.forEach(e => { e.target.classList.toggle('is-animating', e.isIntersecting); });
  }, { threshold: 0.2 });
  document.querySelectorAll('.demo-frame').forEach(el => demoObs.observe(el));
} else {
  document.querySelectorAll('.demo-frame').forEach(el => el.classList.add('is-animating'));
}

/* ============================================================
   DEMO 1: CREDENTIAL VAULT — chip cycle + slider
   ============================================================ */
(function credVaultDemo() {
  const contacts = [
    { initials: 'GC', name: 'Gorge Chapel', role: 'Founder', email: 'gorge@mail.com', company: 'Chapel LLC' },
    { initials: 'MT', name: 'Mike Tylor',   role: 'Director', email: 'mike@cmb.com',   company: 'CMB LLC' },
    { initials: 'JD', name: 'Jack Daniel',  role: 'CEO',     email: 'jack@xelier.com', company: 'Xelier LLC' },
  ];
  const chips  = document.querySelectorAll('.cred-chip');
  const avatar = document.getElementById('cred-avatar');
  const name   = document.getElementById('cred-name');
  const role   = document.getElementById('cred-role');
  const email  = document.getElementById('cred-email');
  const company= document.getElementById('cred-company');
  const fill   = document.getElementById('cred-fill');
  const thumb  = document.getElementById('cred-thumb');
  if (!fill) return;

  let ci = 0, ki = 0;
  let sliderPct = 0, sliderDir = 1;

  setInterval(() => {
    // Rotate chip
    chips.forEach(c => c.classList.remove('active'));
    ki = (ki + 1) % chips.length;
    chips[ki].classList.add('active');
  }, 2000);

  setInterval(() => {
    // Rotate contact
    ci = (ci + 1) % contacts.length;
    const c = contacts[ci];
    if (avatar)  { avatar.textContent = c.initials; }
    if (name)    { name.textContent   = c.name; }
    if (role)    { role.textContent   = c.role; }
    if (email)   { email.textContent  = c.email; }
    if (company) { company.textContent = c.company; }
  }, 3000);

  setInterval(() => {
    // Advance slider
    sliderPct += sliderDir * 2;
    if (sliderPct >= 100) { sliderPct = 100; sliderDir = -1; }
    if (sliderPct <= 0)   { sliderPct = 0;   sliderDir = 1; }
    fill.style.width  = sliderPct + '%';
    thumb.style.left  = 'calc(' + sliderPct + '% - 5px)';
  }, 120);
})();

/* ============================================================
   DEMO 2: AGENT TYPEWRITER
   ============================================================ */
(function agentTypewriter() {
  const tw     = document.getElementById('agent-typewriter');
  const cursor = document.getElementById('agent-cursor');
  const send   = document.querySelector('.agent-send');
  if (!tw) return;
  const prompts = [
    'Schedule a 30 day content calendar',
    'Book my doctor appointment tomorrow',
    'Order groceries from Blinkit',
  ];
  let pi = 0, ci = 0, typing = true;
  function tick() {
    const p = prompts[pi];
    if (typing) {
      tw.textContent = p.slice(0, ci++);
      if (ci > p.length) {
        typing = false;
        if (send) send.classList.add('agent-send-pulse');
        setTimeout(() => { if (send) send.classList.remove('agent-send-pulse'); typing = false; }, 400);
        setTimeout(() => { typing = false; setTimeout(erase, 1200); }, 600);
        return;
      }
      setTimeout(tick, 55);
    }
  }
  function erase() {
    const p = prompts[pi];
    if (ci > 0) { tw.textContent = p.slice(0, --ci); setTimeout(erase, 28); }
    else { pi = (pi + 1) % prompts.length; typing = true; setTimeout(tick, 500); }
  }
  tick();
  // Tag highlight stagger
  const tags = document.querySelectorAll('.agent-tag');
  let ti = 0;
  setInterval(() => {
    tags.forEach(t => t.classList.remove('tag-active'));
    tags[ti].classList.add('tag-active');
    ti = (ti + 1) % tags.length;
  }, 1100);
})();

/* ============================================================
   DEMO 3: OTP DAY SELECTOR
   ============================================================ */
(function otpDays() {
  const days  = document.querySelectorAll('#otp-days .otp-day');
  const pill  = document.getElementById('otp-pill');
  const event = document.getElementById('otp-event');
  if (!days.length || !pill) return;
  let active = 0;
  function movePill(idx) {
    const day = days[idx];
    if (!day) return;
    const offset = day.offsetLeft;
    pill.style.transform = `translateX(${offset}px)`;
    days.forEach(d => d.classList.remove('otp-day-active'));
    day.classList.add('otp-day-active');
    // Show/hide event
    if (event) event.style.opacity = idx === 6 ? '0' : '1';
  }
  movePill(0);
  setInterval(() => { active = (active + 1) % days.length; movePill(active); }, 1800);
})();

/* ============================================================
   DEMO 4: CHECKOUT — progress + platform cycling + checkmark flash
   ============================================================ */
(function checkoutDemo() {
  const fill      = document.getElementById('checkout-fill');
  const pct       = document.getElementById('checkout-pct');
  const badge1    = document.getElementById('ci-badge-1');
  const badge2    = document.getElementById('ci-badge-2');
  const badge3    = document.getElementById('ci-badge-3');
  const statusWrap= document.getElementById('checkout-status');
  if (!fill) return;

  // Platform cycle labels
  const platforms = ['Amazon', 'Flipkart', 'Blinkit'];
  const badges    = [
    { label: 'Processing', cls: 'ci-processing' },
    { label: '✓ Done',     cls: 'ci-done' },
    { label: 'In Queue',   cls: 'ci-queue' },
  ];
  let platform = 0;
  const label = document.querySelector('.checkout-label');

  // Progress bar fill
  let p = 0, dir = 1;
  const fillInterval = setInterval(() => {
    p += dir * 1.2;
    if (p >= 100) {
      p = 100; dir = -1;
      // Flash checkmark in status area when full
      if (statusWrap) {
        statusWrap.innerHTML = '<span style="color:#4ade80;font-size:1.1rem;font-weight:700;">✓</span>';
        setTimeout(() => {
          statusWrap.innerHTML = '<div class="otp-spinner" style="width:16px;height:16px;border-width:1.5px;"></div>';
          if (!reducedMotion) statusWrap.querySelector('.otp-spinner').style.animation = 'spin 0.9s linear infinite';
        }, 1200);
      }
    }
    if (p <= 0) { p = 0; dir = 1; }
    fill.style.width = Math.round(p) + '%';
    if (pct) pct.textContent = Math.round(p) + '%';
  }, 130);

  // Platform cycling
  setInterval(() => {
    platform = (platform + 1) % platforms.length;
    // Rotate badge states across the 3 items in sequence
    [badge1, badge2, badge3].forEach((b, i) => {
      if (!b) return;
      const idx = (i + platform) % 3;
      b.className = 'ci-badge ' + badges[idx].cls;
      b.textContent = badges[idx].label;
    });
    if (label) {
      label.style.opacity = '0';
      setTimeout(() => {
        if (label) { label.textContent = platforms[platform] + ' Checkout'; label.style.opacity = '1'; }
      }, 200);
    }
  }, 2500);
})();

/* ============================================================
   DEMO 4b: RETAIL PIPELINE — stage cycling with status updates
   ============================================================ */
(function retailPipelineDemo() {
  const stages  = [
    document.getElementById('rs-0'),
    document.getElementById('rs-1'),
    document.getElementById('rs-2'),
    document.getElementById('rs-3'),
  ];
  const statuses = [
    { name: 'Scrape Inventory',    done: '✓ Completed', run: 'Running…', cls_done: 'rs-done', cls_run: 'rs-running' },
    { name: 'Price Comparison',    done: '✓ Completed', run: 'Running…', cls_done: 'rs-done', cls_run: 'rs-running' },
    { name: 'Update Listings',     done: '✓ Completed', run: 'Running…', cls_done: 'rs-done', cls_run: 'rs-running' },
    { name: 'Notify Stakeholders', done: '✓ Completed', run: 'Running…', cls_done: 'rs-done', cls_run: 'rs-running' },
  ];
  if (!stages[0]) return;

  let active = 1; // which stage is currently "running"

  function updateStages() {
    stages.forEach((stage, i) => {
      if (!stage) return;
      const dot    = stage.querySelector('.rs-dot');
      const status = stage.querySelector('.rs-status');
      stage.classList.remove('active');
      if (i < active) {
        // completed
        if (dot)    { dot.className = 'rs-dot'; dot.style.background = '#4ade80'; }
        if (status) { status.className = 'rs-status rs-done'; status.textContent = '✓ Done'; }
      } else if (i === active) {
        // running
        stage.classList.add('active');
        if (dot)    { dot.className = 'rs-dot'; dot.style.background = '#A855F7'; }
        if (status) { status.className = 'rs-status rs-running'; status.textContent = 'Running…'; }
      } else {
        // queued
        if (dot)    { dot.className = 'rs-dot rs-dot-muted'; dot.style.background = ''; }
        if (status) { status.className = 'rs-status rs-queue'; status.textContent = 'Queued'; }
      }
    });
  }

  updateStages();
  setInterval(() => {
    active = (active + 1) % (stages.length + 1);
    if (active === 0) {
      // reset — briefly show all queued before starting again
      stages.forEach(s => {
        if (!s) return;
        s.classList.remove('active');
        const dot = s.querySelector('.rs-dot'); const status = s.querySelector('.rs-status');
        if (dot)    { dot.className = 'rs-dot rs-dot-muted'; dot.style.background = ''; }
        if (status) { status.className = 'rs-status rs-queue'; status.textContent = 'Queued'; }
      });
      setTimeout(() => { active = 0; updateStages(); }, 600);
    } else {
      updateStages();
    }
  }, 2200);
})();

/* ============================================================
   DEMO 5: PROCESS — CHECKLIST SCANNER
   ============================================================ */
(function checklistDemo() {
  const items = document.querySelectorAll('.proc-check-item');
  if (!items.length) return;
  let active = 0;
  function scan() {
    items.forEach(it => it.classList.remove('ci-active'));
    items[active].classList.add('ci-active');
    active = (active + 1) % items.length;
  }
  scan();
  setInterval(scan, 1200);
})();

/* ============================================================
   DEMO 6: PROCESS — CODE SCROLL (CSS animation driven)
   ============================================================ */
// Handled purely via CSS @keyframes on #code-scroll

/* ============================================================
   DEMO 7: CONNECTOR PULSE
   ============================================================ */
// Handled via CSS @keyframes on .conn-pulse

/* ============================================================
   PRICING TOGGLE
   ============================================================ */
(function pricingToggle() {
  const toggle   = document.getElementById('toggle-switch');
  const thumb    = document.getElementById('toggle-thumb');
  const mLabel   = document.getElementById('label-monthly');
  const aLabel   = document.getElementById('label-annually');
  const prices   = document.querySelectorAll('.plan-price');
  if (!toggle) return;
  let annual = false;

  toggle.addEventListener('click', () => {
    annual = !annual;
    toggle.setAttribute('aria-checked', String(annual));
    thumb.classList.toggle('thumb-on', annual);
    mLabel.classList.toggle('active', !annual);
    aLabel.classList.toggle('active', annual);

    prices.forEach(p => {
      const m = p.dataset.monthly;
      const a = p.dataset.annual;
      if (!m || m === 'Custom') return;
      const val = annual ? a : m;
      p.textContent = '$' + val;
      p.classList.add('price-flash');
      setTimeout(() => p.classList.remove('price-flash'), 400);
    });
  });
})();

/* ============================================================
   FAQ ACCORDION
   ============================================================ */
(function faqAccordion() {
  const items = document.querySelectorAll('.accordion-item');
  items.forEach(item => {
    const btn  = item.querySelector('.accordion-btn');
    const body = item.querySelector('.accordion-body');
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      // Close all
      items.forEach(other => {
        const ob = other.querySelector('.accordion-btn');
        const od = other.querySelector('.accordion-body');
        if (ob && od) { ob.setAttribute('aria-expanded', 'false'); od.style.maxHeight = '0'; other.classList.remove('faq-open'); }
      });
      // Open clicked (if it was closed)
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        body.style.maxHeight = body.scrollHeight + 'px';
        item.classList.add('faq-open');
      }
    });
  });
})();

/* ============================================================
   CLINICAL CALENDAR — scanning highlight
   ============================================================ */
(function calendarScan() {
  const cells = document.querySelectorAll('.cal-day:not(.cal-today):not(.cal-highlight)');
  if (!cells.length) return;
  let ci = 0;
  setInterval(() => {
    cells.forEach(c => c.classList.remove('cal-scan'));
    cells[ci].classList.add('cal-scan');
    ci = (ci + 1) % cells.length;
  }, 700);
})();



/* ============================================================
   PREMIUM FOOTER — Newsletter form micro-interaction
   ============================================================ */
(function footerNewsletter() {
  const form = document.querySelector('.footer-newsletter-form');
  const btn  = document.getElementById('footer-subscribe-btn');
  const inp  = document.getElementById('footer-email');
  if (!form || !btn || !inp) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!inp.value.includes('@')) return;
    btn.textContent = '✓ Subscribed';
    btn.style.background = '#22c55e';
    btn.style.boxShadow  = '0 4px 20px rgba(34,197,94,0.3)';
    inp.disabled = true;
    btn.disabled = true;
  });
})();




/* === APPENDED AUTHENTICATION MODULE LOGIC === */
const API_BASE = '/api/auth';
const FETCH_OPTS = { credentials: 'include' };

// Page-load route protection for registration sequence
/* Page-load route protection moved to single-page router */









const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="14" cy="14" r="12" stroke="#7c3aed" stroke-width="1.5"/>
  <circle cx="14" cy="14" r="4.5" stroke="#a78bfa" stroke-width="1.2"/>
  <circle cx="14" cy="14" r="1.8" fill="#7c3aed"/>
  <line x1="14" y1="1" x2="14" y2="6.5" stroke="#7c3aed" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="14" y1="21.5" x2="14" y2="27" stroke="#7c3aed" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="1" y1="14" x2="6.5" y2="14" stroke="#7c3aed" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="21.5" y1="14" x2="27" y2="14" stroke="#7c3aed" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

document.querySelectorAll('.auth-logo').forEach(el => {
  if (!el.querySelector('svg')) {
    el.insertAdjacentHTML('afterbegin', LOGO_SVG);
  }
});

function showError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.add('has-error');

  const group = input.closest('.input-group') || input.parentElement;
  let errorMsg = group.querySelector('.error-message');
  if (!errorMsg) {
    errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    group.appendChild(errorMsg);
  }
  errorMsg.textContent = message;
  errorMsg.classList.add('visible');
}

function clearError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.remove('has-error');
  const group = input.closest('.input-group') || input.parentElement;
  const errorMsg = group && group.querySelector('.error-message');
  if (errorMsg) errorMsg.classList.remove('visible');
}

function clearAllErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.auth-input, .country-select').forEach(input => {
    if (input.id) clearError(input.id);
  });
  const formError = form.querySelector('.form-error');
  if (formError) formError.classList.remove('visible');
}

function setButtonLoading(btn, isLoading, originalText = '') {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Please wait…';
  } else {
    btn.textContent = btn.dataset.originalText || originalText;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildMobileNumber(countryCode, localNumber) {
  const digits = localNumber.replace(/\D/g, '');
  return `${countryCode}${digits}`;
}

function maskMobile(number) {
  if (!number || number.length < 6) return number || '';
  return number.substring(0, 3) + '●●●●●' + number.substring(number.length - 4);
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  return res.json();
}

/* ── Register ── */
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const submitBtn = document.getElementById('submit-btn');
  const fields = ['full_name', 'register_email', 'mobile_local', 'register_password', 'register_confirm_password'];
  const termsToggle = document.getElementById('terms-toggle');
  const termsThumb = document.getElementById('terms-thumb');
  let termsAccepted = false;

  if (termsToggle) {
    termsToggle.addEventListener('click', (e) => {
      e.preventDefault();
      termsAccepted = !termsAccepted;
      termsToggle.setAttribute('aria-checked', String(termsAccepted));
      if (termsThumb) {
        termsThumb.classList.toggle('thumb-on', termsAccepted);
      }
      validateRegisterForm();
    });
  }

  function validateRegisterForm() {
    clearAllErrors('register-form');
    let valid = true;

    const fullName = document.getElementById('full_name').value.trim();
    const email = document.getElementById('register_email').value.trim();
    const countryCode = document.getElementById('country_code').value;
    const mobileLocal = document.getElementById('mobile_local').value.trim();
    const password = document.getElementById('register_password').value;
    const confirmPassword = document.getElementById('register_confirm_password').value;
    const mobile = buildMobileNumber(countryCode, mobileLocal);

    if (!fullName) {
      showError('full_name', 'Full Name is required.');
      valid = false;
    }
    if (!email || !isValidEmail(email)) {
      showError('email', 'Enter a valid email address.');
      valid = false;
    }
    if (!mobileLocal || mobile.length < 8) {
      showError('mobile_local', 'Enter a valid mobile number.');
      valid = false;
    }
    if (!password || password.length < 8) {
      showError('create_password', 'Password must be at least 8 characters.');
      valid = false;
    }
    if (confirmPassword && password !== confirmPassword) {
      showError('create_confirm_password', 'Passwords do not match.');
      valid = false;
    } else if (!confirmPassword) {
      valid = false;
    }

    if (!termsAccepted) {
      valid = false;
    }

    if (submitBtn) submitBtn.disabled = !valid;
    return valid ? { full_name: fullName, email, mobile_number: mobile, password, confirm_password: confirmPassword } : null;
  }

  // Bind real-time input validation on both 'input' and 'blur'
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', validateRegisterForm);
      el.addEventListener('blur', validateRegisterForm);
    }
  });
  // Custom dropdown event handlers for country code select
  const trigger = document.getElementById('country_trigger');
  const menu = document.getElementById('country_menu');
  const hiddenInput = document.getElementById('country_code');
  const valueSpan = document.getElementById('selected_country_value');
  
  if (trigger && menu) {
    const items = menu.querySelectorAll('.dropdown-item');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('visible');
      trigger.classList.toggle('active');
      trigger.setAttribute('aria-expanded', String(menu.classList.contains('visible')));
    });

    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-value');
        if (hiddenInput) {
          hiddenInput.value = val;
          validateRegisterForm();
        }
        if (valueSpan) valueSpan.textContent = val;
        
        items.forEach(i => {
          i.classList.remove('selected');
          i.setAttribute('aria-selected', 'false');
        });
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        
        menu.classList.remove('visible');
        trigger.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', () => {
      menu.classList.remove('visible');
      trigger.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  // Password strength meter updates in real-time
  const pwdInput = document.getElementById('register_password');
  if (pwdInput) {
    pwdInput.addEventListener('input', () => {
      const val = pwdInput.value;
      const meter = document.getElementById('register_pwd_strength');
      if (meter) {
        meter.className = 'pwd-strength';
        if (val.length >= 8) {
          const strong = /[A-Z]/.test(val) && /[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val);
          meter.classList.add(strong ? 'strength-strong' : 'strength-medium');
        } else if (val.length > 0) {
          meter.classList.add('strength-weak');
        }
      }
    });
  }

  validateRegisterForm();

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = validateRegisterForm();
    if (!payload) return;

    setButtonLoading(submitBtn, true);
    try {
      const data = await apiPost('/register', payload);
      if (data.success) {
        sessionStorage.setItem('wp_register_email', payload.email);
        alert('Account created successfully!');
        window.location.hash = '#login';
      } else {
        const field = data.error && data.error.field;
        const details = data.error && data.error.details;
        if (details) {
          Object.entries(details).forEach(([key, msg]) => showError(key === 'mobile_number' ? 'mobile_local' : (key === 'email' ? 'register_email' : (key === 'password' ? 'register_password' : key)), msg));
        } else if (field) {
          showError(field === 'mobile_number' ? 'mobile_local' : (field === 'email' ? 'register_email' : (field === 'password' ? 'register_password' : field)), data.error.message);
        } else {
          showError('register_email', data.error.message || 'Registration failed.');
        }
      }
    } catch {
      // Friendly simulation fallback for static server preview (port 3000)
      setTimeout(() => {
        setButtonLoading(submitBtn, false, 'Create Account');
        alert('Registration Simulated Successfully! (Static Preview Demo)');
        window.location.hash = '#login';
      }, 1500);
    }
  });
}

/* ── OTP Verification ── */
const otpGroup = document.getElementById('otp-group');
if (otpGroup) {
  const inputs = otpGroup.querySelectorAll('.otp-input');
  const verifyBtn = document.getElementById('verify-btn');
  const resendTimer = document.getElementById('resend-timer');
  const resendBtn = document.getElementById('resend-btn');
  let countdown = 45;
  let timerId = null;

  const mobileDisplay = document.getElementById('mobile-display');
  const savedMobile = sessionStorage.getItem('wp_register_mobile');
  if (mobileDisplay && savedMobile) {
    mobileDisplay.textContent = maskMobile(savedMobile);
  }

  window.startCountdown = function() {
    countdown = 45;
    if (resendBtn) resendBtn.classList.add('disabled');
    if (resendTimer) resendTimer.textContent = `Resend OTP in 00:${String(countdown).padStart(2, '0')}`;
    clearInterval(timerId);
    timerId = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timerId);
        if (resendTimer) resendTimer.textContent = '';
        if (resendBtn) resendBtn.classList.remove('disabled');
        return;
      }
      if (resendTimer) resendTimer.textContent = `Resend OTP in 00:${String(countdown).padStart(2, '0')}`;
    }, 1000);
  }

  /* startCountdown() triggered by router */

  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
      if (e.target.value && index < inputs.length - 1) inputs[index + 1].focus();
      checkOtpComplete();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) inputs[index - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      pasted.split('').forEach((ch, i) => { if (inputs[i]) inputs[i].value = ch; });
      checkOtpComplete();
      if (pasted.length === 6) inputs[5].focus();
    });
  });

  function checkOtpComplete() {
    const allFilled = Array.from(inputs).every(i => i.value !== '');
    if (verifyBtn) verifyBtn.disabled = !allFilled;
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (resendBtn.classList.contains('disabled')) return;
      const challenge_id = sessionStorage.getItem('wp_challenge_id');
      if (!challenge_id) {
        window.location.hash = '#register';
        return;
      }
      try {
        const data = await apiPost('/resend-otp', { challenge_id });
        if (data.success) {
          /* startCountdown() triggered by router */
          const err = document.getElementById('otp-error');
          if (err) err.classList.remove('visible');
        } else {
          alert(data.error.message || 'Could not resend OTP.');
        }
      } catch {
        alert('Network error.');
      }
    });
  }

  document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = Array.from(inputs).map(i => i.value).join('');
    const challenge_id = sessionStorage.getItem('wp_challenge_id');

    if (!challenge_id) {
      window.location.hash = '#register';
      return;
    }

    setButtonLoading(verifyBtn, true);
    try {
      const data = await apiPost('/verify-otp', { challenge_id, otp });
      if (data.success) {
        sessionStorage.setItem('wp_setup_token', data.setup_token);
        window.location.hash = '#create-password';
      } else {
        otpGroup.classList.remove('shake');
        void otpGroup.offsetWidth;
        otpGroup.classList.add('shake');

        let errorMsg = document.getElementById('otp-error');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.id = 'otp-error';
          errorMsg.className = 'error-message visible';
          errorMsg.style.textAlign = 'center';
          otpGroup.parentNode.insertBefore(errorMsg, otpGroup.nextSibling);
        }
        errorMsg.textContent = data.error.message;
        errorMsg.classList.add('visible');

        inputs.forEach(i => { i.value = ''; });
        inputs[0].focus();
        checkOtpComplete();
      }
    } catch {
      alert('Network error.');
    } finally {
      setButtonLoading(verifyBtn, false, 'Verify');
    }
  });
}

/* ── Password Creation ── */
const createPwdForm = document.getElementById('create-password-form');
if (createPwdForm) {
  const pwdInput = document.getElementById('create_password');
  const confirmInput = document.getElementById('create_confirm_password');
  const submitBtn = createPwdForm.querySelector('button[type="submit"]');

  function validatePasswords() {
    clearError('create_password');
    clearError('create_confirm_password');
    let valid = true;

    if (pwdInput.value.length > 0 && pwdInput.value.length < 8) {
      showError('create_password', 'Password must be at least 8 characters.');
      valid = false;
    }
    if (confirmInput.value.length > 0 && pwdInput.value !== confirmInput.value) {
      showError('create_confirm_password', 'Passwords do not match.');
      valid = false;
    }

    if (submitBtn) {
      submitBtn.disabled = !(valid && pwdInput.value.length >= 8 && pwdInput.value === confirmInput.value);
    }
    return valid;
  }

  pwdInput.addEventListener('input', () => {
    validatePasswords();
    const val = pwdInput.value;
    const meter = document.getElementById('register_pwd_strength');
    if (meter) {
      meter.className = 'pwd-strength';
      if (val.length >= 8) {
        const strong = /[A-Z]/.test(val) && /[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val);
        meter.classList.add(strong ? 'strength-strong' : 'strength-medium');
      } else if (val.length > 0) {
        meter.classList.add('strength-weak');
      }
    }
  });
  confirmInput.addEventListener('input', validatePasswords);
  validatePasswords();

  createPwdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validatePasswords()) return;

    const setup_token = sessionStorage.getItem('wp_setup_token');
    if (!setup_token) {
      window.location.hash = '#register';
      return;
    }

    setButtonLoading(submitBtn, true);
    try {
      const data = await apiPost('/create-password', {
        setup_token,
        password: pwdInput.value,
        confirm_password: confirmInput.value
      });

      if (data.success) {
        // Proceed to login page instead of auto-logging in, to follow the exact registration sequence.
        sessionStorage.removeItem('wp_challenge_id');
        sessionStorage.removeItem('wp_register_mobile');
        sessionStorage.removeItem('wp_setup_token');
        window.location.hash = '#login';
      } else {
        const field = data.error && data.error.field;
        showError(field === 'password' ? 'create_password' : (field === 'confirm_password' ? 'create_confirm_password' : (field || 'create_password')), data.error.message || 'Could not create account.');
      }
    } catch {
      showError('create_password', 'Network error.');
    } finally {
      setButtonLoading(submitBtn, false, 'Complete Account');
    }
  });
}

/* ── Login ── */
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors('login-form');

    const identifier = document.getElementById('identifier').value.trim();
    const email = document.getElementById('register_email').value.trim();
    const password = document.getElementById('register_password').value;

    let valid = true;
    if (!identifier) { showError('identifier', 'Required'); valid = false; }
    if (!email) { showError('login_email', 'Required'); valid = false; }
    if (!password) { showError('login_password', 'Required'); valid = false; }
    if (!valid) return;

    const btn = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(btn, true);

    try {
      const data = await apiPost('/login', { identifier, email, password });
      if (data.success) {
        window.location.hash = '#choose-experience';
      } else {
        let formError = loginForm.querySelector('.form-error');
        if (!formError) {
          formError = document.createElement('div');
          formError.className = 'form-error';
          loginForm.insertBefore(formError, loginForm.firstChild);
        }
        formError.textContent = data.error.message;
        formError.classList.add('visible');
      }
    } catch {
      // Support simulation redirect for static server preview (port 3000)
      setTimeout(() => {
        setButtonLoading(btn, false, 'Sign In');
        window.location.hash = '#choose-experience';
      }, 1000);
    } finally {
      if (typeof data !== 'undefined') {
        setButtonLoading(btn, false, 'Sign In');
      }
    }
  });
}

/* ── Password toggle ── */
document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.getElementById(btn.getAttribute('data-target'));
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  });
});

/* ── Chat placeholder ── */
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    window.location.hash = '#login';
  });
}

const chatMenuBtn = document.getElementById('chat-menu-btn');
const chatSidebar = document.getElementById('chat-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
if (chatMenuBtn && chatSidebar) {
  const toggleSidebar = (open) => {
    chatSidebar.classList.toggle('open', open);
    if (sidebarBackdrop) sidebarBackdrop.classList.toggle('visible', open);
  };
  chatMenuBtn.addEventListener('click', () => toggleSidebar(!chatSidebar.classList.contains('open')));
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
}

const chatForm = document.getElementById('chat-form');
if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    const history = document.getElementById('chat-history');
    const empty = history.querySelector('.chat-empty');
    if (empty) empty.remove();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.textContent = text;
    history.appendChild(bubble);

    input.value = '';
    history.scrollTop = history.scrollHeight;
  });
}


window.loadChatUser = function() {
  if (document.getElementById('user-display-name')) {
    fetch(`${API_BASE}/me`, FETCH_OPTS)
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          document.getElementById('user-display-name').textContent = "Mohit Pandey";
          return;
        }
        document.getElementById('user-display-name').textContent = data.user.display_name;
      })
      .catch(() => {
        document.getElementById('user-display-name').textContent = "Mohit Pandey";
      });
  }
};


/* ============================================================
   EXPERIENCE SELECTION COMPONENT (from choose-experience.html)
   ============================================================ */
class ExperienceSelectionCard {
  constructor({ title, subtitle, description, icon, cta, route }) {
    this.title = title;
    this.subtitle = subtitle;
    this.description = description;
    this.icon = icon;
    this.cta = cta;
    this.route = route;
  }

  render(container) {
    const card = document.createElement('div');
    card.className = 'experience-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Select ${this.title} experience`);

    card.innerHTML = `
      <div class="experience-icon">${this.icon}</div>
      <h2 class="experience-card-title">${this.title}</h2>
      <div class="experience-card-subtitle">${this.subtitle}</div>
      <p class="experience-card-desc">${this.description}</p>
      <button class="btn-primary" tabindex="-1">${this.cta}</button>
    `;

    const handleSelect = () => {
      // Play Selection Animation
      card.classList.add('selected');
      
      // Disable interaction across both cards
      document.querySelectorAll('.experience-card').forEach(c => {
        c.style.pointerEvents = 'none';
      });

      // Update CTA to show loading status
      const btn = card.querySelector('.btn-primary');
      if (btn) {
        btn.textContent = 'Launching Workspace…';
        btn.style.opacity = '0.8';
      }

      // Navigate after completion of selection/loading transition
      setTimeout(() => {
        window.location.hash = this.route;
      }, 1200);
    };

    card.addEventListener('click', handleSelect);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    });

    container.appendChild(card);
  }
}

window.renderExperienceCards = function() {
  const container = document.getElementById('experience-grid-container');
  if (!container) return;
  
  // Only render if empty to prevent duplication on multiple visits
  if (container.children.length > 0) return;

  const businessWorkspace = new ExperienceSelectionCard({
    title: 'Business Solutions',
    subtitle: 'Designed for organizations, startups, enterprises, managers, analysts, and business teams.',
    description: 'Access AI-powered Business Intelligence dashboards, upload CSV/Excel files, generate KPIs, analyze trends, receive intelligent recommendations, and forecast business performance.',
    cta: 'Continue to Business Workspace',
    route: '#business',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>`
  });

  const consumerWorkspace = new ExperienceSelectionCard({
    title: 'Consumer Solutions',
    subtitle: 'Designed for students, professionals, creators, and everyday users.',
    description: 'Use WEBPILOT OS as your intelligent AI assistant for conversations, productivity, research, automation, voice interaction, and daily tasks.',
    cta: 'Continue to Consumer Workspace',
    route: '#chat',
    icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      <path d="M2 12h20"></path>
    </svg>`
  });

  businessWorkspace.render(container);
  consumerWorkspace.render(container);
};


/* ============================================================
   BUSINESS DASHBOARD FILE UPLOADER LOGIC (from business.html)
   ============================================================ */
function initBusinessDashboardUploader() {
  const uploader = document.getElementById('file-uploader');
  const fileInput = document.getElementById('file-input');
  const uploaderText = document.getElementById('uploader-text');
  if (!uploader || !fileInput || !uploaderText) return;

  // Remove existing listeners to avoid multiple attachments
  const newUploader = uploader.cloneNode(true);
  uploader.parentNode.replaceChild(newUploader, uploader);

  const newFileInput = fileInput.cloneNode(true);
  fileInput.parentNode.replaceChild(newFileInput, fileInput);

  newUploader.addEventListener('click', () => {
    newFileInput.click();
  });

  newFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploaderText.textContent = `✓ Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      uploaderText.style.color = '#a78bfa';
    }
  });

  newUploader.addEventListener('dragover', (e) => {
    e.preventDefault();
    newUploader.style.borderColor = '#8b5cf6';
  });

  newUploader.addEventListener('dragleave', () => {
    newUploader.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });

  newUploader.addEventListener('drop', (e) => {
    e.preventDefault();
    newUploader.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    const file = e.dataTransfer.files[0];
    if (file) {
      uploaderText.textContent = `✓ Uploaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      uploaderText.style.color = '#a78bfa';
    }
  });
}


/* ============================================================
   SINGLE PAGE APPLICATION ROUTER (Hash-Based)
   ============================================================ */
function handleHashChange() {
  const hash = window.location.hash || '#';
  
  // 1. Dynamic route protection for registration sequence
  if (hash === '#verify-otp') {
    if (!sessionStorage.getItem('wp_challenge_id')) {
      window.location.hash = '#register';
      return;
    }
  } else if (hash === '#create-password') {
    if (!sessionStorage.getItem('wp_setup_token')) {
      window.location.hash = '#register';
      return;
    }
  }
  
  // 2. Hide all view containers
  const viewIds = [
    'landing-view',
    'login-view',
    'register-view',
    'verify-otp-view',
    'create-password-view',
    'choose-experience-view',
    'business-view',
    'chat-view'
  ];
  viewIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // 3. Remove all page-level classes from body
  document.body.classList.remove('auth-page', 'business-page', 'chat-page');
  
  // 4. Route matching and rendering
  if (hash === '#' || hash === '#home' || hash === '') {
    const landing = document.getElementById('landing-view');
    if (landing) landing.style.display = 'block';
  } else if (hash === '#login') {
    document.body.classList.add('auth-page');
    const login = document.getElementById('login-view');
    if (login) login.style.display = 'block';
    clearAllErrors('login-form');
  } else if (hash === '#register') {
    document.body.classList.add('auth-page');
    const register = document.getElementById('register-view');
    if (register) register.style.display = 'block';
    clearAllErrors('register-form');
  } else if (hash === '#verify-otp') {
    document.body.classList.add('auth-page');
    const otp = document.getElementById('verify-otp-view');
    if (otp) otp.style.display = 'block';
    // Update phone display
    const mobileDisplay = document.getElementById('mobile-display');
    const savedMobile = sessionStorage.getItem('wp_register_mobile');
    if (mobileDisplay && savedMobile) {
      mobileDisplay.textContent = maskMobile(savedMobile);
    }
    if (typeof window.startCountdown === 'function') {
      window.startCountdown();
    }
  } else if (hash === '#create-password') {
    document.body.classList.add('auth-page');
    const createPwd = document.getElementById('create-password-view');
    if (createPwd) createPwd.style.display = 'block';
    clearAllErrors('create-password-form');
  } else if (hash === '#choose-experience') {
    document.body.classList.add('auth-page');
    const chooseExp = document.getElementById('choose-experience-view');
    if (chooseExp) chooseExp.style.display = 'block';
    if (typeof window.renderExperienceCards === 'function') {
      window.renderExperienceCards();
    }
  } else if (hash === '#business') {
    document.body.classList.add('business-page');
    const business = document.getElementById('business-view');
    if (business) business.style.display = 'block';
    initBusinessDashboardUploader();
  } else if (hash === '#chat') {
    document.body.classList.add('chat-page');
    const chat = document.getElementById('chat-view');
    if (chat) chat.style.display = 'block';
    if (typeof window.loadChatUser === 'function') {
      window.loadChatUser();
    }
  }
}

// Attach event listeners for routing
window.addEventListener('hashchange', handleHashChange);
window.addEventListener('DOMContentLoaded', handleHashChange);


/* ============================================================
   RABBIT AI DASHBOARD INTERACTIONS (Consumer Workspace)
   ============================================================ */
function initRabbitDashboard() {
  const rabbitMenuToggle = document.getElementById('rabbit-menu-toggle');
  const rabbitSidebar = document.getElementById('rabbit-sidebar');
  const rabbitSidebarBackdrop = document.getElementById('rabbit-sidebar-backdrop');
  const rabbitCloseSidebar = document.getElementById('rabbit-close-sidebar');

  if (rabbitMenuToggle && rabbitSidebar && rabbitSidebarBackdrop) {
    const toggleSidebar = (open) => {
      rabbitSidebar.classList.toggle('open', open);
      rabbitSidebarBackdrop.classList.toggle('visible', open);
    };
    rabbitMenuToggle.addEventListener('click', () => toggleSidebar(true));
    rabbitSidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
    if (rabbitCloseSidebar) {
      rabbitCloseSidebar.addEventListener('click', () => toggleSidebar(false));
    }
  }

  const modelTrigger = document.getElementById('rabbit-model-trigger');
  const modelMenu = document.getElementById('rabbit-model-menu');
  if (modelTrigger && modelMenu) {
    modelTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      modelMenu.classList.toggle('visible');
      modelTrigger.classList.toggle('active');
    });

    const modelItems = modelMenu.querySelectorAll('.rabbit-model-item');
    modelItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        modelItems.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        modelTrigger.querySelector('span').textContent = item.getAttribute('data-model');
        modelMenu.classList.remove('visible');
        modelTrigger.classList.remove('active');
      });
    });

    document.addEventListener('click', () => {
      modelMenu.classList.remove('visible');
      modelTrigger.classList.remove('active');
    });
  }

  const chatInputField = document.getElementById('rabbit-chat-input-field');
  const chips = document.querySelectorAll('.rabbit-chip');
  const cards = document.querySelectorAll('.rabbit-card');
  const contentContainer = document.getElementById('rabbit-content-container');

  const prefillInput = (promptText) => {
    if (chatInputField) {
      chatInputField.value = promptText;
      chatInputField.focus();
    }
  };

  chips.forEach(c => {
    c.addEventListener('click', () => {
      prefillInput(c.getAttribute('data-prompt'));
    });
  });

  cards.forEach(card => {
    card.addEventListener('click', () => {
      prefillInput(card.getAttribute('data-prompt'));
    });
  });

  // Focus Mode listeners (Apple-like smooth transforms and glows)
  if (chatInputField && contentContainer) {
    chatInputField.addEventListener('focus', () => {
      if (!contentContainer.classList.contains('chat-active')) {
        contentContainer.classList.add('focus-mode');
      }
    });

    chatInputField.addEventListener('blur', () => {
      setTimeout(() => {
        if (!contentContainer.classList.contains('chat-active')) {
          contentContainer.classList.remove('focus-mode');
        }
      }, 180); // Small delay to prevent layout jump when clicking chips/buttons
    });
  }

  const chatForm = document.getElementById('rabbit-chat-input-form');
  const chatHistory = document.getElementById('rabbit-chat-history');
  const welcomeLayout = document.getElementById('rabbit-welcome-layout');
  const cardsGrid = document.getElementById('rabbit-cards-grid');

  if (chatForm && chatHistory) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInputField.value.trim();
      if (!text) return;

      // Deactivate focus mode
      if (contentContainer) {
        contentContainer.classList.remove('focus-mode');
      }
      chatInputField.blur();

      // Show chat history container
      chatHistory.style.display = 'flex';
      
      // Force layout reflow so the transition animations execute smoothly
      void chatHistory.offsetWidth;

      // Add chat active class to trigger smooth transition out of welcome and cards layout
      if (contentContainer) {
        contentContainer.classList.add('chat-active');
      }

      // Add user bubble to chat history view
      const userBubble = document.createElement('div');
      userBubble.className = 'rabbit-bubble user';
      userBubble.textContent = text;
      chatHistory.appendChild(userBubble);

      chatInputField.value = '';
      chatHistory.scrollTop = chatHistory.scrollHeight;
    });
  }

  const upgradeBtn = document.getElementById('rabbit-upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      alert("Premium upgrade simulation activated! Seamless automation pipelines are ready.");
    });
  }

  const newChatBtn = document.getElementById('rabbit-new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      if (contentContainer) {
        contentContainer.classList.remove('chat-active');
        contentContainer.classList.remove('focus-mode');
      }

      if (chatHistory) {
        chatHistory.innerHTML = "";
        chatHistory.style.display = 'none';
      }

      // Re-enable welcome layouts
      if (welcomeLayout) welcomeLayout.style.display = 'flex';
      if (cardsGrid) cardsGrid.style.display = 'grid';
      if (chatInputField) chatInputField.value = "";
    });
  }
}

// Hook dashboard initialization into router view state
const originalHandleHashChange = window.handleHashChange;
window.handleHashChange = function() {
  originalHandleHashChange();
  if (window.location.hash === '#chat') {
    initRabbitDashboard();
  }
};
