/* In-memory demo only. A browser role selector is not authentication. */
(function (root) {
  'use strict';
  const users = [
    { id: 'bgh', name: 'BGH mẫu', role: 'bgh', department: null },
    { id: 'head-social', name: 'Tổ trưởng mẫu — KHXH', role: 'head', department: 'KHXH' },
    { id: 'head-science', name: 'Tổ trưởng mẫu — KHTN', role: 'head', department: 'KHTN' },
    { id: 'teacher-social', name: 'Giáo viên mẫu — KHXH', role: 'teacher', department: 'KHXH' },
    { id: 'teacher-science', name: 'Giáo viên mẫu — KHTN', role: 'teacher', department: 'KHTN' },
    { id: 'teacher-language', name: 'Giáo viên mẫu — Ngoại Ngữ', role: 'teacher', department: 'Ngoại Ngữ' },
    { id: 'teacher-special', name: 'Giáo viên mẫu — Đặc thù', role: 'teacher', department: 'Đặc thù' }
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const person = id => users.find(user => user.id === id);
  const canCreate = user => Boolean(user && ['bgh', 'head'].includes(user.role));
  function validate(actorId, input) {
    const actor = person(actorId), errors = {};
    if (!canCreate(actor)) return { permission: 'Bạn không có quyền giao công việc.' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { save: 'Dữ liệu công việc không hợp lệ. Vui lòng thử lại.' };
    if (typeof input.title !== 'string' || !input.title.trim()) errors.title = 'Vui lòng nhập tên công việc.';
    if (typeof input.description !== 'string' || !input.description.trim()) errors.description = 'Vui lòng nhập mô tả/yêu cầu thực hiện.';
    const assignee = person(input.assigneeId);
    if (!assignee || assignee.role !== 'teacher') errors.assigneeId = 'Vui lòng chọn giáo viên phụ trách hợp lệ.';
    if (input.scope !== (actor.role === 'bgh' ? 'school' : 'department')) errors.scope = 'Phạm vi giao việc không thuộc quyền của bạn.';
    if (actor.role === 'head' && assignee && assignee.department !== actor.department) errors.assigneeId = 'Chỉ được giao cho giáo viên thuộc tổ phụ trách.';
    if (actor.role === 'head' && input.department !== actor.department) errors.scope = 'Chỉ được giao việc trong tổ phụ trách.';
    if (actor.role === 'bgh' && input.department != null) errors.scope = 'Việc cấp trường không gắn phạm vi tổ.';
    const validDate = typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
      && Number.isFinite(Date.parse(input.dueDate)) && new Date(input.dueDate).toISOString().slice(0, 10) === input.dueDate;
    if (!validDate) errors.dueDate = 'Vui lòng chọn ngày thời hạn hợp lệ.';
    if (typeof input.requiresApproval !== 'boolean' || typeof input.requiresEvidence !== 'boolean') errors.flags = 'Lựa chọn xác nhận/minh chứng không hợp lệ.';
    return errors;
  }
  function seedTasks() {
    return ['KHXH', 'KHTN', 'Ngoại Ngữ', 'Đặc thù'].map((department, index) => ({
      id: `sample-${index}`, title: `Nộp kế hoạch môn học tổ ${department}`,
      description: 'Dữ liệu minh họa: chuẩn bị kế hoạch môn học để cùng kiểm tra luồng giao việc.',
      assignerId: index === 0 ? 'head-social' : 'bgh',
      assigneeId: users.filter(user => user.role === 'teacher')[index].id,
      scope: index === 0 ? 'department' : 'school', department: index === 0 ? department : null,
      dueDate: '2026-10-25', status: ['todo', 'in_progress', 'todo', 'pending_review'][index],
      requiresApproval: true, requiresEvidence: false
    }));
  }
  function createStore({ delay = () => new Promise(resolve => setTimeout(resolve, 450)) } = {}) {
    const tasks = seedTasks(), requests = new Map();
    let failNext = false, sequence = 0;
    const visible = actorId => {
      const actor = person(actorId);
      if (!actor) return [];
      return tasks.filter(task => actor.role === 'bgh'
        || task.assigneeId === actor.id
        || (actor.role === 'head' && task.scope === 'department' && task.department === actor.department));
    };
    return {
      list: actorId => clone(visible(actorId)),
      get: (actorId, id) => clone(visible(actorId).find(task => task.id === id) || null),
      simulateFailureOnce() { failNext = true; },
      create(actorId, input, requestId) {
        const errors = validate(actorId, input);
        if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error('Không thể giao công việc.'), { errors }));
        if (typeof requestId !== 'string' || !requestId.trim()) return Promise.reject(new Error('Thiếu mã yêu cầu. Vui lòng thử lại.'));
        const payload = clone(input), key = `${actorId}:${requestId}`, fingerprint = JSON.stringify(payload);
        const existing = requests.get(key);
        if (existing) return existing.fingerprint === fingerprint ? existing.promise
          : Promise.reject(new Error('Mã yêu cầu đã dùng cho nội dung khác. Vui lòng mở lại form.'));
        // Register before the asynchronous write so simultaneous submissions share one result.
        const promise = (async () => {
          await delay();
          if (failNext) { failNext = false; throw new Error('Mô phỏng lỗi lưu: chưa ghi công việc. Vui lòng thử lại.'); }
          const task = { ...payload, title: payload.title.trim(), description: payload.description.trim(),
            id: `demo-${++sequence}`, assignerId: actorId, status: 'todo', createdAt: new Date().toISOString() };
          tasks.push(task);
          return clone(task);
        })();
        requests.set(key, { fingerprint, promise });
        promise.catch(() => requests.delete(key));
        return promise;
      }
    };
  }
  const api = { users: clone(users), canCreate, validate, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskDemo = api;
})(globalThis);
