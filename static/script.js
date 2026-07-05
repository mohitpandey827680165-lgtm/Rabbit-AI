// ── Global HTML escape utility (used by top-level automation card renderers) ──
function escHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}



function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN')) 
                   || voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium')))
                   || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
}

let chatDatabase = JSON.parse(localStorage.getItem('webpilot_chats_db')) || {};
        let currentActiveChatId = null;

        function saveDatabase() {
            localStorage.setItem('webpilot_chats_db', JSON.stringify(chatDatabase));
            renderSidebar();
        }

        // ── Phase D helpers: fire-and-forget SQLite sync ──────────────
        const DB_BASE = '';

        async function wpDbCreateSession(id, title) {
            try {
                await fetch(`${DB_BASE}/api/session/create`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ id, title })
                });
            } catch(e) { /* silent fail — localStorage is primary */ }
        }

        async function wpDbSaveMessage(sessionId, role, type, content) {
            try {
                await fetch(`${DB_BASE}/api/session/${sessionId}/message`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ role, type, content })
                });
            } catch(e) { /* silent fail */ }
        }

        async function wpDbLoadSessions() {
            try {
                const res  = await fetch(`${DB_BASE}/api/session/list`);
                const data = await res.json();
                if (!data.ok) return;
                // Merge SQLite sessions into localStorage cache (localStorage wins for content)
                data.sessions.forEach(s => {
                    if (!chatDatabase[s.id]) {
                        chatDatabase[s.id] = { id: s.id, title: s.title, messages: [], updatedAt: s.updated_at, _sqliteOnly: true };
                    }
                });
                saveDatabase();
            } catch(e) { /* offline — use localStorage only */ }
        }

        async function wpDbLoadMessages(sessionId) {
            try {
                const res  = await fetch(`${DB_BASE}/api/session/${sessionId}/messages`);
                const data = await res.json();
                if (!data.ok) return [];
                return data.messages;   // [{role, type, content}]
            } catch(e) { return []; }
        }

        function startNewChat() {
            currentActiveChatId = null;
            document.getElementById('jsonOutput').innerHTML = `
                <div id="chatPlaceholder" style="text-align:center;padding-bottom:24px;margin-top:120px;">
                    <img src="static/logo.png" alt="WebPilot" class="empty-state-logo">
                    <h2 style="color:var(--text-secondary);font-weight:400;font-size:1.1rem;">How can I help you today?</h2>
                </div>`;
            renderSidebar();
            if (window.innerWidth <= 850) toggleSidebar();
        }

        // ================================================================
        // RENDERER BRIDGE — module-scope shims
        // ================================================================
        // renderChatCard (and sibling renderers) are defined INSIDE
        // DOMContentLoaded, so they are not reachable from switchChat or
        // any other module-scope function until the DOM fires and they
        // register themselves on `window.*`.
        //
        // These shims delegate to the real implementations via window.*
        // once ready, and log a warning instead of crashing if called too
        // early (defensive guard for edge cases).
        // ================================================================

        function renderChatCard(title, output, saveToDb = true) {
            if (typeof window.renderChatCard_impl === 'function') {
                return window.renderChatCard_impl(title, output, saveToDb);
            }
            console.warn('[WebPilot] renderChatCard called before DOMContentLoaded — skipping:', title);
        }

        function renderUserMessage(text, saveToDb = true) {
            if (typeof window.renderUserMessage_impl === 'function') {
                return window.renderUserMessage_impl(text, saveToDb);
            }
            console.warn('[WebPilot] renderUserMessage called before DOM ready — skipping.');
        }

        function renderNeedInfoCard(question, action, saveToDb = true) {
            if (typeof window.renderNeedInfoCard_impl === 'function') {
                return window.renderNeedInfoCard_impl(question, action, saveToDb);
            }
        }

        function renderAutomationCard(message, saveToDb = true) {
            if (typeof window.renderAutomationCard_impl === 'function') {
                return window.renderAutomationCard_impl(message, saveToDb);
            }
        }

        function renderErrorCard(message, saveToDb = true) {
            if (typeof window.renderErrorCard_impl === 'function') {
                return window.renderErrorCard_impl(message, saveToDb);
            }
        }

        function switchChat(chatId) {
            currentActiveChatId = chatId;
            const chat = chatDatabase[chatId];
            
            const jsonOutput = document.getElementById('jsonOutput');
            jsonOutput.innerHTML = ''; // Clear board

            // Phase D: if this session was loaded from SQLite with no local messages, fetch them
            if ((!chat.messages || chat.messages.length === 0) && chat._sqliteOnly) {
                wpDbLoadMessages(chatId).then(msgs => {
                    if (msgs.length > 0) {
                        chatDatabase[chatId].messages = msgs;
                        chatDatabase[chatId]._sqliteOnly = false;
                        localStorage.setItem('webpilot_chats_db', JSON.stringify(chatDatabase));
                    }
                    msgs.forEach(msg => {
                        if (msg.role === 'user') renderUserMessage(msg.content, false);
                        else if (msg.role === 'ai') renderChatCard('WebPilot', msg.content, false);
                    });
                    renderSidebar();
                });
                return;
            }
            
            // Re-render historical messages smoothly
            console.log('[WebPilot] Loading session messages:', chat.messages.length, 'for chatId:', chatId);
            chat.messages.forEach((msg, idx) => {
                // Defensive null-guard: skip corrupt entries without crashing the loop
                if (!msg || typeof msg !== 'object') {
                    console.warn('[WebPilot] Skipping invalid message at index', idx, ':', msg);
                    return;
                }
                if (!msg.content && !msg.question && !msg.message) {
                    console.warn('[WebPilot] Skipping empty message at index', idx);
                    return;
                }

                if (msg.role === 'user') {
                    renderUserMessage(msg.content, false);
                } else if (msg.role === 'ai') {
                    if (msg.type === 'chat') renderChatCard(msg.title, msg.content, false);
                    else if (msg.type === 'need_info') renderNeedInfoCard(msg.question, msg.action, false);
                    else if (msg.type === 'automation') renderAutomationCard(msg.message, false);
                    else if (msg.type === 'error') renderErrorCard(msg.message, false);
                    else renderChatCard(msg.title || 'WebPilot', msg.content, false); // safe fallback
                }
            });
            renderSidebar();
            if (window.innerWidth <= 850) toggleSidebar(); 
        }

    function renderSidebar(filterText = '') {
            const list = document.getElementById('chatHistoryList');
            list.innerHTML = '';

            // Sort by latest updated
            const sortedChats = Object.values(chatDatabase).sort((a, b) => b.updatedAt - a.updatedAt);

            sortedChats.forEach(chat => {
                if (filterText && !chat.title.toLowerCase().includes(filterText.toLowerCase())) return;

                const isActive = chat.id === currentActiveChatId ? 'active' : '';
                const itemDiv = document.createElement('div');
                itemDiv.className = `history-item ${isActive}`;
                
                const contentDiv = document.createElement('div');
                contentDiv.style.cssText = 'display:flex; align-items:center; gap:10px; flex:1; overflow:hidden; cursor:pointer;';
                contentDiv.onclick = () => switchChat(chat.id);
                contentDiv.innerHTML = `<i data-lucide="message-square"></i> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; flex:1;">${escHtml(chat.title)}</span>`;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'history-delete-btn';
                deleteBtn.title = 'Delete chat';
                deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                };
                
                itemDiv.appendChild(contentDiv);
                itemDiv.appendChild(deleteBtn);
                list.appendChild(itemDiv);
            });
            // Scope icon creation to sidebar list only — avoids walking the entire DOM
            lucide.createIcons({ attrs: {}, nodes: [list] });
        }

        async function deleteChat(chatId) {
            // Remove from local cache
            delete chatDatabase[chatId];
            localStorage.setItem('webpilot_chats_db', JSON.stringify(chatDatabase));
            
            // If active chat is deleted, clear screen
            if (currentActiveChatId === chatId) {
                startNewChat();
            } else {
                renderSidebar();
            }
            
            // Delete from SQLite backend
            try {
                await fetch(`${DB_BASE}/api/session/${chatId}`, {
                    method: 'DELETE',
                    headers: {'Content-Type': 'application/json'}
                });
            } catch(e) { console.error('Failed to delete from backend:', e); }
        }

        function filterChats() {
            const val = document.getElementById('searchInput').value;
            renderSidebar(val);
        }

        // Mobile Sidebar Controls
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        function toggleSidebar() {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        }
        if (overlay) {
            overlay.addEventListener('click', toggleSidebar);
        }

        // ================================================================
        // 1. UI ENHANCEMENT (auto-resize + continuous scroll)
        // ================================================================
        document.addEventListener('DOMContentLoaded', () => {
            renderSidebar(); // Load history on boot

            // ── Smooth-scroll for single-page nav links ───────────────
            // The landing page scrolls inside #lpWrapper (content-wrapper),
            // not on body/html (which has overflow:hidden).
            document.querySelectorAll('.wp-scroll-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('href');
                    const target = document.querySelector(targetId);
                    const scrollContainer = document.getElementById('lpWrapper');
                    if (target && scrollContainer) {
                        // Offset for fixed navbar (~80px)
                        const containerTop = scrollContainer.getBoundingClientRect().top;
                        const targetTop    = target.getBoundingClientRect().top;
                        const offset       = targetTop - containerTop + scrollContainer.scrollTop - 85;
                        scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
                    }
                });
            });

            const textarea = document.getElementById('userInput');
            const chatContainer = document.getElementById('chatContainer');
            
            if (textarea) {
                textarea.addEventListener('input', function () {
                    this.style.height = 'auto';
                    this.style.height = this.scrollHeight + 'px';
                });
            }
            
            // Keeps chat scrolled to bottom — instant scroll avoids repeated smooth-scroll jank
            const observer = new MutationObserver(() => {
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });
            const jsonOutput = document.getElementById('jsonOutput');
            if (chatContainer && jsonOutput) {
                // Only observe direct children (childList) — subtree:false avoids firing on every
                // typewriter textContent change which would cause hundreds of calls per message
                observer.observe(jsonOutput, { childList: true, subtree: false });
            }

            // ==========================================================================
            // WEBPILOT AI PREMIUM LANDING PAGE & AUTH INITIALIZATION
            // ==========================================================================
            const lpWrapper = document.getElementById('lpWrapper');
            const chatbotWrapper = document.getElementById('chatbotWrapper');
            const navStartBtn = document.getElementById('navStartBtn');
            const heroStartBtn = document.getElementById('heroStartBtn');
            const watchDemoBtn = document.getElementById('watchDemoBtn');
            const authModal = document.getElementById('authModal');
            const closeAuthBtn = document.getElementById('closeAuthBtn');
            const step1Form = document.getElementById('step1Form');
            const step2Form = document.getElementById('step2Form');
            const backToStep1Btn = document.getElementById('backToStep1Btn');
            const simulatedOtp = document.getElementById('simulatedOtp');
            const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

            // 1. User Session Check on Load
            const isLoggedIn = localStorage.getItem('webpilot_user_logged_in') === 'true';
            if (isLoggedIn) {
                if (lpWrapper) lpWrapper.style.display = 'none';
                if (chatbotWrapper) chatbotWrapper.classList.remove('chatbot-hidden');
            } else {
                if (lpWrapper) lpWrapper.classList.remove('lp-hidden');
                if (chatbotWrapper) chatbotWrapper.classList.add('chatbot-hidden');
            }

            // 2. Parallax Cursor Reactive Effects — throttled via rAF, only on landing page
            // No blob IDs exist in current markup — guarded safely, no work done if missing
            const blobBlue   = document.getElementById('blobBlue');
            const blobPurple = document.getElementById('blobPurple');
            const blobGlow   = document.getElementById('blobGlow');

            if (blobBlue || blobPurple || blobGlow) {
                let _mmPending = false;
                document.addEventListener('mousemove', (e) => {
                    // Only run on landing page
                    if (!lpWrapper || lpWrapper.style.display === 'none') return;
                    if (_mmPending) return;  // throttle: skip if rAF already queued
                    _mmPending = true;
                    requestAnimationFrame(() => {
                        _mmPending = false;
                        const xVal = (e.clientX - window.innerWidth  / 2) * 0.025;
                        const yVal = (e.clientY - window.innerHeight / 2) * 0.025;
                        if (blobBlue)   blobBlue.style.transform   = `translate3d(${xVal}px,${yVal}px,0)`;
                        if (blobPurple) blobPurple.style.transform = `translate3d(${-xVal*1.4}px,${-yVal*1.4}px,0)`;
                        if (blobGlow)   blobGlow.style.transform   = `translate3d(${xVal*0.6}px,${yVal*0.6}px,0)`;
                    });
                }, { passive: true });
            }

            // 3. Navbar shrink on scroll — targets lpWrapper (the actual scroll container)
            // Removed window.scroll listener — window doesn't scroll (overflow:hidden on body)
            const headerEl = document.querySelector('.lp-header');
            if (lpWrapper && headerEl) {
                let _scrollPending = false;
                lpWrapper.addEventListener('scroll', () => {
                    if (_scrollPending) return;
                    _scrollPending = true;
                    requestAnimationFrame(() => {
                        _scrollPending = false;
                        if (lpWrapper.scrollTop > 40) {
                            headerEl.style.transform = 'translateY(-10px)';
                        } else {
                            headerEl.style.transform = 'translateY(0)';
                        }
                    });
                }, { passive: true });
            }

            // 4. Timeline: section #how-it-works not present in current page — skip gracefully
            // Retained as no-op to avoid breaking any future usage
            const timelineSteps   = document.querySelectorAll('.lp-timeline-step');
            const connectorActive = document.querySelector('.lp-timeline-connector-active');
            if (timelineSteps.length > 0 && lpWrapper) {
                let _timelineDone = false;
                lpWrapper.addEventListener('scroll', function animateTimeline() {
                    if (_timelineDone) return;
                    const section = document.getElementById('how-it-works');
                    if (!section) { _timelineDone = true; return; }
                    const rect = section.getBoundingClientRect();
                    if (rect.top <= window.innerHeight * 0.78 && rect.bottom >= 0) {
                        _timelineDone = true;
                        if (connectorActive) connectorActive.style.transform = 'scaleX(1)';
                        timelineSteps.forEach((step, i) =>
                            setTimeout(() => step.classList.add('active'), i * 180 + 300)
                        );
                    }
                }, { passive: true });
            }

            // 5. FAQ Accordion Dropdowns
            const faqTriggers = document.querySelectorAll('.lp-faq-trigger');
            faqTriggers.forEach(trigger => {
                trigger.addEventListener('click', () => {
                    const item = trigger.closest('.lp-faq-item');
                    const answer = item.querySelector('.lp-faq-answer');
                    const isActive = item.classList.contains('active');

                    // Collapse all FAQs
                    document.querySelectorAll('.lp-faq-item').forEach(el => {
                        el.classList.remove('active');
                        el.querySelector('.lp-faq-answer').style.maxHeight = null;
                    });

                    // Expand clicked FAQ if it wasn't active
                    if (!isActive) {
                        item.classList.add('active');
                        answer.style.maxHeight = answer.scrollHeight + 'px';
                    }
                });
            });

            // 6. Modal overlay transitions
            function openModal() {
                if (authModal) authModal.classList.add('open');
            }
            function closeModal() {
                if (authModal) authModal.classList.remove('open');
            }

            const heroLoginBtn = document.getElementById('heroLoginBtn');

            if (navStartBtn) navStartBtn.addEventListener('click', openModal);
            if (heroLoginBtn) heroLoginBtn.addEventListener('click', openModal);
            if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeModal);
            if (authModal) {
                authModal.addEventListener('click', (e) => {
                    if (e.target === authModal) closeModal();
                });
            }

            if (watchDemoBtn) {
                watchDemoBtn.addEventListener('click', () => {
                    const target = document.getElementById('how-it-works');
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                });
            }

            // 7. Multi-Stage Auth OTP Verification
            let activeOtp = '';
            
            if (step1Form) {
                step1Form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    
                    localStorage.setItem('webpilot_user_logged_in', 'true');
                    closeModal();
                    
                    // Pause Spline immediately — no need to render 3D in chatbot mode
                    if (typeof window._wpPauseSpline === 'function') window._wpPauseSpline();

                    if (lpWrapper) {
                        lpWrapper.classList.add('lp-hidden');
                        setTimeout(() => {
                            lpWrapper.style.display = 'none';
                            if (chatbotWrapper) {
                                chatbotWrapper.classList.remove('chatbot-hidden');
                                lucide.createIcons();
                            }
                        }, 800);
                    } else {
                        if (chatbotWrapper) {
                            chatbotWrapper.classList.remove('chatbot-hidden');
                            lucide.createIcons();
                        }
                    }
                });
            }

            if (backToStep1Btn) {
                backToStep1Btn.addEventListener('click', () => {
                    step2Form.classList.add('lp-hidden');
                    step1Form.classList.remove('lp-hidden');
                });
            }

            // OTP Input focus jumping
            const otpDigits = document.querySelectorAll('.lp-otp-digit');
            otpDigits.forEach((input, index) => {
                input.addEventListener('input', (e) => {
                    const val = e.target.value;
                    // Filter non-digits
                    if (val && !/^\d$/.test(val)) {
                        input.value = '';
                        return;
                    }
                    if (val.length === 1 && index < otpDigits.length - 1) {
                        otpDigits[index + 1].disabled = false;
                        otpDigits[index + 1].focus();
                    }
                    checkAndVerifyOtp();
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !input.value && index > 0) {
                        otpDigits[index - 1].focus();
                        otpDigits[index].disabled = true;
                    }
                });
            });

            function checkAndVerifyOtp() {
                const values = Array.from(otpDigits).map(input => input.value).join('');
                if (values.length === 6) {
                    if (values === activeOtp) {
                        // Success transition
                        localStorage.setItem('webpilot_user_logged_in', 'true');
                        closeModal();
                        
                        // Fade out landing wrapper, reveal chatbot
                        if (lpWrapper) {
                            lpWrapper.classList.add('lp-hidden');
                            setTimeout(() => {
                                lpWrapper.style.display = 'none';
                                if (chatbotWrapper) {
                                    chatbotWrapper.classList.remove('chatbot-hidden');
                                    lucide.createIcons(); // build icons inside chatbot
                                }
                            }, 800);
                        } else {
                            if (chatbotWrapper) {
                                chatbotWrapper.classList.remove('chatbot-hidden');
                                lucide.createIcons();
                            }
                        }
                    } else {
                        // Shake digits container on mismatch
                        const container = document.getElementById('otpDigitsContainer');
                        if (container) {
                            container.style.animation = 'lp-shake 0.4s ease';
                            setTimeout(() => { container.style.animation = ''; }, 400);
                        }
                        // Clear digits
                        otpDigits.forEach((input, idx) => {
                            input.value = '';
                            if (idx > 0) input.disabled = true;
                        });
                        otpDigits[0].focus();
                    }
                }
            }

            if (step2Form) {
                step2Form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    checkAndVerifyOtp();
                });
            }

            // 8. Logout logic
            if (sidebarLogoutBtn) {
                sidebarLogoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.removeItem('webpilot_user_logged_in');
                    
                    // Switch back to landing page cleanly
                    if (chatbotWrapper) chatbotWrapper.classList.add('chatbot-hidden');
                    if (lpWrapper) {
                        lpWrapper.style.display = 'block';
                        requestAnimationFrame(() => {
                            lpWrapper.classList.remove('lp-hidden');
                            // Reset forms to step 1
                            if (step1Form) step1Form.classList.remove('lp-hidden');
                            if (step2Form) step2Form.classList.add('lp-hidden');
                            otpDigits.forEach((input, idx) => {
                                input.value = '';
                                if (idx > 0) input.disabled = true;
                            });
                        });
                    }
                });
            }
        });

        // Helper to remove temporary elements safely
        function removeElementById(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }

        function escHtml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // Render user's own message — right-aligned bubble
        function renderUserMessage(text, saveToDb = true) {
            removeElementById('chatPlaceholder');
            
            const html = `
                <div class="user-message-card">
                    ${escHtml(text)}
                </div>`;
            document.getElementById('jsonOutput').insertAdjacentHTML('beforeend', html);

            if (saveToDb) {
                if (!currentActiveChatId) {
                    currentActiveChatId = Date.now().toString();
                    const sessionTitle = text.length > 40 ? text.substring(0, 40) + '...' : text;
                    chatDatabase[currentActiveChatId] = {
                        id: currentActiveChatId,
                        title: sessionTitle,
                        messages: [],
                        updatedAt: Date.now()
                    };
                    // Phase D: create session in SQLite
                    wpDbCreateSession(currentActiveChatId, sessionTitle);
                }
                chatDatabase[currentActiveChatId].messages.push({ role: 'user', content: text });
                chatDatabase[currentActiveChatId].updatedAt = Date.now();
                saveDatabase();
                // Phase D: persist user message to SQLite
                wpDbSaveMessage(currentActiveChatId, 'user', 'chat', text);
            }
        }

        // ================================================================
        // 2. BACKEND LOGIC (PRESERVED BUT ENHANCED FOR CONTINUOUS APPEND)
        // ================================================================
        document.addEventListener('DOMContentLoaded', () => {
            const commandInput = document.getElementById('userInput');
            const sendBtn      = document.getElementById('sendButton');
            const micBtn       = document.getElementById('micBtn');
            const statusBar    = document.getElementById('statusBar');
            const statusText   = document.getElementById('statusText');
            const jsonOutput   = document.getElementById('jsonOutput');

            // Phase D: on load, merge SQLite sessions into sidebar
            wpDbLoadSessions();

            // ── WebPilot Engine Socket & Voice Activation ──
            const activateBtn = document.getElementById("activate-agent-btn");
            if (activateBtn) {
                activateBtn.addEventListener("click", function() {
                    // 1. Initialize Connection
                    
                    
                    // 2. Browser Audio Bypass (Dummy speech to unlock audio architecture)
                    let unlockVoice = new SpeechSynthesisUtterance("WebPilot Engine Activated");
                    unlockVoice.volume = 0; // Silent unlock
                    window.speechSynthesis.speak(unlockVoice);
                    
                    console.log("Socket connected and browser audio restriction unlocked!");
                    
                    // 3. Update Button UI state
                    activateBtn.classList.add("activated");
                    activateBtn.innerHTML = '<i data-lucide="shield-check" class="btn-icon"></i> <span>WebPilot Engine Active</span>';
                    if (window.lucide) {
                        window.lucide.createIcons({
                            attrs: {},
                            nodes: [activateBtn]
                        });
                    }

                    // 4. Trigger Active Listener
                    setupVoiceListeners();
                });
            }

            function setupVoiceListeners() {
                if (!socket) return;
                // ⚠️ AUDIO INTERLOCK: This listener is intentionally a no-op bridge.
                // The canonical co_pilot_voice audio handler lives in index.html inline script.
                // Having a second SpeechSynthesisUtterance here caused simultaneous dual-voice playback.
                // DO NOT add any audio/speech synthesis calls here.
                socket.on('co_pilot_voice', function(data) {
                    console.log('[BRIDGE] co_pilot_voice signal acknowledged (audio handled by index.html):', data.msg || data.reply || '');
                    // No audio playback here — prevents Voice Clash.
                });
            }

            const BACKEND_URL = 'http://127.0.0.1:5000/process-voice';

            let sessionContext = {
                pendingAction:   null,
                collectedParams: {}
            };

            function resetContext() {
                sessionContext = { pendingAction: null, collectedParams: {} };
            }
            

            async function sendCommandToBackend(userText) {
                const userInput = document.getElementById('userInput');
                const chatContainer = document.getElementById('chatContainer') || document.body; 
                const text = userText || userInput.value.trim();
                if (!text) return;

                // Render User Message instantly
                renderUserMessage(text);
                if (userInput) userInput.value = '';
                
                // Show thinking spinner while waiting for Gemini
                if (typeof renderThinking === 'function') {
                    renderThinking();
                }

                // ── Phase A: Build rolling context window (last 6 pairs) ──
                let historyPayload = [];
                if (currentActiveChatId && chatDatabase[currentActiveChatId]) {
                    const allMsgs = chatDatabase[currentActiveChatId].messages || [];
                    // Grab last 12 entries (6 user + 6 ai pairs), text-only
                    const window = allMsgs.slice(-12);
                    historyPayload = window
                        .filter(m => m.role === 'user' || m.role === 'ai')
                        .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 800) }));
                }

                try {
                    const response = await fetch('/process-voice', {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            command:    text,
                            history:    historyPayload,
                            session_id: currentActiveChatId || 'default_session'
                        })
                    });

                    // Remove spinner once fetch completes
                    if (typeof removeElementById === 'function') removeElementById('thinkingSpinner');

                    const data = await response.json();
                    console.log("CRITICAL BACKEND DATA RECEIVED:", data);

                    const autoCard = document.getElementById('automationCard') || document.querySelector('.automation-launched-container');

                    // PRIMARY MODE: Real Conversational AI
                    if (data.intent_type === 'chat') {
                        if (autoCard) autoCard.style.display = 'none';
                        renderAssistantMessage(data.output || "I am here to help you.");
                    }
                    // SECONDARY MODE: Active Web Automation Tasks
                    else if (data.intent_type === 'automation') {
                        if (autoCard) {
                            autoCard.style.display = 'block';
                            const statusSubText = autoCard.querySelector('p') || autoCard;
                            statusSubText.innerText = data.output || "Automation engine active...";
                        }
                        renderAssistantMessage(data.output || "Opening the requested portal now.");
                        // ── Start polling for product cards / confirmation gate ──
                        if (currentActiveChatId) {
                            startStatusPoller(currentActiveChatId);
                        }
                    }
                    // FALLBACK
                    else {
                        if (autoCard) autoCard.style.display = 'none';
                        renderAssistantMessage(data.output || "Processed.");
                    }

                    // Force Auto-Scroll smoothly
                    const chatEl = document.getElementById('chatContainer');
                    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;

                } catch (error) {
                    console.error("Fetch Execution Error:", error);
                    if (typeof removeElementById === 'function') removeElementById('thinkingSpinner');
                    renderAssistantMessage("Sorry, network error or backend crash occurred.");
                }
            }


