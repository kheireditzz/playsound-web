/**
 * PlayMusic Neumorphic Dialog System (neu-dialog.js)
 * Modern tactile dialog replacement for native alert/confirm.
 * Eliminates browser chrome, domain leaks ("... says"), and UI freezes.
 * Follows Neumorphism & Anti-AI-Slop design guidelines.
 */
(function () {
  'use strict';

  let currentResolve = null;

  function ensureDialogDom() {
    if (document.getElementById('neuDialogBackdrop')) return;

    const dialogHtml = `
      <div class="neu-dialog-backdrop" id="neuDialogBackdrop" role="dialog" aria-modal="true" style="display:none;">
        <div class="neu-dialog-box" id="neuDialogBox">
          <div class="neu-dialog-icon-wrapper" id="neuDialogIconWrapper">
            <svg id="neuDialogIconSvg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="neu-dialog-header">
            <span class="neu-dialog-badge" id="neuDialogBadge">SISTEM PLAYMUSIC</span>
            <h3 class="neu-dialog-title" id="neuDialogTitle">Pemberitahuan</h3>
          </div>
          <div class="neu-dialog-body" id="neuDialogBody"></div>
          <div class="neu-dialog-actions" id="neuDialogActions">
            <button type="button" class="neu-dialog-btn neu-dialog-btn-cancel" id="neuDialogCancelBtn" style="display:none;">Batal</button>
            <button type="button" class="neu-dialog-btn neu-dialog-btn-confirm" id="neuDialogConfirmBtn">Mengerti</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    const backdrop = document.getElementById('neuDialogBackdrop');
    const cancelBtn = document.getElementById('neuDialogCancelBtn');
    const confirmBtn = document.getElementById('neuDialogConfirmBtn');

    function triggerHaptic() {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(18);
      }
    }

    cancelBtn.addEventListener('click', () => {
      triggerHaptic();
      closeDialog(false);
    });

    confirmBtn.addEventListener('click', () => {
      triggerHaptic();
      closeDialog(true);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        triggerHaptic();
        closeDialog(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (backdrop.classList.contains('active') && e.key === 'Escape') {
        closeDialog(false);
      }
    });
  }

  function closeDialog(result) {
    const backdrop = document.getElementById('neuDialogBackdrop');
    if (!backdrop) return;

    backdrop.classList.remove('active');
    setTimeout(() => {
      backdrop.style.display = 'none';
      if (typeof currentResolve === 'function') {
        const resolve = currentResolve;
        currentResolve = null;
        resolve(result);
      }
    }, 220);
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

      const backdrop = document.getElementById('neuDialogBackdrop');
      const badgeEl = document.getElementById('neuDialogBadge');
      const titleEl = document.getElementById('neuDialogTitle');
      const bodyEl = document.getElementById('neuDialogBody');
      const iconWrapper = document.getElementById('neuDialogIconWrapper');
      const cancelBtn = document.getElementById('neuDialogCancelBtn');
      const confirmBtn = document.getElementById('neuDialogConfirmBtn');

      badgeEl.textContent = badge;
      titleEl.textContent = title;

      // Format teks dengan baris baru rapi
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

      iconWrapper.innerHTML = icons[type] || icons.info;
      cancelBtn.style.display = 'none';

      confirmBtn.textContent = confirmText;
      confirmBtn.className = 'neu-dialog-btn neu-dialog-btn-confirm';

      backdrop.style.display = 'flex';
      requestAnimationFrame(() => {
        backdrop.classList.add('active');
        confirmBtn.focus();
      });
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

      const backdrop = document.getElementById('neuDialogBackdrop');
      const badgeEl = document.getElementById('neuDialogBadge');
      const titleEl = document.getElementById('neuDialogTitle');
      const bodyEl = document.getElementById('neuDialogBody');
      const iconWrapper = document.getElementById('neuDialogIconWrapper');
      const cancelBtn = document.getElementById('neuDialogCancelBtn');
      const confirmBtn = document.getElementById('neuDialogConfirmBtn');

      badgeEl.textContent = badge;
      titleEl.textContent = title;

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

      iconWrapper.innerHTML = icons[type] || icons.warning;

      cancelBtn.style.display = 'inline-flex';
      cancelBtn.textContent = cancelText;

      confirmBtn.textContent = confirmText;
      confirmBtn.className = 'neu-dialog-btn neu-dialog-btn-confirm' + (isDanger ? ' btn-danger' : '');

      backdrop.style.display = 'flex';
      requestAnimationFrame(() => {
        backdrop.classList.add('active');
        confirmBtn.focus();
      });
    });
  };

  // Override window.alert globally agar tidak ada lagi dialog jelek browser ("... says")
  window.alert = function (msg) {
    return window.showNeuAlert({
      title: 'PlayMusic',
      badge: 'PEMBERITAHUAN',
      message: String(msg),
      type: 'info'
    });
  };
})();
