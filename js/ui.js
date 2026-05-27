/* ═══════════════════════════════════════
   ui.js — UI Rendering
   ═══════════════════════════════════════ */

'use strict';

// ─── STAT TOOLTIPS ───────────────────────
const STAT_TOOLTIPS = {
  str: '전투력·피해량 결정. 전사·기사 전직 조건. maxHP에 영향.',
  int: '마법 위력·MP 결정. 마법사·현자 전직 조건.',
  fai: '신성 효과·치유력. 성직자·팔라딘 전직 조건.',
  agi: '회피율·선제공격. 도적·레인저 전직 조건.',
  cha: '협상·사교 이벤트 효과. 음유시인·상인 전직 조건.',
  end: '생존력·피로 내성. maxHP에 영향. 드루이드·레인저 조건.',
};

// ─── RENDER ALL ──────────────────────────
function renderAll() {
  const gs = window.GS;
  renderHeader(gs);
  renderCharacterList(gs);
  renderActiveTab(gs);
  renderChoiceQueue(gs);
}

// ─── 선택지 큐 렌더링 ────────────────────
function renderChoiceQueue(gs) {
  const queueEl = document.getElementById('story-choice-queue');
  if (!queueEl) return;
  if (!gs.pendingChoices || gs.pendingChoices.length === 0) {
    queueEl.innerHTML = '';
    return;
  }
  const choice = gs.pendingChoices[0];
  const isAnnounce = choice.type === 'guild_announce';
  queueEl.innerHTML = `
    <div class="choice-pending-banner${isAnnounce ? ' announce' : ''}" onclick="openChoiceModal()">
      ${isAnnounce ? '📜' : '⚠'} <strong>${choice.title || '선택 대기 중'}</strong>
      ${gs.pendingChoices.length > 1 ? `<span style="margin-left:4px;opacity:.7">(+${gs.pendingChoices.length-1})</span>` : ''}
      <span style="margin-left:6px;font-size:11px;opacity:.8">클릭하여 결정하기 →</span>
    </div>
  `;
}

function openChoiceModal() {
  const gs = window.GS;
  if (!gs.pendingChoices || !gs.pendingChoices.length) return;
  const choice = gs.pendingChoices[0];

  const modal = document.getElementById('story-choice-modal');
  const isAnnounce = choice.type === 'guild_announce';
  const isQuestScroll = choice.isQuestScroll;

  const header = document.querySelector('#story-choice-modal .modal-header h3');
  header.textContent = choice.title || '선택의 기로';
  header.style.color = isAnnounce ? '#ffd54f' : isQuestScroll ? '#d4a853' : '';

  // Format desc: replace \n with <br>
  const descHtml = (choice.desc || '').replace(/\n/g, '<br>');
  const content = document.getElementById('story-choice-content');
  if (isQuestScroll) {
    content.innerHTML = `<div class="quest-scroll-desc">${descHtml}</div>`;
  } else if (isAnnounce) {
    content.innerHTML = `<div class="announce-desc">${descHtml}</div>`;
  } else {
    content.innerHTML = `<p>${descHtml}</p>`;
  }

  const btnContainer = document.getElementById('story-choice-buttons');
  btnContainer.innerHTML = '';

  if (isQuestScroll) {
    // 양피지 스타일: 퀘스트 카드 그리드
    btnContainer.className = 'quest-card-grid';
    (choice.options || []).forEach((opt) => {
      const gradeColor = { S: '#ff6d00', A: '#ab47bc', B: '#1976d2', C: '#388e3c', D: '#5a5a5a' };
      const gradeSuccessLabel = { S: '성공률 낮음 ★★★★★', A: '성공률 보통 ★★★★☆', B: '성공률 양호 ★★★☆☆', C: '성공률 높음 ★★☆☆☆', D: '성공률 최고 ★☆☆☆☆' };
      const gradePenaltyLabel = { S: '실패 패널티: 치명적', A: '실패 패널티: 심각', B: '실패 패널티: 보통', C: '실패 패널티: 경미', D: '실패 패널티: 없음' };
      const grade = opt.grade || 'C';
      const card = document.createElement('div');
      card.className = 'quest-card';
      card.innerHTML = `
        <div class="quest-card-header">
          <span class="quest-grade-badge" style="background:${gradeColor[grade]||'#5a5a5a'}">등급 ${grade}</span>
          <span class="quest-card-title">${opt.label}</span>
        </div>
        <div class="quest-card-body">${opt.desc || ''}</div>
        <div class="quest-card-risk">
          <span class="quest-risk-label">${gradeSuccessLabel[grade] || ''}</span>
          <span class="quest-penalty-label">${gradePenaltyLabel[grade] || ''}</span>
        </div>
        <div class="quest-card-footer">
          <button class="btn-quest-accept">✅ 수락</button>
          <button class="btn-quest-reject">❌ 거절</button>
        </div>
      `;
      card.querySelector('.btn-quest-accept').addEventListener('click', () => {
        resolveChoice(choice, opt, gs);
        gs.pendingChoices.shift();
        btnContainer.className = 'story-choice-buttons';
        modal.classList.add('hidden');
        renderAll();
        saveGame(gs);
      });
      card.querySelector('.btn-quest-reject').addEventListener('click', () => {
        card.style.opacity = '0.4';
        card.querySelectorAll('button').forEach(b => b.disabled = true);
      });
      btnContainer.appendChild(card);
    });
  } else {
    btnContainer.className = 'story-choice-buttons';
    (choice.options || []).forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = `btn-choice${isAnnounce ? ' announce-choice' : ''}`;
      btn.innerHTML = `<strong>${opt.label}</strong><br><small>${opt.desc}</small>`;
      btn.addEventListener('click', () => {
        resolveChoice(choice, opt, gs);
        gs.pendingChoices.shift();
        modal.classList.add('hidden');
        renderAll();
        saveGame(gs);
      });
      btnContainer.appendChild(btn);
    });
  }

  modal.classList.remove('hidden');
}

function resolveChoice(choice, opt, gs) {
  // opt는 { label, desc, reward, _questId? } 객체 또는 하위 호환성을 위한 문자열
  const reward = (typeof opt === 'object' && opt !== null) ? opt.reward : opt;
  if (choice.type === 'party_quest') {
    resolvePartyQuest(choice.partyId, reward, gs, (typeof opt === 'object' ? opt.grade : null) || 'C');
  } else if (choice.type === 'guild_quest') {
    resolveGuildQuest(reward, gs, opt._questId);
  } else if (choice.type === 'guild_announce') {
    resolveGuildAnnounce(reward, choice, gs);
  } else if (choice.type === 'threat_crisis') {
    resolveThreatCrisis(reward, gs);
  } else if (choice.type === 'rare_market') {
    resolveRareMarketOffer(reward, choice, gs);
  }
}

