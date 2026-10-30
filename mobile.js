(function () {
  'use strict';
  const toggle = document.getElementById('mobile-menu-toggle');
  const nav = document.getElementById('school-navigation');
  const backdrop = document.getElementById('mobile-menu-backdrop');
  const content = document.querySelector('.app-content');
  function close(restore = true) {
    const wasOpen = document.body.classList.contains('menu-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true; content.inert = false;
    nav.removeAttribute('role'); nav.removeAttribute('aria-modal');
    if (wasOpen && restore) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (document.body.classList.contains('menu-open')) { close(); return; }
    document.body.classList.add('menu-open'); toggle.setAttribute('aria-expanded', 'true');
    backdrop.hidden = false; content.inert = true;
    nav.setAttribute('role', 'dialog'); nav.setAttribute('aria-modal', 'true');
    nav.querySelector('a').focus();
  });
  backdrop.addEventListener('click', () => close());
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(false); });
  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('menu-open')) return;
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    const links = [...nav.querySelectorAll('a,button')];
    if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0].focus(); }
  });
  matchMedia('(min-width:1051px)').addEventListener('change', event => { if (event.matches) close(false); });
  document.addEventListener('school-session', event => { if (event.detail.state !== 'data') close(false); });
})();
