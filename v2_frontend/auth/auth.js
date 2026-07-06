const API_BASE = '/api/auth';
const FETCH_OPTS = { credentials: 'include' };

// Page-load route protection for registration sequence
if (window.location.pathname === '/verify-otp') {
  if (!sessionStorage.getItem('wp_challenge_id')) {
    window.location.href = '/register';
  }
} else if (window.location.pathname === '/create-password') {
  if (!sessionStorage.getItem('wp_setup_token')) {
    window.location.href = '/register';
  }
}

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
  const submitBtn = registerForm.querySelector('button[type="submit"]');
  const fields = ['full_name', 'mobile_local', 'email'];

  function validateRegisterForm() {
    clearAllErrors('register-form');
    let valid = true;

    const fullName = document.getElementById('full_name').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const countryCode = document.getElementById('country_code').value;
    const mobileLocal = document.getElementById('mobile_local').value.trim();
    const email = document.getElementById('email').value.trim();
    const mobile = buildMobileNumber(countryCode, mobileLocal);

    if (!fullName) {
      showError('full_name', 'Full Name is required.');
      valid = false;
    }
    if (!mobileLocal || mobile.length < 8) {
      showError('mobile_local', 'Enter a valid mobile number.');
      valid = false;
    }
    if (!email || !isValidEmail(email)) {
      showError('email', 'Enter a valid email address.');
      valid = false;
    }
    if (nickname && nickname.length > 50) {
      showError('nickname', 'Nickname is too long.');
      valid = false;
    }

    if (submitBtn) submitBtn.disabled = !valid;
    return valid ? { full_name: fullName, nickname, mobile_number: mobile, email } : null;
  }

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateRegisterForm);
  });
  const nickEl = document.getElementById('nickname');
  if (nickEl) nickEl.addEventListener('input', validateRegisterForm);
  const ccEl = document.getElementById('country_code');
  if (ccEl) ccEl.addEventListener('change', validateRegisterForm);
  validateRegisterForm();

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = validateRegisterForm();
    if (!payload) return;

    setButtonLoading(submitBtn, true);
    try {
      const data = await apiPost('/register', payload);
      if (data.success) {
        sessionStorage.setItem('wp_challenge_id', data.challenge_id);
        sessionStorage.setItem('wp_register_mobile', payload.mobile_number);
        window.location.href = '/verify-otp';
      } else {
        const field = data.error && data.error.field;
        const details = data.error && data.error.details;
        if (details) {
          Object.entries(details).forEach(([key, msg]) => showError(key === 'mobile_number' ? 'mobile_local' : key, msg));
        } else if (field) {
          showError(field === 'mobile_number' ? 'mobile_local' : field, data.error.message);
        } else {
          showError('email', data.error.message || 'Registration failed.');
        }
      }
    } catch {
      showError('email', 'Network error. Please try again.');
    } finally {
      setButtonLoading(submitBtn, false, 'Continue');
      validateRegisterForm();
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

  function startCountdown() {
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

  startCountdown();

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
        window.location.href = '/register';
        return;
      }
      try {
        const data = await apiPost('/resend-otp', { challenge_id });
        if (data.success) {
          startCountdown();
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
      window.location.href = '/register';
      return;
    }

    setButtonLoading(verifyBtn, true);
    try {
      const data = await apiPost('/verify-otp', { challenge_id, otp });
      if (data.success) {
        sessionStorage.setItem('wp_setup_token', data.setup_token);
        window.location.href = '/create-password';
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
  const pwdInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm_password');
  const submitBtn = createPwdForm.querySelector('button[type="submit"]');

  function validatePasswords() {
    clearError('password');
    clearError('confirm_password');
    let valid = true;

    if (pwdInput.value.length > 0 && pwdInput.value.length < 8) {
      showError('password', 'Password must be at least 8 characters.');
      valid = false;
    }
    if (confirmInput.value.length > 0 && pwdInput.value !== confirmInput.value) {
      showError('confirm_password', 'Passwords do not match.');
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
    const meter = document.getElementById('pwd-strength');
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
      window.location.href = '/register';
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
        window.location.href = '/login';
      } else {
        const field = data.error && data.error.field;
        showError(field || 'password', data.error.message || 'Could not create account.');
      }
    } catch {
      showError('password', 'Network error.');
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
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    let valid = true;
    if (!identifier) { showError('identifier', 'Required'); valid = false; }
    if (!email) { showError('email', 'Required'); valid = false; }
    if (!password) { showError('password', 'Required'); valid = false; }
    if (!valid) return;

    const btn = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(btn, true);

    try {
      const data = await apiPost('/login', { identifier, email, password });
      if (data.success) {
        window.location.href = '/chat';
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
      showError('identifier', 'Network error.');
    } finally {
      setButtonLoading(btn, false, 'Sign In');
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
    window.location.href = '/login';
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

if (document.getElementById('user-display-name')) {
  fetch(`${API_BASE}/me`, FETCH_OPTS)
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        window.location.href = '/login';
        return;
      }
      document.getElementById('user-display-name').textContent = data.user.display_name;
    })
    .catch(() => {
      window.location.href = '/login';
    });
}
