const $ = id => document.getElementById(id);
const ringtone = $('ringtone');
const voice = $('voiceMessage');
const apiBase = (window.WINGMAN_API_BASE || '').replace(/\/$/, '');
let polling;
let lastStatus = 'idle';
let audioArmed = false;
let dragStart = null;

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {headers: {'Content-Type': 'application/json'}, ...options});
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || '请求失败');
  return body;
}

function setText(status, caption) { $('status').textContent = status; $('caption').textContent = caption; }
function setClock() { $('clock').textContent = new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date()); }

async function unlockAudio() {
  ringtone.volume = 0.01;
  ringtone.currentTime = 0;
  try {
    await ringtone.play();
    ringtone.pause();
    ringtone.currentTime = 0;
    ringtone.volume = 1;
    audioArmed = true;
    $('audioArm').classList.add('hidden');
    $('audioHint').textContent = '铃声已就绪。现在可以锁屏等待戒指双击。';
  } catch {
    ringtone.volume = 1;
    $('audioHint').textContent = '无法启用铃声，请检查静音模式后重试。';
  }
}

async function playRingtone() {
  ringtone.currentTime = 0;
  try {
    await ringtone.play();
    $('audioHint').textContent = '';
  } catch {
    $('audioArm').classList.remove('hidden');
    $('audioHint').textContent = audioArmed ? '系统阻止了铃声，请再点一次准备接听。' : '先点“准备接听”以开启自动铃声。';
  }
}

function stopRingtone() { ringtone.pause(); ringtone.currentTime = 0; }
function resetSlider() { $('answerKnob').style.transform = ''; $('answerSlider').classList.remove('is-dragging'); }
function showStandby() {
  $('standbyScreen').classList.remove('hidden');
  $('callScreen').classList.add('hidden');
  $('incomingActions').classList.add('hidden');
  $('setup').classList.remove('hidden');
}
function showCall() {
  $('standbyScreen').classList.add('hidden');
  $('callScreen').classList.remove('hidden');
  $('incomingActions').classList.remove('hidden');
  $('setup').classList.add('hidden');
}

function applyState(call) {
  if (call.status === lastStatus) return;
  lastStatus = call.status;
  const isRinging = call.status === 'ringing';
  const isCallActive = ['scheduled', 'ringing', 'accepted'].includes(call.status);
  if (isCallActive) showCall(); else showStandby();
  $('answerSlider').classList.toggle('hidden', !isRinging);
  $('decline').classList.toggle('hidden', !['scheduled', 'ringing', 'accepted'].includes(call.status));
  if (call.status === 'scheduled') setText('Wingman 即将呼叫', '戒指信号已收到，请保持在这个页面。');
  if (isRinging) { setText('Wingman 正在呼叫你', '向右滑动来接听。'); playRingtone(); }
  if (call.status === 'accepted') { stopRingtone(); resetSlider(); setText('已接听', '正在播放私人提醒语音…'); voice.play().catch(() => $('audioHint').textContent = '请轻触屏幕后播放语音。'); }
  if (call.status === 'declined' || call.status === 'ended' || call.status === 'idle') { stopRingtone(); resetSlider(); }
}

async function answerCall() {
  try { applyState(await api('/api/v1/demo/call/accept', {method: 'POST'})); } catch (error) { $('audioHint').textContent = error.message; }
}

async function poll() { try { applyState(await api('/api/v1/demo/call')); } catch (error) { $('audioHint').textContent = error.message; } }

$('armAudio').addEventListener('click', unlockAudio);
$('more').addEventListener('click', () => $('moreSheet').classList.toggle('hidden'));
$('subtitle').addEventListener('click', () => { $('caption').classList.toggle('subtitle-off'); $('subtitle').textContent = $('caption').classList.contains('subtitle-off') ? '显示字幕' : '隐藏字幕'; });
$('recording').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return;
  if (voice.dataset.objectUrl) URL.revokeObjectURL(voice.dataset.objectUrl);
  const url = URL.createObjectURL(file); voice.src = url; voice.dataset.objectUrl = url;
  $('audioHint').textContent = `已选择录音：${file.name}`;
});
$('trigger').addEventListener('click', async () => {
  $('trigger').disabled = true;
  try { applyState(await api('/api/v1/demo/fixed', {method: 'POST'})); } catch (error) { $('audioHint').textContent = error.message; $('trigger').disabled = false; }
});
$('decline').addEventListener('click', async () => { try { applyState(await api('/api/v1/demo/call/decline', {method: 'POST'})); } catch (error) { $('audioHint').textContent = error.message; } });
$('answerSlider').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); answerCall(); } });
$('answerSlider').addEventListener('pointerdown', event => { dragStart = event.clientX; $('answerSlider').setPointerCapture(event.pointerId); $('answerSlider').classList.add('is-dragging'); });
$('answerSlider').addEventListener('pointermove', event => {
  if (dragStart === null) return;
  const travel = Math.max(0, Math.min(event.clientX - dragStart, $('answerSlider').clientWidth - 60));
  $('answerKnob').style.transform = `translateX(${travel}px)`;
});
$('answerSlider').addEventListener('pointerup', event => {
  if (dragStart === null) return;
  const completed = event.clientX - dragStart > $('answerSlider').clientWidth * 0.52;
  dragStart = null;
  completed ? answerCall() : resetSlider();
});
voice.addEventListener('ended', async () => { try { applyState(await api('/api/v1/demo/call/end', {method: 'POST'})); } catch {} });
setClock(); setInterval(setClock, 30_000);
poll(); polling = setInterval(poll, 1000);
window.addEventListener('pagehide', () => clearInterval(polling));