// ─── LOG COLORIZER ────────────────────────
// 캐릭터 이름·수치 변화·이벤트 태그를 색상으로 구분
function colorizeLog(text, gs) {
  if (!text) return text;
  // 이미 대화 스타일 HTML이 있으면 건드리지 않음
  if (text.includes('dlg-name') || text.includes('dlg-line')) return text;

  // 플레이스홀더 방식으로 순차 치환 (이중 치환 방지)
  const T = '\x02', M = '\x03', E = '\x04'; // 시작·중간·끝 마커

  // ★ [bracket 태그]는 맨 마지막에 처리 (숫자 마커와 중첩 방지)

  // 1. 양수 변화 (+N, +NG) — 한 번에 처리해 이중 치환 방지
  //    +24G → log-pos, +8 → log-pos  (G 포함 여부를 한 패스에서 결정)
  text = text.replace(/\+(\d[\d,]*G?)/g, (full) => `${T}log-pos${M}${full}${E}`);

  // 2. 음수 변화 (-N, -NG) — 숫자 앞 공백·괄호·콤마 필요
  text = text.replace(/([\s(,])(-\d[\d,]*)G/g,  (_, p, n) => `${p}${T}log-neg${M}${n}G${E}`);
  text = text.replace(/([\s(,])(-\d[\d,]*)\b/g,  (_, p, n) => `${p}${T}log-neg${M}${n}${E}`);

  // 3. 골드 단독 수량 (NNG) — 아직 마커 처리 안 된 것만
  text = text.replace(/(\d[\d,]+)G(?!\d|\x04)/g, (_, n) => `${T}log-gold${M}${n}G${E}`);

  // 4. 캐릭터 이름 → 성별 색상 (남=파랑, 여=핑크, 기타=보라)
  if (gs?.characters?.length) {
    const chars = gs.characters
      .filter(c => c.name?.length >= 2)
      .sort((a, b) => b.name.length - a.name.length);
    for (const char of chars) {
      const esc = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\x02-\\x04])${esc}`, 'g');
      const gCls = char.gender === 'male' ? 'log-name-male'
        : char.gender === 'female' ? 'log-name-female'
        : 'log-name-other';
      text = text.replace(re, `${T}${gCls}${M}${char.name}${E}`);
    }
  }

  // 5. 마커 → 실제 HTML span 변환
  text = text.replace(new RegExp(`${T}([^${M}]+)${M}([^${E}]*)${E}`, 'g'),
    (_, cls, content) => `<span class="${cls}">${content}</span>`);

  // 6. [bracket 태그] → 금색 — 마커→HTML 변환 후 마지막에 처리
  //    이 시점엔 마커가 이미 <span>으로 바뀌었으므로 중첩 없이 안전
  text = text.replace(/\[([^\]]{1,100})\]/g, (_, t) => `<span class="log-tag">[${t}]</span>`);

  return text;
}

// ─── HEADER ──────────────────────────────
function renderHeader(gs) {
  const dateInfo = getDayDate(gs.day);
  document.getElementById('day-number').textContent = dateInfo.label;

  const threatLevel = gs.world.threatLevel;
  const fillEl = document.getElementById('threat-fill');
  const valEl = document.getElementById('threat-value');
  const statusEl = document.getElementById('threat-status');

  fillEl.style.width = threatLevel + '%';
  valEl.textContent = Math.round(threatLevel);

  const stage = THREAT_STAGES.find(s => threatLevel >= s.min && threatLevel <= s.max) || THREAT_STAGES[0];
  statusEl.textContent = stage.name;
  fillEl.style.background = threatLevel > 60
    ? 'linear-gradient(90deg,#f44336,#8b0000)'
    : threatLevel > 40
      ? 'linear-gradient(90deg,#ff9800,#f44336)'
      : 'linear-gradient(90deg,#4caf50,#8bc34a)';

  const threatContainer = document.getElementById('threat-container');
  const stageDesc = THREAT_STAGES.map(s =>
    `${s.min}~${s.max}: ${s.name} (시장×${s.marketMod})`
  ).join('\n');
  threatContainer.dataset.tooltip =
    `세계 위협도 ${Math.round(threatLevel)}/100\n현재: ${stage.name}\n시장 가격 보정: ×${stage.marketMod}\n\n단계별 효과:\n${stageDesc}\n\n※ 위협 80+ 시 마왕의 강림 위험\n※ 위협 0 + 파티 활동 시 영웅의 귀환 엔딩`;

  if (!gs.settings.showThreatLevel) {
    threatContainer.style.display = 'none';
  }
}

// ─── CHARACTER LIST ───────────────────────
function renderCharacterList(gs) {
  const container = document.getElementById('character-list');
  container.innerHTML = '';

  if (gs.characters.length === 0) {
    container.innerHTML = '<div class="text-muted" style="text-align:center;padding:12px;font-size:12px;">아직 캐릭터가 없습니다</div>';
    return;
  }

  // Dead characters sorted to the bottom
  const sorted = [...gs.characters].sort((a, b) => (a.isDead ? 1 : 0) - (b.isDead ? 1 : 0));
  for (const char of sorted) {
    const card = buildCharCard(char, gs);
    container.appendChild(card);
  }
}

// 파티 색상 팔레트 (1~4번째 파티)
const PARTY_COLORS = ['#42a5f5', '#ff8c42', '#66bb6a', '#ce93d8'];

function buildCharCard(char, gs) {
  // 파티 인덱스 계산 (gs.parties 순서 기준)
  const partyIdx = char.currentPartyId ? gs.parties.findIndex(p => p.id === char.currentPartyId) : -1;
  const partyColor = partyIdx >= 0 ? PARTY_COLORS[partyIdx % PARTY_COLORS.length] : null;

  const card = document.createElement('div');
  card.className = `char-card${char.isDead ? ' dead' : ''}${char.currentPartyId ? ' in-party' : ''}`;
  if (partyColor) card.style.borderColor = partyColor;
  card.dataset.charId = char.id;

  const classDef = char.class ? CLASSES[char.class] : null;
  const defaultPortrait = char.gender === 'male' ? '🧔' : char.gender === 'female' ? '👩' : '🧑';
  const portrait = char.portraitIcon || defaultPortrait;
  const icon = classDef ? classDef.icon : portrait;
  const alignDef = ALIGNMENTS[char.alignment];
  const mbtiTrait = MBTI_TRAITS[char.mbti] || {};

  // Status effects string
  const effectBadges = char.statusEffects.map(s => {
    const se = STATUS_EFFECTS[s];
    return se ? `<span class="effect-badge" title="${se.name}: ${se.desc || ''}">${se.icon}${se.name}</span>` : '';
  }).join('');

  // Class badge
  const classBadge = classDef
    ? `<span class="class-badge" style="background:${classColor(char.class)};color:white">${classDef.name}</span>`
    : '<span class="class-badge" style="background:var(--bg-tertiary);color:var(--text-muted)">무직</span>';

  // Party badge (색상 포함)
  const partyBadge = char.currentPartyId && partyColor
    ? `<span class="party-badge" style="background:${partyColor};color:#0d1117">파티 ${partyIdx + 1}</span>`
    : char.currentPartyId ? '<span class="party-badge">파티 중</span>' : '';

  const hpPct = Math.max(0, (char.hp / char.maxHp) * 100);
  const fatiguePct = char.fatigue;
  const sanityPct = char.sanity;
  const mpPct = char.maxMp > 0 ? (char.mp / char.maxMp) * 100 : 0;
  const charLevel = char.level || 1;
  const expNeeded = expForNextLevel(charLevel);
  const expPct = Math.min(100, ((char.exp || 0) / expNeeded) * 100);
  const hasPendingSP = (char.statPoints || 0) > 0;

  const genderLabel = char.gender === 'male' ? '♂' : char.gender === 'female' ? '♀' : '⚧';
  const genderColor = char.gender === 'male' ? '#64b5f6' : char.gender === 'female' ? '#f48fb1' : '#ce93d8';

  card.innerHTML = `
    ${partyBadge}
    <div class="char-card-header">
      <div class="char-class-icon">${char.isDead ? '💀' : icon}</div>
      <div class="char-name-block">
        <div class="char-name" style="color:${genderColor}">${char.name}</div>
        <div class="char-sub">
          <span class="alignment-dot" style="background:${alignDef?.color || '#aaa'}"></span>
          ${genderLabel} · ${char.mbti || '?'} · ${mbtiTrait.title || '모험가'}
        </div>
      </div>
      <div class="char-gold">💰 ${numFmt(char.gold)}G</div>
    </div>
    <div style="margin:4px 0 2px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
      ${classBadge}
      <span class="level-badge">Lv.${charLevel}</span>
      ${hasPendingSP ? `<span class="sp-alert-badge" title="스탯 포인트 ${char.statPoints}점 배분 필요">⬆${char.statPoints}SP</span>` : ''}
    </div>
    <div class="stat-bar-row">
      <span class="stat-bar-label">HP</span>
      <div class="stat-bar-outer"><div class="stat-bar-inner hp" style="width:${hpPct}%"></div></div>
      <span class="stat-bar-val">${char.hp}/${char.maxHp}</span>
    </div>
    ${char.maxMp > 0 ? `
    <div class="stat-bar-row">
      <span class="stat-bar-label">MP</span>
      <div class="stat-bar-outer"><div class="stat-bar-inner mp" style="width:${mpPct}%"></div></div>
      <span class="stat-bar-val">${char.mp}/${char.maxMp}</span>
    </div>` : ''}
    <div class="stat-bar-row">
      <span class="stat-bar-label">피로</span>
      <div class="stat-bar-outer"><div class="stat-bar-inner fatigue" style="width:${fatiguePct}%"></div></div>
      <span class="stat-bar-val">${char.fatigue}/100</span>
    </div>
    <div class="stat-bar-row">
      <span class="stat-bar-label">이성</span>
      <div class="stat-bar-outer"><div class="stat-bar-inner sanity" style="width:${sanityPct}%"></div></div>
      <span class="stat-bar-val">${char.sanity}/100</span>
    </div>
    <div class="stat-bar-row">
      <span class="stat-bar-label" style="color:var(--exp-color,#9c6eff)">EXP</span>
      <div class="stat-bar-outer"><div class="stat-bar-inner exp" style="width:${expPct}%"></div></div>
      <span class="stat-bar-val" style="font-size:10px">${Math.floor(char.exp||0)}/${expNeeded}</span>
    </div>
    <div class="stat-mini-row" style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
      ${Object.entries(char.stats).map(([k,v]) => `
        <div class="stat-chip" data-tooltip="${STAT_DEF[k]?.name}(${STAT_DEF[k]?.abbr}): ${v}/10&#10;${STAT_TOOLTIPS[k] || ''}" style="color:${STAT_COLORS[k]}">
          ${STAT_DEF[k]?.abbr}/${v}
        </div>
      `).join('')}
    </div>
    ${effectBadges ? `<div class="char-effects">${effectBadges}</div>` : ''}
    ${char.isDead ? '<button class="memorial-btn">🕯 추모</button>' : ''}
    ${char.isRetired ? '<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:4px">🌅 은퇴</div>' : ''}
  `;

  // Edit/Delete buttons (injected after innerHTML so stopPropagation works cleanly)
  if (!char.isDead && !char.isRetired) {
    const editBtn = document.createElement('button');
    editBtn.className = 'char-edit-btn';
    editBtn.title = '캐릭터 수정';
    editBtn.textContent = '✏';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openCharEditModal(char.id); });
    card.querySelector('.char-card-header').appendChild(editBtn);
  }
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'char-delete-btn';
  deleteBtn.title = '캐릭터 삭제';
  deleteBtn.textContent = '🗑';
  deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteChar(char.id); });
  card.querySelector('.char-card-header').appendChild(deleteBtn);

  // Click to focus
  card.addEventListener('click', () => {
    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    renderInventoryPanel(gs, char);
    renderRelationsPanel(gs, char);
    // Switch to inventory tab on click
    switchTab('inventory');
  });

  return card;
}

function classColor(classId) {
  const colors = {
    warrior: '#e53935', mage: '#7b1fa2', cleric: '#ffa726',
    rogue: '#455a64', knight: '#1565c0', bard: '#e91e63',
    ranger: '#2e7d32', druid: '#558b2f', sage: '#4a148c',
    merchant: '#f57f17', paladin: '#ff8f00', necromancer: '#1a237e',
  };
  return colors[classId] || '#607d8b';
}

// ─── RIGHT PANEL TABS ────────────────────
let activeTab = 'market';

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  renderActiveTab(window.GS);
}

function renderActiveTab(gs) {
  switch (activeTab) {
    case 'market':    renderMarketPanel(gs); break;
    case 'inventory': {
      const sel = document.querySelector('.char-card.selected');
      const char = sel ? gs.characters.find(c => c.id === sel.dataset.charId) : null;
      renderInventoryPanel(gs, char);
      break;
    }
    case 'relations': {
      const sel = document.querySelector('.char-card.selected');
      const char = sel ? gs.characters.find(c => c.id === sel.dataset.charId) : null;
      renderRelationsPanel(gs, char);
      break;
    }
    case 'base':      renderBasePanel(gs); break;
  }
}

// ─── MARKET PANEL ────────────────────────
let marketNews = '';

function renderMarketPanel(gs) {
  const content = document.getElementById('right-panel-content');

  const anomalies = Object.entries(gs.market)
    .filter(([, item]) => item.supplyIndex < 15 && !['rare','artifact','forbidden'].includes(item.cat))
    .map(([, item]) => `⚠ ${item.name} 품귀`)
    .join(' · ');

  const categories = {
    consumable: '🧪 소모품',
    food: '🍞 식료품',
    material: '🪨 재료',
    loot: '⚔ 전리품',
    equipment: '🛡 장비',
    rare: '💎 희귀품',
    artifact: '🏺 유물',
    forbidden: '🔒 금지 재료',
  };

  const grouped = {};
  for (const [id, item] of Object.entries(gs.market)) {
    if (!grouped[item.cat]) grouped[item.cat] = [];
    grouped[item.cat].push({ id, ...item });
  }

  // 희귀 행상인 offer
  let rareOfferHtml = '';
  if (gs.world.rareOffer) {
    const ro = gs.world.rareOffer;
    const daysLeft = ro.expiresDay - gs.day;
    // bonus 또는 stats 둘 다 지원
    const bonusObj = ro.item.bonus || ro.item.stats || {};
    const STAT_LABELS = { str:'STR', int:'INT', fai:'FAI', agi:'AGI', cha:'CHA', end:'END' };
    const statsStr = Object.entries(bonusObj)
      .map(([k, v]) => `<span class="rare-stat-tag">${STAT_LABELS[k]||k} +${v}</span>`)
      .join('');
    const slotLabel = { weapon:'무기', armor:'갑옷', accessory:'장신구' }[ro.item.slot] || ro.item.slot;
    rareOfferHtml = `
      <div class="rare-offer-banner">
        <div class="rare-offer-title">🌟 전설 행상인 등장!</div>
        <div class="rare-offer-item-row">
          <span class="rare-offer-icon">${ro.item.icon || '⚔'}</span>
          <div class="rare-offer-details">
            <div class="rare-offer-name">${ro.item.name}</div>
            <div class="rare-offer-slot">Tier ${ro.item.tier || 4} · ${slotLabel}</div>
            <div class="rare-offer-stats-row">${statsStr}</div>
            ${ro.item.desc ? `<div class="rare-offer-desc">${ro.item.desc}</div>` : ''}
          </div>
        </div>
        <div class="rare-offer-meta">
          <span class="rare-offer-price">💰 ${ro.item.price.toLocaleString()}G</span>
          <span class="rare-offer-days">⏳ ${daysLeft}일 남음</span>
        </div>
        <div class="rare-offer-note">💡 캐릭터가 조건 충족 시 자동으로 구매를 시도합니다.</div>
      </div>
    `;
  }

  let html = `
    <div class="market-news">${marketNews || '📊 시장은 오늘도 활발하게 돌아가고 있다.'}</div>
    ${anomalies ? `<div class="market-anomaly">⚠ ${anomalies}</div>` : ''}
    ${rareOfferHtml}
  `;

  for (const [cat, label] of Object.entries(categories)) {
    if (!grouped[cat] || !grouped[cat].length) continue;
    html += `<div class="market-section-title">${label}</div>`;
    for (const item of grouped[cat]) {
      const priceDiff = item.currentPrice - (item.prevPrice || item.currentPrice);
      // 가격 변동: 화살표 + 수치만 표시 (텍스트 레이블 없음)
      let changeLabel, changeClass;
      const absDiff = Math.abs(priceDiff);
      if (priceDiff > 0) {
        changeClass = 'up';
        changeLabel = `▲+${priceDiff}`;
      } else if (priceDiff < 0) {
        changeClass = 'down';
        changeLabel = `▼-${absDiff}`;
      } else {
        changeClass = 'neutral';
        changeLabel = '—';
      }
      const supplyPct = Math.min(100, (item.supplyIndex / 200) * 100);
      html += `
        <div class="market-item-row">
          <div class="market-item-name">${item.name}</div>
          <div class="supply-bar-outer" title="공급량 ${Math.round(item.supplyIndex)}">
            <div class="supply-bar-inner" style="width:${supplyPct}%;background:${supplyPct<20?'#f44336':supplyPct<50?'#ff9800':'#2196f3'}"></div>
          </div>
          <div class="market-item-price">${numFmt(item.currentPrice)}G</div>
          <div class="market-item-change ${changeClass}" style="font-size:10px">${changeLabel}G</div>
        </div>
      `;
    }
  }

  content.innerHTML = html;
}

// ─── INVENTORY PANEL ─────────────────────
function renderInventoryPanel(gs, selectedChar) {
  const content = document.getElementById('right-panel-content');

  if (!selectedChar) {
    const chars = gs.characters.filter(c => !c.isDead);
    if (!chars.length) { content.innerHTML = '<div class="inventory-empty">캐릭터를 선택하세요.</div>'; return; }
    // Show all
    let html = '';
    for (const char of chars) {
      html += buildInventorySection(char, gs);
    }
    content.innerHTML = html || '<div class="inventory-empty">소지품이 없습니다.</div>';
  } else {
    content.innerHTML = buildInventorySection(selectedChar, gs);
  }

  // ── Stat allocation button handlers ──
  content.querySelectorAll('.stat-alloc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charId = btn.dataset.char;
      const stat   = btn.dataset.stat;
      const c = gs.characters.find(x => x.id === charId);
      if (!c || (c.statPoints || 0) <= 0 || (c.stats[stat] || 0) >= 10) return;
      c.stats[stat]++;
      c.statPoints--;
      // Recalculate derived stats
      if (stat === 'str' || stat === 'end') {
        c.maxHp = 50 + c.stats.str * 5 + c.stats.end * 3;
        c.hp = Math.min(c.hp, c.maxHp);
      }
      if (stat === 'int' || stat === 'fai') {
        c.maxMp = 30 + c.stats.int * 4 + Math.floor((c.stats.fai || 0) * 2);
        c.mp = Math.min(c.mp, c.maxMp);
      }
      renderInventoryPanel(gs, selectedChar);
      renderAll();
    });
  });

}

function buildInventorySection(char, gs) {
  const classDef = char.class ? CLASSES[char.class] : null;
  const slotLabel = { weapon: '⚔ 무기', armor: '🛡 방어구', accessory: '💍 장신구' };

  const equipmentHtml = Object.entries(char.equipment).map(([slot, item]) => {
    if (!item) return `<div class="item-chip empty-slot">${slotLabel[slot] || slot}: <span style="color:var(--text-muted)">없음</span></div>`;
    const def = EQUIPMENT_DEFS?.[item.id];
    const bonusStr = def ? Object.entries(def.bonus).map(([k,v]) => `${STAT_DEF[k]?.abbr||k}+${v}`).join(' ') : '';
    return `<div class="item-chip equipment" data-tooltip="${def?.desc || item.name}">${item.icon || ''} ${item.name}${bonusStr ? ` <span style="color:var(--success);font-size:10px">(${bonusStr})</span>` : ''}</div>`;
  }).join('');

  // 채무 표시
  const debtHtml = (char.debts && char.debts.length > 0)
    ? char.debts.map(d => {
        const creditor = gs.characters.find(c => c.id === d.creditorId);
        const overdue = gs.day > d.deadline;
        return `<div class="item-chip debt-chip${overdue ? ' overdue' : ''}">💸 ${creditor?.name||'미상'}에게 ${d.remaining}G 채무 (${d.purpose})${overdue ? ' ⚠연체' : ` D-${d.deadline - gs.day}`}</div>`;
      }).join('')
    : '';

  const TIER_LABEL = ['일반', '고급', '희귀', '전설'];
  const inventoryHtml = char.inventory.length
    ? char.inventory.map(it => {
        const def = EQUIPMENT_DEFS?.[it.id];
        const tierBadge = def
          ? `<span class="inv-tier-badge tier-${def.tier}">${TIER_LABEL[def.tier] || ''}</span>`
          : '';
        const qty = it.qty > 1 ? ` <span style="color:var(--text-muted)">×${it.qty}</span>` : '';
        return `<div class="item-chip ${it.cat || ''}">${it.icon || ''}${it.name}${tierBadge}${qty}</div>`;
      }).join('')
    : '<span class="text-muted" style="font-size:12px">인벤토리 비어 있음</span>';

  // ── 스킬 UI: 일반 스킬 3개 + 침공 스킬 1개 — 모두 동일한 팝업 스타일 ──
  const raidSk = typeof RAID_SKILL_TABLE !== 'undefined' && char.class ? RAID_SKILL_TABLE[char.class] : null;

  // 별 단계 추가 효과 테이블 (SKILL_STAR_EFFECTS와 동기화)
  const STAR_BONUS_LABELS = {
    2: 'MP -1 감소',
    3: '효과 +15%',
    4: '침공 내 2회 가능',
    5: 'MP -2 추가 · 효과 +30%',
  };

  // 스킬 팝업 칩 렌더러 (isRaid: 침공 스킬 여부)
  function _skillChip(name, mpCost, effect, skillKey, isRaid) {
    const lvl = isRaid ? null : ((char.skillLevels || {})[skillKey] || 1);
    const stars = lvl ? '★'.repeat(lvl) + '☆'.repeat(5 - lvl) : '';
    const typeLabel = isRaid ? '⚔ 침공' : '📖 일반';
    const chipBg = isRaid
      ? 'rgba(255,23,68,0.10)' : 'rgba(100,180,255,0.08)';
    const chipBorder = isRaid ? '#ff1744' : '#546e7a';
    const chipColor  = isRaid ? '#ff8a80' : '#b0bec5';
    // 현재 별 단계 보너스 (Lv.2부터)
    const starBonusHtml = (lvl && lvl >= 2)
      ? `<div class="skill-popup-star-bonus">✦ ${STAR_BONUS_LABELS[lvl] || ''}</div>` : '';
    // 다음 단계 미리보기
    const nextLvl = lvl && lvl < 5 ? lvl + 1 : null;
    const nextBonusHtml = nextLvl
      ? `<div class="skill-popup-next">다음 별: ${STAR_BONUS_LABELS[nextLvl] || ''}</div>` : '';
    return `<div class="skill-popup-chip" style="background:${chipBg};border-color:${chipBorder};color:${chipColor}">
      <div class="skill-popup-header">
        <span class="skill-popup-type">${typeLabel}</span>
        <strong class="skill-popup-name">${name}</strong>
        <span class="skill-popup-mp">MP -${mpCost}</span>
      </div>
      <div class="skill-popup-effect">${effect}</div>
      ${stars ? `<div class="skill-popup-stars">${stars} Lv.${lvl}${starBonusHtml}</div>` : ''}
      ${nextBonusHtml}
    </div>`;
  }

  const raidSkHtml = raidSk
    ? _skillChip(raidSk.name, raidSk.mpCost, raidSk.effect, null, true)
    : '';

  const skillsHtml = char.classSkills && char.classSkills.length
    ? char.classSkills.map(sk => {
        // classSkills는 이제 {name, mpCost, effect} 객체 배열
        const skName   = (typeof sk === 'object') ? sk.name   : sk;
        const skMp     = (typeof sk === 'object') ? sk.mpCost : 0;
        const skEffect = (typeof sk === 'object') ? sk.effect : '—';
        return _skillChip(skName, skMp, skEffect, skName, false);
      }).join('')
    : '<span class="text-muted" style="font-size:12px">스킬 없음</span>';

  // 스탯 포인트 배분 UI
  const sp = char.statPoints || 0;
  const statAllocHtml = sp > 0
    ? `<div class="sp-alloc-header">⬆ 스탯 포인트 <span class="sp-count">${sp}</span>점 배분</div>
       <div class="sp-alloc-row">
         ${Object.keys(char.stats).map(k => `
           <button class="stat-alloc-btn" data-char="${char.id}" data-stat="${k}" ${char.stats[k] >= 10 ? 'disabled' : ''}>
             ${STAT_DEF[k]?.icon || ''} ${STAT_DEF[k]?.abbr || k}
           </button>
         `).join('')}
       </div>`
    : '';

  // 장비 보너스 합산 표시
  const equip = char._equipBonuses || {};
  const bonusSummary = Object.entries(equip).filter(([,v]) => v !== 0)
    .map(([k,v]) => `${STAT_DEF[k]?.abbr||k}${v>0?'+':''}${v}`).join(' ');

  return `
    <div class="inventory-section">
      <div class="inventory-char-label">
        ${classDef?.icon || '🧑'} ${char.name} ${classDef ? `(${classDef.name})` : '(무직)'}
        <span style="float:right;color:var(--gold);font-weight:700">${numFmt(char.gold)}G</span>
      </div>
      <div style="font-size:11px;color:var(--exp-color,#9c6eff);margin-bottom:4px">
        Lv.${char.level || 1} · EXP ${Math.floor(char.exp || 0)} / ${expForNextLevel(char.level || 1)}
        ${(char.statPoints || 0) > 0 ? `<span style="color:var(--warning);font-weight:700;margin-left:6px">⬆ SP +${char.statPoints}</span>` : ''}
      </div>
      ${bonusSummary ? `<div style="font-size:11px;color:var(--success);margin-bottom:4px">⬆ 장비 보너스: ${bonusSummary}</div>` : ''}
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">장착</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${equipmentHtml}</div>
      ${debtHtml ? `<div style="margin:4px 0;font-size:11px;color:var(--danger)">채무</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${debtHtml}</div>` : ''}
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">소지품</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${inventoryHtml}</div>
      ${statAllocHtml}
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">스킬</div>
      <div class="skill-popup-grid">${skillsHtml}${raidSkHtml}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">행동 기록</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
        전투:${char.actionCounts.combat||0} · 마법:${char.actionCounts.magic||0} · 신성:${char.actionCounts.faith||0} · 잠입:${char.actionCounts.stealth||0} · 사교:${char.actionCounts.social||0} · 생존:${char.actionCounts.survival||0} · 교역:${char.actionCounts.trade||0}
      </div>
    </div>
  `;
}

// ─── RELATIONS PANEL ─────────────────────
let relGraphMode = false;

function renderRelationsPanel(gs, selectedChar) {
  const content = document.getElementById('right-panel-content');

  let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
    <button id="toggle-graph-btn" class="btn-small">${relGraphMode ? '📋 목록' : '🕸 그래프'}</button>
  </div>`;

  if (relGraphMode) {
    html += buildRelationGraph(gs, selectedChar);
    content.innerHTML = html;
    document.getElementById('toggle-graph-btn')?.addEventListener('click', () => {
      relGraphMode = false; renderActiveTab(window.GS);
    });
    return;
  }

  // List view — include dead chars
  const chars = selectedChar ? [selectedChar] : gs.characters;
  if (!chars.length) {
    content.innerHTML = html + '<div class="inventory-empty">캐릭터를 선택하세요.</div>';
    return;
  }

  for (const char of chars) {
    if (!char.relationships.length) continue;
    const isDead = char.isDead;
    html += `<div class="relation-char-block${isDead ? ' rel-dead-char' : ''}">`;
    html += `<div class="relation-char-name">
      ${isDead ? '💀' : (CLASSES[char.class]?.icon || '🧑')} ${char.name}
      ${isDead ? '<span style="color:var(--text-muted);font-size:10px;margin-left:4px">(사망)</span>' : ''}
    </div>`;

    const sortedRels = [...char.relationships].sort((a,b) => b.affection - a.affection);
    for (const rel of sortedRels) {
      const target = gs.characters.find(c => c.id === rel.targetId);
      if (!target) continue;
      const relDef = RELATION_TYPES[rel.type] || { name: rel.type, icon: '?', positive: true };
      const affPct = Math.max(0, ((rel.affection + 100) / 300) * 100);
      const isNeg = rel.affection < 0;
      const targetDead = target.isDead;

      // A → B (이 캐릭터 → 대상)
      html += `
        <div class="relation-row">
          <div style="font-size:10px;min-width:22px;color:#90a4ae;white-space:nowrap">→</div>
          <div style="font-size:11px;min-width:65px;color:${targetDead ? 'var(--text-muted)' : 'inherit'}">
            ${targetDead ? '💀 ' : ''}${target.name}${targetDead ? '<span style="font-size:9px"> †</span>' : ''}
          </div>
          <span class="relation-type-badge">${relDef.icon} ${relDef.name}</span>
          <div class="affection-bar">
            <div class="affection-fill ${isNeg ? 'neg' : ''}" style="width:${affPct}%"></div>
          </div>
          <div class="affection-val">${Math.round(rel.affection)}</div>
        </div>
      `;

      // B → A (대상 → 이 캐릭터)
      const reverseRel = target.relationships?.find(r => r.targetId === char.id);
      if (reverseRel) {
        const revDef = RELATION_TYPES[reverseRel.type] || { name: reverseRel.type, icon: '?', positive: true };
        const revPct = Math.max(0, ((reverseRel.affection + 100) / 300) * 100);
        const revNeg = reverseRel.affection < 0;
        html += `
          <div class="relation-row" style="opacity:0.72;margin-left:8px;margin-top:-2px">
            <div style="font-size:10px;min-width:22px;color:#78909c;white-space:nowrap">←</div>
            <div style="font-size:11px;min-width:65px;color:var(--text-muted)">${target.name}</div>
            <span class="relation-type-badge" style="opacity:0.8">${revDef.icon} ${revDef.name}</span>
            <div class="affection-bar">
              <div class="affection-fill ${revNeg ? 'neg' : ''}" style="width:${revPct}%"></div>
            </div>
            <div class="affection-val">${Math.round(reverseRel.affection)}</div>
          </div>
        `;
      }
    }
    html += '</div>';
  }

  content.innerHTML = html || '<div class="inventory-empty">관계가 아직 형성되지 않았습니다.</div>';
  document.getElementById('toggle-graph-btn')?.addEventListener('click', () => {
    relGraphMode = true; renderActiveTab(window.GS);
  });
}

function buildRelationGraph(gs, selectedChar) {
  const chars = gs.characters;
  if (!chars.length) return '<div class="inventory-empty">캐릭터가 없습니다.</div>';

  const count = chars.length;
  const size = Math.max(260, Math.min(380, 140 + count * 22));
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.36;
  const nodeR = 17;

  const nodes = chars.map((char, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), char };
  });

  const relColors = {
    friend: '#2196f3', comrade: '#4caf50', rival: '#ff9800', enemy: '#f44336',
    lover: '#e91e63', spouse: '#f4c430', oathbound: '#9c27b0',
    parent: '#8bc34a', child: '#8bc34a', sibling: '#66bb6a',
    benefactor: '#00bcd4', employer: '#607d8b', employee: '#78909c',
    creditor: '#ff5722', debtor: '#ff7043', fan: '#03a9f4',
  };

  // 방향성 엣지 수집 (중복 제거 없이 A→B, B→A 각각)
  const allEdges = [];
  for (const node of nodes) {
    for (const rel of node.char.relationships) {
      const toNode = nodes.find(n => n.char.id === rel.targetId);
      if (!toNode) continue;
      allEdges.push({ from: node, to: toNode, rel });
    }
  }

  // 쌍 분류: 단방향 vs 양방향 (같은 타입 vs 다른 타입)
  const pairMap = new Map();
  for (const e of allEdges) {
    const key = [e.from.char.id, e.to.char.id].sort().join('|');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(e);
  }

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="display:block;max-width:${size}px;margin:auto">`;

  // 화살표 그리기 헬퍼: 선 + 삼각형 화살촉 (노드 원을 피해 끝점 조정)
  const drawArrow = (from, to, color, op, offset = 0) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;   // 단위 방향
    const px = -uy, py = ux;             // 수직 방향 (오프셋용)

    const ox = px * offset, oy = py * offset;
    const A = 5;                          // 화살촉 크기

    const x1 = from.x + ux * nodeR + ox;
    const y1 = from.y + uy * nodeR + oy;
    // 화살촉 끝 (노드 원 경계)
    const tipX = to.x - ux * nodeR + ox;
    const tipY = to.y - uy * nodeR + oy;
    // 선 끝 (화살촉 밑변)
    const x2 = tipX - ux * A;
    const y2 = tipY - uy * A;

    // 화살촉 삼각형 꼭짓점
    const ax1 = (x2 + px * A * 0.55).toFixed(1);
    const ay1 = (y2 + py * A * 0.55).toFixed(1);
    const ax2 = (x2 - px * A * 0.55).toFixed(1);
    const ay2 = (y2 - py * A * 0.55).toFixed(1);

    let out = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="1.6" stroke-opacity="${op}"/>`;
    out += `<polygon points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${ax1},${ay1} ${ax2},${ay2}" fill="${color}" opacity="${op}"/>`;
    return out;
  };

  for (const [, pairEdges] of pairMap) {
    if (pairEdges.length === 1) {
      // 단방향 화살표
      const e = pairEdges[0];
      const color = relColors[e.rel.type] || '#5a7aaa';
      const op = e.rel.affection < 0 ? 0.30 : 0.65;
      svg += drawArrow(e.from, e.to, color, op, 0);
    } else {
      // 양방향: 두 화살표를 5px씩 오프셋으로 분리
      for (const e of pairEdges) {
        const color = relColors[e.rel.type] || '#5a7aaa';
        const op = e.rel.affection < 0 ? 0.30 : 0.65;
        svg += drawArrow(e.from, e.to, color, op, 5);
      }
    }
  }

  // edges 변수는 레전드용으로만 참조
  const edges = allEdges;

  for (const { char, x, y } of nodes) {
    const isDead = char.isDead;
    const isSel = selectedChar && char.id === selectedChar.id;
    const fill = isDead ? '#1a1a1a' : isSel ? '#0f3460' : '#1e2a45';
    const stroke = isDead ? '#5a5a5a' : isSel ? '#f4c430' : (char.class ? classColor(char.class) : '#5a7aaa');
    const icon = isDead ? '💀' : (CLASSES[char.class]?.icon || '🧑');
    const nameColor = isDead ? '#5a5a5a' : '#e8eaf0';
    const nameText = (char.name.length > 5 ? char.name.slice(0, 4) + '…' : char.name) + (isDead ? '†' : '');
    svg += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${nodeR}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel ? 2.5 : 1.5}"/>`;
    svg += `<text x="${x.toFixed(0)}" y="${(y + 5).toFixed(0)}" text-anchor="middle" font-size="12" dominant-baseline="middle">${icon}</text>`;
    svg += `<text x="${x.toFixed(0)}" y="${(y + nodeR + 10).toFixed(0)}" text-anchor="middle" font-size="9" fill="${nameColor}">${nameText}</text>`;
  }

  svg += '</svg>';

  const usedTypes = [...new Set(edges.map(e => e.rel.type))].filter(t => relColors[t]);
  if (usedTypes.length) {
    svg += '<div class="relation-graph-legend">';
    for (const type of usedTypes) {
      const relDef = RELATION_TYPES[type];
      if (!relDef) continue;
      const color = relColors[type];
      svg += `<span class="graph-legend-item"><svg width="14" height="2" style="display:inline-block;vertical-align:middle"><line x1="0" y1="1" x2="14" y2="1" stroke="${color}" stroke-width="2"/></svg> ${relDef.name}</span>`;
    }
    svg += '</div>';
  }
  return svg;
}

