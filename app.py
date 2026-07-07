from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_socketio import SocketIO
from google import genai
from google.genai import types
import json
import threading
import urllib.parse
import sqlite3
import os
import time
from playwright.sync_api import sync_playwright
import base64
import re

from dotenv import load_dotenv
load_dotenv()

template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
app = Flask(__name__, template_folder=template_dir)

from lexifair_engine import analyze 


# v2_frontend folder ke hisab se sahi relative imports lock kar diye
#from v2_frontend.auth import auth_bp
#from v2_frontend.auth.models import init_auth_db
#from v2_frontend.v2_pages import v2_bp


#app.register_blueprint(auth_bp, url_prefix='/api/auth')
#app.register_blueprint(v2_bp)

CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*")


client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
# ============================================================
# 🔥 UNIFIED AUTHENTICATION API: REGISTER ENDPOINT
# ============================================================
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        import sqlite3  # 🔥 Reference error se bachne ke liye inline import kiya
        data = request.get_json()
        print("👉 BACKEND DATA RECEIVED:", data)

        if not data:
            return jsonify({"success": False, "error": "No data received"}), 400

        # Elements ko strictly backend standard vars mein nikaala
        f_name   = str(data.get('full_name', '')).strip()
        f_email  = str(data.get('email', '')).strip()
        f_mobile = str(data.get('mobile_number', '')).strip()
        f_pwd    = str(data.get('password', ''))

        if not all([f_name, f_email, f_mobile, f_pwd]):
            return jsonify({"success": False, "error": "Fields cannot be empty!"}), 400

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Safe table creation check
        try:
            cursor.execute('''
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    mobile TEXT NOT NULL,
                    password TEXT NOT NULL
                )
            ''')
        except sqlite3.OperationalError:
            pass

        # Email existing validation
        cursor.execute("SELECT id FROM users WHERE email = ?", (f_email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "error": "Email already registered!"}), 400

        # 🔥 FIXED BINDINGS: Tuple ko strictly elements ke barabar 4 values ke saath lock kiya
        cursor.execute(
            "INSERT INTO users (full_name, email, mobile, password) VALUES (?, ?, ?, ?)",
            (f_name, f_email, f_mobile, f_pwd)
        )
        conn.commit()
        conn.close()

        print(f"✅ [SUCCESS] USER WRITTEN TO DATABASE: {f_email}")
        
        # Exact JSON object returned for auth.js promise resolution
        return jsonify({
            "success": True, 
            "message": "Registration successful", 
            "token": "setup_token_active", 
            "challenge_id": "challenge_generated"
        }), 200

    except Exception as e:
        print(f"❌ [CRITICAL REGISTER CRASH]: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

DB_PATH = os.path.join(os.path.dirname(__file__), 'webpilot_sessions.db')

ACTIVE_AUTOMATION_SESSIONS = {}
SCREENSHOT_BUFFER = {}

def get_db():
    """Return a thread-local SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT    NOT NULL,
                role        TEXT    NOT NULL,
                type        TEXT    NOT NULL DEFAULT 'chat',
                content     TEXT    NOT NULL,
                created_at  INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
            CREATE TABLE IF NOT EXISTS automation_state (
                session_id              TEXT PRIMARY KEY,
                state                   TEXT NOT NULL DEFAULT 'IDLE',
                platform                TEXT,
                item_name               TEXT,
                user_query              TEXT,
                selected_product_title  TEXT,
                selected_product_price  TEXT,
                selected_product_link   TEXT,
                payment_method          TEXT,
                cod_available           INTEGER DEFAULT 0,
                variant_options         TEXT,
                chosen_variants         TEXT,
                status_message          TEXT,
                updated_at              INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS automation_products (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id   TEXT NOT NULL,
                idx          INTEGER NOT NULL,
                title        TEXT,
                price        TEXT,
                rating       TEXT,
                link         TEXT,
                thumbnail    TEXT,
                FOREIGN KEY (session_id) REFERENCES automation_state(session_id)
            );
        """)


