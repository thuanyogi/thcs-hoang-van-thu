const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../task-list-rules.js');

test('trang tổng quan phải mở danh sách đầy đủ khi lọc chờ xác nhận hoặc đã xong', () => {
  assert.equal(rules.filterNeedsFullList('pending_review'), true);
  assert.equal(rules.filterNeedsFullList('completed'), true);
  assert.equal(rules.filterNeedsFullList('all'), false);
  assert.equal(rules.filterNeedsFullList('todo'), false);
  assert.equal(rules.filterNeedsFullList('overdue'), false);
  assert.equal(rules.filterNeedsFullList('returned'), false);
});

test('cột chờ xác nhận nói đúng việc giáo viên đang chờ người khác', () => {
  const teacher = rules.pendingPanel('teacher');
  assert.match(teacher.eyebrow, /ĐANG CHỜ/);
  assert.match(teacher.title, /người khác/);
  assert.match(teacher.intro, /không cần làm thêm/);
  const head = rules.pendingPanel('head');
  assert.match(head.eyebrow, /CẦN PHẢN HỒI/);
  assert.match(head.intro, /cần xét duyệt/);
  assert.match(rules.pendingPanel('bgh').title, /Chờ xác nhận/);
});

test('danh sách trống nói đúng khi chưa có việc và khi chỉ hết việc cần làm', () => {
  assert.match(rules.emptyTaskCopy('overview', 'all', '', 0).title, /Chưa có công việc/);
  assert.match(rules.emptyTaskCopy('overview', 'all', '', 3).body, /Xem tất cả/);
  assert.match(rules.emptyTaskCopy('tasks', 'completed', '', 3).body, /đổi bộ lọc/);
  assert.match(rules.emptyTaskCopy('tasks', 'all', '', 0).body, /được giao việc/);
});
