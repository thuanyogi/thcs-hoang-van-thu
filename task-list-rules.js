/* Rules for the teacher task list. Shared by the page and the regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TaskListRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function activeTask(task) {
    return ['todo', 'in_progress'].includes(task?.status);
  }
  function filterNeedsFullList(filter) {
    return filter === 'pending_review' || filter === 'completed';
  }
  function pendingPanel(role) {
    if (role === 'teacher') return {
      eyebrow: 'ĐANG CHỜ',
      title: 'Chờ người khác xác nhận ',
      intro: 'Báo cáo bạn đã gửi. Bạn không cần làm thêm cho đến khi được xác nhận hoặc bị trả lại.'
    };
    return {
      eyebrow: 'CẦN PHẢN HỒI',
      title: 'Chờ xác nhận ',
      intro: 'Báo cáo gửi sớm nhất được hiển thị trước. Đây là việc bạn cần xét duyệt.'
    };
  }
  function emptyTaskCopy(view, filter, query, total) {
    const unfiltered = filter === 'all' && !String(query || '').trim();
    if (unfiltered && view === 'overview' && total > 0) return {
      title: 'Không còn việc cần thực hiện',
      body: 'Việc đã gửi hoặc đã xong nằm trong Xem tất cả.'
    };
    if (unfiltered) return {
      title: 'Chưa có công việc',
      body: 'Khi được giao việc, công việc sẽ xuất hiện tại đây.'
    };
    return {
      title: 'Không có công việc phù hợp',
      body: 'Thử đổi bộ lọc hoặc từ khóa tìm kiếm.'
    };
  }
  return { activeTask, filterNeedsFullList, pendingPanel, emptyTaskCopy };
});
