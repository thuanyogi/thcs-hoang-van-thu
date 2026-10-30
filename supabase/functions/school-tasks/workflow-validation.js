export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FILE_TYPES = Object.freeze({
 doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png'
});
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export const canRead = (actor,task) => Boolean(actor && task && (actor.role === 'bgh'
 || (actor.role === 'department_head' && actor.department_id && actor.department_id === task.department_id)
 || (actor.role === 'teacher' && task.assignee_id === actor.id)));
export const canReview = (actor,task) => Boolean(actor && task && ((actor.role === 'bgh' && task.scope === 'school')
 || (actor.role === 'department_head' && task.scope === 'department' && actor.department_id && actor.department_id === task.department_id)));
export function validateFile(input) {
 if (!input || typeof input !== 'object') return 'Thông tin tệp không hợp lệ.';
 const {name,type,size} = input;
 if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\x00-\x1f\/\\]/.test(name)) return 'Tên tệp không hợp lệ (tối đa 255 ký tự).';
 const extension = name.split('.').pop().toLowerCase();
 if (!FILE_TYPES[extension] || FILE_TYPES[extension] !== type) return 'Chỉ hỗ trợ DOC/DOCX/XLS/XLSX/PPT/PPTX/PDF/JPG/JPEG/PNG đúng loại tệp.';
 if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) return 'Mỗi tệp phải lớn hơn 0 và không quá 25 MB.';
 return null;
}
/** @returns {Record<string,string>} */
export function validateAction(actor,task,action,input = {}) {
 if (!canRead(actor,task)) return {permission:'Bạn không có quyền truy cập công việc này.'};
 if (!input || typeof input !== 'object' || Array.isArray(input)) return {save:'Dữ liệu không hợp lệ.'};
 const errors = {};
 if (action === 'start' || action === 'submit') {
  if (task.assignee_id !== actor.id) errors.permission = 'Chỉ người phụ trách được thực hiện hoặc báo cáo công việc.';
  if (!(action === 'start' ? ['todo'] : ['todo','in_progress']).includes(task.status)) errors.conflict = 'Trạng thái đã thay đổi. Hãy tải lại công việc.';
  if (action === 'submit') {
   if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 20000) errors.body = 'Vui lòng nhập báo cáo (tối đa 20.000 ký tự).';
   if (!Array.isArray(input.evidence)) errors.evidence = 'Danh sách minh chứng không hợp lệ.';
   else {
    if (task.requires_evidence && !input.evidence.length) errors.evidence = 'Công việc này bắt buộc có tệp minh chứng.';
    const paths = new Set();
    for (const file of input.evidence) {
     const error = validateFile({name:file?.originalName,type:file?.mimeType,size:file?.sizeBytes});
     if (error || typeof file?.storagePath !== 'string' || !file.storagePath || paths.has(file.storagePath)) errors.evidence = error || 'Đường dẫn minh chứng bị thiếu hoặc trùng lặp.';
     paths.add(file?.storagePath);
    }
   }
  }
 } else if (action === 'review') {
  if (!canReview(actor,task)) errors.permission = 'Bạn không có quyền duyệt công việc này.';
  if (task.status !== 'pending_review') errors.conflict = 'Công việc không còn chờ xác nhận. Hãy tải lại.';
  if (typeof input.submissionId !== 'string' || !UUID.test(input.submissionId)) errors.submissionId = 'Mã báo cáo không hợp lệ.';
  if (!['approve','return'].includes(input.decision)) errors.decision = 'Lựa chọn duyệt không hợp lệ.';
  if (input.decision === 'return' && (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 20000)) errors.reason = 'Vui lòng nhập lý do trả lại (tối đa 20.000 ký tự).';
  if (input.newDueDate && (!validDate(input.newDueDate) || input.decision !== 'return')) errors.newDueDate = 'Chỉ được đổi hạn hợp lệ khi trả lại công việc.';
 } else errors.action = 'Hành động không được hỗ trợ.';
 return errors;
}
// Inspect container signatures and Office package entries; never trust browser MIME alone.
export function matchesFileContent(bytes,name) {
 const ext = name.split('.').pop().toLowerCase();
 const starts = values => values.every((value,index) => bytes[index] === value);
 if (ext === 'pdf') return starts([37,80,68,70,45]) && new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF');
 if (ext === 'png') return starts([137,80,78,71,13,10,26,10]) && bytes.length >= 20 && new TextDecoder().decode(bytes.slice(-8,-4)) === 'IEND';
 if (ext === 'jpg' || ext === 'jpeg') return starts([255,216,255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217;
 if (['doc','xls','ppt'].includes(ext)) {
  if (!starts([208,207,17,224,161,177,26,225])) return false;
  const text = new TextDecoder('utf-16le').decode(bytes);
  return (ext === 'doc' ? ['WordDocument'] : ext === 'xls' ? ['Workbook','Book'] : ['PowerPoint Document']).some(stream => text.includes(stream));
 }
 if (!['docx','xlsx','pptx'].includes(ext) || !starts([80,75,3,4])) return false;
 const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), entries = new Set();
 for (let i = bytes.length - 22; i >= Math.max(0,bytes.length - 65557); i--) {
  if (view.getUint32(i,true) !== 0x06054b50 || i + 22 + view.getUint16(i+20,true) !== bytes.length) continue;
  const count = view.getUint16(i+10,true), directorySize = view.getUint32(i+12,true);
  let offset = view.getUint32(i+16,true);
  if (offset + directorySize !== i || count === 0) return false;
  for (let entry = 0; entry < count; entry++) {
   if (offset + 46 > i || view.getUint32(offset,true) !== 0x02014b50) return false;
   const length = view.getUint16(offset+28,true), extra = view.getUint16(offset+30,true), comment = view.getUint16(offset+32,true);
   if (offset + 46 + length + extra + comment > i) return false;
   entries.add(new TextDecoder().decode(bytes.slice(offset+46,offset+46+length)));
   offset += 46 + length + extra + comment;
  }
  const main = {docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'}[ext];
  return offset === i && entries.has('[Content_Types].xml') && entries.has(main);
 }
 return false;
}
