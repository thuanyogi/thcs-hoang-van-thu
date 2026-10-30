/* Native modal keeps task reporting and review accessible by keyboard. */
(function () {
  'use strict';
  const dialog = document.getElementById('task-detail-dialog'), content = document.getElementById('detail-content');
  const statuses = { todo: 'Chưa bắt đầu', in_progress: 'Đang thực hiện', pending_review: 'Chờ xác nhận', completed: 'Đã hoàn thành' };
  const eventLabels = { created: 'Giao công việc', started: 'Bắt đầu thực hiện', submitted: 'Gửi báo cáo', completed: 'Hoàn thành', approved: 'Xác nhận kết quả', returned: 'Trả lại báo cáo', due_changed: 'Thay đổi thời hạn', start: 'Bắt đầu thực hiện', submit: 'Gửi báo cáo', approve: 'Xác nhận kết quả', return: 'Trả lại báo cáo' };
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
  const name = id => SchoolData.users.find(user => user.id === id)?.name || 'Người dùng';
  const value = (row, camel, snake) => row[camel] ?? row[snake];
  const date = input => input ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(input)) : 'Chưa có';
  let generation = 0, current = null, pending = false, opener;
  function busy(next) {
    pending = next;
    content.setAttribute('aria-busy', String(next));
    content.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = next; });
    document.getElementById('detail-close').disabled = next;
    document.dispatchEvent(new CustomEvent('school-form-busy', { detail: next }));
  }
  function close(force = false) {
    if (pending && !force) return;
    generation++; current = null; pending = false; dialog.close(); content.replaceChildren();
    document.getElementById('detail-close').disabled = false;
    if (!force) opener?.focus();
  }
  document.getElementById('detail-close').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function field(label, type, name, required = false) {
    const wrapper = text('label', label, 'workflow-field'), input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    input.name = name; input.required = required;
    if (type === 'textarea') input.rows = 4; else input.type = type;
    wrapper.append(input); return { wrapper, input };
  }
  function button(label, className = 'button-primary') { const el = text('button', label, className); el.type = 'button'; return el; }
  function section(title) { const el = document.createElement('section'); el.className = 'detail-section'; el.append(text('h3', title)); return el; }
  function feedback(el, message, error = false) { el.textContent = message; el.className = error ? 'workflow-feedback error' : 'workflow-feedback'; }
  async function reload(attempt) {
    const result = await SchoolData.store.detail(attempt.actorId, attempt.taskId);
    if (current !== attempt || SchoolData.actor?.id !== attempt.actorId) return false;
    attempt.detail = result; return true;
  }
  async function action(attempt, kind, input, status, requestId) {
    if (pending || current !== attempt || SchoolData.actor?.id !== attempt.actorId) return;
    busy(true); feedback(status, kind === 'submit' ? 'Đang tải minh chứng và lưu báo cáo…' : 'Đang lưu thay đổi…');
    try {
      const payload = typeof input === 'function' ? await input() : input;
      if (current !== attempt || SchoolData.actor?.id !== attempt.actorId) return;
      await SchoolData.store.action(attempt.actorId, attempt.taskId, kind, payload, requestId);
      if (!await reload(attempt)) return;
      busy(false); render(attempt);
      const success = content.querySelector('#detail-status');
      feedback(success, 'Đã lưu thay đổi và đọc lại công việc từ Supabase.');
      document.dispatchEvent(new CustomEvent('school-tasks-updated'));
    } catch (error) {
      if (current === attempt) feedback(status, error.message || 'Chưa lưu được. Nội dung bạn nhập vẫn được giữ lại.', true);
    } finally { if (current === attempt) busy(false); }
  }
  function reportSection(attempt, task) {
    const el = section('Báo cáo kết quả'), form = document.createElement('form');
    const body = field('Nội dung báo cáo *', 'textarea', 'body', true); body.input.maxLength = 20000;
    const files = field(task.requiresEvidence ? 'Tệp minh chứng *' : 'Tệp minh chứng', 'file', 'evidence');
    files.input.multiple = true; files.input.accept = '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.jpg,.jpeg,.png';
    const note = text('small', 'DOC, DOCX, XLS, XLSX, PPT, PPTX, PDF, JPG, JPEG, PNG · tối đa 25 MB/tệp.', 'muted');
    const chosen = text('p', '', 'selected-files'), status = text('p', '', 'workflow-feedback'); status.setAttribute('role', 'status');
    const submit = button(task.requiresApproval ? 'Gửi báo cáo để xác nhận' : 'Hoàn thành công việc'); submit.type = 'submit';
    const uploaded = new Map(); let requestId = crypto.randomUUID(), previousPayload = '';
    files.input.addEventListener('change', () => { chosen.textContent = [...files.input.files].map(file => `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`).join('\n'); });
    form.append(body.wrapper, files.wrapper, note, chosen, status, submit);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (pending || !form.reportValidity()) return;
      const evidence = [...files.input.files];
      if (!body.input.value.trim()) { feedback(status, 'Vui lòng nhập nội dung báo cáo.', true); body.input.focus(); return; }
      if (task.requiresEvidence && !evidence.length) { feedback(status, 'Công việc này yêu cầu ít nhất một tệp minh chứng.', true); files.input.focus(); return; }
      const invalid = evidence.find(file => file.size > 25 * 1024 * 1024 || !/\.(docx?|xlsx?|pptx?|pdf|jpe?g|png)$/i.test(file.name));
      if (invalid) { feedback(status, `Tệp “${invalid.name}” không đúng định dạng hoặc vượt 25 MB.`, true); return; }
      const signature = JSON.stringify([body.input.value.trim(), evidence.map(file => [file.name, file.size, file.lastModified])]);
      if (signature !== previousPayload) { requestId = crypto.randomUUID(); previousPayload = signature; }
      action(attempt, 'submit', async () => {
        const metadata = [];
        for (const file of evidence) {
          if (current !== attempt || SchoolData.actor?.id !== attempt.actorId) throw new Error('Phiên đăng nhập đã thay đổi.');
          feedback(status, `Đang tải ${file.name}…`);
          if (!uploaded.has(file)) uploaded.set(file, await SchoolData.store.upload(attempt.actorId, task.id, file));
          metadata.push(uploaded.get(file));
        }
        return { body: body.input.value.trim(), evidence: metadata };
      }, status, requestId);
    });
    el.append(form); return el;
  }
  function reviewSection(attempt, task, submissions) {
    const pendingSubmission = [...submissions].reverse().find(row => ['pending', 'pending_review'].includes(value(row, 'reviewStatus', 'review_status')));
    const el = section('Xét duyệt báo cáo');
    if (!pendingSubmission) { el.append(text('p', 'Chưa đọc được báo cáo để xét duyệt. Hãy đóng và mở lại công việc.')); return el; }
    const reason = field('Lý do trả lại (bắt buộc khi trả lại)', 'textarea', 'reason'); reason.input.maxLength = 20000;
    const newDue = field('Hạn mới khi trả lại (không bắt buộc)', 'date', 'newDueDate');
    const status = text('p', '', 'workflow-feedback'); status.setAttribute('role', 'status');
    const approve = button('Xác nhận kết quả'), back = button('Trả lại báo cáo', 'button-return'), actions = text('div', '', 'workflow-actions');
    let requestId = crypto.randomUUID(), previousPayload = '';
    function review(decision) {
      if (decision === 'return' && !reason.input.value.trim()) { feedback(status, 'Vui lòng nêu lý do trả lại.', true); reason.input.focus(); return; }
      if (decision === 'return' && !newDue.input.reportValidity()) return;
      const input = { submissionId: pendingSubmission.id, decision, ...(decision === 'return' ? { reason: reason.input.value.trim(), newDueDate: newDue.input.value || undefined } : {}) };
      const signature = JSON.stringify(input); if (signature !== previousPayload) { requestId = crypto.randomUUID(); previousPayload = signature; }
      action(attempt, 'review', input, status, requestId);
    }
    approve.addEventListener('click', () => review('approve')); back.addEventListener('click', () => review('return'));
    actions.append(approve, back); el.append(reason.wrapper, newDue.wrapper, text('small', 'Hạn mới tính đến cuối ngày theo giờ Việt Nam.', 'muted'), status, actions); return el;
  }
  async function download(attempt, file, link, status) {
    link.disabled = true;
    try {
      const result = await SchoolData.store.download(attempt.actorId, file.id);
      if (current !== attempt || SchoolData.actor?.id !== attempt.actorId) return;
      const url = new URL(typeof result === 'string' ? result : result.signedUrl || result.signedURL);
      if (url.protocol !== 'https:' || url.hostname !== 'iqchlkfmgxeafgsbconv.supabase.co') throw new Error('Đường dẫn tải tệp không hợp lệ.');
      const anchor = document.createElement('a'); anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.download = value(file, 'originalName', 'original_name') || 'minh-chung'; anchor.click();
      feedback(status, 'Đã mở liên kết tải tệp được cấp quyền.');
    } catch (error) { if (current === attempt) feedback(status, error.message || 'Chưa tải được tệp.', true); }
    finally { if (current === attempt) link.disabled = false; }
  }
  function reports(attempt, submissions, files) {
    const el = section('Báo cáo và minh chứng');
    if (!submissions.length) el.append(text('p', 'Chưa có báo cáo.', 'muted'));
    [...submissions].reverse().forEach(row => {
      const report = text('article', '', 'submission-card');
      report.append(text('strong', name(value(row, 'authorId', 'author_id'))), text('small', date(value(row, 'submittedAt', 'submitted_at')), 'muted'), text('p', row.body || '', 'report-body'));
      const reviewed = value(row, 'reviewStatus', 'review_status');
      report.append(text('span', ({ pending: 'Chờ xác nhận', pending_review: 'Chờ xác nhận', approved: 'Đã xác nhận', returned: 'Đã trả lại', not_required: 'Hoàn thành không cần xác nhận' })[reviewed] || reviewed || 'Đã gửi', 'status-badge'));
      const status = text('p', '', 'workflow-feedback'); status.setAttribute('role', 'status');
      files.filter(file => value(file, 'submissionId', 'submission_id') === row.id).forEach(file => {
        const link = button(`↓ ${value(file, 'originalName', 'original_name') || 'Tệp minh chứng'}`, 'file-download');
        link.addEventListener('click', () => download(attempt, file, link, status)); report.append(link);
      });
      report.append(status); el.append(report);
    }); return el;
  }
  function history(events) {
    const el = section('Lịch sử xử lý'), list = document.createElement('ol'); list.className = 'task-history';
    [...events].sort((a, b) => (value(b, 'createdAt', 'created_at') || '').localeCompare(value(a, 'createdAt', 'created_at') || '')).forEach(row => {
      const item = document.createElement('li'), kind = value(row, 'eventType', 'event_type');
      item.append(text('strong', eventLabels[kind] || kind || 'Cập nhật công việc'), text('small', `${name(value(row, 'actorId', 'actor_id'))} · ${date(value(row, 'createdAt', 'created_at'))}`, 'muted'));
      if (row.reason) item.append(text('p', row.reason));
      if (value(row, 'newDueAt', 'new_due_at')) item.append(text('p', `Hạn: ${date(value(row, 'oldDueAt', 'old_due_at'))} → ${date(value(row, 'newDueAt', 'new_due_at'))}`));
      list.append(item);
    });
    el.append(events.length ? list : text('p', 'Chưa có lịch sử xử lý.', 'muted')); return el;
  }
  function render(attempt) {
    const { task, submissions = [], events = [], files = [] } = attempt.detail;
    content.replaceChildren();
    const heading = text('h2', task.title); heading.id = 'detail-title';
    const status = text('p', '', 'workflow-feedback'); status.id = 'detail-status'; status.setAttribute('role', 'status');
    content.append(heading, text('span', statuses[task.status] || task.status, `status-badge ${task.status}`), status);
    const summary = section('Yêu cầu công việc'); summary.append(text('p', task.description, 'report-body'));
    const metadata = document.createElement('dl'); metadata.className = 'task-metadata';
    [['Người giao', name(task.assignerId)], ['Người phụ trách', name(task.assigneeId)], ['Phạm vi', task.scope === 'school' ? 'Cấp trường' : task.department || 'Tổ chuyên môn'], ['Hạn thực hiện', date(task.dueAt || `${task.dueDate}T23:59:59+07:00`)], ['Yêu cầu xác nhận', task.requiresApproval ? 'Có' : 'Không'], ['Yêu cầu minh chứng', task.requiresEvidence ? 'Bắt buộc' : 'Không bắt buộc']].forEach(([label, data]) => metadata.append(text('dt', label), text('dd', data)));
    summary.append(metadata); content.append(summary);
    if (task.returnedReason && ['todo', 'in_progress'].includes(task.status)) { const returned = section('Báo cáo bị trả lại'); returned.classList.add('return-panel'); returned.append(text('p', task.returnedReason, 'report-body')); content.append(returned); }
    const actor = SchoolData.actor;
    if (task.assigneeId === actor.id && task.status === 'todo') {
      const start = button('Bắt đầu thực hiện'); start.addEventListener('click', () => action(attempt, 'start', {}, status, attempt.startRequestId)); content.append(start);
    }
    if (task.assigneeId === actor.id && ['todo', 'in_progress'].includes(task.status)) content.append(reportSection(attempt, task));
    const canReview = actor.role === 'bgh' && task.scope === 'school' || actor.role === 'head' && task.scope === 'department' && actor.department === task.department;
    if (canReview && task.status === 'pending_review') content.append(reviewSection(attempt, task, submissions));
    content.append(reports(attempt, submissions, files), history(events));
  }
  document.addEventListener('school-session', event => {
    if (event.detail.state !== 'data' || current && SchoolData.actor?.id !== current.actorId) {
      const wasPending = pending; close(true);
      if (wasPending) document.dispatchEvent(new CustomEvent('school-form-busy', { detail: false }));
    }
  });
  window.TaskWorkflow = { async open(taskId, trigger) {
    if (!SchoolData.actor || pending || dialog.open) return;
    opener = trigger; const attempt = { actorId: SchoolData.actor.id, taskId, generation: ++generation, startRequestId: crypto.randomUUID() }; current = attempt;
    const heading = text('h2', 'Đang tải công việc…'); heading.id = 'detail-title'; content.replaceChildren(heading); dialog.showModal();
    try { if (await reload(attempt)) render(attempt); }
    catch (error) { if (current === attempt) content.replaceChildren(heading, text('p', error.message || 'Chưa tải được chi tiết công việc.', 'workflow-feedback error')); }
  } };
})();
