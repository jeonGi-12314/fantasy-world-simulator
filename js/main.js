/* ═══════════════════════════════════════
   main.js — Entry Point & Event Binding
   ═══════════════════════════════════════ */

'use strict';

// ─── INITIALIZATION ───────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load or create game state
  const saved = loadGame();
  if (saved) {
    window.GS = saved;
    // Restore charIdCounter
    if (saved.characters && saved.characters.length > 0) {
      const maxId = Math.max(0, ...saved.characters.map(c => parseInt((c.id || 'char_0').replace('char_','')) || 0));
      charIdCounter = maxId + 1;
    }
    showToast(`Day ${saved.day} 세이브 불러옴`, 'success');
    appendToLog([{ logClass: 'log-system', text: `📂 저장 파일을 불러왔습니다. Day ${saved.day}부터 시작합니다.` }]);
  } else {
    window.GS = createInitialState();
  }

  renderAll();
  bindAllEvents();
  initCharCreationForm();
});

// ─── BIND ALL EVENTS ────────────────────
function bindAllEvents() {
  // Next Day button
  document.getElementById('next-day-btn').addEventListener('click', nextDay);

  // Next Event button
  document.getElementById('next-event-btn')?.addEventListener('click', nextEvent);

  // Next Event mode selector
  const nemSel = document.getElementById('next-event-mode');
  if (nemSel) {
    // Sync initial value from GS
    nemSel.value = window.GS?.settings?.nextEventMode || 'choice';
    nemSel.addEventListener('change', () => {
      if (window.GS) window.GS.settings.nextEventMode = nemSel.value;
    });
  }

  // Speed slider
  document.getElementById('speed-slider')?.addEventListener('input', onSpeedSliderChange);

  // Clear log button
  document.getElementById('clear-log-btn')?.addEventListener('click', clearLog);

  // Add character
  document.getElementById('add-character-btn').addEventListener('click', openCharCreateModal);

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Save button
  document.getElementById('save-btn').addEventListener('click', () => {
    saveGame(window.GS);
    showToast('저장됐습니다.', 'success');
  });

  // Load button
  document.getElementById('load-btn').addEventListener('click', () => {
    const saved = loadGame();
    if (!saved) { showToast('저장된 데이터가 없습니다.', 'warning'); return; }
    Object.assign(window.GS, saved);
    renderAll();
    showToast('불러오기 완료.', 'success');
  });

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  // Tab buttons (right panel)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) document.getElementById(modalId)?.classList.add('hidden');
    });
  });

  // Click outside modal to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Character creation submit
  document.getElementById('char-create-submit').addEventListener('click', submitCharCreate);

  // Character edit submit
  document.getElementById('char-edit-submit').addEventListener('click', submitCharEdit);

  // Add relation button
  document.getElementById('add-relation-btn').addEventListener('click', addRelationRow);

  // Ending modal buttons
  document.getElementById('ending-continue').addEventListener('click', () => {
    document.getElementById('ending-modal').classList.add('hidden');
  });
  document.getElementById('ending-new').addEventListener('click', () => {
    if (confirm('새 게임을 시작하시겠습니까? 현재 진행이 사라집니다.')) {
      localStorage.removeItem('fws_save');
      window.GS = createInitialState();
      document.getElementById('log-entries').innerHTML = '<div class="log-entry log-system"><p>새 게임이 시작됐습니다!</p></div>';
      document.getElementById('ending-modal').classList.add('hidden');
      renderAll();
    }
  });
}

// ─── STORY SPEED SLIDER ──────────────────
const STORY_SPEEDS   = [0.5, 1.0, 1.5, 3.0];
const STORY_LABELS   = ['느림 (0.5×)', '보통 (1×)', '빠름 (1.5×)', '극속 (3×)'];

function onSpeedSliderChange() {
  const val = parseInt(document.getElementById('speed-slider')?.value ?? 1);
  const speed = STORY_SPEEDS[val] ?? 1.0;
  const label = document.getElementById('speed-label');
  if (label) label.textContent = STORY_LABELS[val] || '보통';
  if (window.GS) window.GS.settings.storySpeed = speed;
}

// ─── THEME TOGGLE ────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isDark ? '☀' : '🌙';
}

// ─── CHARACTER CREATION MODAL ────────────
let formGender = 'male';
let formAlignment = 'Light';
let formPortraitIcon = '';
const formStats = { str: 2, int: 2, fai: 2, agi: 2, cha: 2, end: 2 };
const TOTAL_STAT_POINTS = 20;
let usedPoints = 12; // 6 stats × 2 base