function renderAssistantMessage(message) {
    if (typeof renderChatCard === 'function') {
        renderChatCard("WebPilot", message);
    } else {
        const html = `<div class="ai-message-card" style="padding:16px;background:rgba(139,92,246,0.1);color:#d1d5db;margin-bottom:16px;">🤖 ${escHtml(message)}</div>`;
        document.getElementById('jsonOutput').insertAdjacentHTML('beforeend', html);
    }
}

            // --- ALL RENDERERS MODIFIED FROM .innerHTML = TO .insertAdjacentHTML ---
            
            // Thinking indicator — minimal, no border
            function renderThinking() {
                removeElementById('thinkingSpinner');
                const html = `
                    <div id="thinkingSpinner" class="ai-message-card" style="display:flex;align-items:center;gap:12px;padding:6px 2px;">
                        <div style="display:flex;gap:5px;align-items:center;">
                            <span style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:dotPulse 1.4s ease-in-out infinite;"></span>
                            <span style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:dotPulse 1.4s ease-in-out 0.2s infinite;"></span>
                            <span style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:dotPulse 1.4s ease-in-out 0.4s infinite;"></span>
                        </div>
                    </div>
                    <style>@keyframes dotPulse{0%,80%,100%{opacity:0.2;transform:scale(0.85)}40%{opacity:1;transform:scale(1)}}</style>`;
                jsonOutput.insertAdjacentHTML('beforeend', html);
            }

            // ═══════════════════════════════════════════════════════
            // MARKDOWN + SYNTAX HIGHLIGHT ENGINE
            // ═══════════════════════════════════════════════════════

            /**
             * Render AI text → fully highlighted HTML.
             * Hardened pipeline:
             *   0. Normalise CRLF line endings
             *   1. Auto-close unclosed fences (client safety net)
             *   2. Tokenise: extract fenced code blocks FIRST (preserves blank lines)
             *   3. Render: code → renderCodeBlock, prose → renderProse
             */
            function renderMarkdown(rawText) {
                if (!rawText) return '';

                // ── 0. Normalise line endings ──────────────────────────────
                let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                // ── 1. Unclosed-fence client-side recovery ─────────────────
                // Count lines that are pure fence markers (``` or ~~~).
                // Odd count means the last block was never closed.
                const fenceLineCount = text.split('\n')
                    .filter(l => /^[ \t]{0,3}(`{3,}|~{3,})[a-zA-Z0-9+#.\- \t]*$/.test(l)).length;
                if (fenceLineCount % 2 !== 0) {
                    console.warn('[WebPilot] Unclosed code fence detected — auto-closing.');
                    text = text.trimEnd() + '\n```';
                }

                const segments = [];

                // ── 2. Tokenise on fenced code block boundaries ────────────
                // Matches: optional leading spaces (≤3), ``` or ~~~,
                //          optional lang tag, newline, content, closing fence.
                // Uses multiline + lastIndex loop (no DOTALL flag needed).
                const CODE_FENCE = /(?:^|\n)([ \t]{0,3})(`{3,}|~{3,})([a-zA-Z0-9+#.\-]*)[ \t]*\n([\s\S]*?)\n\1\2[ \t]*(?=\n|$)/g;
                let cursor = 0;
                let match;

                while ((match = CODE_FENCE.exec(text)) !== null) {
                    // Offset: when match starts with \n, the actual block starts 1 char later
                    const blockStart = match.index + (text[match.index] === '\n' ? 1 : 0);
                    if (blockStart > cursor) {
                        segments.push({ type: 'prose', text: text.slice(cursor, blockStart) });
                    }
                    segments.push({ type: 'code', lang: (match[3] || '').trim(), code: match[4] });
                    cursor = match.index + match[0].length;
                }

                // Trailing prose after last block
                if (cursor < text.length) {
                    segments.push({ type: 'prose', text: text.slice(cursor) });
                }

                // ── 3. Render ──────────────────────────────────────────────
                if (segments.length === 0) return renderProse(text);
                return segments.map(seg =>
                    seg.type === 'code' ? renderCodeBlock(seg.lang, seg.code) : renderProse(seg.text)
                ).join('');
            }


            /** Produce a syntax-highlighted code block with header + copy button */
            function renderCodeBlock(lang, rawCode) {
                // Strip only leading/trailing blank lines, preserve internal whitespace
                const trimmed = rawCode.replace(/^\n+/, '').replace(/\n+$/, '');
                if (!trimmed) return '';   // empty fence — skip rendering entirely
                const blockId  = 'cb-' + Math.random().toString(36).slice(2, 9);

                // ── Highlight.js: highlight with explicit lang or autodetect ──
                let highlighted = '';
                let resolvedLang = lang;
                const LANG_ALIASES = {
                    'js': 'javascript', 'ts': 'typescript', 'py': 'python',
                    'sh': 'bash', 'shell': 'bash', 'c++': 'cpp', 'c#': 'csharp',
                    'htm': 'html', 'jsx': 'javascript', 'tsx': 'typescript'
                };
                resolvedLang = LANG_ALIASES[resolvedLang] || resolvedLang;

                if (resolvedLang && typeof hljs !== 'undefined' && hljs.getLanguage(resolvedLang)) {
                    highlighted = hljs.highlight(trimmed, { language: resolvedLang, ignoreIllegals: true }).value;
                } else if (typeof hljs !== 'undefined') {
                    const result = hljs.highlightAuto(trimmed);
                    highlighted = result.value;
                    if (!resolvedLang && result.language) resolvedLang = result.language;
                } else {
                    highlighted = escHtml(trimmed);
                }

                const displayLang = resolvedLang || 'code';

                return `<div class="wp-code-block" id="${blockId}">
  <div class="wp-code-header">
    <span class="wp-code-lang">${escHtml(displayLang)}</span>
    <button class="wp-copy-btn" onclick="wpCopyCode('${blockId}',this)" title="Copy code">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Copy
    </button>
  </div>
  <div class="wp-code-body"><code class="hljs language-${escHtml(displayLang)}">${highlighted}</code></div>
</div>`;
            }

            /** Lightweight markdown → HTML for prose sections */
            function renderProse(text) {
                if (!text.trim()) return '';

                const lines = text.split('\n');
                const out   = [];
                let inList  = false;

                const processInline = (t) => {
                    return t
                        // Escape HTML first
                        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                        // Bold **...**
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        // Italic *...*  (but not **)
                        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
                        // Inline code `...`
                        .replace(/`([^`]+)`/g, '<code class="wp-inline-code">$1</code>');
                };

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Headings
                    if (/^### /.test(line)) {
                        if (inList) { out.push('</ul>'); inList = false; }
                        out.push(`<h3 class="wp-h">${processInline(line.slice(4))}</h3>`);
                        continue;
                    }
                    if (/^## /.test(line)) {
                        if (inList) { out.push('</ul>'); inList = false; }
                        out.push(`<h2 class="wp-h">${processInline(line.slice(3))}</h2>`);
                        continue;
                    }
                    if (/^# /.test(line)) {
                        if (inList) { out.push('</ul>'); inList = false; }
                        out.push(`<h1 class="wp-h">${processInline(line.slice(2))}</h1>`);
                        continue;
                    }

                    // Horizontal rule
                    if (/^---+$/.test(line.trim())) {
                        if (inList) { out.push('</ul>'); inList = false; }
                        out.push('<hr class="wp-hr">');
                        continue;
                    }

                    // Unordered list
                    if (/^[-*] /.test(line)) {
                        if (!inList) { out.push('<ul class="wp-ul">'); inList = true; }
                        out.push(`<li>${processInline(line.slice(2))}</li>`);
                        continue;
                    }

                    // Numbered list
                    if (/^\d+\. /.test(line)) {
                        if (!inList) { out.push('<ol class="wp-ul">'); inList = true; }
                        out.push(`<li>${processInline(line.replace(/^\d+\. /,''))}</li>`);
                        continue;
                    }

                    // Close list if needed
                    if (inList && line.trim() === '') {
                        out.push('</ul>'); inList = false;
                        continue;
                    }

                    // Normal paragraph text
                    if (line.trim() !== '') {
                        if (inList) { out.push('</ul>'); inList = false; }
                        out.push(`<p class="wp-p">${processInline(line)}</p>`);
                    }
                }

                if (inList) out.push('</ul>');
                return `<div class="wp-ai-body">${out.join('')}</div>`;
            }

            /** Copy code to clipboard — triggered by copy button */
            function wpCopyCode(blockId, btn) {
                const block = document.getElementById(blockId);
                if (!block) return;
                const codeEl = block.querySelector('code');
                const text = codeEl ? codeEl.innerText : '';

                navigator.clipboard.writeText(text).then(() => {
                    btn.classList.add('copied');
                    const origHTML = btn.innerHTML;
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = origHTML;
                    }, 2000);
                }).catch(() => {
                    // Fallback for non-secure contexts
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    btn.classList.add('copied');
                    setTimeout(() => btn.classList.remove('copied'), 2000);
                });
            }

            // Chat card — uses the new markdown engine + Phase B speaker + Phase C typewriter
            function renderChatCard(title, output, saveToDb = true) {
                removeElementById('thinkingSpinner');
                removeElementById('chatPlaceholder');

                const rendered  = renderMarkdown(output || '');
                const msgId     = 'msg-' + Math.random().toString(36).slice(2, 9);
                const rawEscaped = escHtml(JSON.stringify(output || ''));

                const html = `
                    <div class="ai-message-card" id="${msgId}" style="padding:6px 2px 18px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;">
                            <img src="static/logo.png" style="width:22px;height:22px;object-fit:contain;margin-top:2px;flex-shrink:0;opacity:0.85;">
                            <div style="color:var(--text-main);font-size:0.925rem;flex:1;min-width:0;">
                                <div class="wp-response-body">${rendered}</div>
                                <div class="wp-message-actions">
                                    <button class="wp-speak-btn play-btn" onclick="wpSpeakText(${rawEscaped}, this)" title="Read aloud">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                        </svg>
                                        <span>Read aloud</span>
                                    </button>
                                    <button class="wp-speak-btn stop-btn" onclick="wpStopPlayback()" title="Stop" style="display:none; color:#f87171; border-color:rgba(248,113,113,0.3); background:rgba(248,113,113,0.06);">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <rect x="6" y="6" width="12" height="12"></rect>
                                        </svg>
                                        <span>Stop</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                jsonOutput.insertAdjacentHTML('beforeend', html);

                // Phase C: typewriter reveal on prose nodes only
                const card = document.getElementById(msgId);
                if (card && saveToDb) {   // only animate live responses, not history replay
                    typewriterReveal(card.querySelector('.wp-response-body'));
                    // Safety net: re-highlight any code block that wasn't caught by explicit hljs.highlight()
                    if (typeof hljs !== 'undefined') {
                        requestAnimationFrame(() => {
                            card.querySelectorAll('code:not(.hljs)').forEach(el => hljs.highlightElement(el));
                        });
                    }
                }

                if (saveToDb && currentActiveChatId) {
                    chatDatabase[currentActiveChatId].messages.push({ role: 'ai', type: 'chat', title, content: output });
                    saveDatabase();
                    // Phase D: persist to SQLite async
                    wpDbSaveMessage(currentActiveChatId, 'ai', 'chat', output);
                }
            }

            // ── Export all renderers to window immediately (function hoisting
            //    means all 5 are available here even though some appear later
            //    in the source). Module-scope shims delegate through window.*_impl.
            window.renderChatCard_impl       = renderChatCard;
            window.renderUserMessage_impl    = renderUserMessage;
            window.renderNeedInfoCard_impl   = renderNeedInfoCard;
            window.renderAutomationCard_impl = renderAutomationCard;
            window.renderErrorCard_impl      = renderErrorCard;
            console.log('[WebPilot] Renderer bridge live — all 5 renderers exported to window.');


            // Need info card — minimal prompt style
            function renderNeedInfoCard(question, action, saveToDb = true) {
                removeElementById('thinkingSpinner');
                removeElementById('chatPlaceholder');
                const html = `
                    <div class="ai-message-card" style="padding:6px 2px 18px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;">
                            <img src="static/logo.png" style="width:22px;height:22px;object-fit:contain;margin-top:2px;flex-shrink:0;opacity:0.85;">
                            <div style="flex:1;">
                                <p style="color:var(--text-main);font-size:0.925rem;line-height:1.7;margin:0 0 10px;">${escHtml(question)}</p>
                                <p style="color:var(--text-muted);font-size:0.78rem;margin:0;">Type your answer and press Enter</p>
                            </div>
                        </div>
                    </div>`;
                jsonOutput.insertAdjacentHTML('beforeend', html);

                if (saveToDb && currentActiveChatId) {
                    chatDatabase[currentActiveChatId].messages.push({ role: 'ai', type: 'need_info', question, action });
                    saveDatabase();
                }
            }

            // Automation card — minimal, no emoji
            function renderAutomationCard(message, saveToDb = true) {
                removeElementById('thinkingSpinner');
                removeElementById('chatPlaceholder');
                const html = `
                    <div class="ai-message-card" style="padding:6px 2px 18px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;">
                            <img src="static/logo.png" style="width:22px;height:22px;object-fit:contain;margin-top:2px;flex-shrink:0;opacity:0.85;">
                            <div style="flex:1;">
                                <p style="color:var(--text-main);font-size:0.925rem;line-height:1.7;margin:0 0 8px;">${escHtml(message)}</p>
                                <p style="color:var(--text-muted);font-size:0.78rem;margin:0;">Browser launched. Complete any additional steps manually.</p>
                            </div>
                        </div>
                    </div>`;
                jsonOutput.insertAdjacentHTML('beforeend', html);

                if (saveToDb && currentActiveChatId) {
                    chatDatabase[currentActiveChatId].messages.push({ role: 'ai', type: 'automation', message });
                    saveDatabase();
                }
            }

            // Error card — understated, no emoji
            function renderErrorCard(message, saveToDb = true) {
                removeElementById('thinkingSpinner');
                removeElementById('chatPlaceholder');
                const html = `
                    <div class="ai-message-card" style="padding:6px 2px 18px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;">
                            <img src="static/logo.png" style="width:22px;height:22px;object-fit:contain;margin-top:2px;flex-shrink:0;opacity:0.6;">
                            <div style="flex:1;">
                                <p style="color:var(--text-secondary);font-size:0.925rem;line-height:1.7;margin:0;">${escHtml(message)}</p>
                            </div>
                        </div>
                    </div>`;
                jsonOutput.insertAdjacentHTML('beforeend', html);

                if (saveToDb && currentActiveChatId) {
                    chatDatabase[currentActiveChatId].messages.push({ role: 'ai', type: 'error', message });
                    saveDatabase();
                }
            }

            // Escaper
            function escHtml(str) {
                if (!str) return '';
                return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
            }

            // ============================================
            // EVENT LISTENERS (PRESERVED)
            // ============================================
            if (sendBtn) {
                sendBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (commandInput) {
                        const text = commandInput.value.trim();
                        if (text) { commandInput.value = ''; commandInput.style.height = 'auto'; sendCommandToBackend(text); }
                    }
                });
            }

            if (commandInput) {
                commandInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const text = commandInput.value.trim();
                        if (text) { commandInput.value = ''; commandInput.style.height = 'auto'; sendCommandToBackend(text); }
                    }
                });
            }

            // VOICE
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            let recognition = null;

            if (SpeechRecognition) {
                recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.lang = 'hi-IN';

                recognition.onstart  = () => { if (micBtn) micBtn.classList.add('listening'); updateStatus('Listening...', 'processing'); };
                recognition.onresult = (e) => { 
                    const t = e.results[0][0].transcript; 
                    updateStatus(`Heard: "${t}"`, 'processing'); 
                    if (commandInput) {
                        commandInput.value = t;
                        commandInput.style.height = 'auto';
                    }
                    if (sendBtn) sendBtn.click();
                };
                recognition.onerror  = (e) => { 
                    console.error('Speech error:', e.error); 
                    updateStatus('Microphone Error', 'error'); 
                    if (micBtn) micBtn.classList.remove('listening'); 
                    if (['not-allowed', 'audio-capture', 'no-speech'].includes(e.error)) {
                        renderAssistantMessage("Microphone access unavailable. You can continue typing your request.");
                    }
                };
                recognition.onend    = () => { if (micBtn) micBtn.classList.remove('listening'); if (statusBar && statusText && statusBar.classList.contains('processing') && statusText.textContent === 'Listening...') updateStatus('Ready', 'ready'); };
                
                if (micBtn) {
                    micBtn.addEventListener('click', (e) => { e.preventDefault(); micBtn.classList.contains('listening') ? recognition.stop() : recognition.start(); });
                }
            } else {
                if (micBtn) {
                    micBtn.addEventListener('click', (e) => { 
                        e.preventDefault(); 
                        updateStatus('Speech Recognition not supported in this browser.', 'error'); 
                        renderAssistantMessage("Microphone access unavailable. You can continue typing your request.");
                    });
                }
            }

            // STATUS UPDATER
            function updateStatus(message, state) {
                statusText.textContent = message;
                statusBar.className = 'status-bar';
                let iconName = 'info';
                switch (state) {
                    case 'processing': statusBar.classList.add('processing'); iconName = 'loader'; break;
                    case 'success':    statusBar.classList.add('success');    iconName = 'check-circle-2'; break;
                    case 'error':      statusBar.classList.add('error');      iconName = 'alert-triangle'; break;
                }
                const oldIcon = statusBar.querySelector('i, svg');
                if(oldIcon) {
                    const newI = document.createElement('i');
                    newI.setAttribute('data-lucide', iconName);
                    oldIcon.replaceWith(newI);
                }
                lucide.createIcons();
            }
        });
        
        // Initialize all icons on first paint
        lucide.createIcons();

        // ── GLOBAL EXPORT: copy button onclick needs window scope ──
        // wpCopyCode is defined inside DOMContentLoaded; we expose it here
        // so that inline onclick attributes can find it.
        window.wpCopyCode = function(blockId, btn) {
            const block = document.getElementById(blockId);
            if (!block) return;
            const codeEl = block.querySelector('code');
            const text = codeEl ? codeEl.innerText : '';

            const markCopied = () => {
                btn.classList.add('copied');
                const origHTML = btn.innerHTML;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = origHTML;
                }, 2000);
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(markCopied).catch(() => {
                    fallbackCopy(text); markCopied();
                });
            } else {
                fallbackCopy(text); markCopied();
            }
        };


        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
        }

        // ═══════════════════════════════════════════════════════
        // PHASE B — AI Voice Playback Engine (SpeechSynthesis)
        // ═══════════════════════════════════════════════════════
        let _wpCurrentUtterance = null;
        let _wpSpeakingBtn      = null;

        // Ensure voices are loaded early (Chrome edge case)
        if ('speechSynthesis' in window && window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {};
        }

        window.wpStopPlayback = function() {
            if (!('speechSynthesis' in window)) return;
            if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
                window.speechSynthesis.cancel();
            }
            if (_wpSpeakingBtn) {
                const container = _wpSpeakingBtn.closest('.wp-message-actions');
                const stopBtn = container ? container.querySelector('.stop-btn') : null;
                resetSpeakUI(_wpSpeakingBtn, stopBtn);
                _wpSpeakingBtn = null;
                _wpCurrentUtterance = null;
            }
        };

        function resetSpeakUI(playBtn, stopBtn) {
            if (playBtn) {
                playBtn.classList.remove('speaking');
                const sp = playBtn.querySelector('span');
                if (sp) sp.textContent = 'Read aloud';
            }
            if (stopBtn) {
                stopBtn.style.display = 'none';
            }
        }

        window.wpSpeakText = function(rawText, btn) {
            if (!('speechSynthesis' in window)) return;

            const container = btn.closest('.wp-message-actions');
            const stopBtn = container ? container.querySelector('.stop-btn') : null;

            // If already interacting with this message's button, toggle Pause/Resume
            if (_wpSpeakingBtn === btn) {
                if (window.speechSynthesis.speaking) {
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                        btn.classList.add('speaking');
                        const sp = btn.querySelector('span');
                        if (sp) sp.textContent = 'Pause';
                    } else {
                        window.speechSynthesis.pause();
                        btn.classList.remove('speaking');
                        const sp = btn.querySelector('span');
                        if (sp) sp.textContent = 'Resume';
                    }
                    return;
                }
            }

            // Stop any other ongoing speech before starting a new one
            window.wpStopPlayback();

            // Strip markdown artifacts and replace code blocks with natural speech omissions
            const cleanText = String(rawText)
                .replace(/#{1,6}\s/g, '')          // headings
                .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
                .replace(/\*(.+?)\*/g, '$1')        // italic
                .replace(/`[^`]*`/g, ' Code snippet omitted. ')  // inline code
                .replace(/```[a-zA-Z0-9+#.-]*\n?([\s\S]*?)```/g, ' Code block omitted. ')  // fenced code
                .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
                .replace(/[-*] /g, '')              // list bullets
                .replace(/\n{2,}/g, '. ')           // paragraph breaks
                .replace(/\n/g, ' ')
                .trim();

            if (!cleanText) return;

            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.rate  = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Prefer an Indian/Hindi voice, fallback to natural English
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN')) 
                           || voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium')))
                           || voices.find(v => v.lang.startsWith('en'));
            if (preferred) utterance.voice = preferred;

            utterance.onend = () => { resetSpeakUI(btn, stopBtn); _wpSpeakingBtn = null; _wpCurrentUtterance = null; };
            utterance.onerror = () => { resetSpeakUI(btn, stopBtn); _wpSpeakingBtn = null; _wpCurrentUtterance = null; };

            _wpCurrentUtterance = utterance;
            _wpSpeakingBtn      = btn;
            
            btn.classList.add('speaking');
            const sp = btn.querySelector('span');
            if (sp) sp.textContent = 'Pause';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
            
            window.speechSynthesis.speak(utterance);
        };

        // ═══════════════════════════════════════════════════════
        // PHASE C — Typewriter Reveal (prose only, rAF-based)
        // ═══════════════════════════════════════════════════════
        window.typewriterReveal = function(container) {
            if (!container) return;

            const PROSE_SELECTORS = '.wp-p, .wp-h, .wp-ul li, .wp-ai-body p';
            const proseEls = Array.from(container.querySelectorAll(PROSE_SELECTORS));
            if (proseEls.length === 0) return;

            const CHARS_PER_FRAME = 28;
            const queue = proseEls.map(el => {
                const full = el.innerHTML;
                el.style.visibility = 'hidden';
                el.style.minHeight  = el.offsetHeight + 'px';
                return { el, full };
            });

            let qIdx  = 0;
            let cIdx  = 0;
            let cancelled = false;

            // Cancel typewriter if tab becomes hidden to save CPU/GPU
            const onVisibilityHidden = () => {
                if (document.hidden && !cancelled) {
                    cancelled = true;
                    // Instantly reveal all remaining text
                    queue.slice(qIdx).forEach(item => {
                        item.el.style.visibility = '';
                        item.el.style.minHeight  = '';
                        item.el.innerHTML = item.full;
                    });
                    queue.forEach(item => {
                        item.el.style.visibility = '';
                        item.el.style.minHeight  = '';
                        item.el.innerHTML = item.full;
                    });
                    document.removeEventListener('visibilitychange', onVisibilityHidden);
                }
            };
            document.addEventListener('visibilitychange', onVisibilityHidden);

            function tick() {
                if (cancelled || qIdx >= queue.length) {
                    // Restore all on completion
                    queue.forEach(item => {
                        item.el.style.visibility = '';
                        item.el.style.minHeight  = '';
                        item.el.innerHTML = item.full;
                    });
                    document.removeEventListener('visibilitychange', onVisibilityHidden);
                    return;
                }

                const { el, full } = queue[qIdx];
                el.style.visibility = 'visible';

                const stripped = full.replace(/<[^>]*>/g, '');
                const endIdx   = Math.min(cIdx + CHARS_PER_FRAME, stripped.length);
                el.textContent = stripped.slice(0, endIdx);
                cIdx = endIdx;

                if (cIdx >= stripped.length) {
                    el.innerHTML = full;
                    el.style.minHeight = '';
                    qIdx++;
                    cIdx = 0;
                }

                requestAnimationFrame(tick);
            }

            requestAnimationFrame(tick);
        };

