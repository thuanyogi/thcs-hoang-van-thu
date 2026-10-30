export function attachTaskHistory(tasks,submissions,events) {
 const latest=new Map(),returned=new Map();
 for (const submission of submissions) {
  const prior=latest.get(submission.task_id);
  if (!prior || new Date(submission.submitted_at)>new Date(prior.submitted_at)) latest.set(submission.task_id,submission);
 }
 for (const event of events) {
  if (event.event_type!=='returned') continue;
  const prior=returned.get(event.task_id);
  if (!prior || new Date(event.created_at)>new Date(prior.created_at)) returned.set(event.task_id,event);
 }
 return tasks.map(task=>({...task,submitted_at:latest.get(task.id)?.submitted_at || null,
  returned_reason:latest.get(task.id)?.review_status==='returned' ? returned.get(task.id)?.reason || null : null}));
}