// ─── BASE PANEL ──────────────────────────
function renderBasePanel(gs) {
  const content = document.getElementById('right-panel-content');
  const stage = BASE_STAGES[gs.world.baseLevel - 1];
  if (!gs.world.buildings) gs.world.buildings = {};
  if (gs.world.townGold === undefined) gs.world.townGold = 0;

  const builtIds = Object.keys(gs.world.buildings).filter(k => gs.world.buildings[k]);
  const maxB = stage.maxBuildings;

  let html = `
    <div class="base-stage-info">
      <div class="base-stage-name">${stage.icon} ${stage.name}</div>
      <div class="base-stage-progress">거점 단계 ${stage.level}/4 · 건물 ${builtIds.length}/${maxB === 99 ? '무제한' : maxB}</div>
    </div>
    <div class="market-section-title">🪙 공동 창고</div>
    <div class="base-resource-row"><span>💛 공동 금화</span><span>${numFmt(gs.world.townGold)}G</span></div>
    <div class="base-resource-row"><span>🪵 목재</span><span>${gs.world.baseResources.wood}</span></div>
    <div class="base-resource-row"><span>⛏ 철광석</span><span>${gs.world.baseResources.iron_ore || 0}</span></div>
    <div class="base-resource-row"><span>💎 마법 결정</span><span>${gs.world.baseResources.magic_crystal}</span></div>
  `;

  if (builtIds.length > 0) {
    html += `<div class="market-section-title">✓ 건설된 시설</div>`;
    for (const bId of builtIds) {
      const bDef = BUILDINGS[bId];
      if (!bDef) continue;
      html += `
        <div class="building-card built">
          <div class="building-card-header">
            <span class="building-icon">${bDef.icon}</span>
            <span class="building-name">${bDef.name}</span>
            <button class="btn-small" onclick="tryDemolishBuilding('${bId}')">철거</button>
          </div>
          <div class="building-desc">${bDef.desc}</div>
        </div>`;
    }
  }

  const availBuildings = Object.entries(BUILDINGS).filter(([id]) => !gs.world.buildings[id]);
  if (availBuildings.length > 0) {
    // 현재 레벨에서 건설 가능한 것과 잠긴 것 분리
    const unlockedBuildings = availBuildings.filter(([, d]) => (d.minBaseLevel || 1) <= gs.world.baseLevel);
    const lockedBuildings   = availBuildings.filter(([, d]) => (d.minBaseLevel || 1) >  gs.world.baseLevel);

    if (unlockedBuildings.length > 0) {
      html += `<div class="market-section-title">🔨 건설 가능 시설</div>`;
      for (const [bId, bDef] of unlockedBuildings) {
        const canSlot = builtIds.length < maxB;
        // 거점 레벨에 따른 효과 배율 표시
        const lvAbove = gs.world.baseLevel - (bDef.minBaseLevel || 1);
        const scalePct = bDef.effectScale ? Math.round(lvAbove * bDef.effectScale * 100) : 0;
        const scaleNote = scalePct > 0 ? ` <span style="color:var(--success);font-size:11px">(거점 보너스 +${scalePct}%)</span>` : '';

        const costHtml = Object.entries(bDef.cost).map(([k, v]) => {
          const name = k === 'gold' ? '금화' : (MARKET_ITEMS[k]?.name || k);
          const have = k === 'gold' ? gs.world.townGold : (gs.world.baseResources[k] || 0);
          return `<span style="color:${have >= v ? 'var(--success)' : 'var(--danger)'}">${name}×${v}(${have})</span>`;
        }).join(' ');
        const canAfford = Object.entries(bDef.cost).every(([k, v]) =>
          (k === 'gold' ? gs.world.townGold : (gs.world.baseResources[k] || 0)) >= v
        );
        const enabled = canSlot && canAfford;
        html += `
          <div class="building-card">
            <div class="building-card-header">
              <span class="building-icon">${bDef.icon}</span>
              <span class="building-name">${bDef.name}</span>
              <button class="btn-small${enabled ? '' : ' disabled-btn'}" onclick="${enabled ? `tryBuildBuilding('${bId}')` : ''}">건설</button>
            </div>
            <div class="building-desc">${bDef.desc}${scaleNote}</div>
            <div class="building-cost">필요: ${costHtml}</div>
          </div>`;
      }
    }

    if (lockedBuildings.length > 0) {
      const STAGE_NAMES = ['야영지', '마을', '성채', '왕도'];
      html += `<div class="market-section-title" style="color:var(--text-muted)">🔒 잠긴 시설 (해금 조건 미달)</div>`;
      for (const [bId, bDef] of lockedBuildings) {
        const reqLvl   = bDef.minBaseLevel || 1;
        const reqStage = STAGE_NAMES[reqLvl - 1] || `Lv.${reqLvl}`;
        const curLvl   = gs.world.baseLevel;
        const gapLvl   = reqLvl - curLvl;
        html += `
          <div class="building-card building-locked">
            <div class="building-card-header">
              <span class="building-icon" style="opacity:0.5">${bDef.icon}</span>
              <span class="building-name" style="opacity:0.6">${bDef.name}</span>
              <span class="lock-badge">🔒 거점 Lv.${reqLvl} (${reqStage}) 필요</span>
            </div>
            <div class="building-desc" style="opacity:0.5">${bDef.desc}</div>
            <div class="lock-hint">현재 거점 Lv.${curLvl} → 거점 ${gapLvl}단계 업그레이드 필요</div>
          </div>`;
      }
    }
  }

  if (stage.nextCost) {
    const costs = Object.entries(stage.nextCost)
      .map(([k, v]) => `${MARKET_ITEMS[k]?.name || k} ×${v}`).join(', ');
    html += `
      <div class="market-section-title" style="margin-top:12px">⬆ 거점 업그레이드</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">필요 자재: ${costs}</div>
      <button id="upgrade-base-btn" class="btn-primary" style="width:100%">거점 업그레이드</button>`;
  } else if (gs.world.baseLevel >= 4) {
    html += `<div style="text-align:center;color:var(--gold);padding:12px;font-size:14px">👑 최고 단계 달성!</div>`;
  }

  content.innerHTML = html;
  document.getElementById('upgrade-base-btn')?.addEventListener('click', () => tryUpgradeBase(gs));
}

