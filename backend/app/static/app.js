const el = id => document.getElementById(id);
const api = async (path, options = {}) => {
  const response = await fetch(path, {headers: {'Content-Type': 'application/json', ...options.headers}, ...options});
  const data = await response.json();
  if (!response.ok) throw Error(data.detail || '请求失败');
  return data;
};
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function notify(text, error = false) {
  el('feedback').textContent = text;
  el('feedback').style.color = error ? 'var(--danger)' : 'var(--accent)';
}
async function refresh() {
  try {
    const state = await api('/api/v1/state');
    el('mode').textContent = state.photon_mode === 'live' ? 'Photon · 实时 iMessage' : 'Photon · 演示模式';
    el('call').disabled = !state.calling_enabled;
    el('call').title = state.calling_enabled ? '拨打预设号码' : '请先在 .env 配置 Twilio';
    el('rescues').innerHTML = state.rescues.length ? state.rescues.map(rescue => `
      <div class="task"><span class="badge ${rescue.status}">${rescue.status}</span>
      <div class="task-info">${escape(rescue.message)}<small>${new Date(rescue.execute_at).toLocaleTimeString()} · ${escape(rescue.source)}</small></div>
      ${rescue.status === 'scheduled' ? `<button class="cancel" onclick="cancelRescue('${rescue.id}')">取消</button>` : ''}</div>`).join('') : '尚无任务';
    el('events').innerHTML = state.events.length ? state.events.map(event => `
      <div>${escape(event.event_type)}<small>${escape(event.detail)} · ${new Date(event.created_at).toLocaleTimeString()}</small></div>`).join('') : '尚无事件';
  } catch (error) { notify(error.message, true); }
}
window.cancelRescue = async id => {
  try { await api(`/api/v1/rescues/${id}/cancel`, {method: 'POST'}); notify('已取消'); refresh(); }
  catch (error) { notify(error.message, true); }
};
el('doubleTap').onclick = async () => {
  try {
    const result = await api('/api/v1/events/zilo', {method: 'POST', body: JSON.stringify({kind: 'double_tap', device_id: 'dashboard-simulator'})});
    notify(result.feedback); refresh();
  } catch (error) { notify(error.message, true); }
};
el('schedule').onclick = async () => {
  try {
    const result = await api('/api/v1/rescues', {method: 'POST', body: JSON.stringify({
      recipient: el('recipient').value || null,
      delay_seconds: Number(el('delay').value),
      message: el('message').value || null,
      source: 'dashboard.proactive_dm',
    })});
    notify(`已安排：${result.delay_seconds} 秒后由 Agent 主动发送 iMessage`); refresh();
  } catch (error) { notify(error.message, true); }
};
el('call').onclick = async () => {
  if (!confirm('确认拨打你在服务器配置的预设号码？')) return;
  try { await api('/api/v1/call', {method: 'POST'}); notify('正在拨号'); refresh(); }
  catch (error) { notify(error.message, true); }
};
el('refresh').onclick = refresh;
refresh();
setInterval(refresh, 4_000);
