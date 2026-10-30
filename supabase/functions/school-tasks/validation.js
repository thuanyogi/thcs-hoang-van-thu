/** @returns {Record<string,string>} */
export function validateTask(actor, recipient, input) {
 const errors = {};
 if (!actor || !['bgh','department_head'].includes(actor.role)) return { permission:'Bạn không có quyền giao công việc.' };
 if (!input || typeof input !== 'object' || Array.isArray(input)) return { save:'Dữ liệu công việc không hợp lệ.' };
 if (typeof input.title !== 'string' || !input.title.trim() || input.title.length>500) errors.title='Vui lòng nhập tên công việc (tối đa 500 ký tự).';
 if (typeof input.description !== 'string' || !input.description.trim() || input.description.length>20000) errors.description='Vui lòng nhập mô tả (tối đa 20.000 ký tự).';
 if (!recipient || recipient.role!=='teacher') errors.assigneeId='Vui lòng chọn giáo viên phụ trách hợp lệ.';
 if (input.scope!==(actor.role==='bgh'?'school':'department')) errors.scope='Phạm vi giao việc không thuộc quyền của bạn.';
 if (actor.role==='department_head' && recipient?.department_id!==actor.department_id) errors.assigneeId='Chỉ được giao cho giáo viên thuộc tổ phụ trách.';
 if (typeof input.dueDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
 || !Number.isFinite(Date.parse(input.dueDate)) || new Date(input.dueDate).toISOString().slice(0,10)!==input.dueDate) errors.dueDate='Vui lòng chọn ngày thời hạn hợp lệ.';
 if (typeof input.requiresApproval!=='boolean'||typeof input.requiresEvidence!=='boolean') errors.flags='Lựa chọn xác nhận/minh chứng không hợp lệ.';
 return errors;
}
export function sameRequest(task, actorId, input, departmentId) {
 return task.assigner_id===actorId && task.title===input.title.trim() && task.description===input.description.trim()
 && task.assignee_id===input.assigneeId && task.scope===input.scope && task.department_id===departmentId
 && new Date(task.due_at).toISOString()===new Date(input.dueDate+'T23:59:59+07:00').toISOString()
 && task.requires_approval===input.requiresApproval && task.requires_evidence===input.requiresEvidence;
}