// ==========================================================================
// SENTINEL AI - Spline & Animations
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const canvas    = document.getElementById('canvas3d');
  const lpWrapper = document.getElementById('lpWrapper');
  let   splineApp = null;   // hold reference for pause/resume

  // ── Spline: only load when landing page is actually visible ──
  // If the user is already logged in, lpWrapper is hidden — skip loading entirely.
  function initSpline() {
    if (!canvas) { triggerAnimations(); return; }
    // If landing page is hidden at boot, skip Spline entirely (chatbot mode)
    if (lpWrapper && lpWrapper.style.display === 'none') {
      // Mark canvas as inert so GPU compositor ignores it
      canvas.style.display = 'none';
      triggerAnimations();
      return;
    }
    import('https://unpkg.com/@splinetool/runtime@1.0.55/build/runtime.js')
      .then(({ Application }) => {
        try {
          splineApp = new Application(canvas);
          splineApp.load('https://prod.spline.design/Slk6b8kz3LRlKiyk/scene.splinecode')
            .then(() => triggerAnimations())
            .catch(err  => { console.warn('Spline load failed:', err); triggerAnimations(); });
        } catch(e) { console.warn('Spline init error:', e); triggerAnimations(); }
      })
      .catch(err => { console.warn('Spline library error:', err); triggerAnimations(); });
  }

  initSpline();

  // ── Pause Spline when tab is hidden — saves GPU cycles ──
  document.addEventListener('visibilitychange', () => {
    if (!splineApp) return;
    if (document.hidden) {
      try { splineApp.stop?.(); } catch(e) {}
    } else {
      // Only resume if landing page is still visible
      if (lpWrapper && lpWrapper.style.display !== 'none') {
        try { splineApp.play?.(); } catch(e) {}
      }
    }
  });

  // ── Pause Spline when user enters chatbot (called by login handler) ──
  window._wpPauseSpline = () => {
    if (!splineApp) return;
    try {
      splineApp.stop?.();
      if (canvas) canvas.style.display = 'none';
    } catch(e) {}
  };

  // Cinematic stagger animations (translateY + blur + opacity)
  function triggerAnimations() {
    const staggerSequence = [
      { selector: '.nav-animate',         delay: 100 },
      { selector: '.headline-animate',    delay: 300 },
      { selector: '.subheadline-animate', delay: 450 },
      { selector: '.desc-animate',        delay: 600 },
      { selector: '.btn-animate',         delay: 750 },
      { selector: '.trust-animate',       delay: 900 }
    ];
    staggerSequence.forEach(item => {
      const el = document.querySelector(item.selector);
      if (el) setTimeout(() => el.classList.add('fade-up'), item.delay);
    });
  }

  // Wire up nav buttons to modal (defensive — openModal already bound above)
  const navStartBtn  = document.getElementById('navStartBtn');
  const heroStartBtn = document.getElementById('heroStartBtn');
  if (navStartBtn  && typeof showAuthModal === 'function') navStartBtn.addEventListener('click',  showAuthModal);
  if (heroStartBtn && typeof showAuthModal === 'function') heroStartBtn.addEventListener('click', showAuthModal);
});