function openCharCreateModal() {
  resetCharForm();
  document.getElementById('char-create-modal').classList.remove('hidden');
}

function resetCharForm() {
  document.getElementById('char-name').value = '';
  document.getElementById('char-mbti').value = '';
  document.getElementById('char-mental').value = 'stable';
  document.getElementById('initial-relations-list').innerHTML = '';

  // Reset stat values
  for (const stat of Object.keys(formStats)) formStats[stat] = 2;
  usedPoints = 12;

  // Reset gender/alignment toggles
  formGender = 'male';
  formAlignment = 'Light';
  document.querySelectorAll('[data-group="gender"]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-group="gender"][data-value="male"]')?.classList.add('active');
  document.querySelectorAll('[data-group="alignment"]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-group="alignment"][data-value="Light"]')?.classList.add('active');

  // Reset portrait icon
  formPortraitIcon = '';
  updateIconPicker('male');
  updateStatDisplay();
}

function updateIconPicker(gender) {
  const picker = document.getElementById('icon-picker');
  if (!picker) return;
  const icons = PORTRAIT_ICONS[gender] || PORTRAIT_ICONS.male;
  if (!formPortraitIcon || !icons.includes(formPortraitIcon)) {
    formPortraitIcon = icons[0];
  }
  picker.innerHTML = icons.map(ic => `
    <button class="icon-option${ic === formPortraitIcon ? ' selected' : ''}" data-icon="${ic}">${ic}</button>
  `).join('');
  picker.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      formPortraitIcon = btn.dataset.icon;
      picker.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

function randomizeStats() {
  // Minimum 1 per stat, distribute remaining 14 randomly
  for (const k of Object.keys(formStats)) formStats[k] = 1;
  let remaining = TOTAL_STAT_POINTS - Object.keys(formStats).length; // 20 - 6 = 14
  const statKeys = Object.keys(formStats);
  while (remaining > 0) {
    const k = statKeys[Math.floor(Math.random() * statKeys.length)];
    if (formStats[k] < 10) { formStats[k]++; remaining--; }
  }
  usedPoints = TOTAL_STAT_POINTS;
  updateStatDisplay();
}

function randomizeAll() {
  // 1. Random gender
  const genders = ['male', 'female', 'other'];
  const g = genders[Math.floor(Math.random() * genders.length)];
  formGender = g;
  document.querySelectorAll('[data-group="gender"]').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-group="gender"][data-value="${g}"]`)?.classList.add('active');
  updateIconPicker(g);

  // 2. Random portrait icon (from pool)
  const icons = PORTRAIT_ICONS[g] || PORTRAIT_ICONS.male;
  formPortraitIcon = icons[Math.floor(Math.random() * icons.length)];
  document.querySelectorAll('.icon-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === formPortraitIcon);
  });

  // 3. Random name via Korean name generator
  document.getElementById('char-name').value = randomKrName(g);

  // 4. Random MBTI
  const mbti = MBTI_LIST[Math.floor(Math.random() * MBTI_LIST.length)];
  document.getElementById('char-mbti').value = mbti;

  // 5. Random alignment
  const aligns = ['Light', 'Neutral', 'Dark'];
  const al = aligns[Math.floor(Math.random() * aligns.length)];
  formAlignment = al;
  document.querySelectorAll('[data-group="alignment"]').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-group="alignment"][data-value="${al}"]`)?.classList.add('active');

  // 6. Random mental
  const mentals = ['stable', 'stable', 'anxious', 'determined', 'traumatized'];
  document.getElementById('char-mental').value = mentals[Math.floor(Math.random() * mentals.length)];

  // 7. Random stats
  randomizeStats();
}

