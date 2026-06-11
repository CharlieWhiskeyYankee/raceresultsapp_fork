/**
 * modal.js
 * Non-blocking modal dialog and toast notification system.
 *
 * Public API:
 *   showConfirm(message, options?)  → Promise<boolean>
 *   showAlert(message, options?)    → Promise<void>
 *   showToast(message, type?, duration?) → void
 *
 * All UI is injected into the document on first use; no HTML changes needed.
 */

'use strict';

// ─── CSS (injected once) ─────────────────────────────────────────────────────

(function injectModalStyles() {
    if (document.getElementById('lsc-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'lsc-modal-styles';
    style.textContent = `
        /* ── Modal Backdrop ── */
        #lsc-modal-backdrop {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 40000;
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }
        #lsc-modal-backdrop.hidden { display: none; }

        /* ── Modal Box ── */
        #lsc-modal-box {
            background: white;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            max-width: 480px;
            width: 100%;
            padding: 24px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        #lsc-modal-message {
            font-size: 15px;
            color: #222;
            margin: 0 0 20px 0;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        #lsc-modal-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            flex-wrap: wrap;
        }
        .lsc-modal-btn {
            padding: 9px 18px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            font-family: Arial, sans-serif;
        }
        .lsc-modal-btn-confirm  { background: #003366; color: white; }
        .lsc-modal-btn-confirm:hover { background: #004080; }
        .lsc-modal-btn-cancel   { background: #6c757d; color: white; }
        .lsc-modal-btn-cancel:hover  { background: #5a6268; }
        .lsc-modal-btn-ok       { background: #003366; color: white; }
        .lsc-modal-btn-ok:hover { background: #004080; }

        /* ── Danger confirm ── */
        #lsc-modal-box.danger .lsc-modal-btn-confirm { background: #dc3545; }
        #lsc-modal-box.danger .lsc-modal-btn-confirm:hover { background: #c82333; }

        /* ── Toast Container ── */
        #lsc-toast-container {
            position: fixed;
            bottom: 20px; left: 50%;
            transform: translateX(-50%);
            z-index: 50000;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
        }
        .lsc-toast {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-family: Arial, sans-serif;
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-width: 500px;
            text-align: center;
            opacity: 1;
            transition: opacity 0.4s ease;
        }
        .lsc-toast.info    { background: #003366; }
        .lsc-toast.success { background: #28a745; }
        .lsc-toast.warning { background: #ff9800; }
        .lsc-toast.error   { background: #dc3545; }
        .lsc-toast.fade-out { opacity: 0; }
    `;
    document.head.appendChild(style);
})();

// ─── Modal DOM ────────────────────────────────────────────────────────────────

function _getOrCreateModal() {
    let backdrop = document.getElementById('lsc-modal-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'lsc-modal-backdrop';
    backdrop.classList.add('hidden');
    backdrop.innerHTML = `
        <div id="lsc-modal-box" role="dialog" aria-modal="true">
            <p id="lsc-modal-message"></p>
            <div id="lsc-modal-buttons"></div>
        </div>`;
    document.body.appendChild(backdrop);
    return backdrop;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Shows a confirmation dialog with Confirm and Cancel buttons.
 * @param {string} message
 * @param {{ confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
 */
function showConfirm(message, options = {}) {
    return new Promise(resolve => {
        const backdrop = _getOrCreateModal();
        const box      = document.getElementById('lsc-modal-box');
        const msgEl    = document.getElementById('lsc-modal-message');
        const btnsEl   = document.getElementById('lsc-modal-buttons');

        msgEl.textContent = message;
        box.className = options.danger ? 'danger' : '';
        btnsEl.innerHTML = '';

        const cancel = document.createElement('button');
        cancel.className   = 'lsc-modal-btn lsc-modal-btn-cancel';
        cancel.textContent = options.cancelText || 'Cancel';

        const confirm = document.createElement('button');
        confirm.className   = 'lsc-modal-btn lsc-modal-btn-confirm';
        confirm.textContent = options.confirmText || 'Confirm';

        const close = (result) => {
            backdrop.classList.add('hidden');
            resolve(result);
        };

        cancel.addEventListener('click',  () => close(false));
        confirm.addEventListener('click', () => close(true));

        // Also close on backdrop click (cancel).
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); }, { once: true });

        btnsEl.appendChild(cancel);
        btnsEl.appendChild(confirm);

        backdrop.classList.remove('hidden');
        confirm.focus();
    });
}

/**
 * Shows an informational alert dialog with a single OK button.
 * @param {string} message
 * @param {{ okText?: string }} [options]
 * @returns {Promise<void>}
 */
function showAlert(message, options = {}) {
    return new Promise(resolve => {
        const backdrop = _getOrCreateModal();
        const msgEl    = document.getElementById('lsc-modal-message');
        const btnsEl   = document.getElementById('lsc-modal-buttons');
        const box      = document.getElementById('lsc-modal-box');

        msgEl.textContent = message;
        box.className = '';
        btnsEl.innerHTML = '';

        const ok = document.createElement('button');
        ok.className   = 'lsc-modal-btn lsc-modal-btn-ok';
        ok.textContent = options.okText || 'OK';

        ok.addEventListener('click', () => {
            backdrop.classList.add('hidden');
            resolve();
        });

        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) { backdrop.classList.add('hidden'); resolve(); }
        }, { once: true });

        btnsEl.appendChild(ok);
        backdrop.classList.remove('hidden');
        ok.focus();
    });
}

/**
 * Shows a brief non-blocking toast notification.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {number} [duration] - milliseconds before auto-dismiss (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('lsc-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lsc-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className   = `lsc-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}