// ── Contact form submit handler ────────────────────────────────
function wpContactSubmit(e) {
    e.preventDefault();
    const btn  = e.target.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>Message Sent!</span>';
    btn.disabled  = true;
    setTimeout(() => {
        btn.innerHTML = orig;
        btn.disabled  = false;
        e.target.reset();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 3000);
}


// ================================================================
// AUTOMATION STATE MACHINE — Frontend Poller + Card Renderers
// ================================================================

let _wpStatusPollerInterval = null;
let _wpLastRenderedState    = null;   // track what we already rendered

/**
 * Start polling /api/session/status every 2s.
 * When state changes to AWAITING_PRODUCT_SELECTION   → render product cards.
 * When state changes to AWAITING_VARIANT_SELECTION   → render variant card.
 * When state changes to AWAITING_FINAL_CONFIRMATION  → render confirm gate.
 * Shows live status_message for non-interactive states.
 * Stops automatically when state reaches terminal states.
 */
function startStatusPoller(sessionId) {
    stopStatusPoller();   // clear any existing interval first
    console.log('[Poller] Starting for session:', sessionId);

    _wpStatusPollerInterval = setInterval(async () => {
        try {
            const res  = await fetch(`/api/session/status?session_id=${encodeURIComponent(sessionId)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.ok)   return;

            const state = data.state;
            console.log('[Poller] State:', state, '|', data.status_message || '');

            // ── Update Execution Mode Badge ──
            const modeBadge = document.getElementById('executionModeBadge');
            const telemetryPanel = document.getElementById('telemetryPanel');
            if (modeBadge && telemetryPanel) {
                telemetryPanel.style.display = 'flex';
                if (data.execution_mode === 'hitl') {
                    modeBadge.className = 'execution-mode-badge mode-hitl';
                    modeBadge.innerHTML = '<i data-lucide="alert-triangle"></i> Voice-Assisted HITL';
                } else {
                    modeBadge.className = 'execution-mode-badge mode-autonomous';
                    modeBadge.innerHTML = '<i data-lucide="zap"></i> Autonomous Mode';
                }
                if (window.lucide) window.lucide.createIcons();
            }

            // ── Update Telemetry Timeline ──
            const timeline = document.getElementById('telemetryTimeline');
            if (timeline && data.telemetry_logs) {
                let logs = [];
                try { logs = typeof data.telemetry_logs === 'string' ? JSON.parse(data.telemetry_logs) : data.telemetry_logs; } catch (e) {}
                
                // Only render if count changed
                if (window._wpLastLogCount !== logs.length) {
                    window._wpLastLogCount = logs.length;
                    timeline.innerHTML = '';
                    logs.forEach(log => {
                        const date = new Date(log.timestamp);
                        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                        const logDiv = document.createElement('div');
                        logDiv.className = `telemetry-log type-${log.type}`;
                        logDiv.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${log.message}</span>`;
                        timeline.appendChild(logDiv);
                    });
                    timeline.scrollTop = timeline.scrollHeight;
                    
                    // Voice synthesis for the latest HITL log
                    const latestLog = logs[logs.length - 1];
                    if (latestLog && latestLog.type === 'hitl_request' && data.execution_mode === 'hitl' && window._wpLastSpokenLog !== latestLog.timestamp) {
                        window._wpLastSpokenLog = latestLog.timestamp;
                        speakText(latestLog.message);
                    }
                }
            }


            // ── Live status bubble (non-interactive states) ───────────────
            const INTERACTIVE_STATES = [
                'IDLE', 'COMPLETED', 'CANCELLED', 'ERROR',
                'STATE_COMPLETED', 'STATE_FAILED',
                'AWAITING_PRODUCT_SELECTION', 'STATE_AWAITING_PRODUCT_CHOICE',
                'AWAITING_VARIANT_SELECTION', 'STATE_AWAITING_VARIANT_SELECTION',
                'AWAITING_FINAL_CONFIRMATION', 'STATE_AWAITING_CONFIRMATION',
            ];
            if (!INTERACTIVE_STATES.includes(state)) {
                const DEFAULT_LABELS = {
                    'SEARCHING':                 'Searching for products\u2026',
                    'SEARCHING_PRODUCTS':        'Searching for products\u2026',
                    'STATE_SEARCHING':           'Searching for products\u2026',
                    'PRODUCT_SELECTED':          'Product selected \u2014 opening page\u2026',
                    'STATE_OPENING_PRODUCT':     'Opening product page\u2026',
                    'OPENING_PRODUCT':           'Opening product page\u2026',
                    'STATE_SCANNING_VARIANTS':   'Scanning product page for options\u2026',
                    'ADDING_TO_CART':            'Adding to cart\u2026',
                    'VARIANT_SELECTED':          'Applying your selection\u2026',
                    'STATE_VARIANT_CONFIRMED':   'Applying your selection\u2026',
                    'CHECKOUT_PREPARATION':      'Preparing checkout\u2026',
                    'STATE_ADDRESS_FILL':        'Filling delivery address\u2026',
                    'PROCEEDING_TO_CHECKOUT':    'Proceeding to checkout\u2026',
                    'FILLING_ADDRESS':           'Filling delivery address\u2026',
                    'ADDRESS_FILLED':            'Address filled \u2014 checking payment\u2026',
                    'STATE_DELIVERY_VALIDATION': 'Address filled \u2014 checking payment\u2026',
                    'PAYMENT_MODE_CHECK':        'Checking payment options\u2026',
                    'STATE_COD_CHECK':           'Checking payment options\u2026',
                    'ORDER_EXECUTION':           'Placing order\u2026',
                    'STATE_PLACING_ORDER':       'Placing order\u2026',
                };
                const msg = data.status_message || DEFAULT_LABELS[state] || state.replace(/_/g, ' ');
                _wpUpdateStatusBubble(msg);
            }

            // Stop polling on terminal states
            if (['IDLE', 'COMPLETED', 'CANCELLED', 'STATE_COMPLETED', 'STATE_FAILED'].includes(state)) {
                _wpRemoveStatusBubble();
                stopStatusPoller();
                _wpLastRenderedState = null;
                return;
            }
            if (state === 'ERROR' || state === 'STATE_FAILED') {
                _wpRemoveStatusBubble();
                stopStatusPoller();
                _wpLastRenderedState = null;
                return;
            }

            // Avoid re-rendering the same interactive card
            if (state === _wpLastRenderedState) return;

            // ── Product Selection Gate ─────────────────────────────────────
            if (state === 'AWAITING_PRODUCT_SELECTION' || state === 'STATE_AWAITING_PRODUCT_CHOICE') {
                if (data.products && data.products.length > 0) {
                    _wpRemoveStatusBubble();
                    _wpLastRenderedState = state;
                    renderProductSelectionCard(data.products, data.platform || '', sessionId);
                    stopStatusPoller();   // pause until user picks
                } else {
                    // Products not yet in DB — keep polling
                    _wpUpdateStatusBubble('Products found — loading options\u2026');
                }
                return;
            }

            // ── Variant Selection Gate ─────────────────────────────────────
            if ((state === 'AWAITING_VARIANT_SELECTION' || state === 'STATE_AWAITING_VARIANT_SELECTION') && data.variant_options) {
                _wpRemoveStatusBubble();
                _wpLastRenderedState = state;
                renderVariantSelectionCard(data.variant_options, sessionId);
                stopStatusPoller();   // user must act before next poll resumes
            }

            // ── Final Confirmation Gate ───────────────────────────────
            if ((state === 'AWAITING_FINAL_CONFIRMATION' || state === 'STATE_AWAITING_CONFIRMATION') && data.selected_product) {
                _wpLastRenderedState = state;
                renderOrderConfirmationCard(
                    data.selected_product.title,
                    data.selected_product.price,
                    data.platform || '',
                    data.payment_info ? data.payment_info.method : 'Unknown',
                    data.payment_info ? data.payment_info.cod_available : false,
                    sessionId,
                    data.selected_product.chosen_variants || {}
                );
                stopStatusPoller();
            }

        } catch (err) {
            console.warn('[Poller] Error:', err);
        }
    }, 2000);
}