function initCharCreationForm() {
  // Stat distribution UI
  const container = document.getElementById('stat-distribution');
  container.innerHTML = '';
  for (const [key, def] of Object.entries(STAT_DEF)) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="stat-row-label">${def.icon} ${def.name}</div>
      <button class="stat-adjust-btn" data-stat="${key}" data-delta="-1">−</button>
      <div class="stat-val-display" id="stat-val-${key}">2</div>
      <button class="stat-adjust-btn" data-stat="${key}" data-delta="1">＋</button>
      <div class="stat-mini-bar">
        <div class="stat-mini-fill" id="stat-bar-${key}" style="width:20%;background:${def.color}"></div>
      </div>
    `;
    container.appendChild(row);
  }

  // Stat buttons
  document.querySelectorAll('.stat-adjust-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stat = btn.dataset.stat;
      const delta = parseInt(btn.dataset.delta);
      adjustStat(stat, delta);
    });
  });

  // Toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (group === 'gender') {
        formGender = btn.dataset.value;
        updateIconPicker(formGender);
      }
      if (group === 'alignment') formAlignment = btn.dataset.value;
    });
  });

  // Randomize stats button (stats only)
  document.getElementById('randomize-stats-btn')?.addEventListener('click', randomizeStats);

  // Total random button (everything)
  document.getElementById('total-random-btn')?.addEventListener('click', randomizeAll);

  // Name-only random button (gender-aware)
  document.getElementById('random-name-btn')?.addEventListener('click', () => {
    document.getElementById('char-name').value = randomKrName(formGender);
  });

  // Init icon picker for default gender
  updateIconPicker('male');
}

function adjustStat(stat, delta) {
  const newVal = formStats[stat] + delta;
  if (newVal < 0 || newVal > 10) return;
  if (delta > 0 && usedPoints >= TOTAL_STAT_POINTS) {
    showToast('포인트가 부족합니다!', 'warning');
    return;
  }
  formStats[stat] = newVal;
  usedPoints += delta;
  updateStatDisplay();
}

function updateStatDisplay() {
  for (const [key, val] of Object.entries(formStats)) {
    const valEl = document.getElementById(`stat-val-${key}`);
    const barEl = document.getElementById(`stat-bar-${key}`);
    if (valEl) valEl.textContent = val;
    if (barEl) barEl.style.width = (val / 10 * 100) + '%';
  }
  const leftEl = document.getElementById('stat-points-left');
  if (leftEl) {
    const remaining = TOTAL_STAT_POINTS - usedPoints;
    leftEl.textContent = `${remaining} 포인트 남음`;
    leftEl.style.background = remaining === 0 ? 'var(--success)' : 'var(--accent)';
  }
}

function addRelationRow() {
  const gs = window.GS;
  const list = document.getElementById('initial-relations-list');
  const row = document.createElement('div');
  row.className = 'relation-input-row';

  const typeSelect = document.createElement('select');
  typeSelect.innerHTML = Object.entries(RELATION_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`)
    .join('');

  const targetSelect = document.createElement('select');
  targetSelect.innerHTML = '<option value="">대상 선택</option>' +
    gs.characters.filter(c => !c.isDead)
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-rel';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(typeSelect);
  row.appendChild(targetSelect);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function submitCharCreate() {
  const name = document.getElementById('char-name').value.trim();
  if (!name) { showToast('이름을 입력하세요!', 'warning'); return; }

  const mbti = document.getElementById('char-mbti').value || 'ISTJ';
  const mental = document.getElementById('char-mental').value || 'stable';

  // Collect initial relations
  const relRows = document.querySelectorAll('#initial-relations-list .relation-input-row');
  const relationships = [];
  relRows.forEach(row => {
    const selects = row.querySelectorAll('select');
    const type = selects[0]?.value;
    const targetId = selects[1]?.value;
    if (type && targetId) {
      relationships.push({ targetId, type, affection: 30 });
      // Mirror relation
      const targetChar = window.GS.characters.find(c => c.id === targetId);
      if (targetChar) {
        const mirrorType = getMirrorRelationType(type);
        targetChar.relationships.push({ targetId: 'PLACEHOLDER', type: mirrorType, affection: 30 });
      }
    }
  });

  const char = createCharacter({
    name,
    gender: formGender,
    mbti,
    alignment: formAlignment,
    mental,
    portraitIcon: formPortraitIcon,
    stats: { ...formStats },
    relationships,
  });

  // Fix placeholder
  window.GS.characters.forEach(c => {
    c.relationships.forEach(r => {
      if (r.targetId === 'PLACEHOLDER') r.targetId = char.id;
    });
  });

  window.GS.characters.push(char);
  document.getElementById('char-create-modal').classList.add('hidden');

  renderAll();
  saveGame(window.GS);
  showToast(`${name}이(가) 세계에 등장했다!`, 'success');
  appendToLog([{ logClass: 'log-system', text: `🧑 새로운 모험가 ${name}이(가) 세상에 나타났다. 새로운 이야기가 시작됐다.` }]);
}

function getMirrorRelationType(type) {
  const mirrors = {
    employer: 'employee', employee: 'employer',
    creditor: 'debtor', debtor: 'creditor',
    parent: 'child', child: 'parent',
    fan: 'friend', oathbound: 'oathbound',
  };
  return mirrors[type] || type;
}