def set_auto_state(session_id, state, platform=None, item_name=None,
                   user_query=None, selected_title=None, selected_price=None,
                   selected_link=None, payment_method=None, cod_available=None,
                   variant_options=None, chosen_variants=None, status_message=None):
    """Upsert the automation state for a session into SQLite."""
    now = int(time.time() * 1000)
    try:
        with get_db() as conn:
            row = conn.execute(
                'SELECT session_id FROM automation_state WHERE session_id=?',
                (session_id,)
            ).fetchone()
            # Broad type guardrail — guard against NoneType subscript crash
            existing = row if (row is not None and len(row) > 0) else None
            if existing:
                # Build dynamic UPDATE only touching supplied fields
                updates = ['state=?', 'updated_at=?']
                params  = [state, now]
                if platform        is not None: updates.append('platform=?');               params.append(platform)
                if item_name       is not None: updates.append('item_name=?');              params.append(item_name)
                if user_query      is not None: updates.append('user_query=?');             params.append(user_query)
                if selected_title  is not None: updates.append('selected_product_title=?'); params.append(selected_title)
                if selected_price  is not None: updates.append('selected_product_price=?'); params.append(selected_price)
                if selected_link   is not None: updates.append('selected_product_link=?');  params.append(selected_link)
                if payment_method  is not None: updates.append('payment_method=?');         params.append(payment_method)
                if cod_available   is not None: updates.append('cod_available=?');          params.append(1 if cod_available else 0)
                if variant_options is not None: updates.append('variant_options=?');        params.append(json.dumps(variant_options) if isinstance(variant_options, dict) else variant_options)
                if chosen_variants is not None: updates.append('chosen_variants=?');        params.append(json.dumps(chosen_variants) if isinstance(chosen_variants, dict) else chosen_variants)
                if status_message  is not None: updates.append('status_message=?');         params.append(status_message)
                params.append(session_id)
                conn.execute(f'UPDATE automation_state SET {", ".join(updates)} WHERE session_id=?', params)
            else:
                conn.execute(
                    '''INSERT INTO automation_state
                       (session_id, state, platform, item_name, user_query,
                        selected_product_title, selected_product_price, selected_product_link,
                        payment_method, cod_available, variant_options, chosen_variants,
                        status_message, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (session_id, state, platform, item_name, user_query,
                     selected_title, selected_price, selected_link,
                     payment_method, 1 if cod_available else 0,
                     json.dumps(variant_options) if isinstance(variant_options, dict) else variant_options,
                     json.dumps(chosen_variants) if isinstance(chosen_variants, dict) else chosen_variants,
                     status_message, now)
                )
        print(f"[STATE] {session_id[:12]} → {state}")

        # Trace mapping for Requirement 8 / Variant-Aware State Machine
        trace_state = None
        if state.startswith("STATE_"):
            trace_state = state

        if trace_state:
            if 'STATE_HISTORY' not in globals():
                globals()['STATE_HISTORY'] = {}
            
            history = globals()['STATE_HISTORY'].setdefault(session_id, [])
            
            if not history or history[-1] != trace_state:
                history.append(trace_state)
                
            print("\n=== STATE TRANSITION TRACE ===")
            print(" ↓ \n".join(history))
            print("==============================\n")
    except Exception as e:
        print(f"[STATE ERROR] set_auto_state failed: {e}")


def get_auto_state(session_id):
    """Return the current automation state row as a dict, or None."""
    try:
        with get_db() as conn:
            row = conn.execute(
                'SELECT * FROM automation_state WHERE session_id=?',
                (session_id,)
            ).fetchone()
        return dict(row) if row else None
    except Exception as e:
        print(f"[STATE ERROR] get_auto_state failed: {e}")
        return None





def get_products_from_db(session_id):
    """Return list of product dicts for a session."""
    try:
        with get_db() as conn:
            rows = conn.execute(
                'SELECT idx, title, price, rating, link, thumbnail FROM automation_products WHERE session_id=? ORDER BY idx',
                (session_id,)
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"[STATE ERROR] get_products_from_db failed: {e}")
        return []





def extract_url_or_domain(text: str) -> str:
    """
    Analyzes text to extract a domain or absolute URL.
    Returns the absolute URL if found (prepending https:// if protocol is missing), otherwise None.
    """
    text = text.strip()
    # 1. Search for absolute URL with http or https protocol
    url_match = re.search(r'https?://[^\s/$.?#].[^\s]*', text, re.IGNORECASE)
    if url_match:
        return url_match.group(0)

    # 2. Search for common domain names (e.g. wikipedia.org, irctc.co.in)
    domain_match = re.search(r'\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,6}(?:/[^\s]*)?\b', text)
    if domain_match:
        domain = domain_match.group(0)
        return f"https://{domain}"
        
    return None


def extract_website_name(text: str) -> str:
    """
    Extracts the name of the website/platform from user natural language query.
    Used to dynamically search Google without hardcoded maps.
    """
    text_clean = text.strip()
    
    # 1. Match 'open [website]', 'visit [website]', 'go to [website]', 'navigate to [website]'
    match = re.search(r'\b(?:open|visit|go\s+to|navigate\s+to)\s+([a-zA-Z0-9-]+)', text_clean, re.IGNORECASE)
    if match:
        return match.group(1).strip()
        
    # 2. Match 'from [website]', 'on [website]', 'at [website]', 'via [website]'
    match_from = re.search(r'\b(?:from|on|at|via)\s+([a-zA-Z0-9-]+)\b', text_clean, re.IGNORECASE)
    if match_from:
        return match_from.group(1).strip()
        
    # 3. Match 'search [website]'
    match_search = re.search(r'\b(?:search|show)\s+([a-zA-Z0-9-]+)\b', text_clean, re.IGNORECASE)
    if match_search:
        return match_search.group(1).strip()
        
    # Fallback to the last word
    words = text_clean.split()
    if words:
        # Avoid short articles/prepositions
        for w in reversed(words):
            if w.lower() not in ["website", "site", "page", "portal", "link"]:
                return w
        return words[-1]
    return text_clean


def sanitize_code_fences(text: str) -> str:
    """
    Ensure every opening ``` in the AI response has a matching closing ```.
    Gemini may truncate at token limits mid-block; this repairs the output
    so the JS markdown parser always sees balanced fences.

    Strategy:
      - Count fence markers line-by-line.
      - Track currently-open lang identifier.
      - If text ends with an unclosed fence, append newline + closing ```.
    """
    if not text:
        return text

    lines = text.splitlines()
    fence_open    = False
    open_lang     = ''
    FENCE_RE      = re.compile(r'^```([a-zA-Z0-9+#.\-]*)[\s]*$')

    for line in lines:
        m = FENCE_RE.match(line.strip())
        if m:
            if not fence_open:
                fence_open = True
                open_lang  = m.group(1).strip()
            else:
                fence_open = False
                open_lang  = ''

    if fence_open:
        # Response was cut mid-block — close it gracefully
        text = text.rstrip() + '\n```'
        print(f"[FENCE REPAIR] Closed unclosed ``` block (lang='{open_lang}')")

    return text


def save_model_message(session_id, text):
    try:
        now = int(time.time() * 1000)
        with get_db() as conn:
            conn.execute(
                'INSERT INTO messages (session_id, role, type, content, created_at) VALUES (?,?,?,?,?)',
                (session_id, 'model', 'chat', text, now)
            )
            conn.execute(
                'UPDATE sessions SET updated_at=? WHERE id=?',
                (now, session_id)
            )
        print(f"[DATABASE_SAVER] Saved model message: {text}")
    except Exception as e:
        print(f"[WARNING] Could not save message to database: {e}")





@app.route('/api/session/create', methods=['POST'])
def api_create_session():
    """Create a new chat session, return its ID."""
    data       = request.get_json(silent=True) or {}
    session_id = data.get('id', str(int(time.time() * 1000)))
    title      = (data.get('title', 'New Chat') or 'New Chat')[:120]
    now        = int(time.time() * 1000)
    try:
        with get_db() as conn:
            conn.execute(
                'INSERT OR IGNORE INTO sessions (id, title, created_at, updated_at) VALUES (?,?,?,?)',
                (session_id, title, now, now)
            )
        return jsonify({'ok': True, 'session_id': session_id}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/session/list', methods=['GET'])
def api_list_sessions():
    """Return all sessions sorted by most recently updated."""
    try:
        with get_db() as conn:
            rows = conn.execute(
                'SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 200'
            ).fetchall()
        return jsonify({'ok': True, 'sessions': [dict(r) for r in rows]}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/session/<session_id>/messages', methods=['GET'])
def api_get_messages(session_id):
    """Return all messages for a session, oldest first."""
    try:
        with get_db() as conn:
            rows = conn.execute(
                'SELECT role, type, content, created_at FROM messages WHERE session_id=? ORDER BY id ASC',
                (session_id,)
            ).fetchall()
        return jsonify({'ok': True, 'messages': [dict(r) for r in rows]}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


def internal_save_message(session_id, role, content, mtype='chat'):
    now = int(time.time() * 1000)
    try:
        with get_db() as conn:
            conn.execute(
                'INSERT INTO messages (session_id, role, type, content, created_at) VALUES (?,?,?,?,?)',
                (session_id, role, mtype, content, now)
            )
            conn.execute(
                'UPDATE sessions SET updated_at=?, title=CASE WHEN title="New Chat" THEN ? ELSE title END WHERE id=?',
                (now, content[:60], session_id)
            )
        return True, None
    except Exception as e:
        return False, str(e)

@app.route('/api/session/<session_id>/message', methods=['POST'])
def api_save_message(session_id):
    """Append one message to a session."""
    data    = request.get_json(silent=True) or {}
    role    = data.get('role', 'user')
    mtype   = data.get('type', 'chat')
    content = str(data.get('content', '')).strip()
    if not content:
        return jsonify({'ok': False, 'error': 'Empty content'}), 400
        
    success, err = internal_save_message(session_id, role, content, mtype)
    if success:
        return jsonify({'ok': True}), 200
    else:
        return jsonify({'ok': False, 'error': err}), 500


@app.route('/api/session/<session_id>', methods=['DELETE'])
def api_delete_session(session_id):
    """Delete a session entirely."""
    try:
        with get_db() as conn:
            conn.execute('DELETE FROM automation_products WHERE session_id=?', (session_id,))
            conn.execute('DELETE FROM automation_state WHERE session_id=?', (session_id,))
            conn.execute('DELETE FROM messages WHERE session_id=?', (session_id,))
            conn.execute('DELETE FROM sessions WHERE id=?', (session_id,))
            conn.commit()
        return jsonify({'ok': True}), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/session/status', methods=['GET'])
def api_session_status():
    """Poll endpoint: returns current automation state + products/confirmation/variant data."""
    session_id = request.args.get('session_id', '')
    if not session_id:
        return jsonify({'ok': False, 'error': 'session_id required'}), 400
    try:
        state_row = get_auto_state(session_id)
        if not state_row:
            return jsonify({'ok': True, 'state': AutoState.IDLE, 'platform': None,
                            'item_name': None, 'products': [], 'selected_product': None,
                            'payment_info': None, 'variant_options': None,
                            'status_message': None}), 200

        state = state_row.get('state', AutoState.IDLE)
        products        = []
        selected_product = None
        payment_info    = None
        variant_options = None

        if state == AutoState.AWAITING_PRODUCT_SELECTION:
            products = get_products_from_db(session_id)

        if state == AutoState.AWAITING_VARIANT_SELECTION:
            raw = state_row.get('variant_options')
            if raw:
                try:
                    variant_options = json.loads(raw) if isinstance(raw, str) else raw
                except:
                    variant_options = None

        if state == AutoState.AWAITING_FINAL_CONFIRMATION:
            selected_product = {
                'title': state_row.get('selected_product_title', ''),
                'price': state_row.get('selected_product_price', ''),
                'link':  state_row.get('selected_product_link', ''),
            }
            chosen_raw = state_row.get('chosen_variants')
            chosen = {}
            if chosen_raw:
                try:
                    chosen = json.loads(chosen_raw) if isinstance(chosen_raw, str) else chosen_raw
                except:
                    pass
            selected_product['chosen_variants'] = chosen
            payment_info = {
                'method':        state_row.get('payment_method', 'Unknown'),
                'cod_available': bool(state_row.get('cod_available', 0))
            }

        return jsonify({
            'ok':              True,
            'state':           state,
            'platform':        state_row.get('platform'),
            'item_name':       state_row.get('item_name'),
            'products':        products,
            'selected_product': selected_product,
            'payment_info':    payment_info,
            'variant_options': variant_options,
            'status_message':  state_row.get('status_message')
        }), 200
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/session/select-product', methods=['POST'])
def api_select_product():
    """Called when the user clicks a product card. Resumes the automation thread."""
    data = request.get_json(silent=True) or {}
    session_id  = data.get('session_id', '')
    product_idx = data.get('product_idx', None)

    if not session_id or product_idx is None:
        return jsonify({'ok': False, 'error': 'session_id and product_idx required'}), 400

    try:
        product_idx = int(product_idx)
    except (ValueError, TypeError):
        return jsonify({'ok': False, 'error': 'product_idx must be an integer'}), 400

    # Get product from DB
    products = get_products_from_db(session_id)
    if not products or product_idx >= len(products):
        return jsonify({'ok': False, 'error': 'Invalid product index'}), 400

    selected = products[product_idx]

    # Store selection in ACTIVE_AUTOMATION_SESSIONS for thread to pick up
    if session_id in ACTIVE_AUTOMATION_SESSIONS:
        sess = ACTIVE_AUTOMATION_SESSIONS[session_id]
        sess['selected_link']  = selected.get('link', '')
        sess['selected_title'] = selected.get('title', '')
        sess['selected_idx']   = product_idx
        sess['status'] = 'product_confirmed'

        # Update DB state
        set_auto_state(session_id, AutoState.PRODUCT_SELECTED,
                       selected_title=selected.get('title', ''),
                       selected_price=selected.get('price', ''),
                       selected_link=selected.get('link', ''))



        # Fire resume_event to unblock the automation thread
        if 'resume_event' in sess:
            sess['resume_event'].set()

        save_model_message(session_id,
            f"✅ **Selected:** {selected.get('title', '')} — {selected.get('price', '')}\n"
            f"Opening product page and proceeding to checkout...")

        return jsonify({
            'ok': True,
            'selected_title': selected.get('title', ''),
            'selected_price': selected.get('price', '')
        }), 200
    else:
        return jsonify({'ok': False, 'error': 'No active automation session found. Please start a new search.'}), 404


@app.route('/api/session/select-variant', methods=['POST'])
def api_select_variant():
    """
    Called when the user submits variant choices from the variant card.
    Body: { "session_id": "...", "chosen_variants": { "Size": "9", "Color": "Black" } }
    """
    data = request.get_json(silent=True) or {}
    session_id      = data.get('session_id', '')
    chosen_variants = data.get('chosen_variants', {})

    if not session_id:
        return jsonify({'ok': False, 'error': 'session_id required'}), 400
    if not chosen_variants or not isinstance(chosen_variants, dict):
        return jsonify({'ok': False, 'error': 'chosen_variants must be a non-empty dict'}), 400

    if session_id not in ACTIVE_AUTOMATION_SESSIONS:
        return jsonify({'ok': False, 'error': 'No active automation session'}), 404

    sess = ACTIVE_AUTOMATION_SESSIONS[session_id]
    sess['chosen_variants'] = chosen_variants
    sess['status'] = 'variant_confirmed'

    set_auto_state(session_id, AutoState.VARIANT_SELECTED,
                   chosen_variants=chosen_variants,
                   status_message='Variant selected — applying on page…')

    variant_label = ', '.join(f'{k}: {v}' for k, v in chosen_variants.items())
    save_model_message(session_id,
        f"✅ **Option selected:** {variant_label}\nApplying your selection and proceeding…")

    if 'resume_event' in sess:
        sess['resume_event'].set()

    return jsonify({'ok': True, 'chosen_variants': chosen_variants}), 200


@app.route('/api/session/confirm-order', methods=['POST'])
def api_confirm_order():
    """Called when the user clicks Confirm Order or Cancel in the confirmation card."""
    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id', '')
    confirm    = data.get('confirm', False)

    if not session_id:
        return jsonify({'ok': False, 'error': 'session_id required'}), 400

    if session_id not in ACTIVE_AUTOMATION_SESSIONS:
        return jsonify({'ok': False, 'error': 'No active automation session'}), 404

    sess = ACTIVE_AUTOMATION_SESSIONS[session_id]

    if confirm:
        sess['status'] = 'final_order_confirmed'
        set_auto_state(session_id, AutoState.ORDER_EXECUTION)
        if 'resume_event' in sess:
            sess['resume_event'].set()
        return jsonify({'ok': True, 'message': 'Order confirmed. Placing now...'}), 200
    else:
        sess['status'] = 'cancelled'
        set_auto_state(session_id, AutoState.CANCELLED)
        try:
            sess.get('browser_instance', None) and sess['browser_instance'].close()
        except:
            pass
        if session_id in ACTIVE_AUTOMATION_SESSIONS:
            del ACTIVE_AUTOMATION_SESSIONS[session_id]
        save_model_message(session_id, "❌ Order cancelled. Browser closed. Start a new search anytime.")
        return jsonify({'ok': True, 'message': 'Order cancelled.'}), 200

# ====================================================================
# 🏠 RABBIT AI LANDING PORTAL & INTEGRATED FRONTEND CONTROLLERS
# ====================================================================

@app.route('/')
def home():
    # Yeh tumhaara WebPilot OS ka main dhasu landing page load karega
    return render_template('new.html')  

@app.route('/login')
def login_page():
    # Auth folder ke andar ki login page ko bina chede call karega
    return render_template('auth/login.html')

@app.route('/register')
def register_page():
    return render_template('auth/register.html')

@app.route('/verify-otp')
def otp_page():
    return render_template('auth/verify-otp.html')

@app.route('/chat')
def chat_console():
    # WebPilot Consumer Purpose ka Chat/Conversation Dashboard
    return render_template('chat.html')  

@app.route('/business')
def business_dashboard():
    # LexiFair Business Purpose ka Dynamic Data Dashboard
    return render_template('business.html')  

# ====================================================================



# ==========================================================
# PHASE 2 & 3: ADAPTIVE COPILOT & SCREENSHOT HOOKS
# ==========================================================

def take_live_viewport_screenshot(page, session_id):
    """Background thread that continuously captures the active Playwright screen."""
    print(f"[VISION] Starting background screenshot loop for session {session_id}")
    while True:
        try:
            if page.is_closed():
                print(f"[VISION] Page closed. Stopping screenshot loop for {session_id}")
                break
            
            # Inject interactive element tags
            tagging_script = """
            () => {
                let existingTags = document.querySelectorAll('.wp-copilot-tag');
                existingTags.forEach(t => t.remove());
                
                let interactables = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
                let count = 1;
                interactables.forEach(el => {
                    let rect = el.getBoundingClientRect();
                    if(rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden') {
                        let tag = document.createElement('div');
                        tag.className = 'wp-copilot-tag';
                        tag.textContent = '[' + count + ']';
                        tag.style.position = 'absolute';
                        tag.style.left = (rect.left + window.scrollX) + 'px';
                        tag.style.top = (rect.top + window.scrollY) + 'px';
                        tag.style.backgroundColor = '#ff0000';
                        tag.style.color = '#ffffff';
                        tag.style.padding = '2px 4px';
                        tag.style.fontSize = '12px';
                        tag.style.zIndex = '999999';
                        tag.style.pointerEvents = 'none';
                        tag.style.fontWeight = 'bold';
                        tag.style.borderRadius = '3px';
                        document.body.appendChild(tag);
                        
                        el.setAttribute('data-wp-tag-id', count);
                        count++;
                    }
                });
            }
            """
            try:
                page.evaluate(tagging_script)
            except Exception as e:
                print(f"Tagging error: {e}")

            # Capture screenshot in memory (base64)
            screenshot_bytes = page.screenshot(type="jpeg", quality=50)
            b64_image = base64.b64encode(screenshot_bytes).decode('utf-8')
            
            # Store in buffer
            SCREENSHOT_BUFFER[session_id] = b64_image
            time.sleep(10) # Take snapshot every 10 seconds
        except Exception as e:
            print(f"[VISION ERROR] Screenshot loop failed: {e}")
            break


def proactive_coaching_monitor(page, session_id):
    """Monitors the active page for URL changes and triggers proactive audio guidance."""
    print(f"[COACH MONITOR] Starting proactive coaching monitor for session {session_id}")
    last_url = ""
    while True:
        try:
            if page.is_closed():
                print(f"[COACH MONITOR] Page closed. Stopping coach monitor for {session_id}")
                break
            
            current_url = page.url
            if "google.com" in current_url or "google.co.in" in current_url:
                last_url = current_url
                time.sleep(1)
                continue
                
            if current_url != last_url:
                print(f"[COACH MONITOR] URL changed from '{last_url}' to '{current_url}'. Waiting for load...")
                time.sleep(4)  # Wait for page load and screenshot buffer to update
                if page.is_closed():
                    break
                
                # Fetch screenshot
                b64_image = SCREENSHOT_BUFFER.get(session_id)
                if b64_image:
                    print(f"[COACH MONITOR] Triggering proactive vocal guidance for {current_url}")
                    system_prompt = """You are an active visual voice coach for WebPilot OS.
You are looking at a LIVE browser session screenshot.
Speak directly to Mohit in interactive Hinglish based on what you visually scan on the active page.
NEVER stay quiet — always speak based on the screen.
If you see a product catalog: mention 2-3 products visible and ask which one to pick.
If you see a search bar: tell Mohit what to type.
If you see a login/form: guide them through the exact field to fill.
If you see a loading screen: reassure them and confirm it is loading.
If you see a captcha or block: alert them immediately.
If you see a checkout page: walk them through the payment steps.
Keep your response under 2 sentences, friendly and actionable.
Always address the user as 'Bhai Mohit'."""
                    
                    contents = [
                        types.Content(role="user", parts=[
                            types.Part.from_text(text=system_prompt),
                            types.Part.from_inline_data(
                                mime_type="image/jpeg",
                                data=base64.b64decode(b64_image)
                            )
                        ])
                    ]
                    
                    response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=contents
                    )
                    
                    reply_text = sanitize_code_fences(response.text)
                    print(f"[COACH MONITOR] Proactive Voice guidance: {reply_text}")
                    
                    # Persist message
                    internal_save_message(session_id, "ai", reply_text)
                    # Emit to frontend speaker
                    socketio.emit('co_pilot_voice', {"reply": reply_text, "msg": reply_text, "status": "success"})
                
                last_url = current_url
                
            time.sleep(3)  # Check URL every 3 seconds
        except Exception as e:
            print(f"[COACH MONITOR ERROR] failed: {e}")
            break

def initialize_browser_session(platform):
    """Initialize Playwright context safely."""
    p = sync_playwright().start()
    profile_name = "user" if platform in ["direct", "search", "generic"] else platform
    profile_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"playwright_{profile_name}_profile")
    os.makedirs(profile_dir, exist_ok=True)
    
    context = p.chromium.launch_persistent_context(
        user_data_dir=profile_dir,
        headless=False,
        args=["--start-maximized", "--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"]
    )
    return p, context

def adaptive_copilot_pipeline(session_id, item_name, platform="generic", user_query=None):
    """
    Shift from Automation to Adaptive Assistance.
    Navigates to the target search URL via Google, then hands over control to Vision AI.
    """
    print(f"[COPILOT] Initiating adaptive assistance for '{item_name}' on '{platform}'...")

    try:
        p, context = initialize_browser_session(platform)
        page = context.pages[0] if context.pages else context.new_page()

        # Save session BEFORE any state writes to prevent 500s from uninitialized session handlers
        ACTIVE_AUTOMATION_SESSIONS[session_id] = {
            "playwright": p,
            "context": context,
            "page": page
        }

        set_auto_state(session_id, "STATE_SEARCHING", platform=platform, item_name=item_name)

        # Stage 2: Direct URL mode — navigate straight to the supplied URL
        if platform == "direct":
            print(f"[COPILOT] Direct Domain mode. Navigating directly to: {item_name}")
            page.goto(item_name)

        # Universal Google Gateway — no hardcoded platform dictionaries
        else:
            search_query = urllib.parse.quote(item_name)
            google_url = f"https://www.google.com/search?q={search_query}"
            print(f"[COPILOT] Universal Google Gateway. Navigating to: {google_url}")
            page.goto(google_url)

            # Auto-click the first organic result — resilient multi-selector strategy
            # Google frequently changes its internal class names; this covers all known layouts.
            ORGANIC_SELECTORS = [
                'div.g a h3',                                                    # Standard layout
                '#search a[href^="http"]:not([href*="google.com"]) h3',           # Non-Google href h3
                '#rso .yuRUbf a h3',                                             # Featured snippet fallback
                '#search .tF2Cxc a h3',                                          # Legacy card layout
                'h3.LC20lb',                                                     # Class-based fallback
            ]
            clicked = False
            for selector in ORGANIC_SELECTORS:
                try:
                    page.wait_for_selector(selector, timeout=4000)
                    loc = page.locator(selector).first
                    if loc.count() > 0:
                        loc.click()
                        print(f"[COPILOT] First organic result clicked via selector: '{selector}'")
                        clicked = True
                        break
                except Exception:
                    continue
            if not clicked:
                print("[COPILOT] All selectors exhausted — staying on search results page.")

        # Wait for target page to stabilize
        try:
            page.wait_for_load_state("domcontentloaded", timeout=10000)
        except Exception:
            pass

        # Screenshot observation loop REMOVED — cross-thread Playwright access
        # causes 'Cannot switch to a different thread' errors.
        # Screenshots are now captured synchronously inside /process-voice (session_active branch).

        # Start proactive coaching URL-change monitor
        #threading.Thread(target=proactive_coaching_monitor, args=(page, session_id), daemon=True).start()

        print("[COPILOT] Handover complete. Vision AI is now observing the screen.")
        set_auto_state(session_id, "STATE_OBSERVING_USER")

        # Immediate Voice Copilot Handover via SocketIO
        parsed_url = urllib.parse.urlparse(page.url)
        domain_name = parsed_url.netloc.replace("www.", "") or "the page"
        welcome_msg = f"Bhai Mohit, {domain_name} khul gaya hai. Ab batao aapko kya karna hai — main yahan hoon guide karne ke liye."

        internal_save_message(session_id, "ai", welcome_msg)
        socketio.emit('co_pilot_voice', {"reply": welcome_msg, "msg": welcome_msg, "status": "success"})

        # Block thread so browser context stays alive
        threading.Event().wait()

    except Exception as e:
        print(f"[CRASH] Copilot setup failed: {e}")
        try:
            set_auto_state(session_id, "STATE_FAILED")
        except Exception:
            pass
    finally:
        print("[CLEANUP] Copilot thread exiting.")


# ==========================================================
# PHASE 4: VISION-LANGUAGE BRIDGE (Voice Endpoint)
# ==========================================================

@app.route('/process-voice', methods=['POST'])
@app.route('/api/voice', methods=['POST'])
def process_voice():
    """
    Refactored process_voice to act as a Universal AI Web Copilot intent router.
    Routes to Direct Domain Mode or Intent/Search Mode dynamically via Gemini LLM,
    and uses Gemini Vision + DOM tag IDs for continuous visual coaching.
    """
    try:
        data = request.get_json(silent=True) or {}
        session_id = data.get("session_id", "default_session")
        audio_text = data.get("audio_text") or data.get("command", "")
        
        if not audio_text:
            return jsonify({"error": "Missing audio_text or command"}), 400
            
        print(f"[VOICE INPUT] User: {audio_text}")
        
        session_active = session_id in ACTIVE_AUTOMATION_SESSIONS
        
        if not session_active:
            # ── 1. NEW NAVIGATION (Gemini Text Model) ──
            routing_prompt = f"""
Analyze the user's speech: "{audio_text}"
If it's a general task (like booking tickets, ordering medicine):
Format as JSON: {{"intent": "ask_platform", "industry": "Ticketing/Healthcare/etc", "suggested_platforms": ["P1", "P2", "P3"], "reply_text": "Hinglish question asking which platform to use."}}
If the user explicitly specified a platform (e.g. 'from IRCTC', 'on Netmeds'):
Format as JSON: {{"intent": "launch_platform", "target_platform": "IRCTC", "query": "book ticket"}}
Return ONLY raw JSON, no markdown.
"""
            # ── 429 Rate-Limit Shield: retry up to 2 times on resource exhaustion ──
            resp = None
            for _attempt in range(3):
                try:
                    resp = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=routing_prompt
                    )
                    break
                except Exception as quota_err:
                    err_str = str(quota_err).lower()
                    if '429' in err_str or 'quota' in err_str or 'resource' in err_str or 'exhausted' in err_str:
                        print(f"[QUOTA] Rate limit hit (attempt {_attempt+1}/3). Sleeping 2s...")
                        time.sleep(2)
                    else:
                        raise  # Re-raise non-quota errors immediately
            if resp is None:
                rate_reply = "Bhai Mohit, server par request limits chal rahi hain. Kripya 5 second baad apna command dobara bolein."
                socketio.emit('co_pilot_voice', {"reply": rate_reply, "msg": rate_reply, "status": "rate_limited"})
                return jsonify({"reply": rate_reply, "status": "rate_limited"}), 200
            
            try:
                raw_text = resp.text.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:-3].strip()
                elif raw_text.startswith("```"):
                    raw_text = raw_text[3:-3].strip()
                parsed = json.loads(raw_text)
            except Exception as e:
                print("JSON parsing error:", e)
                parsed = {"intent": "launch_platform", "target_platform": "search", "query": audio_text}
                
            if parsed.get("intent") == "launch_platform":
                target_platform = parsed.get("target_platform", "").strip()
                target_query    = parsed.get("query", "").strip() or audio_text

                # Secure concatenation: blend platform name into query so Google
                # always hits the exact portal as the top organic result.
                if target_platform and target_platform.lower() not in target_query.lower():
                    final_query = f"{target_platform} {target_query}"
                else:
                    final_query = target_query or target_platform or audio_text

                print(f"[INTENT BRIDGE] Launching. Platform: '{target_platform}'. Final query: '{final_query}'")
                threading.Thread(
                    target=adaptive_copilot_pipeline,
                    args=(session_id, final_query, target_platform or "search"),
                    daemon=True
                ).start()

                reply_text = f"Theek hai Bhai Mohit! '{final_query}' ke liye browser launch ho raha hai."
            else:
                reply_text = parsed.get("reply_text", "Aap kis website se shuru karna chahenge?")
                
            internal_save_message(session_id, "user", audio_text)
            internal_save_message(session_id, "ai", reply_text)
            socketio.emit('co_pilot_voice', {"reply": reply_text, "msg": reply_text, "status": "success"})
            return jsonify({"reply": reply_text, "status": "success"}), 200

        else:
            # ── 2. CONTINUOUS VISUAL COACHING LOOP (Gemini Vision Model) ──

            # ── Thread-Safe Inline Screenshot Capture ────────────────────────────────
            # Playwright page objects must be accessed from their own thread only.
            # We capture synchronously here, inside the request thread, instead of
            # relying on the now-removed background take_live_viewport_screenshot thread.
            tagging_script = """
            () => {
                let existingTags = document.querySelectorAll('.wp-copilot-tag');
                existingTags.forEach(t => t.remove());
                let interactables = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
                let count = 1;
                interactables.forEach(el => {
                    let rect = el.getBoundingClientRect();
                    if(rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden') {
                        let tag = document.createElement('div');
                        tag.className = 'wp-copilot-tag';
                        tag.textContent = '[' + count + ']';
                        tag.style.cssText = 'position:absolute;left:'+(rect.left+window.scrollX)+'px;top:'+(rect.top+window.scrollY)+'px;background:#ff0000;color:#fff;padding:2px 4px;font-size:12px;z-index:999999;pointer-events:none;font-weight:bold;border-radius:3px;';
                        document.body.appendChild(tag);
                        el.setAttribute('data-wp-tag-id', count);
                        count++;
                    }
                });
            }
            """
            sess = ACTIVE_AUTOMATION_SESSIONS.get(session_id)
            if sess and "page" in sess and not sess["page"].is_closed():
                try:
                    sess["page"].evaluate(tagging_script)
                    screenshot_bytes = sess["page"].screenshot(type="jpeg", quality=50)
                    SCREENSHOT_BUFFER[session_id] = base64.b64encode(screenshot_bytes).decode('utf-8')
                    print("[VISION] Inline screenshot captured successfully.")
                except Exception as cap_err:
                    print("[VISION] Inline capture failed:", cap_err)

            b64_image = SCREENSHOT_BUFFER.get(session_id)

            system_prompt = f"""You are WebPilot OS Live Audio Coach.
Attached is the current screenshot of the website. Interactive elements are tagged with numbers like [1], [2] in red boxes.
User says: "{audio_text}"
If the user wants to click an element, return the ID number of the tag.
If they want to scroll, indicate the direction.
Always provide a friendly Hinglish response.
Respond ONLY in this JSON format:
{{
  "reply_text": "short response",
  "action_type": "click | scroll | none",
  "target_id": "number string, if click",
  "direction": "up | down, if scroll"
}}"""

            contents = []
            if b64_image:
                contents.append(
                    types.Content(role="user", parts=[
                        types.Part.from_text(text=system_prompt),
                        types.Part.from_inline_data(mime_type="image/jpeg", data=base64.b64decode(b64_image))
                    ])
                )
            else:
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=system_prompt)]))

            # ── 429 Rate-Limit Shield for Vision call ────────────────────────────────
            response = None
            for _attempt in range(3):
                try:
                    response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=contents
                    )
                    break
                except Exception as quota_err:
                    err_str = str(quota_err).lower()
                    if '429' in err_str or 'quota' in err_str or 'resource' in err_str or 'exhausted' in err_str:
                        print(f"[QUOTA] Vision rate limit hit (attempt {_attempt+1}/3). Sleeping 2s...")
                        time.sleep(2)
                    else:
                        raise
            if response is None:
                rate_reply = "Bhai Mohit, server par request limits chal rahi hain. Kripya 5 second baad apna command dobara bolein."
                socketio.emit('co_pilot_voice', {"reply": rate_reply, "msg": rate_reply, "status": "rate_limited"})
                return jsonify({"reply": rate_reply, "status": "rate_limited"}), 200
            
            try:
                raw_text = response.text.strip()
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:-3].strip()
                elif raw_text.startswith("```"):
                    raw_text = raw_text[3:-3].strip()
                parsed = json.loads(raw_text)
            except Exception as e:
                print("Vision JSON parsing error:", e)
                parsed = {"reply_text": "Mujhe samajh nahi aaya, kripya dobara batayein.", "action_type": "none"}
                
            reply_text = parsed.get("reply_text", "")
            action_type = parsed.get("action_type", "none")
            
            # Execute action via Playwright
            sess = ACTIVE_AUTOMATION_SESSIONS.get(session_id)
            if sess and sess.get("page"):
                page = sess["page"]
                try:
                    if action_type == "click" and parsed.get("target_id"):
                        tid = parsed["target_id"]
                        print(f"[PLAYWRIGHT] Clicking tag ID {tid}")
                        loc = page.locator(f'[data-wp-tag-id="{tid}"]')
                        if loc.count() > 0:
                            loc.first.click()
                    elif action_type == "scroll":
                        direction = parsed.get("direction", "down")
                        delta = 500 if direction == "down" else -500
                        print(f"[PLAYWRIGHT] Scrolling {direction}")
                        page.mouse.wheel(0, delta)
                except Exception as ex:
                    print("[PLAYWRIGHT] Action execution failed:", ex)
            
            internal_save_message(session_id, "user", audio_text)
            internal_save_message(session_id, "ai", reply_text)
            socketio.emit('co_pilot_voice', {"reply": reply_text, "msg": reply_text, "status": "success"})
            
            return jsonify({"reply": reply_text, "status": "success"}), 200

    except Exception as e:
        print(f"[CRITICAL BACKEND CRASH]: {str(e)}")
        fallback_response = {
            "reply": "System Error: Main pipeline me technical problem aayi hai.",
            "status": "fallback",
            "error_detail": str(e)
        }
        return jsonify(fallback_response), 200

 # --- TESTING ENDPOINT INJECT KARO ---
@app.route('/api/test-voice-now')
def test_voice_now():
    """Direct trigger to test if frontend speaker synthesis is working"""
    socketio.emit('co_pilot_voice', {
        "status": "test_running",
        "msg": "Bhai Mohit, backend server se direct signal aa gaya hai. Voice assistant background mein bilkul ready hai!"
    })
    return "Voice signal emitted to connected clients!"


@app.errorhandler(404)
def not_found(e):
    return jsonify({'success': False, 'status': 404, 'error': 'Not Found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'success': False, 'status': 500, 'error': 'Internal Server Error'}), 500

if __name__ == '__main__':
    init_db()
    #init_auth_db()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
