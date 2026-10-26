const menuToggle = document.getElementById('mobile-menu-toggle');
const navigation = document.getElementById('school-navigation');
const backdrop = document.getElementById('mobile-menu-backdrop');
function setMenuOpen(open) {
  document.body.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  backdrop.hidden = !open;
  document.querySelector('body > .pl-64').inert = open;
  if (open) { navigation.setAttribute('role', 'dialog'); navigation.setAttribute('aria-modal', 'true'); }
  else { navigation.removeAttribute('role'); navigation.removeAttribute('aria-modal'); }
  // Focus after the drawer and inherited visibility have settled.
  if (open) setTimeout(() => {
    if (document.body.classList.contains('menu-open')) navigation.querySelector('a').focus();
  }, 200);
  else menuToggle.focus();
}
menuToggle.addEventListener('click', () => setMenuOpen(!document.body.classList.contains('menu-open')));
backdrop.addEventListener('click', () => setMenuOpen(false));
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key === 'Escape') setMenuOpen(false);
  if (event.key === 'Tab') {
    const links = [...navigation.querySelectorAll('a, button')];
    const first = links[0], last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a') && document.body.classList.contains('menu-open')) setMenuOpen(false);
});
matchMedia('(min-width: 1280px)').addEventListener('change', event => {
  if (event.matches && document.body.classList.contains('menu-open')) setMenuOpen(false);
});
document.querySelectorAll('.task-row').forEach(row => {
  row.cells[1].dataset.label = 'Hạn chót';
  row.cells[2].dataset.label = 'Mức ưu tiên';
});
