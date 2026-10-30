(function () {
  'use strict';
  const launcher = document.createElement('button');
  launcher.id = 'task-chat-launcher'; launcher.type = 'button'; launcher.hidden = true;
  launcher.textContent = 'Hỏi về công việc'; launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-controls', 'task-chat-dialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'task-chat-dialog'; dialog.setAttribute('aria-labelledby', 'task-chat-title');
  function node(tag, content, className) {
    const element = document.createElement(tag); element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  const header = node('header', '', 'chat-header');
  const title = node('h2', 'Hỏi về công việc'); title.id = 'task-chat-title';
  const close = node('button', '×', 'chat-close'); close.type = 'button'; close.setAttribute('aria-label', 'Đóng hộp hỏi công việc');
  header.append(title, close);
  const intro = node('p', 'Hỏi về công việc trong phạm vi bạn được xem. Câu trả lời AI có thể sai; hãy mở công việc nguồn để kiểm tra.', 'chat-intro');
  intro.id = 'task-chat-note'; dialog.setAttribute('aria-describedby', intro.id);
  const examples = node('div', '', 'chat-examples'); examples.setAttribute('aria-label', 'Câu hỏi gợi ý');
  const transcript = node('div', '', 'chat-transcript'); transcript.setAttribute('role', 'log');
  transcript.setAttribute('aria-label', 'Cuộc hỏi đáp'); transcript.setAttribute('aria-live', 'polite');
  const form = document.createElement('form'); form.className = 'chat-form';
  const label = node('label', 'Câu hỏi của bạn'); label.htmlFor = 'task-chat-question';
  const input = document.createElement('textarea'); input.id = label.htmlFor; input.rows = 3;
  input.maxLength = 1000; input.required = true; input.placeholder = 'Ví dụ: Những công việc nào đang quá hạn?';
  const send = node('button', 'Gửi câu hỏi', 'chat-send'); send.type = 'submit';
  const status = node('p', '', 'chat-status'); status.setAttribute('role', 'status');
  form.append(label, input, send, status); dialog.append(header, intro, examples, transcript, form);
  document.body.append(launcher, dialog);
  let identity = null, epoch = 0, busy = false, ready = false, pendingRow = null;
  function controls() {
    send.disabled = input.disabled = busy || !ready;
    examples.querySelectorAll('button').forEach(button => { button.disabled = busy || !ready; });
    form.setAttribute('aria-busy', String(busy));
  }
  function scroll() { transcript.scrollTop = transcript.scrollHeight; }
  function closeChat() { if (dialog.open) dialog.close(); }
  launcher.addEventListener('click', () => { if (ready) { dialog.showModal(); input.focus(); } });
  close.addEventListener('click', closeChat);
  dialog.addEventListener('close', () => { if (!launcher.hidden) launcher.focus(); });
  for (const question of ['Những công việc nào đang quá hạn?', 'Công việc nào sắp đến hạn?', 'Những công việc nào đang chờ xác nhận?']) {
    const button = node('button', question); button.type = 'button';
    button.addEventListener('click', () => { input.value = question; input.focus(); }); examples.append(button);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || question.length > 1000 || busy || !ready) return;
    const requestEpoch = epoch, actorId = identity;
    const valid = () => requestEpoch === epoch && actorId === SchoolData.actor?.id && ready;
    transcript.append(node('p', question, 'chat-question'));
    const row = node('section', '', 'chat-answer');
    row.append(node('p', 'Đang tìm câu trả lời…')); transcript.append(row); pendingRow = row;
    busy = true; status.textContent = ''; controls(); scroll();
    try {
      const result = await SchoolData.askTasks(question);
      if (!valid()) return;
      row.replaceChildren(node('p', result.answer));
      if (result.scopeNote) row.append(node('p', result.scopeNote, 'chat-scope'));
      if (result.summary) {
        const s = result.summary;
        row.append(node('p', `Số liệu đối chiếu: ${s.authorizedTotal} công việc · ${s.overdue} quá hạn · ${s.pendingReview} chờ xác nhận · ${s.upcoming7Days} đến hạn trong 7 ngày.`, 'chat-scope'));
      }
      if (result.partial) row.append(node('p', 'Dữ liệu có thể chưa đầy đủ. Hãy kiểm tra danh sách công việc.', 'chat-scope'));
      if (result.contextLimited) row.append(node('p', 'Câu trả lời trích một phần công việc phù hợp. Hãy xem danh sách để đối chiếu đầy đủ.', 'chat-scope'));
      if (Array.isArray(result.sources) && result.sources.length) {
        row.append(node('strong', 'Công việc nguồn'));
        for (const source of result.sources) {
          const button = node('button', source.title, 'chat-source'); button.type = 'button';
          button.addEventListener('click', () => {
            if (!ready || actorId !== SchoolData.actor?.id) return;
            closeChat(); TaskWorkflow.open(source.id, launcher);
          }); row.append(button);
        }
      }
      input.value = '';
    } catch (error) {
      if (!valid()) return;
      row.replaceChildren(node('p', error.message || 'Chưa nhận được câu trả lời. Vui lòng thử lại.', 'chat-error'));
    } finally {
      if (valid()) { busy = false; pendingRow = null; controls(); scroll(); }
    }
  });
  document.addEventListener('school-session', event => {
    const actorId = SchoolData.actor?.id || null;
    ready = event.detail.state === 'data' && Boolean(actorId);
    if (!ready || actorId !== identity) {
      epoch++; busy = false; pendingRow?.remove(); pendingRow = null; closeChat();
    }
    if (actorId !== identity || event.detail.state === 'signed-out') {
      transcript.replaceChildren(); input.value = ''; status.textContent = '';
    }
    identity = actorId; launcher.hidden = !ready; controls();
  });
})();