// ─── CHARACTER EDIT / DELETE ─────────────
const PORTRAIT_OPTIONS = ['🧔','👩','🧑','🧝','🧙','🧚','🧛','🧟','👴','👵','🧓','🦸','🦹','🧜','🧞','🤺','👷','🧑‍🌾','🧑‍🔬','🧑‍🎨','⚔','🏹','🔮','🗡','🛡'];
let _editingCharId = null;

function openCharEditModal(charId) {
  const char = window.GS.characters.find(c => c.id === charId);
  if (!char) return;
  _editingCharId = charId;

  document.getElementById('edit-char-name').value = char.name;

  // Portrait picker
  const picker = document.getElementById('edit-portrait-picker');
  picker.innerHTML = PORTRAIT_OPTIONS.map(icon =>
    `<span class="portrait-edit-opt${char.portraitIcon === icon ? ' selected' : ''}" data-icon="${icon}">${icon}</span>`
  ).join('');
  picker.querySelectorAll('.portrait-edit-opt').forEach(el => {
    el.addEventListener('click', () => {
      picker.querySelectorAll('.portrait-edit-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // Alignment select
  const alignSel = document.getElementById('edit-char-alignment');
  alignSel.innerHTML = Object.entries(ALIGNMENTS).map(([k, v]) =>
    `<option value="${k}"${char.alignment === k ? ' selected' : ''}>${v.name}</option>`
  ).join('');

  document.getElementById('char-edit-modal').classList.remove('hidden');
}

function submitCharEdit() {
  const char = window.GS.characters.find(c => c.id === _editingCharId);
  if (!char) return;

  const newName = document.getElementById('edit-char-name').value.trim();
  if (!newName) { showToast('이름을 입력하세요!', 'warning'); return; }

  char.name = newName;
  char.alignment = document.getElementById('edit-char-alignment').value;

  const selectedPortrait = document.querySelector('#edit-portrait-picker .portrait-edit-opt.selected');
  if (selectedPortrait) char.portraitIcon = selectedPortrait.dataset.icon;

  document.getElementById('char-edit-modal').classList.add('hidden');
  renderAll();
  saveGame(window.GS);
  showToast(`${newName}의 정보가 수정됐다.`, 'success');
}

function deleteChar(charId) {
  const char = window.GS.characters.find(c => c.id === charId);
  if (!char) return;
  if (!confirm(`정말 ${char.name}을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

  // Remove from characters
  window.GS.characters = window.GS.characters.filter(c => c.id !== charId);

  // Clean up all relationships referencing this char
  window.GS.characters.forEach(c => {
    c.relationships = c.relationships.filter(r => r.targetId !== charId);
  });

  // Clean up parties
  if (window.GS.parties) {
    window.GS.parties = window.GS.parties.filter(p => {
      p.members = (p.members || []).filter(id => id !== charId);
      return p.members.length > 0;
    });
  }

  // Clean up pending promotions
  window.GS.pendingPromotions = (window.GS.pendingPromotions || []).filter(p => p.charId !== charId);

  // Clean up pending choices referencing this char
  window.GS.pendingChoices = (window.GS.pendingChoices || []).filter(pc => pc.charId !== charId);

  renderAll();
  saveGame(window.GS);
  showToast(`${char.name}이(가) 세계에서 사라졌다.`, 'info');
}

// ─── SETTINGS ────────────────────────────
let activeSettingsTab = 'relation';

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
  renderSettingsContent(activeSettingsTab);
  bindSettingsTabs();
}

function bindSettingsTabs() {
  document.querySelectorAll('.stab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSettingsTab = btn.dataset.stab;
      renderSettingsContent(activeSettingsTab);
    });
  });

  document.getElementById('settings-save').addEventListener('click', () => {
    // Read all inputs
    document.querySelectorAll('#settings-content [data-key]').forEach(input => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') {
        window.GS.settings[key] = input.checked;
      } else if (input.type === 'number') {
        window.GS.settings[key] = parseFloat(input.value) || 0;
      } else if (input.tagName === 'SELECT') {
        // 숫자값 select는 number로 파싱 (e.g. battleLogSpeed)
        const _numVal = Number(input.value);
        window.GS.settings[key] = (!isNaN(_numVal) && input.value !== '') ? _numVal : input.value;
        // nextEventMode 변경 시 헤더 드롭다운도 동기화
        if (key === 'nextEventMode') {
          const nemSel = document.getElementById('next-event-mode');
          if (nemSel) nemSel.value = input.value;
        }
      }
    });
    saveGame(window.GS);
    document.getElementById('settings-modal').classList.add('hidden');
    showToast('설정이 저장됐습니다.', 'success');
    renderAll();
  });
}
