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
