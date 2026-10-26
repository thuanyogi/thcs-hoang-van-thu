(function () {
  'use strict';
  const store = SchoolData.store;
  const notice = document.getElementById('task-notice');
  let filter = 'all', state = 'loading';
  const roles = { bgh: 'Ban giám hiệu', head: 'Tổ trưởng', teacher: 'Giáo viên' };
  const statuses = { todo: 'Cần thực hiện', in_progress: 'Đang thực hiện', pending_review: 'Chờ xác nhận', completed: 'Đã hoàn thành' };
  const text = (tag, value, className) => {
    const el = document.createElement(tag);
    el.textContent = value;
    if (className) el.className = className;
    return el;
  };
  const name = id => SchoolData.users.find(user => user.id === id)?.name || 'Người dùng chưa tải';
  function render() {
    const actor = SchoolData.actor;
    const tasks = actor && state === 'data' ? store.list(actor.id) : [];
    const active = tasks.filter(task => ['todo', 'in_progress'].includes(task.status));
    const pending = tasks.filter(task => task.status === 'pending_review');
    const metrics = [['Tổng công việc', tasks.length], ['Đang thực hiện', active.length],
      ['Đã hoàn thành', tasks.filter(task => task.status === 'completed').length],
      ['Quá hạn (chưa tính)', '—'], ['Chờ xác nhận', pending.length]];
    const stats = document.getElementById('dashboard-stats');
    stats.replaceChildren(...metrics.map(([label, value], index) => {
      const card = text('div', '', 'demo-stat');
      card.append(text('span', label), text('strong', String(value)));
      card.dataset.metric = ['total', 'active', 'completed', 'overdue', 'pending'][index];
      return card;
    }));
    const shown = tasks.filter(task => filter === 'all' || (filter === 'urgent' ? task.status === 'pending_review' : active.some(item => item.id === task.id)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const rows = document.getElementById('task-rows');
    rows.replaceChildren(...shown.map(task => {
      const row = document.createElement('tr');
      row.className = 'task-row';
      row.dataset.taskId = task.id;
      const title = document.createElement('td');
      title.append(text('strong', task.title), text('small', name(task.assigneeId)), text('small', task.description));
      const due = text('td', task.dueDate.split('-').reverse().join('/')); due.dataset.label = 'Hạn chót (ngày)';
      const scope = text('td', task.scope === 'school' ? 'Cấp trường' : `Tổ ${task.department}`); scope.dataset.label = 'Phạm vi';
      const status = text('td', statuses[task.status]); status.dataset.label = 'Trạng thái';
      const flags = document.createElement('td'); flags.dataset.label = 'Yêu cầu & Người giao';
      flags.append(text('small', task.requiresApproval ? 'Cần xác nhận kết quả' : 'Không cần xác nhận'),
        text('small', task.requiresEvidence ? 'Bắt buộc minh chứng' : 'Không bắt buộc minh chứng'), text('small', `Người giao: ${name(task.assignerId)}`));
      row.append(title, due, scope, status, flags);
      return row;
    }));
    document.getElementById('badge-total-count').textContent = `${tasks.length} công việc`;
    document.getElementById('task-list-count').textContent = `Hiển thị ${shown.length} / ${tasks.length} công việc trong phạm vi xem`;
    document.getElementById('demo-summary').textContent = `${tasks.length} việc trong phạm vi xem; ${active.length} đang thực hiện (gồm chưa bắt đầu); ${pending.length} chờ xác nhận, không tính vào đang thực hiện.`;
    document.getElementById('demo-scope').textContent = !actor ? 'Đăng nhập để xem công việc.' : actor.role === 'bgh' ? 'Ban giám hiệu: xem toàn trường, giao việc cấp trường.'
      : actor.role === 'head' ? `Tổ trưởng: giao và xem việc thuộc tổ ${actor.department}.` : 'Giáo viên: xem việc được giao.';
    document.getElementById('demo-greeting').textContent = actor ? `Chào mừng, ${actor.name}!` : 'Chào mừng đến với quản lý công việc';
    document.getElementById('demo-role').textContent = actor ? `Chế độ xem: ${roles[actor.role]}` : 'Chưa đăng nhập';
    const profile = document.querySelector('header .pl-space-xs');
    profile.querySelector('.font-label-md').textContent = actor?.name || 'Chưa đăng nhập';
    profile.querySelector('.font-label-xs').textContent = actor ? roles[actor.role] : 'Tài khoản Supabase';
    document.querySelectorAll('[data-create-task]').forEach(button => { button.hidden = !actor || state !== 'data' || !SchoolData.canCreate(actor); });
    const visibleState = state === 'signed-out' ? 'empty' : state === 'data' && !shown.length ? 'empty' : state;
    ['data', 'empty', 'loading', 'error'].forEach(key => {
      document.getElementById(`state-${key}`).classList.toggle('hidden', visibleState !== key);
    });
    ['all', 'urgent', 'overdue'].forEach(key => document.getElementById(`filter-${key}`).setAttribute('aria-pressed', String(key === filter)));
  }
  document.querySelectorAll('[data-create-task]').forEach(button => button.addEventListener('click', () => {
    const actor = SchoolData.actor;
    if (!actor || state !== 'data') return;
    notice.textContent = '';
    TaskForm.open({ actor, store, setBusy(value) {
      document.dispatchEvent(new CustomEvent('school-form-busy', { detail: value }));
    }, onSaved(task) {
      filter = 'all'; render();
      notice.textContent = `Đã tạo “${task.title}” trên Supabase và đọc lại thành công.`;
    } }, button);
  }));
  document.addEventListener('school-session', event => {
    state = event.detail.state;
    if (state !== 'data') notice.textContent = '';
    if (!SchoolData.actor) filter = 'all';
    render();
  });
  window.filterTask = value => { filter = value; render(); };
  // Existing links point to the same dashboard list in this standalone demo.
  document.querySelector('[data-path="quan-ly-cong-viec"]').addEventListener('click', event => {
    event.preventDefault(); filter = 'all'; render();
    document.getElementById('tasks-viewport').scrollIntoView({ block: 'start' });
  });
  document.querySelector('#tasks-viewport').previousElementSibling.querySelector('a').addEventListener('click', event => {
    event.preventDefault(); filter = 'all'; render();
  });
  document.querySelectorAll('a').forEach(link => {
    if (link.dataset.path === 'quan-ly-hoc-sinh' || link.textContent.includes('Chưa triển khai')) {
      link.setAttribute('aria-disabled', 'true');
      link.addEventListener('click', event => event.preventDefault());
    }
  });
  render();
})();
