export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase(); }
export function prepareContext(rows, question, actorId, now = Date.now()) {
 const q = normalize(question);
 const original = question.normalize('NFC').toLowerCase();
 const mine = /(?:^|[\s,.;!?])(tôi|toi)(?=$|[\s,.;!?])|của mình|cua minh/.test(original);
 const scoped = mine ? rows.filter(t => t.assignee_id === actorId) : rows;
 const active = t => ['todo', 'in_progress'].includes(t.status);
 const overdue = t => active(t) && Date.parse(t.due_at) < now;
 const upcoming = t => active(t) && Date.parse(t.due_at) >= now && Date.parse(t.due_at) <= now + 7 * 86400000;
 const pending = /cho (duyet|xac nhan)|can duyet/.test(q);
 const late = /qua han|tre han/.test(q);
 const soon = /sap (den han|toi han)|7 ngay toi/.test(q);
 const explicitIds = question.match(/[0-9a-f]{8}-[0-9a-f-]{27}/gi) || [];
 let matching = scoped.filter(t => (!pending || t.status === 'pending_review') && (!late || overdue(t)) && (!soon || upcoming(t)));
 if (explicitIds.length) matching = matching.filter(t => explicitIds.some(id => id.toLowerCase() === t.id.toLowerCase()));
 const stop = new Set('toi co cua minh nhung cong viec task nao la gi hay cho biet tom tat thong tin ve dang can thuc hien trong va cac so luong bao nhieu duoc giao han den sap toi ngay qua tre cho duyet xac nhan'.split(' '));
 const words = q.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stop.has(w));
 const score = t => words.reduce((n, w) => n + Number(normalize(t.title).includes(w)), 0);
 matching.sort((a,b) => score(b)-score(a) || a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id));
 return {
  summary: { authorizedTotal: scoped.length, matchingTotal: matching.length, overdue: scoped.filter(overdue).length, upcoming7Days: scoped.filter(upcoming).length, pendingReview: scoped.filter(t => t.status === 'pending_review').length },
  selected: matching.slice(0, 15),
  contextLimited: matching.length > 15,
  scopeNote: mine ? 'Công việc được giao cho bạn.' : 'Công việc trong phạm vi bạn được quyền xem.'
 };
}
export function safeTasks(rows) {
 return rows.map(t => ({ id:t.id, title:t.title.slice(0,500), description:(t.description || '').slice(0,1600), status:t.status, dueAt:t.due_at }));
}
export function validateAnswer(value, tasks) {
 if (!value || typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length > 6000 || !Array.isArray(value.taskIds) || value.taskIds.length > 15) throw new Error('invalid_answer');
 const ids = new Set(tasks.map(t => t.id));
 if (value.taskIds.some(id => typeof id !== 'string' || !ids.has(id))) throw new Error('invalid_sources');
 return { answer:value.answer, sources:[...new Set(value.taskIds)].map(id => ({id,title:tasks.find(t=>t.id===id).title})) };
}
