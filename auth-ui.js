(function () {
  'use strict';
  const form = document.getElementById('auth-form');
  const email = document.getElementById('auth-email');
  const password = document.getElementById('auth-password');
  const status = document.getElementById('auth-status');
  const logout = document.getElementById('auth-sign-out');
  let busy = false, formBusy = false, mode = 'login', state = 'loading', queued = false;
  function controls() {
    document.body.dataset.session = state;
    document.getElementById('school-app').hidden = state !== 'data';
    const signedIn = Boolean(SchoolData.user);
    form.hidden = signedIn;
    document.getElementById('auth-no-access').hidden = !signedIn;
    logout.hidden = !signedIn;
    const current = document.getElementById('auth-current-email');
    current.textContent = signedIn ? SchoolData.user.email || 'Tài khoản đã đăng nhập' : '';
    const locked = busy || formBusy;
    document.querySelectorAll('.auth-panel button, #auth-sign-out, #auth-refresh').forEach(button => { button.disabled = locked; });
    email.disabled = password.disabled = locked;
    const title = document.getElementById('auth-heading');
    const description = document.getElementById('auth-description');
    title.textContent = signedIn ? 'Tài khoản của bạn' : ({login:'Đăng nhập',signup:'Đăng ký tài khoản',link:'Đăng nhập qua email'})[mode];
    description.textContent = signedIn ? 'Tài khoản chưa tải được quyền truy cập. Bạn có thể thử lại hoặc đăng xuất.' : ({login:'Sử dụng tài khoản đã được nhà trường cấp quyền.',signup:'Xác nhận email và chờ nhà trường cấp quyền truy cập.',link:'Chúng tôi sẽ gửi liên kết cho tài khoản hiện có.'})[mode];
    password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    password.required = mode !== 'link';
    password.closest('label').hidden = mode === 'link';
    document.getElementById('auth-sign-in').hidden = mode !== 'login';
    document.getElementById('auth-sign-up').hidden = mode !== 'signup';
    document.getElementById('auth-magic-link').hidden = mode !== 'link';
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
    });
    form.setAttribute('aria-busy', String(locked));
  }
  function publish(next, error) {
    state = next;
    controls();
    document.dispatchEvent(new CustomEvent('school-session', { detail: { state: next, error } }));
  }
  function finish(fallbackState) {
    busy = false;
    if (queued && !formBusy) {
      queued = false;
      load();
      return;
    }
    if (fallbackState) publish(fallbackState);
    else controls();
  }
  async function load() {
    if (busy || formBusy) { queued = true; return; }
    queued = false;
    busy = true; publish('loading'); status.textContent = 'Đang kiểm tra phiên đăng nhập…';
    try {
      const signedIn = await SchoolData.initialize();
      status.textContent = signedIn ? '' : 'Sử dụng tài khoản được nhà trường cấp để tiếp tục.';
      publish(signedIn ? 'data' : 'signed-out');
    } catch (error) {
      status.textContent = error.message || 'Chưa kết nối được. Vui lòng thử lại.';
      publish('error', status.textContent);
    } finally { finish(); }
  }
  async function authenticate(event, action) {
    event.preventDefault();
    if (busy || formBusy || !form.reportValidity()) return;
    if (action === 'signup' && password.value.length < 6) {
      status.textContent = 'Mật khẩu cần ít nhất 6 ký tự.'; password.focus(); return;
    }
    busy = true; controls(); status.textContent = 'Đang xử lý…';
    try {
      if (action === 'login') {
        await SchoolData.signIn(email.value.trim(), password.value);
        password.value = ''; busy = false; await load();
      } else if (action === 'signup') {
        await SchoolData.signUp(email.value.trim(), password.value);
        password.value = ''; mode = 'login';
        status.textContent = 'Kiểm tra hộp thư và thư rác để xác nhận email trước khi đăng nhập. Nhà trường cần cấp quyền trước khi bạn sử dụng hệ thống.';
      } else {
        await SchoolData.sendLoginLink(email.value.trim());
        status.textContent = 'Đã gửi yêu cầu liên kết đăng nhập. Kiểm tra hộp thư và thư rác.';
      }
    } catch (error) { status.textContent = error.message || 'Chưa hoàn tất. Vui lòng thử lại.'; }
    finally { finish(); }
  }
  form.addEventListener('submit', event => authenticate(event, mode));
  document.getElementById('auth-sign-up').addEventListener('click', event => authenticate(event, 'signup'));
  document.getElementById('auth-magic-link').addEventListener('click', event => authenticate(event, 'link'));
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.authMode; status.textContent = ''; controls(); email.focus();
  }));
  document.getElementById('auth-toggle-password')?.addEventListener('click', event => {
    password.type = password.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = password.type === 'password' ? 'Hiện' : 'Ẩn';
    event.currentTarget.setAttribute('aria-pressed', String(password.type === 'text'));
  });
  async function signOut() {
    if (busy || formBusy) return;
    busy = true; publish('loading');
    try { await SchoolData.signOut(); password.value = ''; status.textContent = 'Bạn đã đăng xuất.'; }
    catch (error) { status.textContent = error.message; }
    finally { finish('signed-out'); }
  }
  logout.addEventListener('click', signOut);
  document.getElementById('auth-no-access-logout').addEventListener('click', signOut);
  document.getElementById('auth-no-access-retry').addEventListener('click', () => load());
  async function reload() {
    if (!SchoolData.actor) return load();
    if (busy || formBusy) return;
    busy = true; publish('loading');
    try { await SchoolData.store.refresh(); publish('data'); }
    catch (error) { status.textContent = error.message; publish('error', error.message); }
    finally { finish(); }
  }
  document.getElementById('auth-refresh').addEventListener('click', reload);
  document.querySelectorAll('[data-refresh-tasks]').forEach(button => button.addEventListener('click', reload));
  document.addEventListener('school-form-busy', event => { formBusy = Boolean(event.detail); controls(); if (!formBusy && queued) load(); });
  SchoolData.onAuthChange(source => {
    // Clear private forms immediately, including when another tab changes accounts.
    publish('signed-out');
    if (source !== 'storage') return;
    if (busy || formBusy) { queued = true; return; }
    load();
  });
  controls(); load();
})();
