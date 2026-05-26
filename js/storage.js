/* ═══════════════════════════════════════
   storage.js — Save / Load System
   ═══════════════════════════════════════ */

'use strict';

const SAVE_KEY = 'fws_save';

function saveGame(gs) {
  try {
    const data = JSON.stringify(gs);
    localStorage.setItem(SAVE_KEY, data);
    localStorage.setItem(SAVE_KEY + '_ts', Date.now().toString());
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

function loadGame() {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) return null;
    const gs = JSON.parse(data);
    gs.isRunning = false; // always reset on load — prevents stuck state if saved mid-run
    return gs;
  } catch (e) {
    console.warn('Load failed:', e);
    return null;
  }
}

function exportJSON(gs) {
  const data = JSON.stringify(gs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fws_save_day${gs.day}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('JSON 내보내기 완료', 'success');
}

function importJSON(event, gs) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const loaded = JSON.parse(e.target.result);
      Object.assign(window.GS, loaded);
      // Restore charIdCounter
      const maxId = Math.max(0, ...loaded.characters.map(c => parseInt(c.id.replace('char_','')) || 0));
      charIdCounter = maxId + 1;
      renderAll();
      document.getElementById('log-entries').innerHTML = '<div class="log-entry log-system"><p>저장 파일을 불러왔습니다.</p></div>';
      showToast('불러오기 완료!', 'success');
    } catch(err) {
      showToast('파일 파싱 오류: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function getSaveTimestamp() {
  const ts = localStorage.getItem(SAVE_KEY + '_ts');
  if (!ts) return null;
  return new Date(parseInt(ts));
}
