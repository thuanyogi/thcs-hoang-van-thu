(function () {
  'use strict';
  const form = document.getElementById('auth-form');
  const email = document.getElementById('auth-email');
  const password = document.getElementById('auth-password');
  const status = document.getElementById('auth-status');
  const logout = document.getElementById('auth-sign-out');
  const refresh = document.getElementById('auth-refresh');
  let busy = false, formBusy = false, initializing = false;
  function controls() {
    form.hidden = Boolean(SchoolData.user);
    logout.hidden = !SchoolData.user;
    document.getElementById('auth-current-email').textContent = SchoolData.user ? `Đang đăng nhập: ${SchoolData.user.email || 'Không có email'}` : 'Chưa đăng nhập';
    document.querySelectorAll('.auth-panel button').forEach(button => { button.disabled = busy || formBusy; });
    email.disabled = password.disabled = busy || formBusy;
    form.setAttribute('aria-busy', String(busy));
  }
  function publish(state, error) {
    controls();
    document.dispatchEvent(new CustomEvent('school-session', { detail: { state, error } }));
  }
  async function load() {
    if (busy || formBusy) return;
    busy = true; initializing = true;
    status.textContent = 'Đang tải phiên và dữ liệu Supabase…';
    publish('loading');
    try {
      const signedIn = await SchoolData.initialize();
      status.textContent = signedIn ? 'Đã kết nối Supabase. Dữ liệu theo quyền tài khoản.' : 'Đăng nhập bằng tài khoản nhà trường cấp.';
      publish(signedIn ? 'data' : 'signed-out');
    } catch (error) {
      status.textContent = error.message || 'Không thể tải dữ liệu Supabase. Vui lòng thử lại.';
      publish('error', status.textContent);
    } finally {
      initializing = false; busy = false; controls();
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || formBusy || !form.reportValidity()) return;
    if (!password.value) {
      status.textContent = 'Vui lòng nhập mật khẩu.';
      password.focus(); return;
    }
    busy = true; controls(); status.textContent = 'Đang đăng nhập…';
    try {
      await SchoolData.signIn(email.value.trim(), password.value);
      password.value = '';
      busy = false;
      await load();
    } catch (error) {
      status.textContent = error.message || 'Đăng nhập không thành công.';
    } finally { busy = false; controls(); }
  });
  document.getElementById('auth-sign-up').addEventListener('click', async () => {
    if (busy || formBusy || !form.reportValidity()) return;
    if (password.value.length < 6) {
      status.textContent = 'Mật khẩu đăng ký cần ít nhất 6 ký tự.';
      password.focus(); return;
    }
    busy = true; controls(); status.textContent = 'Đang đăng ký…';
    try {
      await SchoolData.signUp(email.value.trim(), password.value);
      password.value = '';
      status.textContent = 'Hãy kiểm tra hộp thư và thư rác để xác nhận email trước khi đăng nhập. Xác nhận email không tự cấp quyền truy cập nội bộ; cần nhà trường cấp quyền.';
    } catch (error) { status.textContent = error.message || 'Đăng ký chưa thành công. Vui lòng thử lại.'; }
    finally { busy = false; controls(); }
  });
  document.getElementById('auth-magic-link').addEventListener('click', async () => {
    if (busy || formBusy || !email.reportValidity()) return;
    busy = true; controls(); status.textContent = 'Đang gửi liên kết đăng nhập…';
    try {
      await SchoolData.sendLoginLink(email.value.trim());
      status.textContent = 'Đã gửi yêu cầu liên kết đăng nhập. Kiểm tra hộp thư và thư rác.';
    } catch (error) { status.textContent = error.message || 'Chưa gửi được liên kết. Vui lòng thử lại.'; }
    finally { busy = false; controls(); }
  });
  logout.addEventListener('click', async () => {
    if (busy || formBusy) return;
    busy = true; status.textContent = 'Đang đăng xuất…'; publish('loading');
    try {
      await SchoolData.signOut();
      password.value = '';
      document.getElementById('task-dialog').close();
      status.textContent = 'Đã đăng xuất.';
      publish('signed-out');
    } catch (error) {
      status.textContent = error.message || 'Chưa đăng xuất được. Vui lòng thử lại.';
      publish(SchoolData.actor ? 'data' : 'signed-out');
    }
    finally { busy = false; controls(); }
  });
  async function reload() {
    if (busy || formBusy) return;
    if (!SchoolData.actor) { await load(); return; }
    busy = true; status.textContent = 'Đang tải lại công việc…'; publish('loading');
    try {
      await SchoolData.store.refresh();
      status.textContent = 'Đã tải lại dữ liệu từ Supabase.';
      publish(SchoolData.actor ? 'data' : 'signed-out');
    } catch (error) {
      status.textContent = error.message || 'Chưa tải lại được dữ liệu.';
      publish('error', status.textContent);
    } finally { busy = false; controls(); }
  }
  refresh.addEventListener('click', reload);
  document.querySelectorAll('[data-refresh-tasks]').forEach(button => button.addEventListener('click', reload));
  document.addEventListener('school-form-busy', event => { formBusy = event.detail; controls(); });
  SchoolData.onAuthChange(() => {
    if (!SchoolData.user) {
      status.textContent = 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.';
      publish('signed-out');
    }
    if (busy || initializing || formBusy) return;
    load();
  });
  load();
})();
