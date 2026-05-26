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
  queueEl.innerHTML = `
    <div class="choice-pending-banner" onclick="openChoiceModal()">
      ⚠ <strong>${choice.title || '선택 대기 중'}</strong>
      <span style="margin-left:6px;font-size:11px;opacity:.8">클릭하여 선택하기 →</span>
    </div>
  `;
}

function openChoiceModal() {
  const gs = window.GS;
  if (!gs.pendingChoices || !gs.pendingChoices.length) return;
  const choice = gs.pendingChoices[0];

  const modal = document.getElementById('story-choice-modal');
  document.querySelector('#story-choice-modal .modal-header h3').textContent = choice.title || '선택의 기로';
  document.getElementById('story-choice-content').innerHTML = `<p>${choice.desc || ''}</p>`;

  const btnContainer = document.getElementById('story-choice-buttons');
  btnContainer.innerHTML = '';
  (choice.options || []).forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn-choice';
    btn.innerHTML = `<strong>${opt.label}</strong><br><small>${opt.desc}</small>`;
    btn.addEventListener('click', () => {
      resolveChoice(choice, opt.reward, gs);
      gs.pendingChoices.shift();
      modal.classList.add('hidden');
      renderAll();
      saveGame(gs);
    });
    btnContainer.appendChild(btn);
  });

  modal.classList.remove('hidden');
}

function resolveChoice(choice, reward, gs) {
  if (choice.type === 'party_quest') {
    resolvePartyQuest(choice.partyId, reward, gs);
  } else if (choice.type === 'guild_quest') {
    resolveGuildQuest(reward, gs);
  }
}

// ─── HEADER ──────────────────────────────
function renderHeader(gs) {
  document.getElementById('day-number').textContent = gs.day;

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

  for (const char of gs.characters) {
    const card = buildCharCard(char, gs);
    container.appendChild(card);
  }
}