function tryBuildBuilding(bId) {
  const gs = window.GS;
  const bDef = BUILDINGS[bId];
  if (!bDef) return;
  if (!gs.world.buildings) gs.world.buildings = {};

  // 거점 레벨 잠금 확인
  const minLvl = bDef.minBaseLevel || 1;
  if (gs.world.baseLevel < minLvl) {
    const STAGE_NAMES = ['야영지', '마을', '성채', '왕도'];
    showToast(`거점을 ${STAGE_NAMES[minLvl - 1]}(Lv.${minLvl})으로 업그레이드해야 건설 가능합니다.`, 'warning');
    return;
  }

  const stage = BASE_STAGES[gs.world.baseLevel - 1];
  const builtCount = Object.values(gs.world.buildings).filter(Boolean).length;
  if (builtCount >= stage.maxBuildings) {
    showToast(`현재 단계 최대 ${stage.maxBuildings}개까지 건설 가능합니다.`, 'warning');
    return;
  }

  for (const [k, v] of Object.entries(bDef.cost)) {
    const have = k === 'gold' ? (gs.world.townGold || 0) : (gs.world.baseResources[k] || 0);
    if (have < v) {
      showToast(`자재 부족: ${k === 'gold' ? '금화' : (MARKET_ITEMS[k]?.name || k)} ${have}/${v}`, 'warning');
      return;
    }
  }
  for (const [k, v] of Object.entries(bDef.cost)) {
    if (k === 'gold') gs.world.townGold = (gs.world.townGold || 0) - v;
    else gs.world.baseResources[k] = (gs.world.baseResources[k] || 0) - v;
  }

  gs.world.buildings[bId] = true;
  showToast(`${bDef.icon} ${bDef.name} 건설 완료!`, 'success');
  appendToLog([{ logClass: 'log-world', text: `🏗 거점에 ${bDef.icon} ${bDef.name}이(가) 건설됐다! 효과: ${bDef.desc}` }]);
  renderBasePanel(gs);
  saveGame(gs);
}

