// Claim is durable before sending; uncertain outcomes are never automatically retried.
export async function dispatchTelegram(taskId, { claim, send, finish, readStatus }) {
 try {
  if (!await claim(taskId)) {
   const status = await readStatus(taskId);
   return { status: status === 'sending' ? 'unknown' : status || 'not_queued', duplicate: true };
  }
 } catch { return { status: 'failed' }; }
 let result;
 try { result = await send(taskId); } catch { result = { status: 'unknown' }; }
 const status = ['sent', 'failed', 'unknown'].includes(result.status) ? result.status : 'failed';
 try { await finish(taskId, status); } catch { return { status: 'unknown' }; }
 return { status };
}
