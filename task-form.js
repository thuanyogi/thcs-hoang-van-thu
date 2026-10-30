/* Native dialog supplies focus containment and makes the background inert. */
(function () {
  'use strict';
  const dialog = document.getElementById('task-dialog');
  const form = document.getElementById('task-form');
  const submit = document.getElementById('task-submit');
  const cancel = document.getElementById('task-cancel');
  let pending = false, requestId, opener, context;
  function showErrors(errors = {}) {
    form.querySelectorAll('[data-error]').forEach(el => { el.textContent = errors[el.dataset.error] || ''; });
    form.querySelectorAll('[aria-describedby]').forEach(el => {
      el.setAttribute('aria-invalid', String(Boolean(errors[el.name])));
    });
  }
  function setPending(value) {
    pending = value;
    form.querySelector('fieldset').disabled = value;
    submit.disabled = cancel.disabled = value;
    submit.textContent = value ? 'Đang lưu…' : 'Lưu công việc';
    form.setAttribute('aria-busy', String(value));
  }
  function close() {
    if (pending) return;
    dialog.close();
    opener?.focus();
  }
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !context) return;
    const attempt = context;
    if (SchoolData.actor?.id !== attempt.actor.id) {
      showErrors({ permission: 'Phiên đăng nhập đã thay đổi. Hãy đóng biểu mẫu và thử lại.' });
      return;
    }
    const data = new FormData(form);
    const input = {
      title: data.get('title'), description: data.get('description'), assigneeId: data.get('assigneeId'),
      scope: data.get('scope'), department: context.actor.role === 'head' ? context.actor.department : null,
      dueDate: data.get('dueDate'), requiresApproval: data.has('requiresApproval'), requiresEvidence: data.has('requiresEvidence')
    };
    const errors = SchoolData.validate(context.actor.id, input);
    showErrors(errors);
    if (Object.keys(errors).length) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    setPending(true);
    context.setBusy(true);
    try {
      const task = await attempt.store.create(attempt.actor.id, input, requestId);
      const saved = await attempt.store.get(attempt.actor.id, task.id);
      if (!saved) throw new Error('Chưa đọc lại được công việc đã ghi. Vui lòng kiểm tra danh sách.');
      if (SchoolData.actor?.id !== attempt.actor.id || context !== attempt) return;
      attempt.onSaved(saved);
      setPending(false);
      close();
    } catch (error) {
      if (context === attempt) showErrors(error.errors || { save: error.message || 'Chưa lưu được công việc. Vui lòng thử lại.' });
    } finally {
      if (context === attempt) { setPending(false); attempt.setBusy(false); }
    }
  });
  document.addEventListener('school-session', event => {
    if (event.detail.state === 'data' && (!context || SchoolData.actor?.id === context.actor.id)) return;
    const previous = context;
    context = null;
    setPending(false);
    form.reset();
    showErrors();
    dialog.close();
    previous?.setBusy(false);
  });
  window.TaskForm = {
    open(options, trigger) {
      if (!SchoolData.canCreate(options.actor) || dialog.open) return;
      context = options;
      opener = trigger;
      requestId = crypto.randomUUID();
      form.reset();
      showErrors();
      const scope = form.elements.scope;
      scope.replaceChildren(new Option(options.actor.role === 'bgh' ? 'Cấp trường' : `Tổ ${options.actor.department}`, options.actor.role === 'bgh' ? 'school' : 'department'));
      const select = form.elements.assigneeId;
      select.replaceChildren(new Option('Chọn giáo viên phụ trách', ''));
      SchoolData.users.filter(user => user.role === 'teacher' && (options.actor.role === 'bgh' || user.department === options.actor.department))
        .forEach(user => select.add(new Option(user.name, user.id)));
      dialog.showModal();
      form.elements.title.focus();
    }
  };
})();