function stopStatusPoller() {
    if (_wpStatusPollerInterval) {
        clearInterval(_wpStatusPollerInterval);
        _wpStatusPollerInterval = null;
        console.log('[Poller] Stopped.');
    }
}

// ── Live status bubble ────────────────────────────────────────────────
const WP_STATUS_BUBBLE_ID = 'wpLiveStatusBubble';
let   _wpLastStatusMsg    = '';

function _wpUpdateStatusBubble(msg) {
    if (!msg || msg === _wpLastStatusMsg) return;
    _wpLastStatusMsg = msg;

    const output = document.getElementById('jsonOutput');
    if (!output) return;

    let bubble = document.getElementById(WP_STATUS_BUBBLE_ID);
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id        = WP_STATUS_BUBBLE_ID;
        bubble.className = 'wp-status-bubble';
        output.appendChild(bubble);
    }
    bubble.innerHTML =
        `<span class="wp-status-dot"></span><span class="wp-status-text">${escHtml(msg)}</span>`;

    const chatEl = document.getElementById('chatContainer');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

function _wpRemoveStatusBubble() {
    const bubble = document.getElementById(WP_STATUS_BUBBLE_ID);
    if (bubble) bubble.remove();
    _wpLastStatusMsg = '';
}


/**
 * Render a variant selection card so the user can choose Size, Color, etc.
 * variant_options: { "Size": ["S","M","L"], "Color": ["Red","Blue"] }
 */
