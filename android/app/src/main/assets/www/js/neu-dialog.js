/**
 * PlayMusic Neumorphic Alert & Confirm Dialog System (neu-dialog.js)
 * Modern tactile dialog replacement for native alert/confirm.
 * Eliminates browser chrome, domain leaks ("... says"), and UI freezes.
 * Fully follows Neumorphism & Anti-AI-Slop design guidelines.
 */
(function () {
  'use strict';

  let currentResolve = null;

  function triggerHaptic() {
    if (window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate(18); } catch (e) {}
    }
  }

  function closeDialog(result) {
    triggerHaptic();
    const backdrop = document.getElementById('neuAlertBackdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      backdrop.style.display = 'none';
    }
    if (typeof currentResolve === 'function') {
      const resolve = currentResolve;
      currentResolve = null;
      resolve(result !== false);
    }
  }

  window.closeNeuDialog = function (result) {
    closeDialog(result !== false);
  };

  function bindEvents() {
    const backdrop = document.getElementById('neuAlertBackdrop');
    const cancelBtn = document.getElementById('neuAlertCancelBtn');
    const confirmBtn = document.getElementById('neuAlertConfirmBtn');
    if (!backdrop) return;

    if (cancelBtn) {
      cancelBtn.onclick = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        closeDialog(false);
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        closeDialog(true);
      };
    }

    backdrop.onclick = function (e) {
      if (e.target === backdrop) {
        closeDialog(false);
      }
    };

    document.addEventListener('keydown', function (e) {
      if (backdrop.classList.contains('active') && e.key === 'Escape') {
        closeDialog(false);
      }
    });
  }

  function ensureDialogDom() {
    bindEvents();
    if (document.getElementById('neuAlertBackdrop')) return;

    const dialogHtml = `
      <div class="neu-alert-backdrop" id="neuAlertBackdrop" role="dialog" aria-modal="true" style="display:none;">
        <div class="neu-alert-box" id="neuAlertBox">
          <div class="neu-alert-icon-wrapper" id="neuAlertIconWrapper">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#006666" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div class="neu-alert-header">
            <span class="neu-alert-badge" id="neuAlertBadge">SISTEM PLAYMUSIC</span>
            <h3 class="neu-alert-title" id="neuAlertTitle">Pemberitahuan</h3>
          </div>
          <div class="neu-alert-body" id="neuAlertBody"></div>
          <div class="neu-alert-actions" id="neuAlertActions">
            <button type="button" class="neu-alert-btn neu-alert-btn-cancel" id="neuAlertCancelBtn" onclick="window.closeNeuDialog(false)" style="display:none;">Batal</button>
            <button type="button" class="neu-alert-btn neu-alert-btn-confirm" id="neuAlertConfirmBtn" onclick="window.closeNeuDialog(true)">Mengerti</button>
          </div>
        </div>
      </div>
    `;

    if (document.body) {
      document.body.insertAdjacentHTML('beforeend', dialogHtml);
      bindEvents();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('neuAlertBackdrop') && document.body) {
          document.body.insertAdjacentHTML('beforeend', dialogHtml);
        }
        bindEvents();
      });
    }
  }

  const icons = {
    success: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00A63D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    info: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#006666" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    warning: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FE9900" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    error: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FF2157" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  };

  window.showNeuAlert = function (options) {
    if (typeof options === 'string') {
      options = { message: options };
    }
    const {
      title = 'Pemberitahuan',
      badge = 'SISTEM PLAYMUSIC',
      message = '',
      type = 'info',
      confirmText = 'Mengerti'
    } = options || {};

    return new Promise((resolve) => {
      ensureDialogDom();
      currentResolve = resolve;

      const backdrop = document.getElementById('neuAlertBackdrop');
      const badgeEl = document.getElementById('neuAlertBadge');
      const titleEl = document.getElementById('neuAlertTitle');
      const bodyEl = document.getElementById('neuAlertBody');
      const iconWrapper = document.getElementById('neuAlertIconWrapper');
      const cancelBtn = document.getElementById('neuAlertCancelBtn');
      const confirmBtn = document.getElementById('neuAlertConfirmBtn');

      if (badgeEl) badgeEl.textContent = badge;
      if (titleEl) titleEl.textContent = title;

      if (bodyEl) {
        if (typeof message === 'string') {
          const formatted = message
            .split('\n\n')
            .map(p => `<p style="margin: 0 0 8px 0;">${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
          bodyEl.innerHTML = formatted;
        } else {
          bodyEl.innerHTML = '';
          bodyEl.appendChild(message);
        }
      }

      if (iconWrapper) iconWrapper.innerHTML = icons[type] || icons.info;
      if (cancelBtn) cancelBtn.style.display = 'none';

      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        confirmBtn.className = 'neu-alert-btn neu-alert-btn-confirm';
        confirmBtn.onclick = function (e) {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          closeDialog(true);
        };
      }

      if (backdrop) {
        backdrop.style.display = 'flex';
        requestAnimationFrame(() => {
          backdrop.classList.add('active');
          if (confirmBtn) confirmBtn.focus();
        });
      } else {
        resolve(true);
      }
    });
  };

  window.showNeuConfirm = function (options) {
    if (typeof options === 'string') {
      options = { message: options };
    }
    const {
      title = 'Konfirmasi',
      badge = 'PERINGATAN',
      message = '',
      type = 'warning',
      confirmText = 'Lanjutkan',
      cancelText = 'Batal',
      isDanger = false
    } = options || {};

    return new Promise((resolve) => {
      ensureDialogDom();
      currentResolve = resolve;

      const backdrop = document.getElementById('neuAlertBackdrop');
      const badgeEl = document.getElementById('neuAlertBadge');
      const titleEl = document.getElementById('neuAlertTitle');
      const bodyEl = document.getElementById('neuAlertBody');
      const iconWrapper = document.getElementById('neuAlertIconWrapper');
      const cancelBtn = document.getElementById('neuAlertCancelBtn');
      const confirmBtn = document.getElementById('neuAlertConfirmBtn');

      if (badgeEl) badgeEl.textContent = badge;
      if (titleEl) titleEl.textContent = title;

      if (bodyEl) {
        if (typeof message === 'string') {
          const formatted = message
            .split('\n\n')
            .map(p => `<p style="margin: 0 0 8px 0;">${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
          bodyEl.innerHTML = formatted;
        } else {
          bodyEl.innerHTML = '';
          bodyEl.appendChild(message);
        }
      }

      if (iconWrapper) iconWrapper.innerHTML = icons[type] || icons.warning;

      if (cancelBtn) {
        cancelBtn.style.display = 'inline-flex';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = function (e) {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          closeDialog(false);
        };
      }

      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        confirmBtn.className = 'neu-alert-btn neu-alert-btn-confirm' + (isDanger ? ' btn-danger' : '');
        confirmBtn.onclick = function (e) {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          closeDialog(true);
        };
      }

      if (backdrop) {
        backdrop.style.display = 'flex';
        requestAnimationFrame(() => {
          backdrop.classList.add('active');
          if (confirmBtn) confirmBtn.focus();
        });
      } else {
        resolve(true);
      }
    });
  };

  // Override window.alert & window.confirm globally to eliminate domain prompts ("... says")
  window.alert = function (msg) {
    return window.showNeuAlert({
      title: 'PlayMusic',
      badge: 'PEMBERITAHUAN',
      message: String(msg),
      type: 'info'
    });
  };

  window.confirm = function (msg) {
    return window.showNeuConfirm({
      title: 'PlayMusic',
      badge: 'KONFIRMASI',
      message: String(msg),
      type: 'warning'
    });
  };

  // Mount listeners on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDialogDom);
  } else {
    ensureDialogDom();
  }
})();
