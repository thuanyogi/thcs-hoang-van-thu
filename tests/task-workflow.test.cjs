const {test}=require('node:test'),assert=require('node:assert/strict');
const domain=import('../supabase/functions/school-tasks/workflow-validation.js');
const task={id:'task',scope:'school',department_id:'A',assignee_id:'teacher',status:'todo',requires_evidence:true};
const teacher={id:'teacher',role:'teacher',department_id:'A'};
const submissionId='11111111-1111-4111-8111-111111111111';
const file={storagePath:'reserved/file.pdf',originalName:'Báo cáo.pdf',mimeType:'application/pdf',sizeBytes:100};
test('quyền xem phân biệt tổ trưởng/giáo viên và quyền duyệt cấp trường/tổ',async()=>{
 const {canRead,canReview}=await domain;
 assert.equal(canRead(teacher,task),true);assert.equal(canRead({...teacher,id:'other'},task),false);
 assert.equal(canRead({role:'department_head',department_id:'B'},task),false);
 assert.equal(canRead({role:'bgh'},task),true);
 assert.equal(canRead({role:'invented'},task),false);
 assert.equal(canReview({role:'department_head',department_id:'A'},task),false);
 assert.equal(canReview({role:'bgh'},{...task,scope:'department'}),false);
 assert.equal(canReview({role:'department_head',department_id:'A'},{...task,scope:'department'}),true);
});
test('chỉ người phụ trách bắt đầu; trạng thái lỗi thời và role do input khai không cấp quyền',async()=>{
 const {validateAction}=await domain;
 assert.deepEqual(validateAction(teacher,task,'start',{}),{});
 assert.ok(validateAction({id:'bgh',role:'bgh'},task,'start',{role:'teacher'}).permission);
 assert.ok(validateAction(teacher,{...task,status:'completed'},'start',{}).conflict);
 assert.ok(validateAction(teacher,task,'invented',{}).action);
});
test('báo cáo bắt buộc nội dung và minh chứng khi task yêu cầu; chặn trùng path',async()=>{
 const {validateAction}=await domain;
 assert.deepEqual(validateAction(teacher,task,'submit',{body:'Đã thực hiện',evidence:[file]}),{});
 assert.ok(validateAction(teacher,task,'submit',{body:' ',evidence:[]}).body);
 assert.ok(validateAction(teacher,task,'submit',{body:'Đã làm',evidence:[]}).evidence);
 assert.ok(validateAction(teacher,task,'submit',{body:'Đã làm',evidence:[file,file]}).evidence);
 assert.deepEqual(validateAction(teacher,{...task,requires_evidence:false},'submit',{body:'Đã làm',evidence:[]}),{});
 assert.ok(validateAction(teacher,{...task,status:'pending_review'},'submit',{body:'B',evidence:[file]}).conflict);
});
test('trả lại cần lý do; chỉ trả lại mới được đổi hạn và ngày phải tồn tại',async()=>{
 const {validateAction}=await domain,actor={id:'bgh',role:'bgh'},pending={...task,status:'pending_review'};
 assert.deepEqual(validateAction(actor,pending,'review',{submissionId,decision:'return',reason:'Bổ sung minh chứng',newDueDate:'2026-11-03'}),{});
 assert.ok(validateAction(actor,pending,'review',{submissionId,decision:'return',reason:' '}).reason);
 assert.ok(validateAction(actor,pending,'review',{submissionId,decision:'return',reason:'A',newDueDate:'2026-02-30'}).newDueDate);
 assert.ok(validateAction(actor,pending,'review',{submissionId,decision:'approve',newDueDate:'2026-11-03'}).newDueDate);
 assert.ok(validateAction(teacher,pending,'review',{submissionId,decision:'approve'}).permission);
});
test('giới hạn tệp 25MB, MIME/extension khớp, tên không có path và số byte nguyên dương',async()=>{
 const {validateFile,MAX_FILE_BYTES,FILE_TYPES}=await domain;
 for (const [extension,type] of Object.entries(FILE_TYPES)) assert.equal(validateFile({name:'minh-chung.'+extension,type,size:MAX_FILE_BYTES}),null);
 for (const data of [{name:'a.pdf',type:'image/png',size:10},{name:'../a.pdf',type:'application/pdf',size:10},{name:'a.exe',type:'application/pdf',size:10},{name:'a.pdf',type:'application/pdf',size:MAX_FILE_BYTES+1},{name:'a.pdf',type:'application/pdf',size:1.5},{name:'a.pdf',type:'application/pdf',size:0}]) assert.ok(validateFile(data));
});
test('từ chối nội dung ngụy trang PDF/PNG/JPG/Office và ZIP không có cấu trúc OOXML',async()=>{
 const {matchesFileContent}=await domain,encode=text=>new TextEncoder().encode(text);
 assert.equal(matchesFileContent(encode('%PDF-1.7\nbody\n%%EOF'),'a.pdf'),true);
 assert.equal(matchesFileContent(encode('%PDF-1.7\ntruncated'),'a.pdf'),false);
 assert.equal(matchesFileContent(encode('<html>fake</html>'),'a.pdf'),false);
 assert.equal(matchesFileContent(Uint8Array.from([255,216,255,224,255,217]),'a.jpg'),true);
 assert.equal(matchesFileContent(Uint8Array.from([255,216,255,224]),'a.jpg'),false);
 assert.equal(matchesFileContent(encode('PK\x03\x04word/document.xml [Content_Types].xml'),'a.docx'),false);
 for (const ext of ['doc','xls','ppt','png','xlsx','pptx']) assert.equal(matchesFileContent(encode('fake'),`a.${ext}`),false);
});
test('lịch sử dùng lần nộp/lý do mới nhất, xóa lý do đang hiển thị sau khi nộp lại',async()=>{
 const {attachTaskHistory}=await import('../supabase/functions/school-tasks/task-history.js');
 const submissions=[{task_id:'task',submitted_at:'2026-10-29T00:00:00Z',review_status:'returned'}];
 const events=[{task_id:'task',event_type:'returned',reason:'Mới',created_at:'2026-10-30T00:00:00Z'},{task_id:'task',event_type:'returned',reason:'Cũ',created_at:'2026-10-29T00:00:00Z'}];
 assert.equal(attachTaskHistory([task],submissions,events)[0].returned_reason,'Mới');
 const pending={task_id:'task',submitted_at:'2026-10-30T02:00:00Z',review_status:'pending'};
 const projected=attachTaskHistory([task],[pending,...submissions],events)[0];
 assert.equal(projected.returned_reason,null);assert.equal(projected.submitted_at,pending.submitted_at);
 assert.equal(task.submitted_at,undefined);
});
test('nhận diện OOXML theo central directory và từ chối đổi đuôi giữa Word/Excel',async()=>{
 const {matchesFileContent}=await domain;
 const names=['[Content_Types].xml','word/document.xml'],local=[],central=[];let offset=0;
 for (const name of names) {
  const filename=Buffer.from(name),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(filename.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
  local.push(header,filename);central.push(entry,filename);offset+=header.length+filename.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 const bytes=new Uint8Array(Buffer.concat([...local,directory,end]));
 assert.equal(matchesFileContent(bytes,'a.docx'),true);assert.equal(matchesFileContent(bytes,'a.xlsx'),false);
 bytes[bytes.length-6]=255;assert.equal(matchesFileContent(bytes,'a.docx'),false);
});