function tryDemolishBuilding(bId) {
  const gs = window.GS;
  const bDef = BUILDINGS[bId];
  if (!bDef || !gs.world.buildings) return;
  if (!confirm(`${bDef.name}을(를) 철거하시겠습니까? 자재 50%가 반환됩니다.`)) return;

  for (const [k, v] of Object.entries(bDef.cost)) {
    const refund = Math.floor(v * 0.5);
    if (k === 'gold') gs.world.townGold = (gs.world.townGold || 0) + refund;
    else gs.world.baseResources[k] = (gs.world.baseResources[k] || 0) + refund;
  }
  delete gs.world.buildings[bId];
  showToast(`${bDef.name} 철거 완료. 자재 50% 반환.`, 'info');
  renderBasePanel(gs);
  saveGame(gs);
}

function tryUpgradeBase(gs) {
  const stage = BASE_STAGES[gs.world.baseLevel - 1];
  if (!stage.nextCost) return;

  for (const [res, cost] of Object.entries(stage.nextCost)) {
    const have = gs.world.baseResources[res] || 0;
    if (have < cost) {
      showToast(`자재 부족: ${MARKET_ITEMS[res]?.name || res} ${have}/${cost}`, 'warning');
      return;
    }
  }
  for (const [res, cost] of Object.entries(stage.nextCost)) {
    gs.world.baseResources[res] = (gs.world.baseResources[res] || 0) - cost;
  }

  gs.world.baseLevel++;
  const newStage = BASE_STAGES[gs.world.baseLevel - 1];
  showToast(`거점이 ${newStage.icon} ${newStage.name}(으)로 성장했다!`, 'success');
  appendToLog([{ logClass: 'log-world', text: `🏰 거점이 ${newStage.icon} ${newStage.name}(으)로 발전했다! 새로운 시설이 개방됐다.` }]);
  renderAll();
  saveGame(gs);
}

