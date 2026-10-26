const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, validate } = require('../task-demo-store.js');
const valid = overrides => ({ title: 'Việc mẫu', description: 'Yêu cầu mẫu', assigneeId: 'teacher-social', scope: 'school', department: null,
  dueDate: '2026-10-25', requiresApproval: true, requiresEvidence: true, ...overrides });
const store = () => createStore({ delay: async () => {} });
test('BGH ghi và đọc lại việc trường với người giao và flags', async () => {
  const db = store(), task = await db.create('bgh', valid(), 'a');
  assert.equal(db.list('bgh').length, 5);
  assert.equal(db.get('bgh', task.id).assignerId, 'bgh');
  assert.equal(task.requiresEvidence, true);
  assert.equal(task.status, 'todo');
});
test('tổ trưởng giao được đúng tổ', async () => {
  const db = store();
  const task = await db.create('head-social', valid({ scope: 'department', department: 'KHXH' }), 'b');
  assert.equal(db.get('head-social', task.id).department, 'KHXH');
});
test('tổ trưởng bị chặn ngoài tổ, cấp trường và giả department', async () => {
  const db = store();
  for (const input of [valid(), valid({ scope: 'department', department: 'KHXH', assigneeId: 'teacher-science' }), valid({ scope: 'department', department: 'KHTN' })]) {
    await assert.rejects(db.create('head-social', input, 'bad'));
  }
  assert.equal(db.list('bgh').length, 4);
});
test('giáo viên và người lạ bị chặn tại điểm ghi, kể cả giả field role', async () => {
  const db = store();
  for (const actor of ['teacher-social', 'missing']) await assert.rejects(db.create(actor, valid({ role: 'bgh' }), 'c'), /Không thể giao/);
  assert.equal(db.list('bgh').length, 4);
});
test('bắt buộc tên, mô tả, người nhận và hạn', () => {
  const errors = validate('bgh', valid({ title: '  ', description: '', assigneeId: '', dueDate: '' }));
  for (const field of ['title', 'description', 'assigneeId', 'dueDate']) assert.ok(errors[field]);
});
test('từ chối ngày không tồn tại, người nhận sai và flags không phải boolean', () => {
  assert.ok(validate('bgh', valid({ dueDate: '2026-02-30' })).dueDate);
  assert.ok(validate('bgh', valid({ assigneeId: 'bgh' })).assigneeId);
  assert.ok(validate('bgh', valid({ requiresEvidence: 'false' })).flags);
});
test('hai yêu cầu đồng thời và retry sau thành công chỉ ghi một lần', async () => {
  const db = store();
  const [one, two] = await Promise.all([db.create('bgh', valid(), 'same'), db.create('bgh', valid(), 'same')]);
  assert.equal(one.id, two.id);
  assert.equal((await db.create('bgh', valid(), 'same')).id, one.id);
  assert.equal(db.list('bgh').length, 5);
  await assert.rejects(db.create('bgh', valid({ title: 'Khác' }), 'same'));
});
test('lỗi trước ghi không tạo việc, retry cùng mã thành công', async () => {
  const db = store(); db.simulateFailureOnce();
  await assert.rejects(db.create('bgh', valid(), 'retry'), /chưa ghi/);
  assert.equal(db.list('bgh').length, 4);
  await db.create('bgh', valid(), 'retry');
  assert.equal(db.list('bgh').length, 5);
});
test('người nhận thấy việc mới và giáo viên khác không thấy', async () => {
  const db = store(), task = await db.create('bgh', valid(), 'view');
  assert.equal(db.get('teacher-social', task.id).id, task.id);
  assert.equal(db.get('teacher-science', task.id), null);
  assert.equal(db.get('head-science', task.id), null);
});
test('không cho sửa tham chiếu dữ liệu hoặc payload trong khi chờ ghi', async () => {
  const db = store(), input = valid(), promise = db.create('bgh', input, 'copy');
  input.title = 'Đã đổi';
  const task = await promise;
  assert.equal(task.title, 'Việc mẫu');
  db.list('bgh')[0].title = 'Đổi ngoài store';
  assert.notEqual(db.list('bgh')[0].title, 'Đổi ngoài store');
});

test('đầu vào trực tiếp không phải object được từ chối an toàn', async () => {
  const db = store();
  for (const input of [null, undefined, [], 'text']) {
    await assert.rejects(db.create('bgh', input, 'invalid'), error => Boolean(error.errors?.save));
  }
  assert.equal(db.list('bgh').length, 4);
});