function renderVariantSelectionCard(variantOptions, sessionId) {
    const output = document.getElementById('jsonOutput');
    if (!output) return;

    // Build a pill-group for each variant type
    const groupsHtml = Object.entries(variantOptions).map(([vtype, opts]) => {
        const pills = opts.map(v =>
            `<button class="wp-var-pill" data-type="${escHtml(vtype)}" data-val="${escHtml(v)}"
                     onclick="wpVariantPillClick(this,'${escHtml(vtype)}')"
                     id="wpVarPill_${escHtml(vtype)}_${escHtml(v)}">
                ${escHtml(v)}
            </button>`
        ).join('');
        return `<div class="wp-var-group">
            <div class="wp-var-group-label">Please select ${escHtml(vtype.toLowerCase())}:</div>
            <div class="wp-var-pills">${pills}</div>
        </div>`;
    }).join('');

    const sessionKey = escHtml(sessionId);
    const cardHtml = `
    <div class="wp-variant-card ai-message-card" id="wpVariantCard">
        <div class="wp-vc-header">
            <span class="wp-vc-icon">🎛️</span>
            <div class="wp-vc-title">Additional product information required.</div>
        </div>
        <div class="wp-var-groups">${groupsHtml}</div>
        <p class="wp-vc-hint">OR Please type your preferred option.</p>
        <div class="wp-vc-actions">
            <button class="wp-oc-btn wp-oc-btn--confirm" id="wpVarConfirmBtn"
                    onclick="wpSubmitVariants('${sessionKey}')" disabled>
                ✅ Confirm Selection
            </button>
        </div>
    </div>`;

    output.insertAdjacentHTML('beforeend', cardHtml);
    const chatEl = document.getElementById('chatContainer');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

/** Toggle pill selection — only one pill per group can be active */
window.wpVariantPillClick = function(btn, varType) {
    // Deactivate siblings in same group
    document.querySelectorAll(`.wp-var-pill[data-type="${varType}"]`).forEach(b => {
        b.classList.remove('wp-var-pill--active');
    });
    btn.classList.add('wp-var-pill--active');

    // Enable confirm button once all groups have a selection
    const groups = document.querySelectorAll('.wp-var-group');
    const allSelected = Array.from(groups).every(g => {
        const type = g.querySelector('.wp-var-pill')?.dataset.type;
        return type && document.querySelector(`.wp-var-pill[data-type="${type}"].wp-var-pill--active`);
    });
    const confirmBtn = document.getElementById('wpVarConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = !allSelected;
};

/** Collect all active pill choices and POST to /api/session/select-variant */
window.wpSubmitVariants = async function(sessionId) {
    const confirmBtn = document.getElementById('wpVarConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Applying…'; }
    document.querySelectorAll('.wp-var-pill').forEach(b => b.disabled = true);

    const chosen = {};
    document.querySelectorAll('.wp-var-pill--active').forEach(b => {
        chosen[b.dataset.type] = b.dataset.val;
    });

    try {
        const res = await fetch('/api/session/select-variant', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ session_id: sessionId, chosen_variants: chosen })
        });
        const data = await res.json();
        if (!data.ok) {
            renderAssistantMessage('❌ ' + (data.error || 'Could not apply selection.'));
        } else {
            // Resume polling — next gate is the order confirmation
            startStatusPoller(sessionId);
        }
    } catch (err) {
        renderAssistantMessage('❌ Network error while submitting variant selection.');
    }
};