// ─── TOAST ───────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ─── ENDING MODAL ────────────────────────
function showEnding(ending) {
  const modal = document.getElementById('ending-modal');
  document.getElementById('ending-title').textContent = ending.name;
  document.getElementById('ending-content').innerHTML = `
    <div class="ending-content">
      <div class="ending-icon">${ending.icon}</div>
      <div class="ending-name">${ending.name}</div>
      <div class="ending-desc">${ending.desc}</div>
      <div class="ending-stats">Day ${window.GS.day} · 캐릭터 ${window.GS.characters.length}명</div>
    </div>
  `;
  modal.classList.remove('hidden');
}

// ─── SETTINGS PANEL ─────────────────────
const SETTINGS_DEF = {
  relation: [
    { key: 'allowSameSexCouple', name: '동성 커플 허용', desc: '동성 연애 이벤트 활성화' },
    { key: 'allowHeteroCouple', name: '이성 커플 허용', desc: '이성 연애 이벤트 활성화' },
    { key: 'pureMode', name: '순애 모드', desc: '양다리/바람 이벤트 제거' },
    { key: 'friendshipMode', name: '우정 모드', desc: '연애 이벤트 전체 제거' },
    { key: 'oathBondSystem', name: '맹약 시스템', desc: '결혼 + 높은 호감도(80+) 커플에게 "맹약(Oath Bond)"이 발동됩니다. 맹약을 맺은 두 사람은 위기 상황(HP 25% 이하 습격)에 처했을 때 상대방이 자동으로 달려와 HP를 분담합니다. 결혼 이벤트 이후 관계 패널에 🔮 아이콘으로 확인 가능합니다.' },
    { key: 'economicRelations', name: '경제적 관계', desc: '고용·채무 관계 이벤트 활성화' },
  ],
  gameplay: [
    { key: 'statusEffectSystem', name: '상태이상 시스템', desc: '상태이상 발병 여부' },
    { key: 'storyChoices', name: '스토리 선택지', desc: '플레이어 선택지 UI 표시' },
    { key: 'characterInteraction', name: '캐릭터 상호작용', desc: '캐릭터 간 상호작용 이벤트' },
    { key: 'autoClassPromotion', name: '전직 자동 제안', desc: '조건 달성 시 전직 제안 팝업' },
    { key: 'autoStatDistribution', name: '스탯 자동 배분', desc: 'ON 시 스탯 자동 배분' },
    { key: 'autoRecruitment', name: '자동 영입', desc: '평균 30일마다 랜덤 모험가가 길드에 합류' },
  ],
  economy: [
    { key: 'marketPriceFluctuation', name: '시장 가격 변동', desc: '수요·공급에 따른 가격 자동 변동' },
    { key: 'inflationSystem', name: '인플레이션 시스템', desc: '골드 과다 시 물가 상승 적용' },
    { key: 'blackMarket', name: '암시장', desc: '도적·네크로맨서 클래스 암시장 이벤트' },
    { key: 'taxSystem', name: '세금 시스템', desc: '거점 단계별 세금 부과' },
    { key: 'economicCollapseEvent', name: '경제 붕괴 이벤트', desc: '극단적 경제 상황 시 특수 이벤트' },
  ],
  display: [
    { key: 'showThreatLevel', name: '세계 위협도 표시', desc: '헤더 게이지 표시' },
    { key: 'showEventNumbers', name: '이벤트 수치 표시', desc: '이벤트 발생 시 수치 변화 표시' },
    { key: 'developerMode', name: '개발자 모드', desc: '수치 직접 조작, 이벤트 강제 발동' },
    { key: 'nextEventMode', name: '⚡ Next Event 정지 기준', type: 'select', desc: '자동 진행 시 어떤 시점에 멈출지 결정합니다.',
      options: [
        { value: 'choice', label: '선택지 (기본) — 플레이어 선택지·사망·전직 발생 시 정지' },
        { value: 'important', label: '중요 이벤트 — 위 + 연인·결혼·이별·특수·핑크 이벤트 시 정지' },
      ],
    },
    { key: 'battleLogSpeed', name: '⚔ 전투 로그 속도 (ms/줄)', type: 'select', desc: '침공 시 전투 로그 한 줄이 등장하는 간격',
      options: [
        { value: 0,    label: '즉시 — 전체 동시 표시' },
        { value: 400,  label: '빠름 — 0.4초/줄' },
        { value: 800,  label: '보통 (기본) — 0.8초/줄' },
        { value: 1500, label: '느림 — 1.5초/줄' },
      ],
    },
  ],
  manage: null, // special
};

