/* Installed app (PWA): registers the service worker when the app is served over https
   (GitHub Pages) and shows "Update available – Reload" when a new version is ready.
   Opened as a local file, nothing happens here. */
(function (SL) {
  'use strict';

  const served = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const state = { registration: null, reloadAsked: false };

  function showUpdate(worker) {
    if (document.querySelector('.update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.textContent = 'Update available';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.textContent = 'Reload';
    btn.addEventListener('click', async () => {
      if (SL.db) await SL.db.flush(); // keep the last typing
      state.reloadAsked = true;
      worker.postMessage('skipWaiting');
    });
    bar.append(msg, btn);
    document.body.appendChild(bar);
  }

  async function register() {
    if (!served || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      state.registration = reg;
      const watch = (w) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // reload only when the user asked for the new version (not on the first install)
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !state.reloadAsked) return;
        reloading = true;
        location.reload();
      });
      // look for a new version when the app comes back to the screen
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (e) {
      console.warn('Service worker not registered:', e.message);
    }
  }

  SL.pwa = { served, register, state };
  window.addEventListener('load', register);
})(window.SL = window.SL || {});