function buildCharCard(char, gs) {
  const card = document.createElement('div');
  card.className = `char-card${char.isDead ? ' dead' : ''}${char.currentPartyId ? ' in-party' : ''}`;
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

  // Party badge
  const partyBadge = char.currentPartyId
    ? '<span class="party-badge">파티 중</span>'
    : '';

  const hpPct = Math.max(0, (char.hp / char.maxHp) * 100);
  const fatiguePct = char.fatigue;
  const sanityPct = char.sanity;
  const mpPct = char.maxMp > 0 ? (char.mp / char.maxMp) * 100 : 0;

  const genderLabel = char.gender === 'male' ? '♂' : char.gender === 'female' ? '♀' : '⚧';

  card.innerHTML = `
    ${partyBadge}
    <div class="char-card-header">
      <div class="char-class-icon">${char.isDead ? '💀' : icon}</div>
      <div class="char-name-block">
        <div class="char-name">${char.name}</div>
        <div class="char-sub">
          <span class="alignment-dot" style="background:${alignDef?.color || '#aaa'}"></span>
          ${genderLabel} · ${char.mbti || '?'} · ${mbtiTrait.title || '모험가'}
        </div>
      </div>
      <div class="char-gold">💰 ${numFmt(char.gold)}G</div>
    </div>
    <div style="margin:4px 0 2px">${classBadge}</div>
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
    <div class="stat-mini-row" style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
      ${Object.entries(char.stats).map(([k,v]) => `
        <div class="stat-chip" data-tooltip="${STAT_DEF[k]?.name}(${STAT_DEF[k]?.abbr}): ${v}/10&#10;${STAT_TOOLTIPS[k] || ''}" style="color:${STAT_COLORS[k]}">
          ${STAT_DEF[k]?.abbr}${v}
        </div>
      `).join('')}
    </div>
    ${effectBadges ? `<div class="char-effects">${effectBadges}</div>` : ''}
    ${char.isDead ? '<button class="memorial-btn">🕯 추모</button>' : ''}
    ${char.isRetired ? '<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:4px">🌅 은퇴</div>' : ''}
  `;

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

  let html = `
    <div class="market-news">${marketNews || '📊 시장은 오늘도 활발하게 돌아가고 있다.'}</div>
    ${anomalies ? `<div class="market-anomaly">⚠ ${anomalies}</div>` : ''}
  `;

  for (const [cat, label] of Object.entries(categories)) {
    if (!grouped[cat] || !grouped[cat].length) continue;
    html += `<div class="market-section-title">${label}</div>`;
    for (const item of grouped[cat]) {
      const priceDiff = item.currentPrice - item.prevPrice;
      const changeClass = priceDiff > 0 ? 'up' : priceDiff < 0 ? 'down' : 'neutral';
      const changeStr = priceDiff > 0 ? `▲${priceDiff}` : priceDiff < 0 ? `▼${Math.abs(priceDiff)}` : '—';
      const supplyPct = Math.min(100, (item.supplyIndex / 200) * 100);
      html += `
        <div class="market-item-row">
          <div class="market-item-name">${item.name}</div>
          <div class="supply-bar-outer" title="공급량 ${Math.round(item.supplyIndex)}">
            <div class="supply-bar-inner" style="width:${supplyPct}%;background:${supplyPct<20?'#f44336':supplyPct<50?'#ff9800':'#2196f3'}"></div>
          </div>
          <div class="market-item-price">${numFmt(item.currentPrice)}G</div>
          <div class="market-item-change ${changeClass}">${changeStr}G</div>
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
    return;
  }

  content.innerHTML = buildInventorySection(selectedChar, gs);
}

function buildInventorySection(char, gs) {
  const classDef = char.class ? CLASSES[char.class] : null;
  const equipmentHtml = Object.entries(char.equipment).map(([slot, item]) => {
    const slotName = slot === 'weapon' ? '무기' : slot === 'armor' ? '방어구' : '장신구';
    return `<div class="item-chip equipment">${slotName}: ${item ? item.name : '—'}</div>`;
  }).join('');

  const inventoryHtml = char.inventory.length
    ? char.inventory.map(it => `<div class="item-chip ${it.cat || ''}">${it.name} x${it.qty || 1}</div>`).join('')
    : '<span class="text-muted" style="font-size:12px">인벤토리 비어 있음</span>';

  const skillsHtml = char.classSkills.length
    ? char.classSkills.map(s => `<span class="skill-badge">${s}</span>`).join('')
    : '<span class="text-muted" style="font-size:12px">스킬 없음</span>';

  return `
    <div class="inventory-section">
      <div class="inventory-char-label">
        ${classDef?.icon || '🧑'} ${char.name} ${classDef ? `(${classDef.name})` : '(무직)'}
        <span style="float:right;color:var(--gold);font-weight:700">${numFmt(char.gold)}G</span>
      </div>
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">장착</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${equipmentHtml}</div>
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">소지품</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${inventoryHtml}</div>
      <div style="margin:4px 0;font-size:11px;color:var(--text-muted)">스킬</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${skillsHtml}</div>
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
      html += `
        <div class="relation-row">
          <div style="font-size:11px;min-width:70px;color:${targetDead ? 'var(--text-muted)' : 'inherit'}">
            ${targetDead ? '💀 ' : ''}${target.name}${targetDead ? '<span style="font-size:9px"> †</span>' : ''}
          </div>
          <span class="relation-type-badge">${relDef.icon} ${relDef.name}</span>
          <div class="affection-bar">
            <div class="affection-fill ${isNeg ? 'neg' : ''}" style="width:${affPct}%"></div>
          </div>
          <div class="affection-val">${rel.affection}</div>
        </div>
      `;
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

  const edges = [];
  const seenPairs = new Set();
  for (const node of nodes) {
    for (const rel of node.char.relationships) {
      const pairKey = [node.char.id, rel.targetId].sort().join('|');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const toNode = nodes.find(n => n.char.id === rel.targetId);
      if (!toNode) continue;
      edges.push({ from: node, to: toNode, rel });
    }
  }

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="display:block;max-width:${size}px;margin:auto">`;

  for (const e of edges) {
    const color = relColors[e.rel.type] || '#5a7aaa';
    const op = e.rel.affection < 0 ? 0.35 : 0.65;
    svg += `<line x1="${e.from.x.toFixed(0)}" y1="${e.from.y.toFixed(0)}" x2="${e.to.x.toFixed(0)}" y2="${e.to.y.toFixed(0)}" stroke="${color}" stroke-width="1.5" stroke-opacity="${op}"/>`;
  }

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
    html += `<div class="market-section-title">🔨 건설 가능 시설</div>`;
    for (const [bId, bDef] of availBuildings) {
      const canSlot = builtIds.length < maxB;
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
          <div class="building-desc">${bDef.desc}</div>
          <div class="building-cost">필요: ${costHtml}</div>
        </div>`;
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
    { key: 'oathBondSystem', name: '맹약 시스템', desc: 'Oath Bond 이벤트 활성화' },
    { key: 'economicRelations', name: '경제적 관계', desc: '고용·채무 관계 이벤트 활성화' },
  ],
  gameplay: [
    { key: 'statusEffectSystem', name: '상태이상 시스템', desc: '상태이상 발병 여부' },
    { key: 'storyChoices', name: '스토리 선택지', desc: '플레이어 선택지 UI 표시' },
    { key: 'characterInteraction', name: '캐릭터 상호작용', desc: '캐릭터 간 상호작용 이벤트' },
    { key: 'autoClassPromotion', name: '전직 자동 제안', desc: '조건 달성 시 전직 제안 팝업' },
    { key: 'autoStatDistribution', name: '스탯 자동 배분', desc: 'ON 시 스탯 자동 배분' },
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

// ─── NUMBER FORMAT ───────────────────────
function numFmt(n) {
  if (n === undefined || n === null) return '0';
  return Math.floor(n).toLocaleString();
}