/**
 * Render a horizontal scrollable product grid inside the chatbot.
 * Each card has: thumbnail, title, price, rating, and a "Select" button.
 */
function renderProductSelectionCard(products, platform, sessionId) {
    const output = document.getElementById('jsonOutput');
    if (!output) return;

    const platformLabel = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Store';
    const platformIcon  = { flipkart: '🛍️', amazon: '🛍️', blinkit: '⚡', pharmeasy: '💊' }[platform] || '🛍️';

    const cardsHtml = products.map((p, i) => {
        const thumb = p.thumbnail
            ? `<img src="${escHtml(p.thumbnail)}" alt="product" class="wp-pc-img" loading="lazy" onerror="this.style.display='none'">`
            : `<div class="wp-pc-img-placeholder">${platformIcon}</div>`;
        const rating = p.rating ? `<span class="wp-pc-rating">⭐ ${escHtml(String(p.rating))}</span>` : '';
        return `
        <div class="wp-product-card">
            <div class="wp-pc-thumb">${thumb}</div>
            <div class="wp-pc-body">
                <div class="wp-pc-title" title="${escHtml(p.title || '')}">${
                    escHtml((p.title || '').length > 60 ? p.title.slice(0,60) + '…' : (p.title || 'Product'))
                }</div>
                <div class="wp-pc-price">${escHtml(p.price || 'Price on page')}</div>
                ${rating}
            </div>
            <button class="wp-pc-select-btn" onclick="wpSelectProduct(${i},'${escHtml(sessionId)}')" id="wpSelBtn${i}">
                Select
            </button>
        </div>`;
    }).join('');

    const cardHtml = `
    <div class="wp-product-selection-card ai-message-card" id="wpProductSelectionCard">
        <div class="wp-psc-header">
            <span class="wp-psc-icon">${platformIcon}</span>
            <div>
                <div class="wp-psc-title">Choose a Product from ${escHtml(platformLabel)}</div>
                <div class="wp-psc-sub">Found ${products.length} results — tap one to proceed</div>
            </div>
        </div>
        <div class="wp-product-grid">
            ${cardsHtml}
        </div>
        <p class="wp-psc-hint">You can also type <strong>1</strong>, <strong>2</strong>, <strong>3</strong>… in the chat</p>
    </div>`;

    output.insertAdjacentHTML('beforeend', cardHtml);

    // Auto-scroll
    const chatEl = document.getElementById('chatContainer');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

/**
 * Called when user clicks a "Select" button on a product card.
 */
window.wpSelectProduct = async function(idx, sessionId) {
    // Disable all select buttons immediately to prevent double-click
    document.querySelectorAll('.wp-pc-select-btn').forEach(b => {
        b.disabled = true;
        b.textContent = 'Selecting…';
    });
    const clicked = document.getElementById(`wpSelBtn${idx}`);
    if (clicked) clicked.textContent = '\u2705 Selected';

    try {
        const res = await fetch('/api/session/select-product', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ session_id: sessionId, product_idx: idx })
        });
        const data = await res.json();
        if (!data.ok) {
            renderAssistantMessage('❌ ' + (data.error || 'Could not select product.'));
        } else {
            // Resume polling to catch the confirmation gate
            startStatusPoller(sessionId);
        }
    } catch (err) {
        renderAssistantMessage('❌ Network error while selecting product.');
    }
};