function renderSettingsContent(tab) {
  const gs = window.GS;
  const content = document.getElementById('settings-content');
  const defs = SETTINGS_DEF[tab];

  if (tab === 'manage') {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="market-section-title">📁 저장 관리</div>
        <button class="btn-primary" id="manual-save-btn">💾 수동 저장</button>
        <button class="btn-secondary" id="export-btn">📤 JSON 내보내기</button>
        <button class="btn-secondary" id="import-btn-open">📥 JSON 불러오기</button>
        <input type="file" id="import-file-input" accept=".json" style="display:none">
        <div class="market-section-title" style="margin-top:8px">⚠ 위험</div>
        <button class="btn-secondary" id="reset-game-btn" style="border-color:var(--danger);color:var(--danger)">🗑 새 게임 (초기화)</button>
        ${gs.settings.developerMode ? `
        <div class="market-section-title">🛠 개발자 도구</div>
        <button class="btn-secondary" id="dev-add-gold">모든 캐릭터 +1000G</button>
        <button class="btn-secondary" id="dev-reduce-threat">위협도 -20</button>
        <button class="btn-secondary" id="dev-add-resources">자재 +100 전부</button>
        ` : ''}
      </div>
    `;
    bindManageButtons();
    return;
  }

  if (!defs) { content.innerHTML = ''; return; }

  let html = '';
  for (const def of defs) {
    const val = gs.settings[def.key];
    if (def.type === 'number') {
      html += `
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">${def.name}</div>
            <div class="setting-desc">${def.desc}</div>
          </div>
          <input type="number" class="setting-number-input" data-key="${def.key}" value="${val}" min="${def.min}" max="${def.max}">
        </div>
      `;
    } else if (def.type === 'select') {
      // eslint-disable-next-line eqeqeq
      const optHtml = (def.options || []).map(o =>
        `<option value="${o.value}" ${val == o.value ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      html += `
        <div class="setting-row setting-row-select">
          <div class="setting-info">
            <div class="setting-name">${def.name}</div>
            <div class="setting-desc">${def.desc}</div>
          </div>
          <select class="setting-select-input" data-key="${def.key}">${optHtml}</select>
        </div>
      `;
    } else {
      html += `
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-name">${def.name}</div>
            <div class="setting-desc">${def.desc}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" data-key="${def.key}" ${val ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
    }
  }
  content.innerHTML = html;
}

function bindManageButtons() {
  const gs = window.GS;
  document.getElementById('manual-save-btn')?.addEventListener('click', () => { saveGame(gs); showToast('저장됐습니다.', 'success'); });
  document.getElementById('export-btn')?.addEventListener('click', () => exportJSON(gs));
  document.getElementById('import-btn-open')?.addEventListener('click', () => document.getElementById('import-file-input')?.click());
  document.getElementById('import-file-input')?.addEventListener('change', (e) => importJSON(e, gs));
  document.getElementById('reset-game-btn')?.addEventListener('click', () => {
    if (confirm('정말 새 게임을 시작하시겠습니까? 현재 진행이 삭제됩니다.')) {
      localStorage.removeItem('fws_save');
      window.GS = createInitialState();
      document.getElementById('log-entries').innerHTML = '<div class="log-entry log-system"><p>새 게임이 시작됐습니다.</p></div>';
      renderAll();
      document.getElementById('settings-modal').classList.add('hidden');
    }
  });
  document.getElementById('dev-add-gold')?.addEventListener('click', () => {
    gs.characters.forEach(c => c.gold += 1000);
    renderAll(); showToast('모든 캐릭터에 1000G 추가', 'success');
  });
  document.getElementById('dev-reduce-threat')?.addEventListener('click', () => {
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 20);
    renderAll(); showToast('위협도 -20', 'success');
  });
  document.getElementById('dev-add-resources')?.addEventListener('click', () => {
    gs.world.baseResources.wood += 100;
    gs.world.baseResources.iron_ore = (gs.world.baseResources.iron_ore||0) + 100;
    gs.world.baseResources.magic_crystal += 100;
    renderAll(); showToast('자재 전부 +100', 'success');
  });
}

// ─── SMART TOOLTIP POSITIONING ───────────
// Prevents tooltips from going behind the log area / top of screen.
// On mouseover we measure the element position and set CSS custom props
// which the ::after pseudo-element reads via var().
(function initSmartTooltips() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    // Flip below if element is in upper 40% of viewport (tooltip would go above screen)
    const goBelow = rect.top < viewH * 0.40;
    if (goBelow) {
      el.style.setProperty('--tt-top', '100%');
      el.style.setProperty('--tt-bottom', 'auto');
      el.style.setProperty('--tt-mt', '6px');
      el.style.setProperty('--tt-mb', '0');
    } else {
      el.style.setProperty('--tt-top', 'auto');
      el.style.setProperty('--tt-bottom', '100%');
      el.style.setProperty('--tt-mt', '0');
      el.style.setProperty('--tt-mb', '6px');
    }
    // Horizontal: keep within viewport
    const ttW = Math.min(240, 200);
    const elCX  = rect.left + rect.width / 2;
    let leftPct = '50%';
    let translateX = '-50%';
    if (elCX - ttW / 2 < 8) {
      leftPct = '0%'; translateX = '0%';
    } else if (elCX + ttW / 2 > viewW - 8) {
      leftPct = 'auto'; translateX = '0%';
      el.style.setProperty('--tt-right', '0px');
    } else {
      el.style.removeProperty('--tt-right');
    }
    el.style.setProperty('--tt-left', leftPct);
    el.style.setProperty('--tt-tx', translateX);
  });
})();

// ─── NUMBER FORMAT ───────────────────────
function numFmt(n) {
  if (n === undefined || n === null) return '0';
  return Math.floor(n).toLocaleString();
}
