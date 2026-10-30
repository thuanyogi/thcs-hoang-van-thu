// Never return Telegram response bodies: they may contain chat data.
export async function sendTelegram({ token, chatId, taskId, fetcher = fetch }) {
 if (!token || !chatId) return { status: 'not_configured' };
 if (!/^[0-9a-f-]{36}$/i.test(taskId || '')) return { status: 'invalid_task' };
 try {
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ chat_id: chatId, text: `Có công việc mới\nMã: ${taskId}\nhttps://thcs-hoang-van-thu.vercel.app/`, link_preview_options: { is_disabled: true } }),
   signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return { status: 'failed' };
  const data = await response.json();
  return { status: data.ok === true ? 'sent' : 'failed' };
 } catch (error) {
  return { status: 'unknown' };
 }
}