/**
 * Render the final order confirmation gate inside the chatbot.
 */
function renderOrderConfirmationCard(title, price, platform, paymentMethod, codAvailable, sessionId, chosenVariants) {
    const output = document.getElementById('jsonOutput');
    if (!output) return;

    const platformLabel = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Platform';
    const payBadge      = codAvailable
        ? '<span class="wp-oc-badge wp-oc-badge--cod">✅ Cash on Delivery</span>'
        : '<span class="wp-oc-badge wp-oc-badge--online">💳 Online Payment</span>';
    const sessionKey    = escHtml(sessionId);

    let variantRow = '';
    if (chosenVariants && Object.keys(chosenVariants).length > 0) {
        const varStr = Object.entries(chosenVariants).map(([k,v]) => `${k}: ${v}`).join(', ');
        variantRow = `<div class="wp-oc-row"><span class="wp-oc-label">🎛️ Options</span><span class="wp-oc-value">${escHtml(varStr)}</span></div>`;
    }

    const cardHtml = `
    <div class="wp-order-confirm-card ai-message-card" id="wpOrderConfirmCard">
        <div class="wp-oc-header">
            <span class="wp-oc-icon">📋</span>
            <div class="wp-oc-title">Order Confirmation</div>
        </div>
        <div class="wp-oc-summary">
            <div class="wp-oc-row"><span class="wp-oc-label">📦 Product</span><span class="wp-oc-value">${escHtml(title || 'Your Product')}</span></div>
            ${variantRow}
            <div class="wp-oc-row"><span class="wp-oc-label">💰 Price</span><span class="wp-oc-value">${escHtml(price || '—')}</span></div>
            <div class="wp-oc-row"><span class="wp-oc-label">🏪 Platform</span><span class="wp-oc-value">${escHtml(platformLabel)}</span></div>
            <div class="wp-oc-row"><span class="wp-oc-label">💳 Payment</span><span class="wp-oc-value">${payBadge}</span></div>
        </div>
        <p class="wp-oc-warn">⚠️ No order will be placed without your confirmation.</p>
        <div class="wp-oc-actions">
            <button class="wp-oc-btn wp-oc-btn--confirm" onclick="wpConfirmOrder(true,'${sessionKey}')">
                ✅ Confirm Order
            </button>
            <button class="wp-oc-btn wp-oc-btn--cancel" onclick="wpConfirmOrder(false,'${sessionKey}')">
                ❌ Cancel
            </button>
        </div>
    </div>`;

    output.insertAdjacentHTML('beforeend', cardHtml);
    const chatEl = document.getElementById('chatContainer');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

/**
 * Called by Confirm Order / Cancel buttons.
 */
window.wpConfirmOrder = async function(confirm, sessionId) {
    // Disable buttons immediately
    document.querySelectorAll('.wp-oc-btn').forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.5';
    });

    try {
        const res = await fetch('/api/session/confirm-order', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ session_id: sessionId, confirm })
        });
        const data = await res.json();
        if (data.ok) {
            if (confirm) {
                renderAssistantMessage('🚀 Placing your order now… please wait.');
                // Poll briefly to catch COMPLETED state
                startStatusPoller(sessionId);
            } else {
                renderAssistantMessage('❌ Order cancelled. Browser closed. Start a new search anytime.');
                stopStatusPoller();
            }
        } else {
            renderAssistantMessage('❌ ' + (data.error || 'Could not process your decision.'));
        }
    } catch (err) {
        renderAssistantMessage('❌ Network error while confirming order.');
    }
};
