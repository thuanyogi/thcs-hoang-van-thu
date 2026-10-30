(function () {
  'use strict';
  const $ = id => document.getElementById(id), store = SchoolData.store;
  const roles = { bgh: 'Ban giám hiệu', head: 'Tổ trưởng chuyên môn', teacher: 'Giáo viên' };
  const labels = { todo: 'Chưa bắt đầu', in_progress: 'Đang thực hiện', pending_review: 'Chờ xác nhận', completed: 'Đã hoàn thành' };
  const month = value => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date(value)) : '';
  const due = task => task.dueAt || `${task.dueDate}T23:59:59+07:00`;
  const active = task => ['todo', 'in_progress'].includes(task.status);
  const overdue = task => active(task) && Date.parse(due(task)) < Date.now();
  const pendingForActor = task => {
    const actor = SchoolData.actor;
    if (!actor || task.status !== 'pending_review') return false;
    return actor.role === 'bgh' ? task.scope === 'school' : actor.role === 'head' ? task.scope === 'department' && actor.department === task.department : task.assigneeId === actor.id;
  };
  const person = id => SchoolData.users.find(user => user.id === id)?.name || 'Chưa tải tên';
  const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
  const date = value => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : 'Chưa có';
  let state = 'loading', view = 'overview', page = 1, identity = null;
  const pageSize = 8;
  function tasks() { return state === 'data' && SchoolData.actor ? store.list(SchoolData.actor.id) : []; }
  function openTask(task, trigger) { TaskWorkflow.open(task.id, trigger); }
  function notifications(list) {
    return list.filter(task => overdue(task) || task.returnedReason || pendingForActor(task))
      .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || due(a).localeCompare(due(b)));
  }
  function notificationRow(task) {
    const el = node('button', '', 'notification-item'); el.type = 'button';
    el.append(node('strong', task.title), node('small', overdue(task) ? `Quá hạn từ ${date(due(task))}` : task.returnedReason ? `Bị trả lại: ${task.returnedReason}` : 'Có báo cáo đang chờ xác nhận'));
    el.addEventListener('click', () => { $('notification-popover').hidden = true; $('notifications-toggle').setAttribute('aria-expanded', 'false'); openTask(task, el); });
    return el;
  }
  function renderNotifications(list) {
    const items = notifications(list);
    $('nav-notification-count').textContent = items.length;
    $('notification-dot').hidden = !items.length;
    [$('notifications-list'), $('notification-preview')].forEach((container, index) => {
      container.replaceChildren(...(index ? items.slice(0, 4) : items).map(notificationRow));
      if (!items.length) container.append(node('p', 'Bạn chưa có thông báo công việc cần chú ý.', 'queue-empty'));
    });
  }
  function renderMetrics(list) {
    const currentMonth = month(new Date());
    const metrics = [ ['Tổng công việc tháng này', list.filter(task => month(task.createdAt) === currentMonth).length, 'total', '▤'],
      ['Đang thực hiện', list.filter(active).length, 'active', '↗'],
      ['Hoàn thành tháng này', list.filter(task => task.status === 'completed' && month(task.completedAt) === currentMonth).length, 'completed', '✓'],
      ['Quá hạn', list.filter(overdue).length, 'overdue', '◷'],
      ['Chờ xác nhận', list.filter(pendingForActor).length, 'pending', '◎'] ];
    $('dashboard-stats').replaceChildren(...metrics.map(([label, value, key, symbol]) => {
      const card = node('div', '', 'demo-stat'); card.dataset.metric = key;
      card.append(node('span', label), node('span', symbol, 'metric-symbol'), node('strong', state === 'data' ? String(value) : '—')); return card;
    }));
    const monthLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', month: 'long', year: 'numeric' }).format(new Date());
    $('header-month').textContent = $('metric-month').textContent = monthLabel;
    $('demo-summary').textContent = `${list.filter(active).length} việc cần thực hiện và ${list.filter(pendingForActor).length} báo cáo đang chờ xác nhận trong phạm vi của bạn.`;
  }
  function renderPending(list) {
    const pending = list.filter(pendingForActor).sort((a, b) => (a.submittedAt || '9999').localeCompare(b.submittedAt || '9999'));
    $('pending-count').textContent = pending.length;
    $('pending-list').replaceChildren(...pending.slice(0, 5).map(task => {
      const el = node('button', '', 'pending-item'); el.type = 'button';
      el.append(node('strong', task.title), node('small', person(task.assigneeId)), node('small', task.submittedAt ? `Đã gửi: ${date(task.submittedAt)}` : 'Chưa có thời điểm nộp báo cáo'));
      el.addEventListener('click', () => openTask(task, el)); return el;
    }));
    if (!pending.length) $('pending-list').append(node('p', 'Không có báo cáo chờ xác nhận.', 'queue-empty'));
    $('pending-more').hidden = pending.length <= 5;
  }
  function matches(task, filter) {
    if (filter === 'pending_review') return pendingForActor(task);
    if (filter === 'overdue') return overdue(task);
    if (filter === 'returned') return Boolean(task.returnedReason) && active(task);
    return filter === 'all' || task.status === filter;
  }
  function renderRows(list) {
    const filter = $('task-status-filter').value;
    const query = $('task-search').value.trim().toLocaleLowerCase('vi');
    const shown = list.filter(task => (view !== 'overview' || active(task)) && matches(task, filter) && `${task.title} ${task.description} ${person(task.assigneeId)}`.toLocaleLowerCase('vi').includes(query))
      .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || due(a).localeCompare(due(b)));
    const pages = Math.max(1, Math.ceil(shown.length / pageSize)); page = Math.min(page, pages);
    $('task-rows').replaceChildren(...shown.slice((page - 1) * pageSize, page * pageSize).map(task => {
      const row = document.createElement('tr'); row.className = 'task-row'; row.dataset.taskId = task.id;
      const title = document.createElement('td'), button = node('button', task.title, 'task-open'); button.type = 'button';
      button.addEventListener('click', () => openTask(task, button));
      title.append(button, node('small', person(task.assigneeId)));
      if (task.returnedReason && active(task)) title.append(node('span', 'Bị trả lại', 'status-badge returned'), node('small', task.returnedReason, 'return-reason'));
      const deadline = node('td', date(due(task)), overdue(task) ? 'due-overdue' : ''); deadline.dataset.label = 'Hạn thực hiện';
      if (overdue(task)) deadline.append(node('small', 'Quá hạn', 'due-overdue'));
      const status = document.createElement('td'); status.dataset.label = 'Trạng thái'; status.append(node('span', labels[task.status] || task.status, `status-badge ${task.status}`));
      row.append(title, deadline, status); return row;
    }));
    $('badge-total-count').textContent = shown.length;
    $('task-list-count').textContent = shown.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, shown.length)} / ${shown.length} công việc` : '0 công việc';
    $('page-label').textContent = `${page} / ${pages}`; $('page-previous').disabled = page <= 1; $('page-next').disabled = page >= pages;
    const visible = state === 'data' ? (shown.length ? 'data' : 'empty') : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'empty';
    ['data', 'empty', 'loading', 'error'].forEach(key => { $(`state-${key}`).hidden = visible !== key; });
  }
  function render() {
    const actor = SchoolData.actor, list = tasks();
    $('school-app').hidden = state !== 'data';
    $('demo-greeting').textContent = actor ? `Chào ${actor.name}!` : 'Tổng quan công việc';
    $('demo-role').textContent = actor ? roles[actor.role] || 'Tài khoản' : 'KHÔNG GIAN CỦA BẠN';
    $('demo-scope').textContent = actor?.role === 'bgh' ? 'Theo dõi và điều phối công việc trong toàn trường.' : actor?.role === 'head' ? `Theo dõi công việc thuộc ${actor.department || 'tổ được phân quyền'}.` : 'Các công việc được giao và kết quả thực hiện của bạn.';
    $('profile-name').textContent = actor?.name || 'Đang tải'; $('profile-role').textContent = roles[actor?.role] || '';
    $('profile-initial').textContent = actor?.name?.split(' ').at(-1)?.slice(0, 1) || 'H';
    $('account-details').textContent = actor ? `${actor.name} · ${roles[actor.role] || actor.role} · ${SchoolData.user?.email || ''}${actor.department ? ' · ' + actor.department : ''}` : '';
    $('nav-task-count').textContent = list.filter(active).length;
    document.querySelectorAll('[data-create-task]').forEach(button => { button.hidden = state !== 'data' || !SchoolData.canCreate(actor); });
    renderMetrics(list); renderRows(list); renderPending(list); renderNotifications(list);
    $('overview-metrics').hidden = view !== 'overview'; $('task-columns').hidden = !['overview', 'tasks'].includes(view);
    $('notifications-section').hidden = view !== 'notifications'; $('account-section').hidden = view !== 'account';
    document.querySelector('.dashboard-aside').hidden = view !== 'overview';
    $('task-columns').classList.toggle('all-tasks-view', view === 'tasks');
    $('list-heading').firstChild.textContent = view === 'tasks' ? 'Tất cả công việc ' : 'Cần thực hiện ';
    $('view-all-tasks').hidden = view === 'tasks';
    document.querySelectorAll('[data-path]').forEach(link => { if (link.dataset.path === ({ overview: 'tong-quan', tasks: 'quan-ly-cong-viec', notifications: 'thong-bao', account: 'tai-khoan' })[view]) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  }
  function navigate(next, filter = 'all') { view = next; page = 1; $('task-status-filter').value = filter; $('task-search').value = ''; render(); $('main-content').focus({ preventScroll: true }); }
  document.querySelectorAll('[data-path]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(({ 'tong-quan': 'overview', 'quan-ly-cong-viec': 'tasks', 'thong-bao': 'notifications', 'tai-khoan': 'account' })[link.dataset.path] || 'overview'); }));
  $('view-all-tasks').addEventListener('click', () => navigate('tasks'));
  $('pending-more').addEventListener('click', () => navigate('tasks', 'pending_review'));
  $('view-overdue').addEventListener('click', () => navigate('tasks', 'overdue'));
  $('notifications-all').addEventListener('click', () => { $('notification-popover').hidden = true; $('notifications-toggle').setAttribute('aria-expanded', 'false'); navigate('notifications'); });
  $('notifications-toggle').addEventListener('click', () => { const open = $('notification-popover').hidden; $('notification-popover').hidden = !open; $('notifications-toggle').setAttribute('aria-expanded', String(open)); });
  $('notifications-close').addEventListener('click', () => { $('notification-popover').hidden = true; $('notifications-toggle').setAttribute('aria-expanded', 'false'); $('notifications-toggle').focus(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('notification-popover').hidden = true; $('notifications-toggle').setAttribute('aria-expanded', 'false'); } });
  $('task-search').addEventListener('input', () => { page = 1; renderRows(tasks()); });
  $('task-status-filter').addEventListener('change', () => { page = 1; renderRows(tasks()); });
  $('page-previous').addEventListener('click', () => { page--; renderRows(tasks()); }); $('page-next').addEventListener('click', () => { page++; renderRows(tasks()); });
  document.querySelectorAll('[data-create-task]').forEach(button => button.addEventListener('click', () => {
    if (!SchoolData.actor || state !== 'data') return;
    TaskForm.open({ actor: SchoolData.actor, store, setBusy(value) { document.dispatchEvent(new CustomEvent('school-form-busy', { detail: value })); }, onSaved(task) { render(); $('task-notice').textContent = `Đã lưu công việc “${task.title}” và đọc lại từ Supabase.`; } }, button);
  }));
  document.addEventListener('school-session', event => {
    const nextIdentity = SchoolData.actor?.id || null;
    if (identity !== nextIdentity || event.detail.state !== 'data') { view = 'overview'; page = 1; $('task-search').value = ''; $('task-status-filter').value = 'all'; $('task-notice').textContent = ''; $('notification-popover').hidden = true; }
    identity = nextIdentity; state = event.detail.state; render();
  });
  document.addEventListener('school-tasks-updated', () => render());
  render();
})();
