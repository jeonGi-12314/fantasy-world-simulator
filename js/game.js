/* ═══════════════════════════════════════
   game.js — Core Game Engine
   ═══════════════════════════════════════ */

'use strict';

// ─── NEXT DAY ALGORITHM ───────────────────
async function nextDay() {
  const gs = window.GS;
  if (gs.isRunning) return;
  if (gs.characters.length === 0) {
    showToast('캐릭터를 먼저 추가하세요!', 'warning');
    return;
  }

  // 고아 선택지 자동 정리: 알 수 없는 타입이거나 파티가 사라진 quest는 제거
  const VALID_CHOICE_TYPES = new Set(['party_quest','guild_quest','guild_announce','threat_crisis']);
  gs.pendingChoices = gs.pendingChoices.filter(c => {
    if (!VALID_CHOICE_TYPES.has(c.type)) return false;
    if (c.type === 'party_quest' && !gs.parties?.find(p => p.id === c.partyId)) return false;
    return true;
  });

  // If there are pending choices, resolve them first
  if (gs.pendingChoices.length > 0) {
    showToast('미결 선택지를 먼저 처리하세요!', 'warning');
    return;
  }

  gs.isRunning = true;
  document.getElementById('next-day-btn').disabled = true;

  try {
    gs.day++;
    const dayLogs = [];

    // 1. World threat natural drift
    processWorldThreat(gs, dayLogs);

    // 1b. Building visit effects
    processBuildings(gs, dayLogs);

    // 2. Update market demand from world state
    updateDemandFromWorld(gs);

    // 3. Process each alive character
    const aliveChars = gs.characters.filter(c => !c.isDead && !c.isRetired);

    // 3a. Guild operating costs (upkeep) — after aliveChars is defined
    processGuildUpkeep(aliveChars, gs, dayLogs);

    for (const char of aliveChars) {
      // Status effect passives
      applyStatusPassives(char, gs, dayLogs);
      // 독 등으로 HP가 0이 되면 즉시 사망 처리 (이벤트 진행 전)
      if (!char.isDead && char.hp <= 0) {
        char.isDead = true;
        char.hp = 0;
        dayLogs.push({ logClass: 'log-death', text: `💀 ${char.name}이(가) 상태이상으로 쓰러졌다...` });
        if (char.currentPartyId) leaveParty(char, gs);
      }
      if (char.isDead) continue;

      // Pick & resolve main event
      const ev = pickEvent(char, gs);
      // 이벤트 사용 기록 (반복 방지용) — 100일 이상 된 항목은 자동 삭제 (메모리 절약 + 이벤트 순환 보장)
      if (!char._eventHistory) char._eventHistory = {};
      char._eventHistory[ev.id] = gs.day;
      for (const [k, v] of Object.entries(char._eventHistory)) {
        if (gs.day - v > 100) delete char._eventHistory[k];
      }
      const result = ev.resolve(char, gs);
      if (result) result._evType = ev.type; // pass event type for MP deduction
      applyEventResult(char, gs, result, dayLogs);
    }

    // 4. Interaction events between characters
    if (gs.settings.characterInteraction && aliveChars.length >= 2) {
      processInteractions(aliveChars, gs, dayLogs);
    }

    // 4b. 자연 호감도 감소 (관계는 방치하면 서서히 약해진다)
    processAffectionDecay(aliveChars, gs);

    // 4b-2. 질투·바람 드라마 (연인/배우자 있는 캐릭터 대상)
    if (gs.settings.characterInteraction && aliveChars.length >= 2) {
      processRelationshipDrama(aliveChars, gs, dayLogs);
    }

    // 4c. 자연 이성 감소 (모험 스트레스는 매일 정신을 갉아먹는다)
    processSanityDecay(aliveChars);

    // 5. Market: apply class economic effects
    for (const char of aliveChars) {
      const mLogs = applyClassEconomicEffects(char, gs);
      dayLogs.push(...mLogs.map(l => ({ ...l, logClass: 'log-economy' })));
    }

    // 6. Recalculate market prices
    recalcMarketPrices(gs);

    // 7. Market anomaly check
    const anomalies = checkMarketAnomalies(gs);
    for (const a of anomalies) {
      dayLogs.push({ logClass: 'log-market', text: a.text });
    }

    // 8. Class promotion check (deduplicate: only queue if not already pending for this char)
    const pendingCharIds = new Set(gs.pendingPromotions.map(p => p.charId));
    for (const char of aliveChars) {
      if (!char.class && !pendingCharIds.has(char.id)) {
        const promoClass = checkClassPromotion(char);
        if (promoClass) {
          gs.pendingPromotions.push({ charId: char.id, classId: promoClass });
          pendingCharIds.add(char.id);
        }
      }
    }

    // 9. Romance & relationship updates
    processRomance(aliveChars, gs, dayLogs);

    // 9b. Guild quest check
    processGuildQuests(gs, dayLogs);

    // 9b-2. Guild master public announce (player choice)
    processGuildAnnounce(gs, dayLogs);

    // 9c. Equipment purchase attempts
    processEquipmentPurchases(aliveChars, gs, dayLogs);

    // 9c-2. Inventory management (forge / dismantle / sell excess)
    processInventoryManagement(aliveChars, gs, dayLogs);

    // 9d. Debt repayment
    processDebts(aliveChars, gs, dayLogs);

    // 9e. Skill level growth: now triggered per character level-up (see checkLevelUp)

    // 9e-2. Rare/artifact equipment passive effects
    processRareItemPassives(aliveChars, gs, dayLogs);

    // 9f. Auto-recruitment (random adventurer joins guild)
    processRecruitment(gs, dayLogs);

    // 9f-2. Threat consequences (high threat damages chars, crisis choice)
    processThreatAttack(aliveChars, gs, dayLogs);

    // 9f-2b. 계절 침공 (90일마다 마왕군 공격)
    processSeasonalRaid(aliveChars, gs, dayLogs);

    // 9f-3. MP regeneration for magic/faith classes
    processMP(aliveChars, dayLogs);

    // 9f-4. Rare market equipment offer (시장에 직접 등장)
    processRareMarketOffer(gs, dayLogs);
    processRareOfferAutoBuy(aliveChars, gs, dayLogs);

    // 9g. Luxury spending (wealthy characters splurge)
    processLuxurySpending(aliveChars, gs, dayLogs);

    // 9h. Unlock new market items based on base/building growth
    const newMarketItems = unlockMarketItems(gs);
    for (const id of newMarketItems) {
      const def = MARKET_EXTRA_ITEMS[id];
      if (def) dayLogs.push({ logClass: 'log-economy', text: `🏪 거점 성장! 시장에 새 상품 [${def.name}]이(가) 등장했다!` });
    }

    // 10. Party checks
    processParties(aliveChars, gs, dayLogs);

    // 11. Death check (already done in applyEventResult, but double-check)
    for (const char of gs.characters) {
      if (!char.isDead && char.hp <= 0) {
        char.isDead = true;
        dayLogs.push({ logClass: 'log-death', text: `💀 ${char.name}이(가) 쓰러졌다... 모험가로서의 생을 마감했다. 명복을 빈다.` });
      }
    }

    // 12. Stat growth clamp (스탯 하한만 적용 — 시뮬레이션 중 상한 없음, 초기 생성만 10 이하)
    for (const char of aliveChars) {
      for (const stat of Object.keys(char.stats)) {
        char.stats[stat] = Math.max(0, char.stats[stat]);
      }
      char.hp = Math.min(char.maxHp, Math.max(0, char.hp));
      char.mp = Math.min(char.maxMp, Math.max(0, char.mp));
      char.fatigue = Math.max(0, Math.min(100, char.fatigue));
      char.sanity = Math.max(0, Math.min(100, char.sanity));
      char.gold = Math.max(0, char.gold);

      // Sanity-based status effects
      if (char.sanity <= 10 && !char.statusEffects.includes('madness')) {
        char.statusEffects.push('madness');
        dayLogs.push({ logClass: 'log-status', text: `🌀 ${char.name}의 정신이 붕괴했다! [광기 발생]` });
      } else if (char.sanity <= 30 && !char.statusEffects.includes('confusion') && !char.statusEffects.includes('madness')) {
        char.statusEffects.push('confusion');
        dayLogs.push({ logClass: 'log-status', text: `😵 ${char.name}의 정신이 혼란스러워졌다! [혼란 발생]` });
      } else if (char.sanity >= 50) {
        const ci = char.statusEffects.indexOf('confusion');
        if (ci >= 0) { char.statusEffects.splice(ci, 1); dayLogs.push({ logClass: 'log-status', text: `${char.name}의 혼란이 해소됐다.` }); }
      }
      if (char.sanity > 30) {
        const mi = char.statusEffects.indexOf('madness');
        if (mi >= 0) { char.statusEffects.splice(mi, 1); dayLogs.push({ logClass: 'log-status', text: `${char.name}의 광기가 진정됐다.` }); }
      }
    }

    // 13. Ending check
    const ending = checkEndings(gs);

    // 14. Output to log — set flags for nextEvent detection
    gs._lastDaySpecial = dayLogs.some(l => l.logClass === 'log-special');
    gs._lastDayRomance = dayLogs.some(l => l.logClass === 'log-romance');
    renderDayLog(gs.day, dayLogs);

    // 15. Auto-save
    saveGame(gs);

    // 16. UI update
    renderAll();

    // 17. Handle pending promotions
    if (gs.pendingPromotions.length > 0) {
      setTimeout(() => showNextPromotion(), 500);
    }

    // 18. Ending — 전멸 시 항상 엔딩 모달 표시
    if (ending && !gs.endingsAchieved.includes(ending.id)) {
      gs.endingsAchieved.push(ending.id);
      setTimeout(() => showEnding(ending), 1000);
    }
  } catch (err) {
    console.error('[nextDay error]', err);
    showToast('오류가 발생했습니다: ' + err.message, 'error');
  } finally {
    gs.isRunning = false;
    document.getElementById('next-day-btn').disabled = false;
    const neb = document.getElementById('next-event-btn');
    if (neb && !window._nextEventRunning) neb.disabled = false;
  }
}

// ─── DIALOGUE HELPERS ────────────────────
// dlg(name, line) → HTML-formatted dialogue string for log text
function dlg(name, line) {
  return `<span class="dlg-name">[${name}]</span> <span class="dlg-line">"${line}"</span>`;
}
// dlgLog → push-ready log object with log-dialogue class
function dlgLog(name, line) {
  return { logClass: 'log-dialogue', text: dlg(name, line) };
}
// dlgPair → two-line dialogue as single log string
function dlgPair(name1, line1, name2, line2) {
  return { logClass: 'log-dialogue', text: `${dlg(name1, line1)}<br>${dlg(name2, line2)}` };
}

// Dialogue pools — picked randomly for natural variation
const DLG_PARTY_GREET = [
  ['함께라면 두려울 게 없겠죠.', '맞아요. 같이 해봅시다!'],
  ['드디어 파티가 꾸려졌네. 실망시키지 마.', '최선을 다하겠습니다.'],
  ['잘 부탁드려요. 서로 믿고 나아가요.', '저야말로요.'],
  ['이 파티, 강해질 거야.', '그렇게 될 수 있도록 노력할게요.'],
  ['자, 출발합시다!', '뒤처지지 않겠습니다.'],
];
const DLG_COMBAT_WIN = [
  ['해냈어! 역시 우리 팀이야.', '팀워크 덕분이지.'],
  ['치열했지만... 이겼다.', '네가 있어서 든든했어.'],
  ['다음엔 더 강한 놈을 잡아봅시다.', '벌써 다음을 생각해요?'],
];
const DLG_COMBAT_FAIL = [
  ['미안. 이번엔 내가 부족했어.', '아니야, 다들 최선을 다했잖아.'],
  ['...다음엔 이긴다.', '그래, 물러서지 말자.'],
];
const DLG_EXPLORE_WIN = [
  ['이게 다 우리 거야? 대박이다!', '조심해, 저주 걸린 것도 있을 수 있어.'],
  ['고대 유물이라니... 가슴이 두근거려.', '유적 탐험의 낭만이지.'],
];
const DLG_EXPLORE_FAIL = [
  ['함정이었잖아! 하마터면 큰일 날 뻔했어.', '빠져나왔으니 됐어. 다음엔 조심하자.'],
  ['어둠 속에서 길을 잃었었어.', '다들 무사해서 다행이야.'],
];
const DLG_DEFEND = [
  ['마을 사람들이 고마워하더라.', '이게 우리 일이야.'],
  ['오늘도 마을을 지켰어.', '다음에도 믿고 맡겨줘.'],
];
const DLG_REST = [
  ['오랜만에 쉬네. 몸이 좀 풀리는 것 같아.', '가끔은 이런 날도 필요하지.'],
  ['요즘 너무 무리했나 봐.', '쉬어가는 것도 전략이야.'],
];
const DLG_LOVER = [
  ['나는... 너 없인 안 될 것 같아.', '나도 그래. 이상하지?'],
  ['솔직히 말할게. 좋아해.', '...저도요.'],
  ['당신과 함께하는 시간이 너무 좋아요.', '나도야. 앞으로도 같이 있자.'],
  ['이 감정, 뭔지 알아?', '아마... 나도 같은 것 같아.'],
];
const DLG_MARRIAGE = [
  ['평생 함께하겠소.', '...응. 나도.'],
  ['죽을 때까지 옆에 있어 줘.', '그럼요. 약속할게요.'],
  ['당신과 함께라면 어떤 모험도 두렵지 않아요.', '...나도야. 사랑해.'],
  ['이제부터 우리 길은 하나야.', '두 손 꼭 잡아줘.'],
];
const DLG_DEBT = [
  ['이 장비가 꼭 필요한데... 조금만 빌려줄 수 있어?', '알겠어. 꼭 갚아야 해.'],
  ['잠깐 돈 좀 빌려줘. 금방 갚을게.', '...믿어볼게. 7일 안에.'],
  ['사실 지금 형편이 좀 어려워서...', '이번 한 번이야. 잊지 마.'],
  ['장비 값이 좀 모자라는데... 도와줄 수 있어?', '어쩔 수 없지. 빌려줄게.'],
];

// ─── WORLD THREAT ────────────────────────
function processWorldThreat(gs, dayLogs) {
  if (gs.settings.developerMode) return;

  // 연도별 위협 자연 증가율: 1년차 0.05/일, 2년차부터 급격히 상승
  const year = Math.floor((gs.day - 1) / 360) + 1;
  let naturalIncrease = 0.05;
  if (year >= 2) naturalIncrease = 0.12 + (year - 2) * 0.08; // 2Y:0.12, 3Y:0.20, 4Y:0.28
  if (year >= 5) naturalIncrease = 0.40; // 상한선

  // 감시탑(watchtower) 건설 시 증가 일부 상쇄
  const towerBonus = gs.world.buildings?.watchtower ? 0.5 : 0;
  gs.world.threatLevel = Math.min(100, Math.max(0, gs.world.threatLevel + naturalIncrease - towerBonus));

  // 2년차 진입 시 경고 (1회만)
  if (gs.day === 361 && !gs._year2warned) {
    gs._year2warned = true;
    dayLogs.push({ logClass: 'log-special', text: `[2년차] 마왕의 힘이 강해지고 있다. 위협의 속도가 빨라졌다. 대비가 필요하다.` });
  }
}

// ─── APPLY EVENT RESULT ───────────────────
function applyEventResult(char, gs, result, dayLogs) {
  if (!result) return;

  const fx = result.effects || {};

  // HP
  if (fx.hp) {
    char.hp = Math.min(char.maxHp, char.hp + fx.hp);
    // Clamp but allow dying
  }

  // MP
  if (fx.mp && (char.class && CLASSES[char.class]?.mpActive)) {
    char.mp = Math.min(char.maxMp, char.mp + fx.mp);
  }

  // Fatigue
  if (fx.fatigue !== undefined) char.fatigue = Math.max(0, char.fatigue + fx.fatigue);

  // Sanity
  if (fx.sanity !== undefined) char.sanity = Math.max(0, Math.min(100, char.sanity + fx.sanity));

  // Gold
  if (fx.gold) {
    char.gold = Math.max(0, char.gold + fx.gold);
    if (fx.gold > 0) gs.world.totalGoldCirculated += fx.gold;
  }

  // EXP — 1000일 기준: 0.2배 적용 (기존 100일 기준 EXP ÷ 5)
  if (fx.exp) {
    const gain = fx.exp * 0.2;
    char.exp = (char.exp || 0) + gain;
    char.totalExp = (char.totalExp || 0) + gain;  // career total (doesn't reset on level-up)
    checkLevelUp(char, gs, dayLogs);
  }

  // Action counts
  if (result.addAction) {
    for (const [act, val] of Object.entries(result.addAction)) {
      char.actionCounts[act] = (char.actionCounts[act] || 0) + (val || 0);
    }
  }

  // Stat growth (fractional, tracked internally)
  if (result.statGrow) {
    const speed = gs?.settings?.storySpeed || 1;
    for (const [stat, delta] of Object.entries(result.statGrow)) {
      if (!char._statAccum) char._statAccum = {};
      char._statAccum[stat] = (char._statAccum[stat] || 0) + delta * speed;
      if (char._statAccum[stat] >= 1.0) {
        char.stats[stat] = (char.stats[stat] || 0) + 1;
        char._statAccum[stat] -= 1.0;
        dayLogs.push({ logClass: 'log-class', text: `📈 ${char.name}의 ${STAT_DEF[stat].name}(${STAT_DEF[stat].abbr}) 스탯이 성장했다!` });
        // Update maxHp if str/end grew
        if (stat === 'str' || stat === 'end') {
          char.maxHp = 50 + char.stats.str * 5 + char.stats.end * 3;
        }
      }
    }
  }

  // Market supply
  if (result.supply) applySupplyChange(gs, result.supply);

  // Market demand
  if (result.demand) applyDemandChange(gs, result.demand);

  // World threat
  if (result.worldThreatDelta) {
    gs.world.threatLevel = Math.min(100, Math.max(0, gs.world.threatLevel + result.worldThreatDelta));
  }

  // Status add
  if (result.statusAdd && gs.settings.statusEffectSystem) {
    if (!char.statusEffects.includes(result.statusAdd)) {
      char.statusEffects.push(result.statusAdd);
    }
  }

  // Status remove
  if (result.removeStatus) {
    const idx = char.statusEffects.indexOf(result.removeStatus);
    if (idx >= 0) char.statusEffects.splice(idx, 1);
  }

  // Remove all status
  if (result.removeAllStatus) {
    char.statusEffects = [];
  }

  // Equipment drop from event
  if (result.equipDrop) {
    const drop = result.equipDrop;
    const def = EQUIPMENT_DEFS[drop.id];
    if (def) {
      const slot = def.slot;
      const current = char.equipment[slot];
      const currentTier = current ? (EQUIPMENT_DEFS[current.id]?.tier ?? -1) : -1;
      if (def.tier > currentTier) {
        equipItem(char, drop, dayLogs);
      } else {
        // 이미 좋은 장비 보유 → 인벤토리
        char.inventory.push({ id: drop.id, name: def.name, icon: def.icon, qty: 1 });
        dayLogs.push({ logClass: 'log-system', text: `🎁 ${char.name}이(가) ${def.icon} ${def.name}을(를) 획득했다. (인벤토리)` });
      }
    }
  }

  // Base resource collection
  if (result.baseResource) {
    for (const [res, amt] of Object.entries(result.baseResource)) {
      gs.world.baseResources[res] = (gs.world.baseResources[res] || 0) + amt;
    }
  }

  // MP cost for magic/faith events (mpActive classes consume MP each action)
  if (char.class && CLASSES[char.class]?.mpActive) {
    const evType = result._evType;
    if (evType === 'magic' || evType === 'faith') {
      const cost = randInt(8, 18);
      char.mp = Math.max(0, char.mp - cost);
    }
    // Passive MP recovery: 3/day baseline (processMP handles the rest)
  }

  // Log — auto-upgrade: texts with [bracket tags] → log-special (purple)
  let _autoClass = result.logClass || 'log-system';
  if (!result.logClass && result.text && /\[[^\]]{1,50}\]/.test(result.text)) {
    _autoClass = 'log-special';
  }
  dayLogs.push({ logClass: _autoClass, text: result.text, char: char.name });

  // Death check
  if (char.hp <= 0) {
    char.isDead = true;
    char.hp = 0;
    // Leave party if in one
    if (char.currentPartyId) {
      leaveParty(char, gs);
    }
  }
}

// ─── LEVEL UP ────────────────────────────
const LEVEL_CAP = 30;

function checkLevelUp(char, gs, dayLogs) {
  if (!char.level) char.level = 1;
  if (!char.statPoints) char.statPoints = 0;
  if (!char.skillLevels) char.skillLevels = {};

  let leveled = false;
  while (char.level < LEVEL_CAP) {
    const needed = expForNextLevel(char.level);
    if (char.exp < needed) break;
    char.exp -= needed;
    char.level++;
    leveled = true;
    char.statPoints += 3;

    // Auto-distribute if setting is on
    if (gs.settings.autoStatDistribution) {
      autoDistributeStats(char, 3);
    }

    // Recalculate maxHp/maxMp after potential stat changes
    char.maxHp = 50 + char.stats.str * 5 + char.stats.end * 3;
    char.maxMp = 30 + char.stats.int * 4 + Math.floor((char.stats.fai || 0) * 2);
    // Small HP bonus on level-up (reward feeling)
    char.hp = Math.min(char.hp + 10, char.maxHp);

    const spMsg = gs.settings.autoStatDistribution ? '' : ` (+3 스탯 포인트 배분 필요!)`;
    dayLogs.push({ logClass: 'log-special', text: `⬆ ${char.name}이(가) Lv.${char.level}로 레벨업!${spMsg}` });

    // 레벨업 시 스킬 1개만 1업 (첫 번째 최대치 미달 스킬)
    const _allSkills = char.classSkills || [];
    if (_allSkills.length) {
      for (const _sk of _allSkills) {
        const _skName = typeof _sk === 'object' ? _sk.name : _sk;
        const _skLvl = char.skillLevels[_skName] || 1;
        if (_skLvl < 5) {
          char.skillLevels[_skName] = _skLvl + 1;
          const _stars = '★'.repeat(_skLvl + 1) + '☆'.repeat(5 - (_skLvl + 1));
          const _bonus = SKILL_STAR_EFFECTS[_skLvl + 1] || '';
          dayLogs.push({ logClass: 'log-special', text: `✨ ${char.name}의 스킬 [${_skName}]이(가) Lv.${_skLvl + 1} ${_stars}로 성장했다!${_bonus ? ` (+효과: ${_bonus})` : ''}` });
          break;
        }
      }
    }
  }
  return leveled;
}

function autoDistributeStats(char, points) {
  const mbtiTrait = MBTI_TRAITS[char.mbti] || {};
  const mods = mbtiTrait.eventMod || { str: 0.1 };
  // Sort stats by MBTI preference descending (상한 없음 — 시뮬레이션 중 무한 성장 가능)
  const sorted = Object.entries(mods).sort((a, b) => b[1] - a[1]);
  const allStats = Object.keys(char.stats);
  for (let i = 0; i < points; i++) {
    // MBTI 선호 스탯에 라운드로빈 분배 (상한 없음)
    const preferred = sorted[i % sorted.length];
    if (preferred) {
      char.stats[preferred[0]] = (char.stats[preferred[0]] || 0) + 1;
      char.statPoints--;
    } else {
      const any = allStats[i % allStats.length];
      if (any) { char.stats[any] = (char.stats[any] || 0) + 1; char.statPoints--; }
    }
  }
}

// ─── SKILL LEVEL GROWTH ──────────────────
// Thresholds: action count needed to reach each skill level
// Level 2: 20 actions, Level 3: 60, Level 4: 150, Level 5: 350
const SKILL_THRESHOLDS = [0, 20, 60, 150, 350];

// 별 단계별 스킬 추가 효과 (UI 표시용)
const SKILL_STAR_EFFECTS = {
  2: 'MP 소모 -1 감소',
  3: '스킬 효과 +15% 향상',
  4: '한 침공에서 2회 사용 가능',
  5: 'MP 소모 -2 추가 감소 · 효과 +30% 향상',
};

function processSkillLevels(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    if (!char.class || !char.classSkills || !char.classSkills.length) continue;
    if (!char.skillLevels) char.skillLevels = {};

    const classAction = SKILL_ACTION_MAP[char.class];
    if (!classAction) continue;
    const actionCount = char.actionCounts[classAction] || 0;

    // 하루에 최대 1개 스킬만 레벨업 (가장 먼저 조건 충족된 스킬)
    for (const skill of char.classSkills) {
      // skill은 이제 {name, mpCost, effect} 객체 (또는 하위 호환 문자열)
      const skName = (typeof skill === 'object') ? skill.name : skill;
      const currentLevel = char.skillLevels[skName] || 1;
      if (currentLevel >= 5) continue;
      const threshold = SKILL_THRESHOLDS[currentLevel];
      if (actionCount >= threshold) {
        const newLevel = currentLevel + 1;
        char.skillLevels[skName] = newLevel;
        const stars = '★'.repeat(newLevel) + '☆'.repeat(5 - newLevel);
        const starBonus = SKILL_STAR_EFFECTS[newLevel] || '';
        dayLogs.push({ logClass: 'log-special', text: `✨ ${char.name}의 스킬 [${skName}]이(가) Lv.${newLevel} ${stars}로 성장했다!${starBonus ? `  (+효과: ${starBonus})` : ''}` });
        break;
      }
    }
  }
}

// ─── AUTO-RECRUITMENT ────────────────────
// 설정 ON 시 평균 30일마다 랜덤 모험가가 길드에 합류
const RECRUIT_GREETINGS = [
  '소문을 듣고 이 길드를 찾아왔습니다. 잘 부탁드립니다.',
  '이 길드라면 함께 성장할 수 있을 것 같았습니다.',
  '마을에서 길드 이야기를 들었어요. 합류해도 될까요?',
  '혼자 모험은 한계가 있죠. 길드에 힘을 보태겠습니다.',
  '이 지역 최고의 길드라고 들었습니다. 실망시키지 않겠습니다.',
];
function processRecruitment(gs, dayLogs) {
  if (!gs.settings.autoRecruitment) return;
  if (Math.random() > 1/30) return;                     // ~1/30 chance per day

  const genders   = ['male', 'female', 'other'];
  const gender    = pick(genders);
  const mbti      = pick(MBTI_LIST);
  const alignment = pick(['Light', 'Neutral', 'Neutral', 'Dark']); // Neutral more common
  const mentals   = ['stable', 'stable', 'anxious', 'determined'];
  const mental    = pick(mentals);

  // Random but valid stats (total 18-22 pts, min 1 each)
  const statKeys = ['str','int','fai','agi','cha','end'];
  const stats = {};
  statKeys.forEach(k => stats[k] = 1);
  let pool = randInt(12, 16);
  while (pool > 0) {
    const k = pick(statKeys);
    if (stats[k] < 8) { stats[k]++; pool--; }
  }

  const icons = PORTRAIT_ICONS[gender] || PORTRAIT_ICONS.male;
  const char = createCharacter({
    name: randomKrName(gender),
    gender, mbti, alignment, mental,
    portraitIcon: pick(icons),
    stats,
  });

  gs.characters.push(char);
  dayLogs.push({ logClass: 'log-special', text: `🚪 새로운 모험가 ${char.name}이(가) 길드에 합류했다! [${ALIGNMENTS[alignment].icon} ${alignment}·${mbti}]` });
  dayLogs.push(dlgLog(char.name, pick(RECRUIT_GREETINGS)));
}

// ─── LUXURY SPENDING ─────────────────────
// 자본 500G 초과 캐릭터: ~20% 확률로 과소비 발생
const LUXURY_ITEMS = [
  { name: '고급 와인', cost: [50, 120],  effect: '기분이 좋아졌다. (피로 -15, 이성 +5)'  , fat: -15, san: 5 },
  { name: '맞춤 의상', cost: [80, 200],  effect: '세련되게 차려입었다. (매력 분위기 상승)', fat:  0,  san: 4 },
  { name: '귀족 연회', cost:[120, 300],  effect: '화려한 연회를 즐겼다. (피로 -20, 이성 +5)', fat:-20, san: 5 },
  { name: '마법 장신구', cost:[100, 250], effect: '충동 구매를 했다. 기분은 좋다.',          fat:  0,  san: 5 },
  { name: '특급 여관',  cost:[60,  150], effect: '최고급 방에서 쉬었다. (HP 전회복)',        fat:-25, san: 3, hp: true },
];
function processLuxurySpending(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    const isMerchant = char.class === 'merchant';

    // 일반 캐릭터: 800G 이상 + 낮은 확률 (5~12%, 이전 15~40%에서 하향)
    // 상인 클래스: 400G 이상 or 채무로 구매 가능 (소비 성향이 높음)
    const luxThreshold = isMerchant ? 400 : 800;
    const baseChance   = isMerchant ? 0.08 : 0.04;
    const extraChance  = isMerchant
      ? Math.min(0.12, (char.gold - luxThreshold) / 3000)
      : Math.min(0.08, (char.gold - luxThreshold) / 5000);

    if (char.gold < luxThreshold && !isMerchant) continue;
    const chance = baseChance + Math.max(0, extraChance);
    if (Math.random() > chance) continue;

    const item = pick(LUXURY_ITEMS);
    const cost = randInt(item.cost[0], item.cost[1]);

    if (char.gold >= cost) {
      // 자력 구매
      char.gold -= cost;
    } else if (isMerchant && !char.debts?.length && cost - char.gold <= 150) {
      // 상인 클래스: 소액 부족 시 외상(채무) 구매
      const shortage = cost - char.gold;
      char.gold = 0;
      if (!char.debts) char.debts = [];
      char.debts.push({ creditorId: 'market', amount: shortage, remaining: shortage, dayTaken: gs.day, deadline: gs.day + 5, note: '사치품 외상' });
      dayLogs.push({ logClass: 'log-economy', text: `📝 ${char.name}이(가) 잔금 ${shortage}G를 외상으로 처리했다.` });
    } else {
      continue; // 구매 포기
    }

    char.fatigue = Math.max(0, char.fatigue + (item.fat || 0));
    char.sanity  = Math.min(100, char.sanity  + (item.san || 0));
    if (item.hp) char.hp = char.maxHp;

    // 시장 수요 반영 (사치품 구매 = 소비재 수요 상승)
    if (gs.market?.quality_meal) gs.market.quality_meal.demandIndex = Math.min(300, gs.market.quality_meal.demandIndex + 2);

    dayLogs.push({ logClass: 'log-economy', text: `💸 ${char.name}이(가) [${item.name}]에 ${cost}G를 썼다. ${item.effect}` });
  }
}

// ─── UNLOCK MARKET ITEMS ─────────────────
// 거점 레벨·건물 성장에 따라 MARKET_EXTRA_ITEMS 해금
// Returns array of newly-unlocked item IDs (empty if nothing new)
function unlockMarketItems(gs) {
  const newlyUnlocked = [];
  for (const [id, def] of Object.entries(MARKET_EXTRA_ITEMS)) {
    if (gs.market[id]) continue; // already unlocked
    const cond = def.unlock;
    if (cond.baseLevel && gs.world.baseLevel < cond.baseLevel) continue;
    if (cond.building  && !gs.world.buildings?.[cond.building]) continue;
    // Unlock it
    gs.market[id] = {
      name: def.name,
      cat: def.cat,
      basePrice: def.base,
      currentPrice: def.base,
      supplyIndex: def.supply,
      demandIndex: def.demand,
      regionFactor: 1.0,
      prevPrice: def.base,
    };
    newlyUnlocked.push(id);
  }
  return newlyUnlocked;
}

// ─── GUILD UPKEEP ────────────────────────
// 길드 운영비: 캐릭터 1인당 6G/일. 공동창고→캐릭터 순으로 차감
function processGuildUpkeep(aliveChars, gs, dayLogs) {
  if (!aliveChars.length) return;
  const perMember = 6;
  let total = aliveChars.length * perMember;

  // Deduct from townGold first
  const fromTown = Math.min(total, gs.world.townGold || 0);
  gs.world.townGold = (gs.world.townGold || 0) - fromTown;
  total -= fromTown;

  if (total <= 0) return;

  // Distribute remainder evenly from chars
  const perChar = Math.ceil(total / aliveChars.length);
  let anyPoor = false;
  for (const c of aliveChars) {
    if (c.gold >= perChar) {
      c.gold -= perChar;
    } else {
      // Can't pay — morale & sanity hit
      c.sanity = Math.max(0, c.sanity - 3);
      c.fatigue = Math.min(100, c.fatigue + 5);
      anyPoor = true;
    }
  }
  if (anyPoor) {
    dayLogs.push({ logClass: 'log-economy', text: `⚠ 길드 운영비가 부족하다. 일부 단원의 사기가 떨어졌다. (이성 -3, 피로 +5)` });
  }
}

// ─── MP REGENERATION & DAILY DRAIN ──────────
// mpActive 클래스: 매일 회복 + 일상 소모
// 그 외 직업 보유 클래스: 일상 스킬 훈련으로 소모
function processMP(aliveChars, dayLogs) {
  for (const char of aliveChars) {
    if (!char.class) continue;
    const isActive = CLASSES[char.class]?.mpActive;
    if (isActive) {
      // 마법 계열: 회복 10, 일상 마법 시전 소모 6 → 순 +4/day
      char.mp = Math.min(char.maxMp, (char.mp || 0) + 10);
      char.mp = Math.max(0, char.mp - 6);
    } else {
      // 그 외 직업: 일상 훈련·스킬 소모 (3~7 MP/day 랜덤)
      const drain = 3 + Math.floor(Math.random() * 5);
      char.mp = Math.max(0, (char.mp || 0) - drain);
    }
  }
}

// ─── THREAT ATTACK ───────────────────────
// 세계 위협도 ≥50 → 실질적 피해 발생
function processThreatAttack(aliveChars, gs, dayLogs) {
  const threat = gs.world.threatLevel;
  if (threat < 50 || !aliveChars.length) return;

  let attackChance, minDmg, maxDmg, label, sanDmg;
  if (threat >= 90) {
    attackChance = 0.55; minDmg = 25; maxDmg = 55; sanDmg = 12; label = '마왕군 대규모 공세';
  } else if (threat >= 75) {
    attackChance = 0.35; minDmg = 15; maxDmg = 35; sanDmg = 8;  label = '적군 대담한 기습';
  } else {
    attackChance = 0.15; minDmg = 8;  maxDmg = 18; sanDmg = 3;  label = '소규모 위협 사건';
  }

  if (Math.random() > attackChance) return;

  // Pick 1~2 random targets
  const targets = [...aliveChars].sort(() => Math.random() - 0.5).slice(0, threat >= 90 ? 2 : 1);
  for (const t of targets) {
    const dmg = randInt(minDmg, maxDmg);
    t.hp = Math.max(1, t.hp - dmg);
    t.sanity = Math.max(0, t.sanity - sanDmg);
    dayLogs.push({ logClass: 'log-world', text: `⚠ [${label}] ${t.name}이(가) 적의 습격을 받았다! (HP -${dmg}, 이성 -${sanDmg})` });

    // 맹약(Oath Bond) 자동 발동: 배우자가 HP 위기면 달려와 HP 분담
    if (gs.settings.oathBondSystem && t.hp < t.maxHp * 0.25) {
      const oathRel = t.relationships.find(r => r.type === 'oathbound');
      if (oathRel) {
        const protector = aliveChars.find(c => c.id === oathRel.targetId && c.hp > 30);
        if (protector) {
          const shield = Math.min(20, protector.hp - 10);
          protector.hp -= shield;
          t.hp = Math.min(t.maxHp, t.hp + shield);
          dayLogs.push({ logClass: 'log-relation', text: `🔮 [맹약 발동] ${protector.name}이(가) 위기의 ${t.name}을(를) 몸으로 막아섰다! (HP 분담 ${shield})` });
        }
      }
    }
  }

  // Crisis choice at very high threat — 최소 30일 쿨다운 (매일 스팸 방지)
  if (threat >= 90 && !gs.pendingChoices.some(c => c.type === 'threat_crisis')) {
    if (!gs.world._lastCrisisDay) gs.world._lastCrisisDay = 0;
    if (gs.day - gs.world._lastCrisisDay >= 30) {
      gs.world._lastCrisisDay = gs.day;
      gs.pendingChoices.push({
        type: 'threat_crisis',
        title: '🚨 위기 상황: 세계 위협 최고조',
        desc: `세계 위협도가 ${Math.floor(threat)}에 달했습니다. 이대로면 길드가 무너집니다. 길드장의 결단이 필요합니다.`,
        options: [
          { label: '⚔ 전원 출격 — 정면 돌파', desc: '망설일 시간이 없다. 길드 전원이 지금 당장 달려나가 상황을 뒤집는다. 피를 흘려야 할 것이다.', reward: 'assault' },
          { label: '🛡 진지 구축 — 버텨낸다', desc: '자금을 쏟아부어 방어선을 단단히 쌓는다. 충돌 없이 시간을 번다. 하지만 문제의 근원은 남는다.', reward: 'defend' },
          { label: '💰 협상 — 금화로 침묵을 산다', desc: '적에게 금화를 넘기고 잠시 평화를 빌린다. 치욕스럽지만 살아남는다. 언제까지 통할지는 모른다.', reward: 'bribe' },
          { label: '🙏 신에게 맡긴다', desc: '인간의 힘이 닿지 않는 곳이라면 신이 뜻을 보여줄지도 모른다. 결과는 길드원의 믿음에 달려 있다.', reward: 'pray' },
        ],
      });
      dayLogs.push({ logClass: 'log-world', text: `🚨 긴급! 길드장의 결단을 기다립니다!` });
    }
  }
}

// ─── THREAT CRISIS RESOLVER ──────────────
function resolveThreatCrisis(reward, gs) {
  const alive = gs.characters.filter(c => !c.isDead && !c.isRetired);
  const logs = [];

  if (reward === 'assault') {
    alive.forEach(c => { c.hp = Math.max(1, c.hp - 25); c.actionCounts.combat = (c.actionCounts.combat||0)+3; });
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 15);
    logs.push({ logClass: 'log-world', text: `⚔ 길드 전원이 출격했다! 치열한 전투 끝에 위협을 밀어냈다. (전원 HP -25, 위협도 -15)` });
  } else if (reward === 'defend') {
    const cost = 300;
    const pool = gs.world.townGold || 0;
    if (pool >= cost) {
      gs.world.townGold -= cost;
    } else {
      const shortage = cost - pool;
      gs.world.townGold = 0;
      const topChar = alive.slice().sort((a,b) => b.gold - a.gold)[0];
      if (topChar) topChar.gold = Math.max(0, topChar.gold - shortage);
    }
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 10);
    logs.push({ logClass: 'log-world', text: `🛡 방어 시설을 보강했다. 위협이 다소 잦아들었다. (300G 소비, 위협도 -10)` });
  } else if (reward === 'bribe') {
    const cost = 500;
    let paid = 0;
    for (const c of alive.sort((a,b) => b.gold - a.gold)) {
      const take = Math.min(c.gold, cost - paid);
      c.gold -= take; paid += take;
      if (paid >= cost) break;
    }
    if ((gs.world.townGold||0) > 0 && paid < cost) {
      const take = Math.min(gs.world.townGold, cost - paid);
      gs.world.townGold -= take; paid += take;
    }
    const reduction = paid >= cost ? 12 : Math.floor(paid / cost * 8);
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - reduction);
    logs.push({ logClass: 'log-economy', text: `💰 ${paid}G를 지불해 잠시 평화를 샀다. (위협도 -${reduction})` });
  } else if (reward === 'pray') {
    const cleric = alive.find(c => c.class === 'cleric' || c.class === 'paladin');
    if (cleric) {
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 18);
      logs.push({ logClass: 'log-world', text: `✝ ${cleric.name}이(가) 신에게 간절히 기도했다. 신성한 결계가 펼쳐지며 위협이 크게 물러났다. (위협도 -18)` });
      logs.push(dlgLog(cleric.name, '신이시여... 이 땅을 지켜주소서.'));
    } else {
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 3);
      logs.push({ logClass: 'log-world', text: `🙏 길드원들이 기도를 올렸지만 성직자가 없어 효과가 미미했다. (위협도 -3)` });
    }
  }

  appendToLog(logs);
}

// ─── RARE MARKET OFFER ───────────────────
// 약 30일마다 전설급 장비가 시장에 등장 (선택지 없이 자동 표시, 10일간 유효)
function processRareMarketOffer(gs, dayLogs) {
  // 만료된 offer 정리
  if (gs.world.rareOffer && gs.day > gs.world.rareOffer.expiresDay) {
    dayLogs.push({ logClass: 'log-economy', text: `🛒 행상인이 [${gs.world.rareOffer.item.name}]을(를) 팔지 못하고 떠났다.` });
    gs.world.rareOffer = null;
  }

  if (gs.world.rareOffer) return; // 이미 offer 중
  if ((gs.world.baseLevel || 1) < 2) return;
  if (!gs.world._lastRareOffer) gs.world._lastRareOffer = 0;
  if (gs.day - gs.world._lastRareOffer < 25) return;
  if (Math.random() > 1 / 30) return;

  gs.world._lastRareOffer = gs.day;
  const item = pick(RARE_EQUIPMENT_OFFERS);
  gs.world.rareOffer = { item, expiresDay: gs.day + 10 };
  dayLogs.push({ logClass: 'log-economy', text: `🌟 행상인이 전설급 장비 [${item.icon}${item.name}]을(를) 들고 나타났다! 시장에서 ${item.price.toLocaleString()}G에 구매 가능. (${10}일 한정)` });
}

// ─── RARE MARKET RESOLVER ────────────────
function resolveRareMarketOffer(reward, choice, gs) {
  const item = choice.itemData;
  if (!item) return;
  const alive = gs.characters.filter(c => !c.isDead && !c.isRetired);
  const logs = [];

  const doEquip = (price) => {
    // Find character with best gold or best slot match
    let buyer = alive.slice().sort((a,b) => b.gold - a.gold)[0];
    // Prefer char whose slot is empty or lower tier
    const slotTarget = alive.find(c => !c.equipment?.[item.slot]);
    if (slotTarget) buyer = slotTarget;

    if (!buyer || buyer.gold < price) {
      // Try guild fund
      if ((gs.world.townGold||0) >= price) {
        gs.world.townGold -= price;
        if (buyer) {
          buyer.equipment = buyer.equipment || {};
          buyer.equipment[item.slot] = { id: item.id, name: item.name, icon: item.icon };
          buyer._equipBonuses = buyer._equipBonuses || {};
          for (const [k,v] of Object.entries(item.bonus)) buyer._equipBonuses[k] = (buyer._equipBonuses[k]||0) + v;
          buyer.maxHp = 50 + ((buyer.stats.str||0) + (buyer._equipBonuses?.str||0)) * 5 + ((buyer.stats.end||0) + (buyer._equipBonuses?.end||0)) * 3;
          logs.push({ logClass: 'log-special', text: `${item.icon} 공동 창고의 금화로 [${item.name}]을(를) 구매! ${buyer.name}이(가) 장착했다.` });
        }
      } else {
        logs.push({ logClass: 'log-economy', text: `💸 자금이 부족해 [${item.name}] 구매에 실패했다.` });
      }
      return;
    }
    buyer.gold -= price;
    buyer.equipment = buyer.equipment || {};
    buyer.equipment[item.slot] = { id: item.id, name: item.name, icon: item.icon };
    buyer._equipBonuses = buyer._equipBonuses || {};
    for (const [k,v] of Object.entries(item.bonus)) buyer._equipBonuses[k] = (buyer._equipBonuses[k]||0) + v;
    buyer.maxHp = 50 + ((buyer.stats.str||0) + (buyer._equipBonuses?.str||0)) * 5 + ((buyer.stats.end||0) + (buyer._equipBonuses?.end||0)) * 3;
    logs.push({ logClass: 'log-special', text: `${item.icon} ${buyer.name}이(가) 전설급 장비 [${item.name}]을(를) ${price}G에 구매했다! 장착 완료.` });
  };

  if (reward === 'buy') {
    doEquip(item.price);
  } else if (reward === 'haggle') {
    const topChar = alive.slice().sort((a,b) => b.gold - a.gold)[0];
    const chaRoll = topChar ? roll(topChar, 'cha') : 30;
    if (chaRoll >= 60) {
      const discounted = Math.floor(item.price * 0.8);
      logs.push({ logClass: 'log-economy', text: `🗣 흥정 성공! [${item.name}]을(를) ${discounted.toLocaleString()}G(20% 할인)에 구매할 수 있다!` });
      doEquip(discounted);
    } else {
      logs.push({ logClass: 'log-economy', text: `😤 흥정 실패. 행상인이 기분 나빠 자리를 떴다. 기회를 놓쳤다.` });
    }
  } else {
    logs.push({ logClass: 'log-system', text: `👋 행상인을 돌려보냈다.` });
  }

  appendToLog(logs);
}

// ─── STATUS PASSIVES ─────────────────────
function applyStatusPassives(char, gs, dayLogs) {
  if (char.statusEffects.includes('poison')) {
    const dmg = 3; // 5 → 3, 치명도 완화
    char.hp = Math.max(0, char.hp - dmg);
    // 8% 자연 해독 (성당 방문 없이도 생존 가능)
    if (Math.random() < 0.08) {
      char.statusEffects.splice(char.statusEffects.indexOf('poison'), 1);
      dayLogs.push({ logClass: 'log-status', text: `✨ ${char.name}의 중독이 자연적으로 해독됐다.` });
    } else {
      dayLogs.push({ logClass: 'log-status', text: `☠ ${char.name}의 중독이 진행됐다. (HP -${dmg})` });
    }
  }
  if (char.statusEffects.includes('charmed')) {
    const target = getCharmedTarget(char, gs);
    if (target) {
      const goldStolen = randInt(5, 20);
      char.gold = Math.max(0, char.gold - goldStolen);
      target.gold += goldStolen;
      dayLogs.push({ logClass: 'log-status', text: `💕 ${char.name}이(가) 홀림에 취해 ${target.name}에게 ${goldStolen}G를 무의식적으로 줬다.` });
    }
    if (Math.random() < 0.3) {
      const idx = char.statusEffects.indexOf('charmed');
      if (idx >= 0) { char.statusEffects.splice(idx, 1); dayLogs.push({ logClass: 'log-status', text: `${char.name}의 홀림이 풀렸다.` }); }
    }
  }
  // Curse wears off naturally over time (5% per day)
  if (char.statusEffects.includes('curse') && Math.random() < 0.05) {
    const idx = char.statusEffects.indexOf('curse');
    if (idx >= 0) { char.statusEffects.splice(idx, 1); dayLogs.push({ logClass: 'log-status', text: `✨ ${char.name}의 저주가 자연적으로 풀렸다.` }); }
  }
  // Fear wears off (20% per day)
  if (char.statusEffects.includes('fear') && Math.random() < 0.2) {
    const idx = char.statusEffects.indexOf('fear');
    if (idx >= 0) { char.statusEffects.splice(idx, 1); dayLogs.push({ logClass: 'log-status', text: `${char.name}의 공포가 사라졌다.` }); }
  }
}

function getCharmedTarget(char, gs) {
  return gs.characters.find(c => c.id !== char.id && !c.isDead) || null;
}

// ─── 날짜 헬퍼 ───────────────────────────
// 1년 = 4계절 × 90일 = 360일
const SEASON_NAMES  = ['봄', '여름', '가을', '겨울'];
const SEASON_EMOJI  = ['🌸', '☀', '🍂', '❄'];
function getDayDate(day) {
  const yearLen   = 360;
  const seasonLen = 90;
  const year      = Math.ceil(day / yearLen);
  const dayInYear = ((day - 1) % yearLen) + 1;
  const seasonIdx = Math.floor((dayInYear - 1) / seasonLen);
  const dayInSeason = ((dayInYear - 1) % seasonLen) + 1;
  return {
    year, seasonIdx,
    season: SEASON_NAMES[seasonIdx],
    seasonEmoji: SEASON_EMOJI[seasonIdx],
    dayInSeason,
    isSeasonEnd: dayInSeason === seasonLen,
    label: `${year}년 ${SEASON_EMOJI[seasonIdx]}${SEASON_NAMES[seasonIdx]} ${dayInSeason}일`,
  };
}

// ─── 희귀·유물 장비 패시브 효과 테이블 ─────────────────────────
// trigger: 하루당 발동 확률. effect(c, gs, dayLogs) → string (로그 텍스트)
const RARE_ITEM_PASSIVES = {
  blade_ignis:  {
    trigger: 0.22,
    effect: (c, gs) => { const g = randInt(5, 12); c.gold += g; return `🔥 ${c.name}의 [이그니스]가 빛났다. 소각된 잔해에서 ${g}G를 찾았다.`; },
  },
  frost_arbor:  {
    trigger: 0.18,
    effect: (c, gs) => { gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 1); return `❄ ${c.name}의 [프로스트]가 적군을 얼렸다. (위협도 -1)`; },
  },
  shadow_fang:  {
    trigger: 0.25,
    effect: (c, gs) => { const g = randInt(8, 18); c.gold += g; return `🌑 ${c.name}이(가) [섀도팽]의 힘으로 암거래 정보를 팔았다. (+${g}G)`; },
  },
  storm_bow:    {
    trigger: 0.20,
    effect: (c, gs) => { if (gs.market?.travel_food) gs.market.travel_food.supplyIndex = Math.min(300, gs.market.travel_food.supplyIndex + 5); return `🌪 ${c.name}의 [스톰레인]이 바람을 타고 보급로를 개척했다. (식량 공급 +5)`; },
  },
  divine_plate: {
    trigger: 0.20,
    effect: (c, gs) => {
      const party = gs.parties?.find(p => p.memberIds?.includes(c.id));
      const targets = party ? gs.characters.filter(x => party.memberIds.includes(x.id) && !x.isDead) : [c];
      targets.forEach(t => { t.hp = Math.min(t.maxHp, t.hp + 8); });
      return `✨ ${c.name}의 [세라피엘]에서 신성한 빛이 흘렀다. 파티원 HP +8.`;
    },
  },
  shadow_robe:  {
    trigger: 0.18,
    effect: (c, gs) => { c.sanity = Math.min(100, c.sanity + 5); return `🌑 ${c.name}의 [나이트쉐이드]가 정신을 보호했다. (이성 +5)`; },
  },
  crown_of_dawn:{
    trigger: 0.15,
    effect: (c, gs) => {
      gs.characters.filter(x => !x.isDead).forEach(x => { x.sanity = Math.min(100, x.sanity + 3); x.fatigue = Math.max(0, x.fatigue - 3); });
      return `👑 ${c.name}의 [다운크라운]이 여명을 불렀다. 길드원 전체 이성 +3, 피로 -3.`;
    },
  },
  ring_void:    {
    trigger: 0.18,
    effect: (c, gs) => { c.mp = Math.min(c.maxMp, c.mp + 10); return `💍 [보이드링]에서 마력이 솟았다. ${c.name} MP +10.`; },
  },
  cape_tempest: {
    trigger: 0.22,
    effect: (c, gs) => { c.fatigue = Math.max(0, c.fatigue - 10); return `🧣 [템페스트]의 바람이 ${c.name}의 피로를 씻어냈다. (피로 -10)`; },
  },
};

// 희귀 장비 패시브 처리 — 매일 호출
function processRareItemPassives(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    if (!char.equipment) continue;
    for (const slot of Object.values(char.equipment)) {
      if (!slot?.id) continue;
      const passive = RARE_ITEM_PASSIVES[slot.id];
      if (!passive) continue;
      if (Math.random() < passive.trigger) {
        const text = passive.effect(char, gs);
        if (text) dayLogs.push({ logClass: 'log-special', text });
      }
    }
    // ── 인벤토리 희귀/유물/금지 소지 효과 ──
    processInventoryItemPassives(char, gs, dayLogs);
  }
}

// 인벤토리 아이템 카테고리별 소지 효과 (5일마다 발동)
function processInventoryItemPassives(char, gs, dayLogs) {
  if (!char.inventory?.length) return;
  if (gs.day % 5 !== (char.id ? char.id.charCodeAt(0) % 5 : 0)) return; // 5일 주기 분산

  const inv = char.inventory;
  const hasRare     = inv.some(it => (gs.market[it.id]?.cat || it.cat) === 'rare');
  const hasArtifact = inv.some(it => (gs.market[it.id]?.cat || it.cat) === 'artifact');
  const hasForbid   = inv.some(it => (gs.market[it.id]?.cat || it.cat) === 'forbidden');

  if (hasRare) {
    // 희귀품 소지: 마법 공명 — mpActive 캐릭터 MP+5, 그 외 이성+1
    if (CLASSES[char.class]?.mpActive) {
      char.mp = Math.min(char.maxMp, (char.mp || 0) + 5);
      dayLogs.push({ logClass: 'log-special', text: `💎 ${char.name}이 소지한 희귀 결정이 마력과 공명했다. (MP +5)` });
    } else {
      char.sanity = Math.min(100, char.sanity + 1);
    }
  }

  if (hasArtifact) {
    // 유물 소지: 고대의 지혜 — EXP +3, 이성 +1
    char.exp = (char.exp || 0) + 3;
    char.sanity = Math.min(100, char.sanity + 1);
    dayLogs.push({ logClass: 'log-special', text: `🏺 ${char.name}이 보유한 유물에서 고대의 지혜가 흘러나왔다. (EXP +3, 이성 +1)` });
  }

  if (hasForbid) {
    // 금지 재료 소지: 이성 서서히 잠식 또는 어둠의 힘 발현
    if (Math.random() < 0.6) {
      char.sanity = Math.max(0, char.sanity - 2);
      dayLogs.push({ logClass: 'log-system', text: `💀 ${char.name}이(가) 봉인된 재료의 어두운 기운에 잠식되고 있다. (이성 -2)` });
    } else {
      // 어둠의 힘으로 잠깐 강화
      char.stats.str = (char.stats.str || 0) + 1;
      // 임시: 이후 회복 (다음 날 원상복귀 X — 간단히 로그만)
      dayLogs.push({ logClass: 'log-system', text: `🌑 ${char.name}이(가) 금지된 힘에 잠시 눈을 떴다. (STR 일시 고취)` });
    }
  }
}

// ─── 전투 스킬 테이블 (전역) — 계절 침공 및 인벤토리 참조 ───
// mpCost: 라운드당 MP 소모 / atkBonus: 적 처치력 보너스 / defRed: 피해 감소(0~1)
// evade: 완전 회피율 / healAll: 아군 전체 HP 회복량 / buffAll: 아군 전체 공격력 버프
const RAID_SKILL_TABLE = {
  warrior: {
    name: '대검 휘두르기', mpCost: 8, atkBonus: 14, defRed: 0.10,
    effect: '방어 관통 — 스킬 사용 시 적 방어를 무력화하고 전열을 강타',
    flavor: ['전신의 힘을 실어 적의 방어를 박살냈다', '기합과 함께 대검을 휘둘러 적 대열을 쓸어냈다', '마왕군 전사 3명을 한 번에 베어냈다'],
  },
  knight: {
    name: '방패 결의', mpCost: 6, atkBonus: 6, defRed: 0.28,
    effect: '철벽 수호 — 아군을 뒤에 두고 피해 28% 경감, 전선 유지',
    flavor: ['방패를 앞세워 아군 전원을 등 뒤에 두고 적의 파도를 막아냈다', '흔들리지 않는 자세로 전선을 굳게 지켰다', '갑옷이 움푹 파일 때까지 꼼짝도 하지 않았다'],
  },
  mage: {
    name: '파이어볼', mpCost: 20, atkBonus: 22, defRed: 0.00,
    effect: '광역 폭발 — 방어 무시. 적 전열을 화염으로 쑥대밭으로',
    flavor: ['두 손에 집중된 마력이 폭발하며 적 전열을 불바다로 만들었다', '하늘을 가르는 불꽃 구체가 적진 한가운데서 터졌다', '열기가 전장을 집어삼켰다. 적 대열이 흩어졌다'],
  },
  sage: {
    name: '시간 정지술', mpCost: 15, atkBonus: 17, defRed: 0.10,
    effect: '적 행동 봉쇄 — 시간을 멈춰 적을 무력화한 뒤 급소 타격',
    flavor: ['순간 시간의 흐름이 멈췄다. 얼어붙은 적들 사이를 천천히 걸으며 급소를 찔렀다', '고대 봉인술로 적 마법사를 무력화시킨 뒤 허점을 공격했다'],
  },
  necromancer: {
    name: '언데드 소환', mpCost: 18, atkBonus: 15, defRed: 0.05,
    effect: '후방 교란 — 쓰러진 적을 아군으로 전환, 공포로 적 대열 와해',
    flavor: ['쓰러진 적의 영혼을 강제로 소환해 아군으로 전환시켰다', '죽음의 기운이 파동치며 언데드 군단이 마왕군 후방을 공격했다', '공포의 기운이 마왕군의 대열을 흩트렸다'],
  },
  cleric: {
    name: '신성 결계', mpCost: 12, atkBonus: 4, defRed: 0.28, healAll: 12,
    effect: '신성 결계 — 아군 전체 HP +12 회복, 피해 28% 경감, 언데드 소멸',
    flavor: ['신성한 빛이 아군 전체를 감쌌다. 상처들이 천천히 아물었다', '기도와 함께 결계가 펼쳐지며 언데드들이 빛 속에 소멸됐다', '아군에게 신의 가호를 부여한 뒤 성스러운 빛으로 돌격했다'],
  },
  paladin: {
    name: '성스러운 일격', mpCost: 10, atkBonus: 12, defRed: 0.20,
    effect: '대악 특효 — 성검에 신성력을 실어 악의 존재에 두 배 위력',
    flavor: ['성검에 신성력을 불어넣어 마왕군 정예 지휘관을 베어냈다', '빛나는 검격이 어둠의 존재들을 연속으로 소멸시켰다', '검과 방패를 동시에 활용해 공수를 균형 있게 펼쳤다'],
  },
  rogue: {
    name: '암습', mpCost: 8, atkBonus: 18, defRed: 0.00, evade: 0.30,
    effect: '30% 완전 회피 — 그림자 속으로 소멸 후 지휘관 급소를 노림',
    flavor: ['눈 깜짝할 새 그림자 속으로 사라졌다가 지휘관 뒤에서 나타났다', '독이 묻은 단검이 적 지휘계통의 목을 노렸다', '아무도 보지 못한 순간에 치명타가 작렬했다'],
  },
  ranger: {
    name: '연속 사격', mpCost: 7, atkBonus: 14, defRed: 0.06,
    effect: '원거리 정밀 타격 — 5연속 사격으로 후위를 엄호하며 적 제압',
    flavor: ['한 치의 흔들림도 없이 5발을 연속으로 발사해 척후대를 제압했다', '고지에 자리를 잡고 후방에서 아군을 엄호하며 적을 쓰러뜨렸다', '바람을 읽으며 멀리 있는 적 마법사를 정확히 꿰뚫었다'],
  },
  druid: {
    name: '가시덤불 소환', mpCost: 10, atkBonus: 10, defRed: 0.16,
    effect: '지형 제압 — 거대 가시덤불로 진격로를 막아 피해 16% 경감',
    flavor: ['발 구르기 한 번에 거대한 가시덤불이 솟아올라 적의 진격로를 막았다', '자연의 힘으로 지형을 바꿔 적을 함정에 빠뜨렸다', '식물의 장벽이 적의 돌격을 완전히 저지했다'],
  },
  bard: {
    name: '전투가', mpCost: 8, atkBonus: 5, defRed: 0.10, buffAll: 6,
    effect: '사기 고취 — 전투가로 아군 전체 공격력 +6, 피해 10% 경감',
    flavor: ['전장을 울리는 전투가가 아군 전원의 피를 끓게 했다', '사기를 드높이는 멜로디가 마왕군의 기세를 꺾었다', '노래 한 소절에 동료들이 두 배의 힘을 발휘했다'],
  },
  merchant: {
    name: '군수 보급', mpCost: 6, atkBonus: 4, defRed: 0.10, healAll: 8,
    effect: '현장 보급 — 포션 배급으로 아군 전체 HP +8 회복, 전투력 유지',
    flavor: ['전선에 물자를 신속히 배급해 아군의 체력을 유지시켰다', '부상당한 동료들에게 포션을 나눠주며 전투력을 끌어올렸다', '보급선을 확보해 장기전에서 유리한 고지를 점했다'],
  },
};

// ─── 계절 침공: 계절 마지막 날 마왕군 공격 ───
function processSeasonalRaid(aliveChars, gs, dayLogs) {
  const d = getDayDate(gs.day);
  if (!d.isSeasonEnd) return;

  const threat = gs.world.threatLevel || 0;
  const BORDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  dayLogs.push({ logClass: 'log-battle', text: BORDER });
  dayLogs.push({ logClass: 'log-battle', text: `${d.seasonEmoji} [${d.label}] 마왕군 계절 침공! 세계 위협도: ${Math.floor(threat)}` });

  if (threat < 10) {
    dayLogs.push({ logClass: 'log-battle', text: `✅ 위협도가 낮아 마왕군이 접근조차 못했다. 이번 ${d.season}은 평화롭게 마무리됐다.` });
    dayLogs.push({ logClass: 'log-battle', text: BORDER });
    return;
  }

  if (!aliveChars.length) {
    dayLogs.push({ logClass: 'log-battle', text: `🔥 맞설 길드원이 없다! 마을이 무방비로 함락됐다!` });
    gs.world.threatLevel = Math.min(100, threat + 20);
    gs.world.townGold    = Math.max(0, (gs.world.townGold || 0) - 300);
    dayLogs.push({ logClass: 'log-battle', text: BORDER });
    return;
  }

  // ── 텍스트 HP바 ──
  const battleBar = (cur, max, len = 12) => {
    const filled = Math.max(0, Math.round((Math.max(0, cur) / max) * len));
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  };

  // ── 연도별 침공 스케일 (점진적 난이도 상승) ──
  const _raidYear = d.year;
  const _yearScale = 1.0 + (_raidYear - 1) * 0.45; // 1년차: 1.0×, 2년차: 1.45×, 3년차: 1.9×, ...
  const _maxRounds = Math.min(6, 3 + Math.floor((_raidYear - 1) * 0.8)); // 1년차:3, 2년차:3-4, 3년차:4, 4년차:5, 5년차+:6
  dayLogs.push({ logClass: 'log-battle', text: `  [${_raidYear}년차 침공] 난이도 배율 ×${_yearScale.toFixed(1)} / 최대 ${_maxRounds}라운드` });

  const enemyTotal = Math.floor(threat * 4.5 * _yearScale);
  let remainingEnemyHP = enemyTotal;

  // ── 침공 전 마나 소모 (전투 집결·준비 과정) ──
  for (const char of aliveChars) {
    if (!char.class || !CLASSES[char.class]?.mpActive) continue;
    const preDrain = Math.floor(char.maxMp * (0.25 + Math.random() * 0.25)); // 25~50% 소모
    char.mp = Math.max(0, (char.mp || 0) - preDrain);
  }

  dayLogs.push({ logClass: 'log-battle', text: `  [적 전력] ${battleBar(remainingEnemyHP, enemyTotal)} ${remainingEnemyHP}/${enemyTotal}  |  아군 ${aliveChars.length}명 응전` });

  let activeFighters = aliveChars.filter(c => !c.isDead);

  // ── 연도별 최대 라운드 전투 ──
  const MAX_ROUNDS = _maxRounds;
  // 침공 전체에서 스킬을 이미 사용한 캐릭터 추적 (한 침공당 스킬 1회 제한)
  const usedSkillsThisInvasion = new Set();
  for (let round = 1; round <= MAX_ROUNDS && activeFighters.length > 0 && remainingEnemyHP > 0; round++) {
    dayLogs.push({ logClass: 'log-battle', text: `  ▶ ${round}라운드  [적 잔여: ${battleBar(remainingEnemyHP, enemyTotal)} ${Math.max(0, remainingEnemyHP)}/${enemyTotal}]` });

    // 버프/힐 선계산 (MP 보유 시에만, 클래스별 중복 적용 방지 + 이번 침공 미사용자만)
    let buffAll = 0, healAll = 0;
    const buffSources = [], healSources = [];
    const _preUsedClasses = new Set();
    for (const c of activeFighters) {
      const sk = RAID_SKILL_TABLE[c.class];
      if (!sk || _preUsedClasses.has(c.class) || usedSkillsThisInvasion.has(c.id)) continue;
      _preUsedClasses.add(c.class);
      if (sk.buffAll && c.mp >= sk.mpCost) { buffAll += sk.buffAll; buffSources.push(`${c.name}(+${sk.buffAll})`); }
      if (sk.healAll && c.mp >= sk.mpCost) { healAll += sk.healAll; healSources.push(`${c.name}(+${Math.round(sk.healAll)})`); }
    }

    // 버프/힐 라운드 공지 (시전자 표시)
    if (buffAll > 0) dayLogs.push({ logClass: 'log-battle', text: `    ♪ 아군 사기 고취! 전원 공격력 +${buffAll}  [${buffSources.join(' · ')}]` });
    if (healAll > 0) dayLogs.push({ logClass: 'log-battle', text: `    ✨ 신성 치유 발동! 전원 HP +${Math.round(healAll)} 회복  [${healSources.join(' · ')}]` });

    // 이번 라운드 내 클래스 중복 방지 (같은 라운드 내 동일 클래스 2인 시)
    const usedClassesThisRound = new Set();

    const nextFighters = [];
    for (const char of activeFighters) {
      const classSk  = RAID_SKILL_TABLE[char.class];
      const hasMp    = classSk && char.mp >= classSk.mpCost;
      const icon     = char.class ? (CLASSES[char.class]?.icon || '⚔') : '🗡';

      // 아군 힐 적용
      if (healAll > 0) char.hp = Math.min(char.maxHp, char.hp + Math.round(healAll));

      // ── 스킬/무기 결정 ──
      let sk, mpUsed = 0, actionLabel;
      // 스킬 사용 가능 여부: MP 충분 + 이번 침공 미사용 + 이번 라운드 동일 클래스 미사용
      const canUseSkill = classSk && hasMp
        && !usedSkillsThisInvasion.has(char.id)
        && !usedClassesThisRound.has(char.class);
      if (canUseSkill) {
        // 직업 스킬 사용 (침공당 1회)
        sk = classSk;
        mpUsed = sk.mpCost;
        char.mp -= mpUsed;
        usedSkillsThisInvasion.add(char.id);
        usedClassesThisRound.add(char.class);
        actionLabel = `⚡MP -${mpUsed}(잔여:${char.mp})`;
      } else if (classSk) {
        // 직업 있지만 스킬 재사용 불가 (이미 사용 or MP부족 or 동료 선행) → 기본 타격
        const wpDef = char.equipment?.weapon ? EQUIPMENT_DEFS[char.equipment.weapon.id] : null;
        const wpBonus = wpDef ? (wpDef.bonus.str || 0) + (wpDef.bonus.int || 0) : 0;
        const _dupReason = usedSkillsThisInvasion.has(char.id) ? '스킬 사용 완료'
          : usedClassesThisRound.has(char.class) ? '동료 선행 사용' : 'MP부족';
        sk = { name: char.equipment?.weapon?.name || '맨손', mpCost: 0, atkBonus: 4 + wpBonus, defRed: 0.0, evade: 0,
               flavor: ['필사적으로 버텼다', '쓰러지지 않겠다는 의지로 싸웠다', '직접 몸으로 막아냈다'] };
        actionLabel = `${_dupReason} — ${char.equipment?.weapon?.name || '맨손'}으로 공격`;
      } else {
        // 직업 없음 → 장착 무기로 공격
        const wpItem = char.equipment?.weapon;
        const wpDef  = wpItem ? EQUIPMENT_DEFS[wpItem.id] : null;
        const wpName = wpDef?.name || wpItem?.name || '맨손';
        const wpBonus = wpDef ? (wpDef.bonus.str || 0) * 2 : 0;
        sk = { name: wpName, mpCost: 0, atkBonus: 5 + wpBonus, defRed: 0.0, evade: 0,
               flavor: wpItem
                 ? [`${wpName}을(를) 힘껏 휘둘렀다`, `무기를 믿고 전열에 뛰어들었다`, `${wpName}으로 적 병사를 격파했다`]
                 : ['맨손으로 필사적으로 싸웠다', '무기가 없어도 의지만으로 버텼다'] };
        actionLabel = wpItem ? `${wpName}으로 공격` : '맨손 공격';
      }

      // 공격력 계산
      const statAtk = (char.stats.str || 0) + (char.stats.int || 0) * 0.8
                    + (char.stats.fai || 0) * 0.4 + (char.level || 1);
      const charAtk = Math.round(sk.atkBonus + statAtk + buffAll);
      remainingEnemyHP -= charAtk;

      // 받는 피해 (연도별 스케일 적용)
      const spreadDiv = Math.sqrt(activeFighters.length);
      const baseDmg   = Math.max(2, Math.round((threat * 0.9 * _yearScale + randInt(3, 12)) / spreadDiv));

      char.actionCounts = char.actionCounts || {};
      char.actionCounts.combat = (char.actionCounts.combat || 0) + 1;

      const flavor = pick(sk.flavor);

      // 회피 판정
      if (sk.evade && Math.random() < sk.evade) {
        const remEv = Math.max(0, remainingEnemyHP);
        dayLogs.push({ logClass: 'log-battle', text: `  ${icon} ${char.name}  (${actionLabel})  [${sk.name}]` });
        dayLogs.push({ logClass: 'log-battle', text: `    ↳ ${flavor}` });
        dayLogs.push({ logClass: 'log-battle', text: `    ✦ 완전 회피! 마왕군 피해 -${charAtk}  [${battleBar(remEv, enemyTotal)}] ${remEv}/${enemyTotal}` });
        dayLogs.push({ logClass: 'log-battle', text: `    ${char.name} HP (${char.hp}/${char.maxHp})` });
        nextFighters.push(char);
        continue;
      }

      const dmg = Math.max(1, Math.round(baseDmg * (1 - (sk.defRed || 0))));
      char.hp  -= dmg;
      char.fatigue = Math.min(100, char.fatigue + randInt(8, 16));

      const remAtk = Math.max(0, remainingEnemyHP);
      dayLogs.push({ logClass: 'log-battle', text: `  ${icon} ${char.name}  (${actionLabel})  [${sk.name}]` });
      dayLogs.push({ logClass: 'log-battle', text: `    ↳ ${flavor}` });
      dayLogs.push({ logClass: 'log-battle', text: `    ⚔ 마왕군 피해 -${charAtk}  [${battleBar(remAtk, enemyTotal)}] ${remAtk}/${enemyTotal}` });

      if (char.hp <= 0) {
        char.hp = 1;
        char.statusEffects = [...new Set([...char.statusEffects, 'exhausted'])];
        dayLogs.push({ logClass: 'log-battle', text: `    ☠ HP -${dmg} → 중상! 전선 이탈  (1/${char.maxHp})` });
        // 사망 판정: 위협도 70 이상부터 최대 30% 확률 (게임 지속성 보장)
        // 최소 1명은 생존하도록 보장
        const remainingAlive = activeFighters.filter(c => !c.isDead && c !== char).length;
        const deathChance = Math.min(0.30, Math.max(0, (threat - 70) / 100));
        if (threat >= 70 && remainingAlive >= 1 && Math.random() < deathChance) {
          char.isDead = true;
          dayLogs.push({ logClass: 'log-battle', text: `    ☠️ ${char.name}이(가) 전사했다...` });
        }
      } else {
        dayLogs.push({ logClass: 'log-battle', text: `    ${char.name} HP (${char.hp}/${char.maxHp})` });
        nextFighters.push(char);
      }
    }

    activeFighters = nextFighters;

    // 라운드 종료 후 적 HP 표시
    const remClamped = Math.max(0, remainingEnemyHP);
    if (remClamped <= 0) {
      dayLogs.push({ logClass: 'log-battle', text: `  ★ 적 전멸! ████████████ 0/${enemyTotal}` });
    } else if (activeFighters.length > 0) {
      dayLogs.push({ logClass: 'log-battle', text: `  [적 잔여] ${battleBar(remClamped, enemyTotal)} ${remClamped}/${enemyTotal}` });
    }
  }

  // ── 승패 판정 ──
  const aliveAtEnd  = aliveChars.filter(c => !c.isDead && c.hp > 1).length;
  const defeatedPct = Math.max(0, remainingEnemyHP) / enemyTotal;  // 남은 적 비율
  const survivorPct = aliveAtEnd / Math.max(1, aliveChars.length); // 생존 아군 비율

  dayLogs.push({ logClass: 'log-battle', text: `` });

  // 완전 전멸
  if (aliveAtEnd === 0) {
    const inc  = Math.floor(threat / 8) + 8;
    const loss = Math.floor(threat / 3) * 15;
    gs.world.threatLevel = Math.min(100, threat + inc);
    gs.world.townGold    = Math.max(0, (gs.world.townGold || 0) - loss);
    aliveChars.forEach(c => { if (!c.isDead) c.sanity = Math.max(0, c.sanity - 15); });
    dayLogs.push({ logClass: 'log-battle', text: `🔥 전원 전투 불능! 마왕군이 마을을 함락시켰다! (위협도 +${inc}, 마을 자금 -${loss}G, 이성 -15)` });

  // 완전 격퇴 — 적 HP 25% 이하로 감소
  } else if (defeatedPct <= 0.25) {
    const reduce = Math.floor(threat * 0.18) + 6;
    gs.world.threatLevel = Math.max(0, threat - reduce);
    const exp    = Math.min(90, Math.floor(threat / 2) + 25);
    const reward = Math.floor(threat / 5) * 30 + 100;
    aliveChars.filter(c => !c.isDead).forEach(c => { c.exp = (c.exp || 0) + exp; });
    gs.world.townGold = (gs.world.townGold || 0) + reward;
    // 계절 침공 격퇴 보상: 시장 공급 일괄 보충
    for (const item of Object.values(gs.market)) {
      if (!['rare','artifact','forbidden'].includes(item.cat)) {
        item.supplyIndex = Math.min(200, item.supplyIndex + randInt(20, 40));
      }
    }
    dayLogs.push({ logClass: 'log-battle', text: `🎖 마왕군 격퇴 성공! (위협도 -${reduce}, 생존자 EXP +${exp}, 마을 보상금 +${reward}G, 시장 공급 보충)` });

  // 부분 격퇴 — 아군 70% 생존 + 적 HP 40% 이하
  } else if (survivorPct >= 0.7 && defeatedPct <= 0.40) {
    const reduce = Math.floor(threat * 0.10) + 3;
    gs.world.threatLevel = Math.max(0, threat - reduce);
    const exp    = Math.min(50, Math.floor(threat / 3) + 15);
    const reward = Math.floor(threat / 8) * 20 + 50;
    aliveChars.filter(c => !c.isDead).forEach(c => { c.exp = (c.exp || 0) + exp; });
    gs.world.townGold = (gs.world.townGold || 0) + reward;
    dayLogs.push({ logClass: 'log-battle', text: `⚔ 간신히 격퇴! 피해는 컸지만 마왕군을 몰아냈다. (위협도 -${reduce}, EXP +${exp}, 보상금 +${reward}G)` });

  // 패배
  } else {
    const inc  = Math.floor(threat / 15) + 3;
    const loss = Math.floor(threat / 6) * 10;
    gs.world.threatLevel = Math.min(100, threat + inc);
    gs.world.townGold    = Math.max(0, (gs.world.townGold || 0) - loss);
    aliveChars.filter(c => !c.isDead).forEach(c => { c.sanity = Math.max(0, c.sanity - 8); });
    dayLogs.push({ logClass: 'log-battle', text: `💀 마왕군을 막지 못했다. 쓰러진 동료들의 희생으로 간신히 버텼다. (위협도 +${inc}, 마을 자금 -${loss}G, 이성 -8)` });
    dayLogs.push({ logClass: 'log-battle', text: `  → 전력을 강화하고 위협도를 낮춰야 다음 침공을 막을 수 있다.` });
  }
  dayLogs.push({ logClass: 'log-battle', text: BORDER });
}

// ─── 자연 이성 감소 ───────────────────────
// 모험 생활의 스트레스로 이성은 매일 조금씩 소모된다.
// 극도로 피로하면 추가 소모 (피로 >70 시 -1 추가)
function processSanityDecay(aliveChars) {
  for (const char of aliveChars) {
    let decay = 0.5; // 기본 -0.5/일
    if (char.fatigue > 70) decay += 1.0; // 과로 패널티 -1 추가
    char.sanity = Math.max(0, char.sanity - decay);
  }
}

// ─── 자연 호감도 감소 ───────────────────
// 적극적 상호작용 없이는 관계가 서서히 옅어진다.
// 연인·배우자·맹약은 감소폭 완화 (강한 유대)
// 기준: 일반 -0.35/일, 강한유대 -0.15/일 (호감도 상승 환경 개선)
function processAffectionDecay(aliveChars, gs) {
  for (const char of aliveChars) {
    for (const rel of char.relationships) {
      const strongBond = rel.type === 'lover' || rel.type === 'spouse' || rel.type === 'oathbound';
      if (rel.affection > 0) {
        const decay = strongBond ? 0.15 : 0.35;
        rel.affection = Math.max(0, rel.affection - decay);
      } else if (rel.affection < 0) {
        rel.affection = Math.min(0, rel.affection + 0.3);
        if (rel.type === 'enemy' && rel.affection >= -10) rel.type = 'friend';
      }
    }
  }
}

// ─── 관계 드라마: 질투·바람 이벤트 ──────────
// 연인/배우자 있는 캐릭터를 중심으로 드라마틱한 관계 변화 발생
function processRelationshipDrama(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    // 연인 또는 배우자 확인
    const partnerRel = char.relationships.find(r => r.type === 'lover' || r.type === 'spouse');
    if (!partnerRel) continue;
    const partner = aliveChars.find(c => c.id === partnerRel.targetId);
    if (!partner) continue;

    // ── 질투: 제3자가 파트너에게 높은 호감도를 가질 때 ──
    const rivals = aliveChars.filter(c =>
      c.id !== char.id && c.id !== partner.id &&
      (getRelationship(c, partner.id)?.affection || 0) >= 45
    );
    if (rivals.length > 0 && Math.random() < 0.05) {
      const rival = pick(rivals);
      const penalty = randInt(12, 25);
      updateAffection(char, partner, -penalty, gs);
      const scenes = [
        `${char.name}이(가) ${rival.name}과(와) ${partner.name}의 친밀한 모습을 목격하고 질투에 불탔다`,
        `${char.name}이(가) ${partner.name}이(가) ${rival.name}에게 웃어 보이는 것을 보고 가슴이 철렁했다`,
        `${char.name}은 ${rival.name}이 ${partner.name}에게 자꾸 접근하는 게 마음에 걸렸다`,
      ];
      dayLogs.push({ logClass: 'log-relation', text: `💢 ${pick(scenes)}. (${char.name}→${partner.name} 호감도 -${penalty})` });
    }

    // ── 바람: 본인이 제3자에게 강하게 이끌림 (중복 처리 방지: id 비교) ──
    if (char.id < partner.id) {
      const temptations = aliveChars.filter(c =>
        c.id !== char.id && c.id !== partner.id &&
        (getRelationship(char, c.id)?.affection || 0) >= 60
      );
      if (temptations.length > 0 && Math.random() < 0.04) {
        const third = pick(temptations);
        const caught = Math.random() < 0.55;
        if (caught) {
          const penalty = randInt(20, 40);
          updateAffection(partner, char, -penalty, gs);
          const scenes = [
            `${partner.name}이(가) ${char.name}과(와) ${third.name}의 관계를 알아채고 큰 상처를 받았다`,
            `${partner.name}은 ${char.name}이(가) ${third.name}을(를) 특별히 대하는 걸 눈치채고 분노했다`,
            `${partner.name}이(가) ${char.name}의 마음이 흔들리고 있다는 것을 직감했다`,
          ];
          dayLogs.push({ logClass: 'log-relation', text: `😡 ${pick(scenes)}. (${partner.name}→${char.name} 호감도 -${penalty})` });
        } else {
          dayLogs.push({ logClass: 'log-relation', text: `👀 ${char.name}은 ${partner.name}이 있음에도 ${third.name}에게 마음이 이끌리고 있다. 아직 아무도 모른다.` });
        }
      }
    }
  }
}

// ─── WEIGHTED PICK ───────────────────────
// INTERACTION_EVENTS의 weight 필드를 실제로 반영하는 가중치 랜덤 선택
function weightedPick(arr) {
  const total = arr.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of arr) {
    r -= (e.weight || 1);
    if (r <= 0) return e;
  }
  return arr[arr.length - 1];
}

// ─── INTERACTIONS ────────────────────────
function processInteractions(aliveChars, gs, dayLogs) {
  // 최대 2회 (was 3회), 하루에 같은 페어 중복 없음
  const numInteractions = Math.min(2, Math.max(1, Math.floor(aliveChars.length / 2)));
  const usedPairs = new Set();

  for (let i = 0; i < numInteractions; i++) {
    const a = pick(aliveChars);
    const others = aliveChars.filter(c => c.id !== a.id);
    if (others.length === 0) continue;
    const b = pick(others);

    // 같은 페어 중복 방지
    const pairKey = [a.id, b.id].sort().join('|');
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);

    // 가중치 기반 이벤트 선택 (weightedPick — weight 필드가 이제 실제로 동작함)
    const validInteractions = INTERACTION_EVENTS.filter(ie => {
      if (ie.partyFormCheck) {
        if (!gs.settings.characterInteraction) return false;
        const rel = getRelationship(a, b.id);
        return rel && rel.affection >= 60 && !a.currentPartyId && !b.currentPartyId;
      }
      if (ie.romanceOnly) {
        if (gs.settings.friendshipMode) return false;
        const rel = getRelationship(a, b.id);
        if (!rel || rel.type !== 'lover') return false;
        const same = a.gender === b.gender;
        if (same && !gs.settings.allowSameSexCouple) return false;
        if (!same && !gs.settings.allowHeteroCouple) return false;
        if (gs.settings.minorRelationRestriction && (a.isMinor || b.isMinor)) return false;
        return true;
      }
      if (ie.condition && !ie.condition(a, b, gs)) return false;
      return true;
    });

    if (!validInteractions.length) continue;
    const ie = weightedPick(validInteractions);  // ← pick() 대신 weightedPick()
    const iResult = ie.resolve(a, b, gs);

    // Apply affection
    if (iResult.affectionDelta) {
      updateAffection(a, b, iResult.affectionDelta, gs);
    }

    // Gold transfer — interact_trade (b가 실제 부족할 때만)
    if (iResult.goldTransfer) {
      const amt = Math.min(a.gold - 50, iResult.goldTransfer); // a 생활비 50G 보장
      if (amt > 0) {
        a.gold -= amt;
        b.gold += amt;
        // 채무 추적 구조로 등록
        if (!b.debts) b.debts = [];
        b.debts.push({
          creditorId: a.id,
          amount: amt,
          remaining: amt,
          dayTaken: gs.day,
          deadline: gs.day + 7,
          purpose: '긴급 생활비',
        });
        addOrUpdateRelation(b, a.id, 'debtor', 0);
        addOrUpdateRelation(a, b.id, 'creditor', 0);
      }
    }

    // Party formation
    if (iResult.formParty) {
      formParty([a, b], gs, dayLogs);
    }

    dayLogs.push({ logClass: iResult.logClass || 'log-social', text: iResult.text });
  }
}

// ─── ROMANCE CRINGE / SWEET DIALOGUE ────
const DLG_LOVER_DATE = [
  ['오늘 저녁에 시간 있어?', '당신이랑이라면 항상 있지.'],
  ['오늘 같이 밥 먹고 싶어서...', '...나도 마침 그러고 싶었어.'],
  ['달이 예쁘다.', '...그러게. 그런데 나는 당신이 더 예쁜걸.'],
  ['어, 저기 별똥별!', '소원은 빌었어?', ],
  ['오늘 일 끝나면 같이 산책할까?', '...응. 손 잡아도 돼?'],
];
const DLG_LOVER_CRINGE = [
  ['내 심장이 두근두근해... 이거 마법에 걸린 거 아니야?', '저도요. 둘 다 걸린 것 같은데요.'],
  ['당신은 내 태양이고, 내 달이고, 내 별이야.', '...그거 너무 많은 것 같은데.'],
  ['꿈에서도 당신 얼굴이 보여.', '저는 코 골던데 괜찮았어요?'],
  ['내 심장을 가져가도 돼. 이미 당신 거야.', '...그럼 심장 없이 어떻게 살아요.'],
  ['당신 없이는 못 살 것 같아... 진짜로.', '일단 밥은 먹어야 해요.'],
  ['세상에서 가장 아름다운 게 뭔지 알아?', '...혹시 저 말하려는 거예요?', ],
];
const DLG_LOVER_PDA = [
  // 손발이 오그라드는 공개 애정 표현
  ['길드 사람들이 보는데... 그냥 손이라도.', '...부끄럽지만 뭐, 좋아.'],
  ['여기서 껴안으면 안 돼?', '...지금요? 다들 보고 있잖아요.'],
  ['나 지금 당신 너무 좋아서 어쩔 줄 모르겠어.', '조용히 해, 다들 들어.'],
  ['오늘 특별히 예뻐 보이는데.', '...하, 아 진짜. 조용히 해요.'],
];
const DLG_LOVER_JEALOUS = [
  ['아까 그 사람이랑 왜 그렇게 웃고 있었어?', '...그냥 이야기한 거야. 질투해?'],
  ['혹시 나보다 더 좋은 사람 생겼어?', '무슨 소리야. 왜 그런 생각을 해?'],
  ['요즘 나한테 좀 소홀한 것 같아서.', '그런가? 미안해. 요즘 좀 바빠서.'],
];
const DLG_BREAKUP = [
  ['우리... 잠깐 거리를 두는 게 좋을 것 같아.', '...그래. 알겠어.'],
  ['솔직히 말할게. 더 이상 예전 같지가 않아.', '...나도 느꼈어. 그냥 인정하자.'],
  ['우리 사이가 변한 것 같아. 미안해.', '...미안하긴 나도 마찬가지야.'],
  ['이건 당신 잘못이 아니야. 그냥... 타이밍이 안 맞았던 거야.', '...고마워. 그 말로 충분해.'],
];
const DLG_CHEATING = [
  ['요즘 새벽에 어딜 가는 거야?', '...운동이야. 그냥 산책.'],
  ['설마... 다른 사람이 생긴 건 아니지?', '무슨 말을 하는 거야. 나 그런 사람 아니야.'],
];

// ─── ROMANCE & RELATIONSHIPS ─────────────
function processRomance(aliveChars, gs, dayLogs) {
  if (gs.settings.friendshipMode) return;

  for (const char of aliveChars) {
    for (const rel of char.relationships) {
      const partner = gs.characters.find(c => c.id === rel.targetId && !c.isDead);
      if (!partner) continue;

      // 중복 처리 방지: ID 기준 한 방향만 처리 (char.id < partner.id)
      if (char.id > partner.id) continue;

      // ── 친구 → 연인 ──────────────────────
      if (rel.affection >= 60 && rel.type === 'friend') {
        const same = char.gender === partner.gender;
        if (same && !gs.settings.allowSameSexCouple) continue;
        if (!same && !gs.settings.allowHeteroCouple) continue;

        const loverChance = Math.min(0.3, 0.03 * (gs.settings.storySpeed || 1));
        if (Math.random() < loverChance) {
          // ── 3-2 정절 시스템: 기존 연인·맹약 있으면 대형 패널티 + 이별 ──
          const _charExisting  = char.relationships.find(r => (r.type==='lover'||r.type==='oathbound'||r.type==='spouse') && r.targetId !== partner.id);
          const _partnerExisting = partner.relationships.find(r => (r.type==='lover'||r.type==='oathbound'||r.type==='spouse') && r.targetId !== char.id);
          if (_charExisting || _partnerExisting) {
            const betrayer = _charExisting ? char : partner;
            const victim   = _charExisting
              ? gs.characters.find(c => c.id === _charExisting.targetId)
              : gs.characters.find(c => c.id === _partnerExisting.targetId);
            // 기존 관계 파기
            if (victim) {
              const victimRel = getRelationship(victim, betrayer.id);
              if (victimRel) { victimRel.type = 'enemy'; victimRel.affection -= 80; }
              const betrayerRel = getRelationship(betrayer, victim.id);
              if (betrayerRel) { betrayerRel.type = 'rival'; betrayerRel.affection -= 60; }
              betrayer.sanity = Math.max(0, betrayer.sanity - 20);
              victim.sanity   = Math.max(0, victim.sanity   - 30);
              dayLogs.push({ logClass: 'log-romance', text: `💔 [배신] ${betrayer.name}이(가) 기존 인연(${victim.name})을 저버렸다. ${victim.name}은(는) 깊은 상처를 입었다.` });
              dayLogs.push(dlgLog(victim.name, pick(['...이럴 수 있어?', '날 버리는 거야?', '믿었는데... 믿었었는데.', '돌아보지 마. 이미 끝이야.'])));
            }
            continue; // 새 연인 관계 성립 취소
          }

          rel.type = 'lover';
          const pr = getRelationship(partner, char.id);
          if (pr) pr.type = 'lover';
          dayLogs.push({ logClass: 'log-romance', text: `💕 ${char.name}과(와) ${partner.name}이(가) 연인이 됐다! 두 사람의 사이가 더욱 깊어졌다.` });
          { const g = pick(DLG_LOVER); dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1])); }
        }
      }

      // ── 연인·맹약 이벤트 ─────────────────
      // 3-1: oathbound도 연인 스위트 이벤트 발동
      if (rel.type === 'lover' || rel.type === 'oathbound') {

        // 연인 일수 카운트
        if (!char.daysAsLovers) char.daysAsLovers = {};
        char.daysAsLovers[partner.id] = (char.daysAsLovers[partner.id] || 0) + 1;

        // 달달/크링지 이벤트 (~15% 확률)
        if (Math.random() < 0.15) {
          const eventPool = [
            () => {
              // 데이트
              const g = pick(DLG_LOVER_DATE);
              dayLogs.push({ logClass: 'log-relation', text: `🌙 ${char.name}과(와) ${partner.name}이(가) 조용한 저녁 시간을 함께 보냈다.` });
              dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1]));
              updateAffection(char, partner, 3, gs);
            },
            () => {
              // 손발 오그라드는 대사
              const g = pick(DLG_LOVER_CRINGE);
              dayLogs.push({ logClass: 'log-relation', text: `🌹 ${char.name}이(가) ${partner.name}에게 진심 어린(?) 고백을 쏟아냈다.` });
              dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1]));
              updateAffection(char, partner, 2, gs);
              char.sanity = Math.max(0, char.sanity - 2); // 약간의 정신력 소모
            },
            () => {
              // 공개 애정 표현
              const g = pick(DLG_LOVER_PDA);
              const witnesses = aliveChars.filter(c => c.id !== char.id && c.id !== partner.id);
              const witness = witnesses.length ? pick(witnesses) : null;
              dayLogs.push({ logClass: 'log-social', text: `😳 ${char.name}이(가) 길드 한복판에서 ${partner.name}에게 노골적으로 애정을 표현했다.${witness ? ` ${witness.name}이(가) 민망함을 느꼈다.` : ''}` });
              dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1]));
              if (witness) updateAffection(char, witness, -2, gs);
              updateAffection(char, partner, 4, gs);
            },
            () => {
              // 질투
              const g = pick(DLG_LOVER_JEALOUS);
              dayLogs.push({ logClass: 'log-relation', text: `😤 ${char.name}이(가) ${partner.name}에게 질투심을 드러냈다.` });
              dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1]));
              const afDelta = Math.random() < 0.5 ? 3 : -2;
              updateAffection(char, partner, afDelta, gs);
            },
            () => {
              // 깜짝 선물
              const giftCost = randInt(20, 60);
              if (char.gold >= giftCost) {
                char.gold -= giftCost;
                partner.sanity = Math.min(100, partner.sanity + 4);
                dayLogs.push({ logClass: 'log-relation', text: `🎁 ${char.name}이(가) ${partner.name}에게 ${giftCost}G짜리 선물을 건넸다. ${partner.name}이(가) 깜짝 놀라며 기뻐했다.` });
                dayLogs.push(dlgLog(partner.name, pick(['이게 뭐야...?', '고마워. 진짜로.', '바보같이 왜 이런 거야.', '...간직할게.'])));
                updateAffection(char, partner, 8, gs);
              }
            },
          ];
          pick(eventPool)();
        }

        // 이별 조건: 호감도 < 20이고 연인 상태 (pureMode off 시 더 쉽게)
        // 맹약(oathbound)은 이별 불가 — 영원한 유대
        const breakupThreshold = gs.settings.pureMode ? 5 : 20;
        if (rel.type === 'lover' && rel.affection < breakupThreshold && Math.random() < 0.25) {
          rel.type = 'friend';
          const pr = getRelationship(partner, char.id);
          if (pr) pr.type = 'friend';
          dayLogs.push({ logClass: 'log-romance', text: `💔 ${char.name}과(와) ${partner.name}이(가) 이별했다. 둘 사이에 어색한 침묵이 감돌았다.` });
          const g = pick(DLG_BREAKUP);
          dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1]));
          // 이별 후 이성 하락
          char.sanity    = Math.max(0, char.sanity    - randInt(5, 15));
          partner.sanity = Math.max(0, partner.sanity - randInt(5, 15));
          if (char.daysAsLovers) delete char.daysAsLovers[partner.id];
        }

        // 바람 (pureMode OFF 시): 연인이 있으면서 다른 캐릭터에 호감도 70+
        if (!gs.settings.pureMode && Math.random() < 0.04) {
          const thirdParties = aliveChars.filter(c =>
            c.id !== char.id && c.id !== partner.id &&
            (getRelationship(char, c.id)?.affection || 0) >= 70 &&
            (getRelationship(char, c.id)?.type === 'friend')
          );
          if (thirdParties.length > 0) {
            const rival = pick(thirdParties);
            const partnerRel = getRelationship(partner, char.id);
            if (partnerRel) partnerRel.affection -= randInt(15, 30);
            updateAffection(char, rival, 5, gs);
            dayLogs.push({ logClass: 'log-relation', text: `💢 ${char.name}이(가) ${rival.name}에게 마음이 흔들리고 있다. ${partner.name}이(가) 눈치채기 시작했다.` });
            const g = pick(DLG_CHEATING);
            dayLogs.push(dlgPair(partner.name, g[0], char.name, g[1]));
          }
        }

        // 결혼: 연인 상태에서만 가능 (oathbound/spouse는 이미 결혼했거나 맹약 상태)
        if (rel.type === 'lover') {
          const daysTogether = char.daysAsLovers?.[partner.id] || 0;
          const marriageChance = Math.min(0.25, (0.002 + Math.floor(daysTogether / 10) * 0.002) * (gs.settings.storySpeed || 1));
          if (Math.random() < marriageChance) {
            rel.type = 'spouse';
            const pr = getRelationship(partner, char.id);
            if (pr) pr.type = 'spouse';
            rel.affection = Math.min(rel.affection + 20, 200);
            if (pr) pr.affection = Math.min(pr.affection + 20, 200);
            dayLogs.push({ logClass: 'log-romance', text: `💍 ${char.name}과(와) ${partner.name}이(가) 결혼했다! 두 영혼이 하나가 됐다.` });
            { const g = pick(DLG_MARRIAGE); dayLogs.push(dlgPair(char.name, g[0], partner.name, g[1])); }

            // 맹약: spouse 관계에 oathBound 플래그만 추가 (관계 타입 덮어쓰기 금지)
            if (gs.settings.oathBondSystem && rel.affection > 80) {
              rel.oathBound = true;
              if (pr) pr.oathBound = true;
              dayLogs.push({ logClass: 'log-romance', text: `🔮 ${char.name}과(와) ${partner.name}이(가) 결혼과 동시에 맹약(Oath Bond)을 맺었다!` });
            }
          }
        }
      }

      // ── 배우자 → 임신 ────────────────────
      if (rel.type === 'spouse' && gs.settings.pregnancySystem) {
        if (!char.pregnant && !partner.pregnant) {
          const canBirth = (char.gender === 'female' || partner.gender === 'female') &&
                           char.gender !== partner.gender;
          if (canBirth && Math.random() < gs.settings.pregnancyChance / 100) {
            const mother = char.gender === 'female' ? char : partner;
            mother.pregnant = { fatherId: char.gender === 'male' ? char.id : partner.id, daysLeft: 7 };
            dayLogs.push({ logClass: 'log-relation', text: `🤰 ${mother.name}이(가) 임신했다! 7일 후 아이가 태어날 것이다.` });
          }
        }
      }
    }

    // ── 임신 카운트다운 ───────────────────
    if (char.pregnant) {
      char.pregnant.daysLeft--;
      if (char.pregnant.daysLeft <= 0) {
        const baby = birthChild(char, gs);
        gs.characters.push(baby);
        char.pregnant = null;
        dayLogs.push({ logClass: 'log-relation', text: `👶 ${char.name}이(가) 아이를 낳았다! 새로운 모험가 ${baby.name}이(가) 세상에 태어났다.` });
      }
    }
  }
}

function birthChild(mother, gs) {
  const father = gs.characters.find(c => c.id === mother.pregnant?.fatherId);
  const babyNames = ['아리엔','카엘','리안','세로','나비','다운','이루','소린','마엘','루나'];
  const name = pick(babyNames);
  const gender = Math.random() < 0.5 ? 'male' : 'female';
  const mbti = pick(MBTI_LIST);

  // Inherit some stats from parents
  const stats = { str:1, int:1, fai:1, agi:1, cha:1, end:1 };
  if (father) {
    for (const s of Object.keys(stats)) {
      stats[s] = Math.max(0, Math.round((mother.stats[s] + father.stats[s]) / 4));
    }
  }

  const baby = createCharacter({ name, gender, mbti, alignment: 'Neutral', stats, age: 0 });
  baby.isMinor = true;
  baby.age = 0;

  // Relationships
  baby.relationships.push({ targetId: mother.id, type: 'parent', affection: 80 });
  mother.relationships.push({ targetId: baby.id, type: 'child', affection: 100 });
  if (father) {
    baby.relationships.push({ targetId: father.id, type: 'parent', affection: 80 });
    father.relationships.push({ targetId: baby.id, type: 'child', affection: 100 });
  }

  return baby;
}

// ─── PARTY MANAGEMENT ────────────────────
function processParties(aliveChars, gs, dayLogs) {
  for (const party of [...gs.parties]) {
    const members = aliveChars.filter(c => c.currentPartyId === party.id);

    // 멤버 2명 미만 → 즉시 해산
    if (members.length < 2) {
      disbandParty(party, gs, dayLogs);
      dayLogs.push({ logClass: 'log-party', text: `🏚 파티 인원이 부족해졌다. 파티가 자동 해산됐다.` });
      continue;
    }

    // 파티 활동 일수 추적
    if (!party.daysActive) party.daysActive = 0;
    party.daysActive++;

    // 퀘스트 사이클: 마지막 퀘스트 이후 10~15일 경과 시 새 퀘스트 제안
    const daysSinceQuest = gs.day - (party.lastQuestDay || party.formedDay || gs.day);
    const questCooldown = 12 + Math.floor(Math.random() * 6); // 12~17일 간격
    const hasPendingPartyQuest = gs.pendingChoices.some(c => c.type === 'party_quest' && c.partyId === party.id);
    if (!hasPendingPartyQuest && daysSinceQuest >= questCooldown) {
      _offerPartyNextQuest(party, members, gs);
      party.lastQuestDay = gs.day;
    }

    // ── 해산 조건 ────────────────────────
    // 1. 내부 갈등: 낮은 호감도 멤버 조합
    if (Math.random() < 0.04) {
      const a = pick(members);
      const b = pick(members.filter(m => m.id !== a.id));
      const rel = getRelationship(a, b.id);
      if (rel && rel.affection < 15) {
        disbandParty(party, gs, dayLogs);
        dayLogs.push({ logClass: 'log-party', text: `💥 ${a.name}과(와) ${b.name}이(가) 갈등 끝에 파티를 떠났다. 파티 해산.` });
        continue;
      }
    }

    // 2. 자연 해산: 오래된 파티 (30일 이상) — 낮은 확률로 해산
    if (party.daysActive > 30 && Math.random() < 0.008) {
      disbandParty(party, gs, dayLogs);
      dayLogs.push({ logClass: 'log-party', text: `🌅 ${members.map(c => c.name).join(', ')}의 파티가 활동을 마치고 자연스럽게 해산했다.` });
      continue;
    }

    // 3. 구성원 피로 과부하: 모두 피로 80+ → 해산
    if (members.every(c => c.fatigue >= 80)) {
      disbandParty(party, gs, dayLogs);
      dayLogs.push({ logClass: 'log-party', text: `😓 파티원 전원이 극도로 지쳐 파티를 해산했다. 충분히 쉬어야 한다.` });
      continue;
    }
  }
}

function _offerPartyNextQuest(party, members, gs) {
  const PARTY_QUEST_OPTIONS = [
    { label: '⚔ 어둠의 소굴 소탕', grade: 'B', reward: 'combat',
      desc: '인근에 출몰한 강적의 근거지를 쳐부수자는 의뢰다. 보상: 금화 + 위협도 감소.' },
    { label: '🗡 산적 두목 현상금', grade: 'C', reward: 'combat',
      desc: '수배 중인 산적 두목 목에 현상금이 걸렸다. 난이도 보통, 보상 안정적.' },
    { label: '🗺 봉인된 고대 유적', grade: 'A', reward: 'explore',
      desc: '수백 년 전 봉인된 유적 탐사. 위험 높지만 유물 보상이 크다.' },
    { label: '🛡 마을 수호 임무', grade: 'C', reward: 'defend',
      desc: '야간 경비. 낮은 위험, 안정적 금화 + 위협도 감소.' },
    { label: '💤 재정비 기간', grade: 'D', reward: 'rest',
      desc: '퀘스트 없이 쉬며 체력 회복. 보상 없지만 피로·HP 회복.' },
    { label: '🐉 드래곤 격퇴', grade: 'S', reward: 'combat',
      desc: '인근 동굴에 드래곤이 출현했다. 극도로 위험하지만 전설급 보상.' },
    { label: '🧭 미지의 동굴 탐사', grade: 'B', reward: 'explore',
      desc: '지도에 없는 동굴 조사. 발견물에 따라 학술원 사례.' },
    { label: '🏰 국경 요새 지원', grade: 'B', reward: 'defend',
      desc: '국경 요새 지원 요청. 급여 지급 + 위협도 감소.' },
  ];
  const shuffled = PARTY_QUEST_OPTIONS.slice().sort(() => Math.random() - 0.5);
  const opts = shuffled.slice(0, 4);
  const names = members.map(c => c.name).join(', ');
  gs.pendingChoices.push({
    type: 'party_quest',
    partyId: party.id,
    title: `📋 파티 퀘스트 선택`,
    desc: `${names}의 파티가 다음 목표를 정해야 합니다.\n각 의뢰의 등급과 세부 내용을 확인하고 결정하세요.`,
    options: opts,
    isQuestScroll: true,
  });
}

function formParty(chars, gs, dayLogs) {
  const id = 'party_' + Date.now();
  const party = { id, memberIds: chars.map(c => c.id), sharedInventory: [], formedDay: gs.day };
  gs.parties.push(party);
  for (const c of chars) c.currentPartyId = id;
  const names = chars.map(c => c.name).join(', ');
  dayLogs.push({ logClass: 'log-party', text: `🤝 ${names}이(가) 파티를 결성했다! 첫 퀘스트를 선택하세요.` });
  if (chars.length >= 2) {
    const g = pick(DLG_PARTY_GREET);
    dayLogs.push(dlgPair(chars[0].name, g[0], chars[1].name, g[1]));
  }
  // 파티 결성 → 첫 퀘스트 선택 (양피지 스타일)
  _offerPartyNextQuest(party, chars, gs);
  party.lastQuestDay = gs.day;
}

// ─── 파티 퀘스트 결과 처리 ────────────────
function resolvePartyQuest(partyId, rewardType, gs, grade = 'C') {
  const party = gs.parties.find(p => p.id === partyId);
  if (!party) return;
  const members = gs.characters.filter(c => party.memberIds.includes(c.id) && !c.isDead);
  if (!members.length) return;

  const logs = [];

  // ── 등급별 파라미터 ──
  // successBase: 기본 성공률, goldMul: 보상 배율, penaltyMul: 패널티 배율, threatReduce: 위협도 감소
  const GRADE_CFG = {
    S: { successBase: 0.18, goldMul: 4.0, penaltyMul: 2.5, threatReduce: 15, expMul: 4.0, lootChance: 0.90 },
    A: { successBase: 0.35, goldMul: 2.5, penaltyMul: 1.8, threatReduce: 10, expMul: 2.5, lootChance: 0.75 },
    B: { successBase: 0.55, goldMul: 1.5, penaltyMul: 1.2, threatReduce: 5,  expMul: 1.5, lootChance: 0.60 },
    C: { successBase: 0.70, goldMul: 1.0, penaltyMul: 0.8, threatReduce: 3,  expMul: 1.0, lootChance: 0.45 },
    D: { successBase: 0.95, goldMul: 0.5, penaltyMul: 0.3, threatReduce: 1,  expMul: 0.5, lootChance: 0.20 },
  };
  const cfg = GRADE_CFG[grade] || GRADE_CFG['C'];

  // 멤버 평균 스탯으로 성공률 보정 (최대 +25%)
  const avgStatBonus = members.reduce((s, c) =>
    s + ((c.stats.str || 0) + (c.stats.int || 0) + (c.level || 1) * 0.5), 0)
    / members.length * 0.015;
  const successChance = Math.min(0.92, cfg.successBase + avgStatBonus);

  // ── 출발 시 식량 소비 ──
  const FOOD_IDS = new Set(['travel_food','dried_meat','bread','potato','salt_fish']);
  if (rewardType === 'combat' || rewardType === 'explore') {
    for (const c of members) {
      const foodIdx = (c.inventory || []).findIndex(it => FOOD_IDS.has(it.id));
      if (foodIdx >= 0) {
        const food = c.inventory[foodIdx];
        food.qty = (food.qty || 1) - 1;
        if (food.qty <= 0) c.inventory.splice(foodIdx, 1);
        logs.push({ logClass: 'log-system', text: `🍞 ${c.name}이(가) 출발 전 ${food.name}을(를) 챙겼다.` });
      } else {
        const travelCost = gs.market?.travel_food?.currentPrice || 10;
        if (c.gold >= travelCost) {
          c.gold -= travelCost;
          gs.market.travel_food && (gs.market.travel_food.supplyIndex = Math.max(1, gs.market.travel_food.supplyIndex - 1));
          logs.push({ logClass: 'log-system', text: `🍞 ${c.name}이(가) 시장에서 여행 식량을 ${travelCost}G에 구매해 출발했다.` });
        } else {
          c.fatigue = Math.min(100, c.fatigue + 8);
          logs.push({ logClass: 'log-system', text: `😓 ${c.name}은(는) 식량도 없이 출발했다. (피로 +8)` });
        }
      }
    }
  }

  const success = Math.random() < successChance;
  const gradeTag = `[${grade}등급]`;

  switch (rewardType) {
    case 'combat': {
      if (success) {
        const gold = Math.round(randInt(80, 200) * members.length * cfg.goldMul);
        const guildCut = Math.floor(gold * 0.1);
        const threatDec = cfg.threatReduce;
        const names = members.map(c => c.name).join(', ');
        members.forEach(c => {
          c.gold += Math.floor((gold - guildCut) / members.length);
          c.exp = (c.exp || 0) + Math.round(20 * cfg.expMul);
          c.actionCounts = c.actionCounts || {};
          c.actionCounts.combat = (c.actionCounts.combat || 0) + 2;
        });
        gs.world.townGold = (gs.world.townGold || 0) + guildCut;
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - threatDec);
        logs.push({ logClass: 'log-party', text: `⚔ ${gradeTag} 파티 [${names}]이(가) 토벌에 성공했다! 금화 ${gold-guildCut}G 분배, 길드 창고 +${guildCut}G. (위협도 -${threatDec})` });
        for (const c of members) {
          if (Math.random() < cfg.lootChance) {
            c.inventory = c.inventory || [];
            const r = Math.random();
            let lootItem;
            if (grade === 'S') {
              lootItem = r < 0.35
                ? { id: 'magic_crystal',    name: '마법 결정',    icon: '🔮', cat: 'rare',     qty: 1 }
                : r < 0.75
                  ? { id: 'magic_stone',    name: '마석',         icon: '💎', cat: 'material', qty: 1 }
                  : { id: 'monster_material', name: '몬스터 소재', icon: '🦴', cat: 'loot',    qty: 1 };
            } else if (grade === 'A') {
              lootItem = r < 0.55
                ? { id: 'magic_stone',      name: '마석',         icon: '💎', cat: 'material', qty: 1 }
                : { id: 'monster_material', name: '몬스터 소재',  icon: '🦴', cat: 'loot',     qty: 1 };
            } else if (grade === 'B') {
              lootItem = r < 0.25
                ? { id: 'magic_stone',      name: '마석',         icon: '💎', cat: 'material', qty: 1 }
                : r < 0.65
                  ? { id: 'monster_material', name: '몬스터 소재', icon: '🦴', cat: 'loot',   qty: 1 }
                  : { id: 'herb',           name: '약초',         icon: '🌿', cat: 'material', qty: 1 };
            } else {
              lootItem = r < 0.55
                ? { id: 'monster_material', name: '몬스터 소재',  icon: '🦴', cat: 'loot',     qty: 1 }
                : { id: 'herb',             name: '약초',         icon: '🌿', cat: 'material', qty: 1 };
            }
            c.inventory.push(lootItem);
          }
        }
        if (members.length >= 2) { const g = pick(DLG_COMBAT_WIN); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      } else {
        const hpLoss = Math.round(randInt(10, 25) * cfg.penaltyMul);
        const goldLoss = grade === 'S' ? randInt(50, 120) : grade === 'A' ? randInt(20, 60) : 0;
        members.forEach(c => {
          c.hp = Math.max(1, c.hp - hpLoss);
          if (goldLoss) c.gold = Math.max(0, c.gold - goldLoss);
        });
        const penaltyDesc = goldLoss ? ` 금화 ${goldLoss}G 손실.` : '';
        logs.push({ logClass: 'log-party', text: `⚔ ${gradeTag} 파티가 토벌에 실패했다... 부상을 입고 귀환했다. (HP -${hpLoss}${penaltyDesc})` });
        if (members.length >= 2) { const g = pick(DLG_COMBAT_FAIL); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      }
      break;
    }
    case 'explore': {
      if (success) {
        const gold = Math.round(randInt(60, 150) * members.length * cfg.goldMul);
        const expGain = Math.round(15 * cfg.expMul);
        members.forEach(c => { c.gold += Math.floor(gold / members.length); c.exp = (c.exp || 0) + expGain; });
        if (grade === 'S') {
          // S등급: 고대 유물을 대표 멤버 인벤토리에 직접 지급
          const bearer = members[0];
          bearer.inventory = bearer.inventory || [];
          bearer.inventory.push({ id: 'ancient_artifact', name: '고대 유물', icon: '🏺', cat: 'artifact', qty: 1 });
          gs.world.baseResources.ancient_artifact = (gs.world.baseResources.ancient_artifact || 0) + 1;
        } else if (grade === 'A') {
          gs.world.baseResources.ancient_artifact = (gs.world.baseResources.ancient_artifact || 0) + 1;
        }
        logs.push({ logClass: 'log-party', text: `🗺 ${gradeTag} 파티가 탐험에 성공! 금화 ${gold}G와 귀한 발견물을 가져왔다.` });
        for (const c of members) {
          if (Math.random() < cfg.lootChance) {
            c.inventory = c.inventory || [];
            const r = Math.random();
            let lootItem;
            if (grade === 'S') {
              lootItem = r < 0.50
                ? { id: 'magic_crystal', name: '마법 결정',   icon: '🔮', cat: 'rare',     qty: 1 }
                : r < 0.80
                  ? { id: 'magic_stone', name: '마석',        icon: '💎', cat: 'material', qty: 1 }
                  : { id: 'herb',        name: '약초',        icon: '🌿', cat: 'material', qty: 1 };
            } else if (grade === 'A') {
              lootItem = r < 0.45
                ? { id: 'magic_stone',   name: '마석',        icon: '💎', cat: 'material', qty: 1 }
                : r < 0.70
                  ? { id: 'magic_crystal', name: '마법 결정', icon: '🔮', cat: 'rare',     qty: 1 }
                  : { id: 'herb',          name: '약초',      icon: '🌿', cat: 'material', qty: 1 };
            } else if (grade === 'B') {
              lootItem = r < 0.50
                ? { id: 'magic_stone',   name: '마석',        icon: '💎', cat: 'material', qty: 1 }
                : { id: 'herb',          name: '약초',        icon: '🌿', cat: 'material', qty: 1 };
            } else {
              lootItem = { id: 'herb',   name: '약초',        icon: '🌿', cat: 'material', qty: 1 };
            }
            c.inventory.push(lootItem);
          }
        }
        if (members.length >= 2) { const g = pick(DLG_EXPLORE_WIN); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      } else {
        const hpLoss = Math.round(randInt(5, 15) * cfg.penaltyMul);
        const fatigueLoss = Math.round(20 * cfg.penaltyMul);
        members.forEach(c => { c.hp = Math.max(1, c.hp - hpLoss); c.fatigue = Math.min(100, c.fatigue + fatigueLoss); });
        logs.push({ logClass: 'log-party', text: `🗺 ${gradeTag} 파티가 탐험 중 위기에 처했다. 간신히 귀환했다. (HP -${hpLoss}, 피로 +${fatigueLoss})` });
        if (members.length >= 2) { const g = pick(DLG_EXPLORE_FAIL); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      }
      break;
    }
    case 'defend': {
      if (success) {
        const gold = Math.round(randInt(40, 80) * members.length * cfg.goldMul);
        const threatDec = cfg.threatReduce + 2;
        members.forEach(c => { c.gold += Math.floor(gold / members.length); });
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - threatDec);
        logs.push({ logClass: 'log-party', text: `🛡 ${gradeTag} 파티가 수호 임무 완료. 금화 ${gold}G 수령, 위협도 -${threatDec}` });
      } else {
        const threatInc = Math.round(3 * cfg.penaltyMul);
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + threatInc);
        logs.push({ logClass: 'log-party', text: `🛡 ${gradeTag} 파티가 수호 임무에 실패했다. 방어선이 뚫렸다. (위협도 +${threatInc})` });
      }
      if (members.length >= 2) { const g = pick(DLG_DEFEND); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      break;
    }
    case 'rest': {
      members.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + 20); c.fatigue = Math.max(0, c.fatigue - 30); });
      logs.push({ logClass: 'log-party', text: `💤 파티가 충분히 쉬었다. 모두 체력을 회복했다. (HP +20, 피로 -30)` });
      if (members.length >= 2) { const g = pick(DLG_REST); logs.push(dlgPair(members[0].name, g[0], members[1].name, g[1])); }
      break;
    }
  }
  // 퀘스트 완료 기록 — 다음 퀘스트 쿨다운 기산점
  if (party) party.lastQuestDay = gs.day;
  appendToLog(logs);
}

// ═══════════════════════════════════════
// 길드장 공표 시스템 — 마을·국가 단위 이벤트
// ═══════════════════════════════════════
const GUILD_ANNOUNCE_POOL = [
  {
    id: 'threat_alert',
    icon: '⚔',
    title: '⚔ 마왕군 접근 경보',
    desc: '척후병 보고입니다, 길드장. 마왕군 선발대가 인근까지 접근했습니다. 신속한 결정이 필요합니다.',
    condition: (gs) => true,
    options: [
      { label: '전면 출격', desc: '전원을 출격시켜 정면 격파. 큰 성과이지만 부상 위험이 있습니다.', reward: 'frontal' },
      { label: '매복 전술', desc: '지형을 이용해 기습. 균형 잡힌 결과가 예상됩니다.', reward: 'ambush' },
      { label: '방어 강화', desc: '거점 방어를 굳히고 진격을 저지합니다. 안전하지만 소극적입니다.', reward: 'defend' },
      { label: '정찰만 파견', desc: '상황 파악 후 신중하게 대응합니다. 즉각 효과는 없습니다.', reward: 'scout' },
    ],
  },
  {
    id: 'market_crisis',
    icon: '📉',
    title: '📉 시장 물가 폭등',
    desc: '물가가 급격히 치솟고 있습니다. 주민들의 불만이 증가 중입니다. 어떤 조치를 취하시겠습니까?',
    condition: (gs) => true,
    options: [
      { label: '길드 자금 투입', desc: '재정에서 자금을 지출해 가격을 안정시킵니다.', reward: 'invest' },
      { label: '자원 채집 의무화', desc: '모험가들에게 자원 채집을 지시해 공급을 늘립니다.', reward: 'gather' },
      { label: '원정 교역 허가', desc: '외부 상인단을 유치해 장기적으로 안정화합니다.', reward: 'trade' },
      { label: '가격 통제령 발동', desc: '상한가를 강제 설정합니다. 부작용이 있을 수 있습니다.', reward: 'control' },
    ],
  },
  {
    id: 'ruins_found',
    icon: '🗺',
    title: '🗺 고대 유적 발견',
    desc: '인근 산맥에서 대규모 고대 유적이 발견됐습니다. 먼저 차지하기 전에 결정을 내려야 합니다.',
    condition: (gs) => true,
    options: [
      { label: '즉시 탐험대 파견', desc: '빠르게 탐험합니다. 경험치와 유물 획득이 가능합니다.', reward: 'explore_now' },
      { label: '전문가 대동 후 탐험', desc: '마법사나 현자를 앞세워 안전하게 조사합니다.', reward: 'explore_safe' },
      { label: '왕국에 보고', desc: '왕국 학자에게 넘기고 보상금을 받습니다.', reward: 'report' },
      { label: '봉인 후 방치', desc: '위험할 수 있으니 접근을 막습니다.', reward: 'seal' },
    ],
  },
  {
    id: 'town_petition',
    icon: '📜',
    title: '📜 주민 청원',
    desc: '마을 주민들이 길드에 지원을 요청하는 청원서를 제출했습니다. 어떤 방향으로 지원하시겠습니까?',
    condition: (gs) => true,
    options: [
      { label: '훈련 시설 강화', desc: '전투력을 올립니다. 모험가 전원 STR·END +1.', reward: 'train' },
      { label: '의료 지원', desc: '부상자 치료와 회복에 집중합니다. 전원 HP 완전 회복·상태이상 치료.', reward: 'heal' },
      { label: '마을 대축제 개최', desc: '금화를 써서 모두의 사기와 관계를 높입니다.', reward: 'festival' },
      { label: '청원 기각', desc: '당장은 여유가 없습니다.', reward: 'reject' },
    ],
  },
  {
    id: 'kingdom_aid',
    icon: '👑',
    title: '👑 왕국 원정 지원 요청',
    desc: '왕국 원수가 서신을 보내왔습니다. "마왕군 토벌 원정에 귀 길드의 전력을 지원해 주시오." 어떻게 하시겠습니까?',
    condition: (gs) => (gs.day || 0) >= 50,
    options: [
      { label: '전면 파병', desc: '전원을 원정에 보냅니다. 위협도가 크게 감소하지만 부상 위험.', reward: 'full_deploy' },
      { label: '정예 인원 파견', desc: '강한 모험가 일부만 파견합니다.', reward: 'partial_deploy' },
      { label: '물자 지원', desc: '직접 파병 대신 물자와 자금을 지원합니다.', reward: 'supply_aid' },
      { label: '정중히 거절', desc: '우리도 여력이 없다고 전합니다. 왕실 관계에 영향이 있을 수 있습니다.', reward: 'refuse' },
    ],
  },
  {
    id: 'mysterious_visitor',
    icon: '🧙',
    title: '🧙 수수께끼의 방문자',
    desc: '정체불명의 인물이 길드를 찾아왔습니다. 깊은 눈빛에서 범상치 않음이 느껴집니다.',
    condition: (gs) => true,
    options: [
      { label: '정보 구매', desc: '금화를 내고 세계의 비밀을 얻습니다.', reward: 'buy_info' },
      { label: '합류 제안', desc: '길드에 영입을 요청합니다.', reward: 'recruit' },
      { label: '조용히 돌려보낸다', desc: '위험을 감수하지 않습니다.', reward: 'dismiss' },
      { label: '정체 추궁', desc: '신분을 밝히라고 요구합니다. 결과는 알 수 없습니다.', reward: 'interrogate' },
    ],
  },
  {
    id: 'dark_omen',
    icon: '🌑',
    title: '🌑 불길한 전조',
    desc: '점성술사가 끔찍한 예언을 전해왔습니다. "어둠이 왕국을 삼키기 전에 행동하라." 어떻게 대비하시겠습니까?',
    condition: (gs) => (gs.world?.threatLevel || 0) >= 45,
    options: [
      { label: '비상 훈련 실시', desc: '모든 모험가를 전투 대비 훈련에 투입합니다.', reward: 'prepare' },
      { label: '성전 봉헌', desc: '성당에 대규모 봉헌을 드려 신성력을 강화합니다.', reward: 'offering' },
      { label: '연합 전선 결성', desc: '인근 길드들과 연합 전선을 구성합니다.', reward: 'alliance' },
      { label: '예언 무시', desc: '점쟁이의 말을 믿지 않습니다.', reward: 'ignore' },
    ],
  },
  {
    id: 'legendary_hero',
    icon: '⭐',
    title: '⭐ 전설의 용사 소문',
    desc: '먼 지방에서 전설적인 실력을 가진 용사가 동료를 찾고 있다는 소문이 들립니다. 영입을 시도하시겠습니까?',
    condition: (gs) => (gs.day || 0) >= 80,
    options: [
      { label: '파격 조건으로 영입', desc: '거금을 투자해 반드시 영입합니다. 전원 사기 상승.', reward: 'hire_paid' },
      { label: '소문만 확인', desc: '먼저 정보를 수집합니다.', reward: 'investigate' },
      { label: '경쟁 길드에 소개', desc: '소개료를 받고 연결해줍니다.', reward: 'pass_on' },
      { label: '무관심', desc: '소문은 소문일 뿐입니다.', reward: 'ignore' },
    ],
  },
  {
    id: 'supply_shortage',
    icon: '📦',
    title: '📦 [길드 공표] 물자 수급 퀘스트',
    desc: '길드 창고 점검 결과, 일부 핵심 물자의 재고가 위험 수준으로 떨어졌습니다.\n길드장으로서 수급 우선순위를 결정해 모험가들에게 임무를 부여하십시오.',
    condition: (gs) => {
      const SUPPLY_CATS = new Set(['food','consumable','material','loot']);
      return Object.values(gs.market || {}).some(item => item.supplyIndex < 25 && SUPPLY_CATS.has(item.cat));
    },
    isQuestScroll: true,
    buildOptions: (gs) => {
      const SUPPLY_CATS = new Set(['food','consumable','material','loot']);
      // 품귀 순으로 정렬, 최대 4개
      const lowItems = Object.entries(gs.market || {})
        .filter(([, item]) => item.supplyIndex < 35 && SUPPLY_CATS.has(item.cat))
        .sort(([, a], [, b]) => a.supplyIndex - b.supplyIndex)
        .slice(0, 4);

      // 공급지수에 따른 등급: <5 → S, <12 → A, <20 → B, <35 → C
      const getGrade = (si) => si < 5 ? 'S' : si < 12 ? 'A' : si < 20 ? 'B' : 'C';
      const getRewardGold = (si) => si < 5 ? 400 : si < 12 ? 280 : si < 20 ? 180 : 100;
      const getSupplyBoost = (si) => si < 5 ? 60 : si < 12 ? 45 : si < 20 ? 30 : 20;

      return lowItems.map(([id, item]) => {
        const grade = getGrade(item.supplyIndex);
        const gold = getRewardGold(item.supplyIndex);
        const boost = getSupplyBoost(item.supplyIndex);
        return {
          label: `${item.name} 수급`,
          desc: `현재 재고: ${Math.floor(item.supplyIndex)} / 목표: 60 &nbsp;|&nbsp; 시장가: ${item.currentPrice}G<br>임무 성공 → 공급 +${boost}, 보상금 ${gold}G 분배`,
          reward: id,
          grade,
        };
      });
    },
  },
];

function processGuildAnnounce(gs, dayLogs) {
  // Cooldown: at least 20 days between announces
  if (!gs.world.lastAnnounceDay) gs.world.lastAnnounceDay = 0;
  if (gs.day - gs.world.lastAnnounceDay < 20) return;
  // Prevent stacking
  if (gs.pendingChoices.some(c => c.type === 'guild_announce')) return;
  // 5% per day after cooldown (avg ~40 days between events)
  if (Math.random() > 0.05) return;

  // per-template 쿨다운: 같은 공표는 365일(1년)에 1번만
  if (!gs.world._announceHistory) gs.world._announceHistory = {};
  const available = GUILD_ANNOUNCE_POOL.filter(t => {
    if (!t.condition(gs)) return false;
    const last = gs.world._announceHistory[t.id] || 0;
    return (gs.day - last) >= 365;
  });
  if (!available.length) return;

  // Weight: dark_omen + threat_alert get double weight when threat is high
  let pool = [...available];
  if ((gs.world?.threatLevel || 0) >= 60) {
    const heavy = available.filter(t => t.id === 'threat_alert' || t.id === 'dark_omen');
    pool = [...pool, ...heavy]; // double weight
  }

  const template = pick(pool);
  gs.world.lastAnnounceDay = gs.day;
  gs.world._announceHistory[template.id] = gs.day; // 이 템플릿 사용 기록

  const d = getDayDate(gs.day);
  // 동적 옵션 생성 지원 (supply_shortage 등)
  const opts = template.buildOptions ? template.buildOptions(gs) : template.options;
  if (!opts || !opts.length) return; // 옵션이 없으면 (품귀 품목 없음 등) 스킵
  gs.pendingChoices.push({
    type: 'guild_announce',
    templateId: template.id,
    title: template.title,
    desc: `[길드장 공표 — ${d.label}]\n\n${template.desc}`,
    options: opts,
    isQuestScroll: !!template.isQuestScroll,
  });
  dayLogs.push({ logClass: 'log-world', text: `${template.icon} [길드장 공표] ${template.title} — 결정을 내려야 합니다!` });
}

function resolveGuildAnnounce(reward, choice, gs) {
  const alive = gs.characters.filter(c => !c.isDead && !c.isRetired);
  if (!alive.length) return;
  const logs = [];
  const tid = choice.templateId;

  if (tid === 'threat_alert') {
    if (reward === 'frontal') {
      alive.forEach(c => { c.hp = Math.max(1, c.hp - randInt(10, 25)); c.exp += 15; c.gold += randInt(60, 120); });
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 15);
      logs.push({ logClass: 'log-party', text: `⚔ 전면 출격! 치열한 전투 끝에 마왕군 선발대를 격파했다. (위협도 -15, 전원 부상, 보상 획득)` });
      logs.push(dlgLog('길드장', '잘 싸웠다. 오늘의 피는 헛되지 않을 것이다.'));
    } else if (reward === 'ambush') {
      const chosen = alive.slice(0, Math.min(3, alive.length));
      chosen.forEach(c => { c.hp = Math.max(1, c.hp - randInt(5, 15)); c.exp += 10; c.gold += 80; });
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 10);
      logs.push({ logClass: 'log-party', text: `🌲 매복 전술 성공! 마왕군에 타격을 입혔다. (위협도 -10, 소수 부상)` });
    } else if (reward === 'defend') {
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 5);
      logs.push({ logClass: 'log-world', text: `🛡 거점 방어를 강화했다. 마왕군 진격이 둔화됐다. (위협도 -5)` });
    } else {
      alive.slice(0,1).forEach(c => c.exp += 5);
      logs.push({ logClass: 'log-system', text: `🔭 정찰대를 파견했다. 마왕군의 규모를 파악했다. (소량 경험치 획득)` });
    }

  } else if (tid === 'market_crisis') {
    if (reward === 'invest') {
      const amt = Math.min(gs.world.townGold||0, 200);
      gs.world.townGold = Math.max(0, (gs.world.townGold||0) - amt);
      gs.market && Object.values(gs.market).forEach(m => { m.supplyIndex = Math.min(200, m.supplyIndex + 15); });
      logs.push({ logClass: 'log-economy', text: `💰 길드 자금 ${amt}G를 투입해 시장을 안정시켰다. (공급 +15 전품목)` });
    } else if (reward === 'gather') {
      alive.forEach(c => { c.exp += 8; c.actionCounts.survival = (c.actionCounts.survival||0) + 2; });
      ['herb','iron_ore','wood'].forEach(r => gs.world.baseResources[r] = (gs.world.baseResources[r]||0) + 20);
      logs.push({ logClass: 'log-economy', text: `⛏ 자원 채집단 파견! 자원이 대량 확보됐다. 시장 공급이 늘었다. (+20 약초·철광·목재)` });
    } else if (reward === 'trade') {
      gs.market && Object.values(gs.market).forEach(m => {
        m.supplyIndex = Math.min(200, m.supplyIndex + 8);
        m.currentPrice = Math.max(m.basePrice, Math.round(m.currentPrice * 0.92));
      });
      logs.push({ logClass: 'log-economy', text: `🤝 원정 교역로가 개설됐다. 물가가 소폭 하락하고 공급이 안정됐다.` });
    } else {
      gs.market && Object.values(gs.market).forEach(m => m.currentPrice = Math.max(m.basePrice, Math.round(m.currentPrice * 0.85)));
      alive.forEach(c => c.sanity = Math.max(0, c.sanity - 5));
      logs.push({ logClass: 'log-economy', text: `📋 가격 통제령이 발동됐다. 단기적으로 가격이 낮아졌지만 상인들의 불만이 높아졌다. (이성 -5)` });
    }

  } else if (tid === 'ruins_found') {
    if (reward === 'explore_now') {
      const ex = alive.slice(0, Math.min(3, alive.length));
      if (Math.random() < 0.65) {
        ex.forEach(c => { c.exp += 20; c.gold += 80; });
        gs.world.baseResources.ancient_artifact = (gs.world.baseResources.ancient_artifact||0) + 2;
        logs.push({ logClass: 'log-party', text: `🗺 탐험대가 유적에서 고대 유물 2점과 금화를 발견했다!` });
        if (ex.length >= 2) { const g = pick(DLG_EXPLORE_WIN); logs.push(dlgPair(ex[0].name, g[0], ex[1].name, g[1])); }
      } else {
        ex.forEach(c => { c.hp = Math.max(1, c.hp - 15); c.exp += 8; });
        logs.push({ logClass: 'log-party', text: `🗺 탐험 중 함정에 걸렸다! 유물은 없었고 부상만 입었다.` });
        if (ex.length >= 2) { const g = pick(DLG_EXPLORE_FAIL); logs.push(dlgPair(ex[0].name, g[0], ex[1].name, g[1])); }
      }
    } else if (reward === 'explore_safe') {
      const expert = alive.find(c => c.class === 'sage' || c.class === 'mage') || alive[0];
      if (expert) { expert.exp += 30; expert.actionCounts.magic = (expert.actionCounts.magic||0) + 3; }
      gs.world.baseResources.ancient_artifact = (gs.world.baseResources.ancient_artifact||0) + 1;
      gs.world.baseResources.magic_crystal = (gs.world.baseResources.magic_crystal||0) + 5;
      logs.push({ logClass: 'log-party', text: `📚 전문가와 체계적으로 유적을 조사했다. 유물 1점과 마법 결정 5개를 발굴했다.` });
    } else if (reward === 'report') {
      const rGold = randInt(150, 300);
      gs.world.townGold = (gs.world.townGold||0) + rGold;
      logs.push({ logClass: 'log-economy', text: `👑 왕국 학자에게 유적을 인계했다. 보상금 ${rGold}G가 길드 금고에 입금됐다.` });
    } else {
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 2);
      logs.push({ logClass: 'log-system', text: `🔒 유적 입구를 봉인했다. 위험 요소가 차단됐다. (위협도 -2)` });
    }

  } else if (tid === 'town_petition') {
    if (reward === 'train') {
      alive.forEach(c => { c.stats.str = (c.stats.str||0)+1; c.stats.end = (c.stats.end||0)+1; c.maxHp = 50+c.stats.str*5+c.stats.end*3; });
      logs.push({ logClass: 'log-special', text: `🥊 훈련 강화 명령! 모든 모험가의 STR·END가 +1 성장했다.` });
      logs.push(dlgLog('길드장', '훈련을 게을리하면 마왕군에게 당한다. 몸으로 익혀라.'));
    } else if (reward === 'heal') {
      alive.forEach(c => { c.hp = c.maxHp; c.statusEffects = []; c.fatigue = Math.max(0, c.fatigue-20); });
      logs.push({ logClass: 'log-special', text: `💊 의료 지원 시행. 모든 모험가의 HP가 완전 회복되고 상태이상이 치료됐다.` });
    } else if (reward === 'festival') {
      const fcost = Math.min(gs.world.townGold||0, 150);
      gs.world.townGold = Math.max(0, (gs.world.townGold||0) - fcost);
      alive.forEach(c => {
        c.sanity = Math.min(100, c.sanity + 8);
        c.fatigue = Math.max(0, c.fatigue - 20);
        c.relationships.forEach(r => { if (r.affection > 0) r.affection = Math.min(r.affection + 1, 200); });
      });
      logs.push({ logClass: 'log-special', text: `🎉 마을 대축제! 모두의 이성 +8, 피로 -20, 기존 친분 호감도 +1. 분위기가 활기차다.` });
      logs.push(dlgLog('길드장', '오늘만큼은 마음껏 쉬어라. 내일의 싸움을 위한 재충전이다.'));
    } else {
      alive.forEach(c => c.sanity = Math.max(0, c.sanity - 3));
      logs.push({ logClass: 'log-system', text: `📋 청원을 기각했다. 주민들의 실망이 느껴진다. (전원 이성 -3)` });
    }

  } else if (tid === 'kingdom_aid') {
    if (reward === 'full_deploy') {
      alive.forEach(c => { c.hp = Math.max(1, c.hp - randInt(15, 30)); c.exp += 20; c.gold += 120; });
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 20);
      logs.push({ logClass: 'log-party', text: `⚔ 전면 파병! 치열한 전투 끝에 왕국 원정을 지원했다. (위협도 -20, 전원 부상, 보상 +120G)` });
      logs.push(dlgLog('길드장', '왕국을 위해 싸운 우리의 이름, 오래도록 기억될 것이다.'));
    } else if (reward === 'partial_deploy') {
      const chosen = alive.slice(0, Math.min(2, alive.length));
      chosen.forEach(c => { c.hp = Math.max(1, c.hp - randInt(10, 20)); c.exp += 15; c.gold += 100; });
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 12);
      logs.push({ logClass: 'log-party', text: `⚔ 정예 인원 파견. 부상을 입었지만 임무를 완수했다. (위협도 -12, +100G)` });
    } else if (reward === 'supply_aid') {
      const supplyGold = Math.min(gs.world.townGold||0, 200);
      gs.world.townGold = Math.max(0, (gs.world.townGold||0) - supplyGold);
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 8);
      logs.push({ logClass: 'log-economy', text: `📦 물자 ${supplyGold}G 어치를 왕국에 지원했다. (위협도 -8)` });
    } else {
      alive.forEach(c => c.sanity = Math.max(0, c.sanity - 5));
      logs.push({ logClass: 'log-system', text: `👑 왕국 지원 요청을 거절했다. 왕실과의 관계가 냉랭해졌다. (전원 이성 -5)` });
    }

  } else if (tid === 'mysterious_visitor') {
    if (reward === 'buy_info') {
      const infoCost = 100;
      if ((gs.world.townGold||0) >= infoCost) {
        gs.world.townGold -= infoCost;
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 8);
        logs.push({ logClass: 'log-world', text: `🧙 비밀 정보를 구입했다. 마왕군의 약점이 밝혀졌다. (위협도 -8)` });
        logs.push(dlgLog('수수께끼의 방문자', '...알고 싶은 것을 알려주었소. 나머지는 그대들의 몫이오.'));
      } else {
        logs.push({ logClass: 'log-system', text: `💸 자금 부족으로 정보를 구입하지 못했다.` });
      }
    } else if (reward === 'recruit') {
      alive.forEach(c => c.exp += 15);
      logs.push({ logClass: 'log-special', text: `✨ 방문자가 길드에 합류 의사를 밝혔다. 사기가 올랐다. (전원 EXP +15)` });
      logs.push(dlgLog('수수께끼의 방문자', '...오래 혼자였소. 이제 함께 해도 되겠소?'));
    } else if (reward === 'dismiss') {
      logs.push({ logClass: 'log-system', text: `🚪 방문자를 조용히 돌려보냈다. 특별한 일은 없었다.` });
    } else {
      if (Math.random() < 0.45) {
        alive.forEach(c => c.exp += 10);
        logs.push({ logClass: 'log-social', text: `🔍 정체를 추궁하자 방문자가 고위 정보원임을 밝혔다. 귀중한 정보를 얻었다.` });
      } else {
        alive.forEach(c => c.sanity = Math.max(0, c.sanity - 8));
        logs.push({ logClass: 'log-status', text: `💀 방문자는 갑자기 사라졌다. 그 눈빛이 뇌리에 박혔다. (전원 이성 -8)` });
      }
    }

  } else if (tid === 'dark_omen') {
    if (reward === 'prepare') {
      alive.forEach(c => { c.exp += 25; c.stats.str = (c.stats.str||0)+1; c.maxHp = 50+c.stats.str*5+c.stats.end*3; });
      logs.push({ logClass: 'log-special', text: `🥊 비상 훈련 완료! 모든 모험가가 어둠에 맞설 준비를 마쳤다. (EXP +25, STR+1)` });
      logs.push(dlgLog('길드장', '두려워할 필요 없다. 우리가 먼저 어둠을 찾아 나설 것이다.'));
    } else if (reward === 'offering') {
      const targets = alive.filter(c => ['cleric','paladin','druid'].includes(c.class));
      const list = targets.length ? targets : alive;
      list.forEach(c => { c.stats.fai = (c.stats.fai||0)+1; c.sanity = Math.min(100, c.sanity+5); });
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 5);
      logs.push({ logClass: 'log-special', text: `⛪ 대규모 봉헌식이 거행됐다. 신성한 힘이 깃들었다. (위협도 -5, FAI+1, 이성+5)` });
    } else if (reward === 'alliance') {
      gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 12);
      alive.forEach(c => c.relationships.forEach(r => { if (r.affection > 0) r.affection = Math.min(r.affection + 2, 200); }));
      logs.push({ logClass: 'log-world', text: `🤝 인근 길드들과 연합 전선이 구성됐다. (위협도 -12, 기존 친분 호감도+2)` });
    } else {
      gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 5);
      logs.push({ logClass: 'log-system', text: `🌑 예언을 무시했다. 어둠이 조금 더 가까워진 것 같다. (위협도 +5)` });
    }

  } else if (tid === 'legendary_hero') {
    if (reward === 'hire_paid') {
      const hireCost = 300;
      const richest = alive.slice().sort((a,b) => b.gold - a.gold)[0];
      const canAfford = (gs.world.townGold||0) >= hireCost || (richest && richest.gold >= hireCost);
      if (canAfford) {
        if ((gs.world.townGold||0) >= hireCost) gs.world.townGold -= hireCost;
        else richest.gold -= hireCost;
        alive.forEach(c => { c.exp += 20; c.stats.str = (c.stats.str||0)+1; c.maxHp = 50+c.stats.str*5+c.stats.end*3; });
        logs.push({ logClass: 'log-special', text: `⭐ 전설의 용사가 길드에 합류했다! 사기가 치솟았다. (전원 EXP+20, STR+1)` });
        logs.push(dlgLog('전설의 용사', '나를 원하는 곳은 많았지만... 이 길드라면 함께 싸울 수 있을 것 같소.'));
      } else {
        logs.push({ logClass: 'log-system', text: `💸 자금이 부족해 영입에 실패했다.` });
      }
    } else if (reward === 'investigate') {
      alive.slice(0,1).forEach(c => c.exp += 5);
      logs.push({ logClass: 'log-system', text: `🔍 정보를 수집했다. 그 용사의 실력은 실제로 뛰어난 것 같다.` });
    } else if (reward === 'pass_on') {
      const ref = randInt(100, 200);
      gs.world.townGold = (gs.world.townGold||0) + ref;
      logs.push({ logClass: 'log-economy', text: `💰 소개료 ${ref}G를 받고 경쟁 길드에 연결했다.` });
    } else {
      logs.push({ logClass: 'log-system', text: `🌟 소문을 무시했다. 그 용사는 다른 길드에 합류했다는 이야기가 들린다.` });
    }

  } else if (tid === 'supply_shortage') {
    // reward = item id (e.g. 'travel_food', 'healing_potion', ...)
    const targetItem = gs.market[reward];
    if (targetItem) {
      // 성공 여부: 전투/탐험 능력에 따라 확률 결정 (더 많은 인원 = 더 높은 성공률)
      const successChance = Math.min(0.92, 0.50 + alive.length * 0.08);
      const succeeded = Math.random() < successChance;
      const itemName = targetItem.name;

      if (succeeded) {
        // 공급 부족 등급에 따른 보상 결정
        const si = targetItem.supplyIndex;
        const boost  = si < 5 ? 60 : si < 12 ? 45 : si < 20 ? 30 : 20;
        const gold   = si < 5 ? 400 : si < 12 ? 280 : si < 20 ? 180 : 100;
        targetItem.supplyIndex = Math.min(200, targetItem.supplyIndex + boost);
        alive.forEach(c => { c.exp += Math.floor(gold / 20); c.gold += Math.floor(gold / alive.length); });
        gs.world.townGold = (gs.world.townGold||0) + Math.floor(gold * 0.3);
        logs.push({ logClass: 'log-economy', text: `📦 수급 퀘스트 성공! [${itemName}]의 재고가 보충됐다. (공급 +${boost}, 보상금 ${gold}G 분배)` });
        const hero = alive[Math.floor(Math.random() * alive.length)];
        logs.push(dlgLog(hero.name, `겨우 구해왔습니다. ${itemName}이(가) 동났을 때 얼마나 힘들었는지 몰라요.`));
      } else {
        // 실패: 소량만 확보
        const partialBoost = Math.floor(targetItem.supplyIndex < 12 ? 10 : 6);
        targetItem.supplyIndex = Math.min(200, targetItem.supplyIndex + partialBoost);
        alive.forEach(c => { c.hp = Math.max(1, c.hp - randInt(5, 15)); c.exp += 5; });
        logs.push({ logClass: 'log-economy', text: `📦 수급 퀘스트 부분 성공. [${itemName}]을 소량 확보했지만 충분하지 않다. (공급 +${partialBoost}, 전원 소량 부상)` });
        const hero = alive[Math.floor(Math.random() * alive.length)];
        logs.push(dlgLog(hero.name, `최선을 다했는데... ${itemName}은 구하기가 정말 어려웠어요.`));
      }
    } else {
      logs.push({ logClass: 'log-system', text: `📦 임무 대상 물자를 확인할 수 없습니다.` });
    }
  }

  appendToLog(logs);
}

// ─── 길드 퀘스트 옵션 풀 (12개 → 매번 랜덤 4개 선택) ───
const GUILD_QUEST_POOL = [
  // ── 전투 의뢰
  { id:'gq_beast',     label:'🐗 인근 숲의 이상 징후',     desc:'마을 인근 숲에서 주민 실종이 이어지고 있다. 비교적 대응하기 쉬운 위협으로 보인다.',                                          reward:'easy'    },
  { id:'gq_dungeon',   label:'🏯 실종된 탐험대 수색',       desc:'지하 던전으로 내려간 탐험대가 사흘째 소식이 없다. 구출인지 수습인지는 내려가봐야 안다.',                                     reward:'medium'  },
  { id:'gq_assault',   label:'👿 마왕군 거점 타격',          desc:'기밀 정보에 따르면 마왕군의 소규모 전진 기지가 이틀 거리에 있다. 전멸시킬 수 있다면 큰 전환점이 될 것이다.',                reward:'hard'    },
  { id:'gq_bandit',    label:'🗡 산적 소탕령',               desc:'왕도 교역로를 끊는 산적단이 기승을 부리고 있다. 기사단이 손쓰기 전에 길드가 먼저 치우면 포상이 따른다.',                      reward:'medium'  },
  { id:'gq_undead',    label:'💀 묘지에서 일어난 것들',      desc:'외곽 묘지에서 언데드가 출몰한다는 제보가 들어왔다. 성직자나 전사 없이는 무리일지도 모른다.',                               reward:'medium'  },
  { id:'gq_dragon',    label:'🐉 용의 둥지 탐문',            desc:'북부 산맥에 소형 드래곤이 출몰한다는 소문이다. 직접 상대하기보다 행동 패턴 파악이 목표다.',                                reward:'hard'    },
  // ── 탐험·조사 의뢰
  { id:'gq_ruin',      label:'🗺 봉인된 고대 유적 조사',     desc:'왕국 학술원이 유적 탐사를 의뢰해왔다. 무력보다 지식이 필요한 임무다.',                                                      reward:'explore' },
  { id:'gq_map',       label:'🧭 미지의 영역 지도 제작',      desc:'왕도 동쪽 황야에 대한 정식 지도가 없다. 생환하기만 하면 상당한 보수가 지급된다.',                                           reward:'explore' },
  { id:'gq_spy',       label:'🔍 인근 도시의 정황 파악',      desc:'이웃 도시와의 관계가 미묘하다. 표 나지 않게 분위기를 살피고 돌아와야 한다.',                                              reward:'trade'   },
  // ── 경제·외교 의뢰
  { id:'gq_escort',    label:'📦 왕도행 상단 호위',           desc:'상단이 군수 물자를 실어 왕도로 떠난다. 무력 충돌은 없을 것이다. 아마도.',                                                  reward:'trade'   },
  { id:'gq_diplomat',  label:'🤝 인접 마을과의 협정 중재',    desc:'이웃 마을이 무역 협정을 원하고 있다. 협상 테이블에서 우리 길드의 이익을 지켜내야 한다.',                                    reward:'trade'   },
  { id:'gq_rest',      label:'💤 내실 다지기',                desc:'서두르지 않는 것도 전략이다. 지금은 길드의 역량을 다지는 시간으로 삼자.',                                                  reward:'rest'    },
];

// ─── 길드 퀘스트 처리 ────────────────────
function processGuildQuests(gs, dayLogs) {
  if (!gs.world.buildings?.guild) return;
  if (gs.pendingChoices.some(c => c.type === 'guild_quest')) return; // 중복 방지
  // 평균 20일마다 한 번 (5% per day)
  if (Math.random() > 0.05) return;

  // 옵션별 쿨다운: 같은 의뢰는 180일(반년)에 1번
  if (!gs.world._questHistory) gs.world._questHistory = {};
  const available = GUILD_QUEST_POOL.filter(q => {
    const last = gs.world._questHistory[q.id] || 0;
    return (gs.day - last) >= 180;
  });
  // 가용 의뢰가 3개 미만이면 전체 풀에서 뽑기 (극초반 안전망)
  const pool = available.length >= 3 ? available : GUILD_QUEST_POOL;

  // 무작위로 4개 (혹은 전부) 선택
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, Math.min(4, shuffled.length));

  gs.pendingChoices.push({
    type: 'guild_quest',
    title: '📋 길드 의뢰판',
    desc: '새로운 의뢰가 게시판에 올라왔습니다. 길드장으로서 방향을 정하세요.',
    options: chosen.map(q => ({ label: q.label, desc: q.desc, reward: q.reward, _questId: q.id })),
  });
  dayLogs.push({ logClass: 'log-system', text: `📋 길드 게시판에 새로운 의뢰가 올라왔다! 선택지를 확인하세요.` });
}

function resolveGuildQuest(rewardType, gs, questId) {
  // 선택된 의뢰 쿨다운 기록
  if (questId) {
    if (!gs.world._questHistory) gs.world._questHistory = {};
    gs.world._questHistory[questId] = gs.day;
  }
  const alive = gs.characters.filter(c => !c.isDead && !c.isRetired);
  if (!alive.length) return;
  const logs = [];

  switch (rewardType) {
    case 'easy': {
      const gold = randInt(50, 100);
      const char = pick(alive);
      char.gold += gold;
      gs.world.baseResources.monster_material = (gs.world.baseResources.monster_material||0) + 10;
      logs.push({ logClass: 'log-party', text: `🐗 ${char.name}이(가) 몬스터 소탕 의뢰를 완수했다. 금화 ${gold}G와 소재를 획득했다.` });
      break;
    }
    case 'medium': {
      const gold = randInt(100, 250);
      const targets = alive.slice(0, Math.min(2, alive.length));
      const goldEach = Math.floor(gold / targets.length);
      targets.forEach(c => { c.gold += goldEach; c.exp += 20; c.hp = Math.max(1, c.hp - randInt(5, 15)); });
      logs.push({ logClass: 'log-party', text: `🏯 파티가 던전 공략을 완수했다! 금화 ${gold}G와 경험치를 획득했다. (HP 손실)` });
      break;
    }
    case 'hard': {
      const success = Math.random() < 0.55;
      if (success) {
        const gold = randInt(300, 600);
        alive.forEach(c => { c.gold += Math.floor(gold / alive.length); c.exp += 35; });
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 10);
        logs.push({ logClass: 'log-party', text: `👿 마왕군 토벌 성공! 금화 ${gold}G 분배, 위협도 -10!` });
      } else {
        alive.forEach(c => { c.hp = Math.max(1, c.hp - randInt(15, 30)); });
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 3);
        logs.push({ logClass: 'log-party', text: `👿 마왕군 토벌 실패... 심각한 부상을 입고 퇴각했다. (위협도 +3)` });
      }
      break;
    }
    case 'trade': {
      const gold = randInt(30, 60);
      alive.forEach(c => c.gold += Math.floor(gold / alive.length));
      gs.market && Object.values(gs.market).forEach(m => { m.supplyIndex = Math.min(200, m.supplyIndex + 5); });
      logs.push({ logClass: 'log-economy', text: `📦 물자 수송 완료. 금화 ${gold}G 획득, 시장 공급 안정.` });
      break;
    }
  }
  appendToLog(logs);
}

function leaveParty(char, gs) {
  if (!char.currentPartyId) return;
  const party = gs.parties.find(p => p.id === char.currentPartyId);
  char.currentPartyId = null;
  if (party) {
    party.memberIds = party.memberIds.filter(id => id !== char.id);
    if (party.memberIds.length < 2) {
      // Dissolve remaining
      for (const mid of party.memberIds) {
        const m = gs.characters.find(c => c.id === mid);
        if (m) m.currentPartyId = null;
      }
      gs.parties = gs.parties.filter(p => p.id !== party.id);
    }
  }
}

function disbandParty(party, gs, dayLogs) {
  for (const mid of party.memberIds) {
    const m = gs.characters.find(c => c.id === mid);
    if (m) m.currentPartyId = null;
  }
  gs.parties = gs.parties.filter(p => p.id !== party.id);
}

// ═══════════════════════════════════════
// EQUIPMENT SYSTEM
// ═══════════════════════════════════════

// 장비 장착 — _equipBonuses에 누적, 기존 장비 해제 후 새 장비 적용
function equipItem(char, item, dayLogs) {
  if (!item || !item.id) return;
  const def = EQUIPMENT_DEFS[item.id];
  if (!def) return;
  const slot = def.slot;

  if (!char._equipBonuses) char._equipBonuses = { str:0, int:0, fai:0, agi:0, cha:0, end:0 };

  // 기존 장비 보너스 제거
  const old = char.equipment[slot];
  if (old) {
    const oldDef = EQUIPMENT_DEFS[old.id];
    if (oldDef) {
      for (const [stat, bonus] of Object.entries(oldDef.bonus)) {
        char._equipBonuses[stat] = (char._equipBonuses[stat] || 0) - bonus;
      }
    }
    // 기존 장비 인벤토리로
    char.inventory.push({ id: old.id, name: old.name, icon: old.icon, qty: 1 });
  }

  // 새 장비 장착
  char.equipment[slot] = { id: item.id, name: def.name, icon: def.icon, tier: def.tier };
  for (const [stat, bonus] of Object.entries(def.bonus)) {
    char._equipBonuses[stat] = (char._equipBonuses[stat] || 0) + bonus;
  }

  // maxHp 재계산 (end 보너스 반영)
  const effEnd = (char.stats.end || 0) + (char._equipBonuses.end || 0);
  const effStr = (char.stats.str || 0) + (char._equipBonuses.str || 0);
  char.maxHp = 50 + effStr * 5 + effEnd * 3;
  char.hp = Math.min(char.maxHp, char.hp);

  if (dayLogs) {
    const bonusStr = Object.entries(def.bonus).map(([k,v]) => `${STAT_DEF[k]?.abbr||k}+${v}`).join(', ');
    dayLogs.push({ logClass: 'log-system', text: `🛡 ${char.name}이(가) ${def.icon} ${def.name}을(를) 장착했다! (${bonusStr})` });
  }
}

// ═══════════════════════════════════════
// 장비 판매 / 분해 / 강화 시스템
// ═══════════════════════════════════════

// 분해 시 재료 수득표 (tier → resources)
const DISMANTLE_YIELD = {
  0: { wood: 3 },
  1: { iron_ore: 5 },
  2: { iron_ore: 8, magic_crystal: 1 },
  3: { iron_ore: 5, magic_crystal: 4 },
};

// 인벤토리 장비 판매 (판매가: 정가의 35%)
function sellInventoryItem(char, itemIdx, gs) {
  const item = char.inventory[itemIdx];
  if (!item) return null;
  const def = EQUIPMENT_DEFS[item.id];
  if (!def) {
    // 장비가 아닌 아이템 (포션 등) — 시장 가격의 50%
    const mItem = gs.market?.[item.id];
    const price = mItem ? Math.floor(mItem.currentPrice * 0.5) : 5;
    char.gold += price;
    gs.world.townGold = (gs.world.townGold || 0) + price;
    char.inventory.splice(itemIdx, 1);
    return { sold: item.name, price };
  }
  const sellPrice = Math.floor(def.price * 0.35);
  char.gold += sellPrice;
  gs.world.townGold = (gs.world.townGold || 0) + sellPrice;
  char.inventory.splice(itemIdx, 1);
  return { sold: def.name, price: sellPrice };
}

// 인벤토리 장비 분해 (재료 수득)
function dismantleInventoryItem(char, itemIdx, gs) {
  const item = char.inventory[itemIdx];
  if (!item) return null;
  const def = EQUIPMENT_DEFS[item.id];
  if (!def) return null; // 장비가 아니면 분해 불가
  const yield_ = DISMANTLE_YIELD[def.tier] || { wood: 1 };
  for (const [res, amt] of Object.entries(yield_)) {
    gs.world.baseResources[res] = (gs.world.baseResources[res] || 0) + amt;
  }
  char.inventory.splice(itemIdx, 1);
  return { item: def.name, yield: yield_ };
}

// 대장간 장비 강화 — 동일 tier 아이템 2개 + 자재 → 다음 tier 장비
// 성공 시 동일 슬롯의 랜덤 다음 tier 장비 획득
function forgeUpgradeItem(char, itemIdx, gs) {
  const item = char.inventory[itemIdx];
  if (!item) return { ok: false, reason: '아이템 없음' };
  const def = EQUIPMENT_DEFS[item.id];
  if (!def) return { ok: false, reason: '장비가 아님' };

  const currentTier = def.tier;
  if (currentTier >= 3) return { ok: false, reason: '이미 최고 등급입니다.' };

  // 동일 tier, 동일 slot의 다른 아이템이 인벤토리에 있어야 함
  const secondIdx = char.inventory.findIndex((it, i) => {
    if (i === itemIdx) return false;
    const d = EQUIPMENT_DEFS[it.id];
    return d && d.slot === def.slot && d.tier === currentTier;
  });
  if (secondIdx < 0) return { ok: false, reason: `같은 슬롯 tier ${currentTier} 장비가 하나 더 필요합니다.` };

  // 필요 자재: tier에 따라 증가
  const matCost = { iron_ore: (currentTier + 1) * 8, magic_crystal: currentTier * 2 };
  for (const [res, amt] of Object.entries(matCost)) {
    if ((gs.world.baseResources[res] || 0) < amt) {
      return { ok: false, reason: `자재 부족: ${res === 'iron_ore' ? '철광석' : '마법 결정'} ${gs.world.baseResources[res] || 0}/${amt}` };
    }
  }

  // 자재 차감
  for (const [res, amt] of Object.entries(matCost)) {
    gs.world.baseResources[res] -= amt;
  }
  // 두 재료 아이템 제거 (인덱스가 바뀌지 않도록 큰 것 먼저)
  const idxs = [itemIdx, secondIdx].sort((a, b) => b - a);
  idxs.forEach(i => char.inventory.splice(i, 1));

  // 다음 tier 장비 후보
  const nextTierItems = Object.entries(EQUIPMENT_DEFS).filter(([, d]) => d.slot === def.slot && d.tier === currentTier + 1);
  if (!nextTierItems.length) return { ok: false, reason: '다음 tier 장비가 없습니다.' };

  const [newId, newDef] = nextTierItems[Math.floor(Math.random() * nextTierItems.length)];
  char.inventory.push({ id: newId, name: newDef.name, icon: newDef.icon, qty: 1 });
  return { ok: true, result: newDef.name, icon: newDef.icon };
}

// ─── 인벤토리 자동 관리 (대장간 강화 / 분해 / 판매) ───────────────
// 캐릭터가 하루에 한 번 자신의 인벤토리를 정리한다.
// 우선순위: ① 강화(합성) → ② 분해(구식 장비) → ③ 판매(과잉 소지품)
function processInventoryManagement(aliveChars, gs, dayLogs) {
  const RES_NAME = { iron_ore: '철광석', magic_crystal: '마법 결정', wood: '목재' };

  for (const char of aliveChars) {
    if (!char.inventory || !char.inventory.length) continue;

    // ── ⓪ 전리품 판매: 'loot' 카테고리 아이템은 귀환 후 시장에 판매 ──
    let soldLoot = false;
    for (let i = char.inventory.length - 1; i >= 0; i--) {
      const it = char.inventory[i];
      if (it.cat !== 'loot') continue;
      const mkt = gs.market?.[it.id];
      const sellPrice = mkt ? Math.floor(mkt.currentPrice * 0.6) : 20;
      char.gold += sellPrice;
      gs.world.townGold = (gs.world.townGold || 0) + sellPrice;
      if (mkt) mkt.supplyIndex = Math.min(300, mkt.supplyIndex + 2);
      char.inventory.splice(i, 1);
      dayLogs.push({ logClass: 'log-economy', text:
        `🦴 ${char.name}이(가) 전리품 ${it.icon||''}${it.name}을(를) 시장에 ${sellPrice}G에 팔았다.` });
      soldLoot = true;
    }
    if (soldLoot) continue;

    // ── ① 강화: 동일 슬롯·등급 장비 2개 보유 시 대장간에서 합성 ──
    // 30% 기회 (대장간이 있으면 50%)
    const hasForge = !!gs.world.buildings?.forge;
    const forgeChance = hasForge ? 0.5 : 0.3;

    // 인벤토리 내 장비만 수집
    const equipItems = char.inventory
      .map((it, i) => ({ it, i, def: EQUIPMENT_DEFS?.[it.id] }))
      .filter(x => x.def);

    // 합성 가능한 쌍 찾기 (같은 slot + 같은 tier)
    let forged = false;
    outer:
    for (let a = 0; a < equipItems.length; a++) {
      for (let b = a + 1; b < equipItems.length; b++) {
        const da = equipItems[a].def, db = equipItems[b].def;
        if (da.slot !== db.slot || da.tier !== db.tier || da.tier >= 3) continue;
        if (Math.random() > forgeChance) continue;

        // 자재 확인
        const tier = da.tier;
        const matCost = { iron_ore: (tier + 1) * 8, magic_crystal: tier * 2 };
        const hasEnough = Object.entries(matCost).every(([r, amt]) =>
          amt === 0 || (gs.world.baseResources[r] || 0) >= amt);

        if (!hasEnough) {
          // 자재가 부족하면 이 쌍은 건너뜀
          continue;
        }

        // 자재 차감
        for (const [r, amt] of Object.entries(matCost)) {
          if (amt > 0) gs.world.baseResources[r] -= amt;
        }

        // 두 아이템 제거 (큰 인덱스부터)
        const idxs = [equipItems[a].i, equipItems[b].i].sort((x, y) => y - x);
        idxs.forEach(i => char.inventory.splice(i, 1));

        // 다음 tier 후보
        const nextTierItems = Object.entries(EQUIPMENT_DEFS)
          .filter(([, d]) => d.slot === da.slot && d.tier === da.tier + 1);
        if (nextTierItems.length) {
          const [newId, newDef] = nextTierItems[Math.floor(Math.random() * nextTierItems.length)];
          char.inventory.push({ id: newId, name: newDef.name, icon: newDef.icon, cat: 'equipment', qty: 1 });
          const matStr = Object.entries(matCost).filter(([,v])=>v>0)
            .map(([r,v])=>`${RES_NAME[r]||r} ×${v}`).join(', ');
          dayLogs.push({ logClass: 'log-economy', text:
            `⚒ [대장간] ${char.name}이(가) ${equipItems[a].it.name} 2개를 합성해 ${newDef.icon||''}${newDef.name}을(를) 제작했다! (소모: ${matStr})` });
          forged = true;
        }
        break outer;
      }
    }

    if (forged) continue; // 강화 했으면 이날은 다른 행동 스킵

    // ── ② 분해: 장착 슬롯에 더 좋은 장비가 이미 있는데 인벤에 구식 장비가 있을 때 ──
    // 55% 확률
    let dismantled = false;
    for (let i = char.inventory.length - 1; i >= 0; i--) {
      const it = char.inventory[i];
      const def = EQUIPMENT_DEFS?.[it.id];
      if (!def) continue;

      const equippedItem = char.equipment[def.slot];
      const equippedTier = equippedItem ? (EQUIPMENT_DEFS[equippedItem.id]?.tier ?? -1) : -1;

      // 장착한 것이 인벤 아이템보다 tier가 높으면 → 구식
      if (equippedTier > def.tier && Math.random() < 0.55) {
        const yld = DISMANTLE_YIELD[def.tier] || { wood: 1 };
        for (const [r, amt] of Object.entries(yld)) {
          gs.world.baseResources[r] = (gs.world.baseResources[r] || 0) + amt;
        }
        char.inventory.splice(i, 1);
        const matStr = Object.entries(yld).map(([r,v])=>`${RES_NAME[r]||r} ×${v}`).join(', ');
        dayLogs.push({ logClass: 'log-economy', text:
          `🔨 ${char.name}이(가) 낡은 ${it.icon||''}${it.name}을(를) 분해해 재료를 얻었다. (${matStr})` });
        dismantled = true;
        break; // 하루에 한 개씩
      }
    }

    if (dismantled) continue;

    // ── ③ 판매: 인벤토리 5개 초과 시 가장 약한 장비 or 잉여 소모품 판매 ──
    // 45% 확률
    if (char.inventory.length > 5 && Math.random() < 0.45) {
      // 장비 중 가장 tier 낮은 것 먼저, 없으면 아무 아이템
      const equipInInv = char.inventory
        .map((it, i) => ({ it, i, def: EQUIPMENT_DEFS?.[it.id] }))
        .filter(x => x.def)
        .sort((a, b) => a.def.tier - b.def.tier);

      const target = equipInInv[0] || { it: char.inventory[0], i: 0 };
      const tDef = EQUIPMENT_DEFS?.[target.it.id];
      const price = tDef
        ? Math.floor(tDef.price * 0.35)
        : Math.floor((gs.market?.[target.it.id]?.currentPrice || 10) * 0.5);

      char.gold += price;
      gs.world.townGold = (gs.world.townGold || 0) + price;
      // 판매 시 해당 카테고리 시장 공급 증가 (tier로 분류해 가장 근접한 시장 아이템 반영)
      if (tDef) {
        const sellSlotMkt = tDef.slot === 'weapon' ? 'weapon_dark' : tDef.slot === 'armor' ? 'armor_plate' : null;
        if (sellSlotMkt && gs.market[sellSlotMkt]) {
          gs.market[sellSlotMkt].supplyIndex = Math.min(300, gs.market[sellSlotMkt].supplyIndex + 4);
          gs.market[sellSlotMkt].demandIndex = Math.max(5, gs.market[sellSlotMkt].demandIndex - 2);
        }
      } else if (gs.market?.[target.it.id]) {
        gs.market[target.it.id].supplyIndex = Math.min(300, gs.market[target.it.id].supplyIndex + 3);
      }
      char.inventory.splice(target.i, 1);
      dayLogs.push({ logClass: 'log-economy', text:
        `🪙 ${char.name}이(가) 짐이 너무 많아 ${target.it.icon||''}${target.it.name}을(를) ${price}G에 시장에 내다 팔았다.` });
    }
  }
}

// 장비 구매 & 채무 시도 — 매일 10% 확률
function processEquipmentPurchases(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    if (Math.random() > 0.10) continue;

    const slotsToCheck = ['weapon', 'armor'];
    for (const slot of slotsToCheck) {
      const current = char.equipment[slot];
      const currentTier = current ? (EQUIPMENT_DEFS[current.id]?.tier ?? -1) : -1;

      // 다음 티어 장비 후보 (성향·직업 적합 우선)
      const candidates = Object.entries(EQUIPMENT_DEFS)
        .filter(([id, def]) => def.slot === slot && def.tier === currentTier + 1)
        .sort((a, b) => a[1].price - b[1].price);

      if (!candidates.length) continue;

      // 직업에 맞는 장비 선택 (클래스별 우선 무기 지정)
      const CLASS_WEAPON_PREF = {
        warrior:     ['weapon_great_axe', 'armor_plate', 'weapon_dark'],
        knight:      ['armor_plate', 'weapon_holy', 'armor_divine'],
        mage:        ['weapon_grimoire', 'armor_robe', 'weapon_dark'],
        sage:        ['weapon_grimoire', 'armor_robe', 'weapon_holy'],
        necromancer: ['weapon_grimoire', 'weapon_dark', 'armor_robe'],
        cleric:      ['weapon_holy', 'armor_divine', 'armor_robe'],
        paladin:     ['weapon_holy', 'armor_plate', 'armor_divine'],
        rogue:       ['weapon_dark', 'weapon_longbow', 'armor_shadow'],
        ranger:      ['weapon_longbow', 'weapon_dark', 'armor_shadow'],
        druid:       ['weapon_grimoire', 'armor_robe', 'weapon_holy'],
        bard:        ['weapon_dark', 'armor_shadow', 'acc_amulet'],
        merchant:    ['acc_bracer', 'weapon_dark', 'acc_charm'],
      };
      const prefs = CLASS_WEAPON_PREF[char.class] || [];

      // 장비 다양성: 다른 캐릭터가 이미 착용한 아이템은 후순위
      const othersEquipped = new Set(
        aliveChars
          .filter(c => c.id !== char.id)
          .flatMap(c => Object.values(c.equipment || {}))
          .filter(Boolean)
          .map(e => e.id)
      );

      let [itemId, itemDef] = candidates[0];
      // 1순위: 클래스 선호 + 타인 미착용
      const _picked1 = prefs.reduce((acc, pid) => acc || candidates.find(([id]) => id === pid && !othersEquipped.has(id)) || null, null);
      // 2순위: 클래스 선호 (중복 허용)
      const _picked2 = prefs.reduce((acc, pid) => acc || candidates.find(([id]) => id === pid) || null, null);
      if (_picked1) [itemId, itemDef] = _picked1;
      else if (_picked2) [itemId, itemDef] = _picked2;

      const price = itemDef.price;

      // 시장 반응 헬퍼: 장비 구매 시 카테고리 공급 감소 + 수요 상승
      const _applyEquipBuyMarket = () => {
        const slotMkt = slot === 'weapon' ? 'weapon_dark' : slot === 'armor' ? 'armor_plate' : null;
        if (slotMkt && gs.market[slotMkt]) {
          gs.market[slotMkt].supplyIndex = Math.max(1, gs.market[slotMkt].supplyIndex - 5);
          gs.market[slotMkt].demandIndex = Math.min(300, gs.market[slotMkt].demandIndex + 3);
        }
        gs.world.totalGoldCirculated = (gs.world.totalGoldCirculated || 0) + price;
      };

      if (char.gold >= price) {
        // 자력 구매
        char.gold -= price;
        gs.world.townGold = (gs.world.townGold || 0) + Math.floor(price * 0.15);
        _applyEquipBuyMarket();
        equipItem(char, { id: itemId, ...itemDef }, dayLogs);
        break;
      } else {
        // 금화 부족 → 채무 시도 (기존 채무 없을 때만)
        const shortage = price - char.gold;
        if (shortage <= 300 && (!char.debts || char.debts.length === 0)) {
          const creditor = aliveChars.find(c =>
            c.id !== char.id &&
            c.gold >= price + 150 &&
            (getRelationship(c, char.id)?.affection || 0) >= 25
          );
          if (creditor) {
            creditor.gold -= price;
            char.gold += price;
            char.gold -= price;
            gs.world.townGold = (gs.world.townGold || 0) + Math.floor(price * 0.15);
            _applyEquipBuyMarket();
            equipItem(char, { id: itemId, ...itemDef }, dayLogs);

            if (!char.debts) char.debts = [];
            char.debts.push({
              creditorId: creditor.id,
              amount: price,
              remaining: price,
              dayTaken: gs.day,
              deadline: gs.day + 7,
              purpose: itemDef.name + ' 구매',
            });
            addOrUpdateRelation(char, creditor.id, 'debtor', 0);
            addOrUpdateRelation(creditor, char.id, 'creditor', 0);
            dayLogs.push({ logClass: 'log-economy', text: `💸 ${char.name}이(가) ${creditor.name}에게 ${price}G를 빌려 ${itemDef.icon} ${itemDef.name}을(를) 장착했다. 7일 내 상환 예정.` });
            { const g = pick(DLG_DEBT); dayLogs.push(dlgPair(char.name, g[0], creditor.name, g[1])); }
            break;
          }
        }
      }
    }
  }
}

// ─── 희귀 장비 자동 구매 시도 ───────────────
// rareOffer 아이템을 가장 부유하거나 적합한 캐릭터가 자동 구매
function processRareOfferAutoBuy(aliveChars, gs, dayLogs) {
  if (!gs.world.rareOffer) return;
  if (Math.random() > 0.15) return; // 매일 15% 확률로 누군가 구매 고려
  const offer = gs.world.rareOffer;
  const item  = offer.item;
  const sorted = aliveChars.slice().sort((a, b) => b.gold - a.gold);
  // 슬롯이 비어있거나 현재 장비보다 높은 tier인 캐릭터 우선
  const buyer = sorted.find(c => {
    if (c.gold < item.price) return false;
    const cur = c.equipment?.[item.slot];
    const curTier = cur ? (EQUIPMENT_DEFS[cur.id]?.tier ?? -1) : -1;
    return (item.tier || 3) > curTier;
  });
  if (!buyer) return;
  buyer.gold -= item.price;
  gs.world.townGold = (gs.world.townGold || 0) + Math.floor(item.price * 0.1);
  buyer.equipment = buyer.equipment || {};
  buyer.equipment[item.slot] = { id: item.id, name: item.name, icon: item.icon };
  buyer._equipBonuses = buyer._equipBonuses || {};
  for (const [k, v] of Object.entries(item.bonus || {})) {
    buyer._equipBonuses[k] = (buyer._equipBonuses[k] || 0) + v;
  }
  buyer.maxHp = 50 + ((buyer.stats.str||0)+(buyer._equipBonuses?.str||0))*5+((buyer.stats.end||0)+(buyer._equipBonuses?.end||0))*3;
  dayLogs.push({ logClass: 'log-special', text: `🌟 ${buyer.name}이(가) 전설급 장비 [${item.icon}${item.name}]을(를) ${item.price.toLocaleString()}G에 구매했다! 장착 완료.` });
  gs.world.rareOffer = null;
}

// 채무 상환 — 매일 잉여 금화의 40% 자동 상환
function processDebts(aliveChars, gs, dayLogs) {
  for (const char of aliveChars) {
    if (!char.debts || char.debts.length === 0) continue;

    for (let i = char.debts.length - 1; i >= 0; i--) {
      const debt = char.debts[i];
      const surplus = Math.max(0, char.gold - 50); // 50G 생활비 제외
      if (surplus > 0) {
        const payment = Math.min(debt.remaining, Math.ceil(surplus * 0.40));
        if (payment > 0) {
          char.gold -= payment;
          debt.remaining -= payment;
          const creditor = gs.characters.find(c => c.id === debt.creditorId);
          if (creditor && !creditor.isDead) {
            creditor.gold += payment;
            // 상환은 당연한 행동 — 호감도 보너스 없음 (이전: +1)
          }
          if (debt.remaining <= 0) {
            const creditorName = gs.characters.find(c => c.id === debt.creditorId)?.name || '길드';
            dayLogs.push({ logClass: 'log-economy', text: `✅ ${char.name}이(가) ${creditorName}에게 빌린 금화 ${debt.amount}G를 모두 갚았다! (목적: ${debt.purpose})` });
            // 채무 관계 해제
            const dRel = char.relationships.find(r => r.targetId === debt.creditorId && r.type === 'debtor');
            if (dRel) dRel.type = 'friend';
            const cRel = gs.characters.find(c => c.id === debt.creditorId)?.relationships.find(r => r.targetId === char.id && r.type === 'creditor');
            if (cRel) cRel.type = 'friend';
            char.debts.splice(i, 1);
          }
        }
      }

      // 연체 패널티 — 매일 호감도 하락 + 이성 하락 (3일마다 더 큰 이벤트 로그)
      if (debt.remaining > 0 && gs.day > debt.deadline) {
        const overdue = gs.day - debt.deadline;
        const creditor = gs.characters.find(c => c.id === debt.creditorId);
        if (creditor && !creditor.isDead) {
          // 매일 -10 (was -5), 빚이 클수록 추가 패널티 (80G당 -1)
          const dailyPenalty = -10;
          const debtBonus = -Math.floor(debt.remaining / 80);
          const totalPenalty = dailyPenalty + debtBonus;
          updateAffection(char, creditor, totalPenalty, gs);
          char.sanity = Math.max(0, char.sanity - 1); // 채무자 이성도 하락

          // 3일마다 로그 출력 (매일 출력하면 너무 빈번)
          if (overdue % 3 === 0) {
            const mood = overdue >= 14
              ? `${creditor.name}이(가) 더 이상 참지 않겠다며 분노했다.`
              : `${creditor.name}이(가) 불쾌함을 드러냈다.`;
            dayLogs.push({ logClass: 'log-economy', text: `💢 [연체 ${overdue}일] ${char.name}이(가) ${creditor.name}에게 진 빚 ${debt.remaining}G를 아직 갚지 못했다. ${mood} (호감도 ${totalPenalty * 3})` });
          }
          // 연체 14일 초과 시 채무자에게 이성·피로 추가 패널티
          if (overdue === 14) {
            char.sanity = Math.max(0, char.sanity - 10);
            char.fatigue = Math.min(100, char.fatigue + 10);
            dayLogs.push({ logClass: 'log-economy', text: `😰 ${char.name}이(가) 빚 독촉에 시달리며 심신이 지쳐가고 있다. (이성 -10, 피로 +10)` });
          }
        }
      }
    }
  }
}

// ─── RELATIONSHIP UTILITIES ───────────────
function getRelationship(char, targetId) {
  return char.relationships.find(r => r.targetId === targetId) || null;
}

function updateAffection(a, b, delta, gs) {
  const speed = gs?.settings?.storySpeed || 1;
  const scaledDelta = delta > 0 ? delta * speed : delta; // only scale positive growth

  let relA = getRelationship(a, b.id);
  if (!relA) {
    relA = { targetId: b.id, type: 'friend', affection: 0 };
    a.relationships.push(relA);
  }
  relA.affection = Math.max(-50, Math.min(200, relA.affection + scaledDelta));

  let relB = getRelationship(b, a.id);
  if (!relB) {
    relB = { targetId: a.id, type: 'friend', affection: 0 };
    b.relationships.push(relB);
  }
  relB.affection = Math.max(-50, Math.min(200, relB.affection + scaledDelta));

  // Hostile: affection < -20 → enemy
  if (relA.affection < -20) relA.type = 'enemy';
  if (relB.affection < -20) relB.type = 'enemy';
}

function addOrUpdateRelation(char, targetId, type, afDelta) {
  let rel = getRelationship(char, targetId);
  if (!rel) {
    rel = { targetId, type, affection: 30 + afDelta };
    char.relationships.push(rel);
  } else {
    rel.type = type;
    rel.affection = Math.max(-100, Math.min(200, rel.affection + afDelta));
  }
}

// ─── CLASS PROMOTION ────────────────────
function showNextPromotion() {
  const gs = window.GS;
  if (!gs.pendingPromotions.length) return;

  const promo = gs.pendingPromotions[0];
  const char = gs.characters.find(c => c.id === promo.charId);
  const classDef = CLASSES[promo.classId];
  if (!char || !classDef) {
    gs.pendingPromotions.shift();
    return;
  }

  const isReclass = !!char.class;
  const goldCost  = isReclass ? 300 : 150;
  const modal = document.getElementById('class-promo-modal');
  const content = document.getElementById('class-promo-content');
  content.innerHTML = `
    <div class="class-promo-info">
      <div class="class-promo-icon">${classDef.icon}</div>
      <div class="class-promo-name">${classDef.name}</div>
      <div class="class-promo-char">${char.name}이(가) ${isReclass ? '재전직' : '전직'} 조건을 달성했습니다!</div>
      <div class="class-promo-desc">${classDef.desc}</div>
      <div class="class-promo-skills">
        ${classDef.skills.map(s => {
          const skName = (typeof s === 'object') ? s.name : s;
          const skMp   = (typeof s === 'object') ? s.mpCost : 0;
          const skEff  = (typeof s === 'object') ? s.effect : '';
          return `<span class="skill-badge" title="MP -${skMp}  ${skEff}">${skName}  <span style="font-size:9px;opacity:0.7">MP${skMp}</span></span>`;
        }).join('')}
      </div>
      <div class="class-promo-desc" style="margin-top:8px;font-size:12px;color:var(--text-muted)">
        경제 활동: ${classDef.economyRole}
      </div>
      <div class="class-promo-desc" style="margin-top:6px;font-size:12px;color:var(--gold)">
        ⚠ 전직 비용: ${goldCost}G + 피로 +${isReclass?50:30}${isReclass ? ' | 구 스킬 전부 소실·스탯 일부 반환' : ''}
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  document.getElementById('class-promo-accept').onclick = () => {
    applyClassPromotion(char, promo.classId, gs);
    gs.pendingPromotions.shift();
    modal.classList.add('hidden');
    renderAll();
    const nextDay_log = [{ logClass: 'log-class', text: `⬆ ${char.name}이(가) ${classDef.name}(으)로 전직했다! 새로운 스킬 [${classDef.skills.map(s => (typeof s === 'object' ? s.name : s)).join(', ')}]을 익혔다.` }];
    appendToLog(nextDay_log);
    saveGame(gs);
    if (gs.pendingPromotions.length > 0) setTimeout(showNextPromotion, 500);
  };

  document.getElementById('class-promo-refuse').onclick = () => {
    gs.pendingPromotions.shift();
    modal.classList.add('hidden');
    if (gs.pendingPromotions.length > 0) setTimeout(showNextPromotion, 500);
  };
}

function applyClassPromotion(char, classId, gs) {
  const classDef = CLASSES[classId];
  const prevClass = char.class;

  // ── 전직 비용 ──────────────────────────
  // 첫 전직: 150G + 피로 +30
  // 재전직(직업 변경): 300G + 피로 +50 + 구 클래스 스킬 전부 소실 + 스킬레벨 초기화
  const isReclass = !!prevClass;
  const goldCost = isReclass ? 300 : 150;
  const fatCost  = isReclass ? 50  : 30;

  char.gold = Math.max(0, (char.gold || 0) - goldCost);
  char.fatigue = Math.min(100, (char.fatigue || 0) + fatCost);

  if (isReclass) {
    // 재전직 패널티: 구 스탯 보너스 일부 제거
    for (const [stat, bonus] of Object.entries(CLASSES[prevClass]?.statBonus || {})) {
      char.stats[stat] = Math.max(1, (char.stats[stat] || 0) - bonus);
    }
    char.skillLevels = {}; // 스킬 레벨 전초기화
  }

  char.class = classId;
  // 일반 스킬 3개 + 침공 스킬 1개를 동일하게 classSkills에 포함
  const _invasionSk = RAID_SKILL_TABLE[classId];
  const _invasionSkObj = _invasionSk
    ? { name: _invasionSk.name, mpCost: _invasionSk.mpCost, effect: _invasionSk.effect, isRaid: true }
    : null;
  char.classSkills = [...classDef.skills, ...(_invasionSkObj ? [_invasionSkObj] : [])];
  for (const [stat, bonus] of Object.entries(classDef.statBonus || {})) {
    char.stats[stat] = (char.stats[stat] || 0) + bonus;
  }
  if (classDef.mpActive) {
    char.mp = char.maxMp;
  }
  char.maxHp = 50 + char.stats.str * 5 + char.stats.end * 3 + 10;
  char.hp = Math.min(char.hp + (isReclass ? 0 : 20), char.maxHp);
}

// ─── ENDINGS CHECK ───────────────────────
function checkEndings(gs) {
  for (const ending of ENDINGS) {
    if (gs.endingsAchieved.includes(ending.id)) continue;
    try {
      if (ending.condition(gs)) return ending;
    } catch(e) {}
  }
  return null;
}

// ─── KOREAN PARTICLE AUTO-FIX ────────────
function autoJosa(text) {
  if (!text) return text;
  const hasBatchim = (char) => {
    const code = char.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return false;
    return (code - 0xAC00) % 28 !== 0;
  };
  return text
    .replace(/([가-힣])이\(가\)/g, (_, c) => c + (hasBatchim(c) ? '이' : '가'))
    .replace(/([가-힣])은\(는\)/g, (_, c) => c + (hasBatchim(c) ? '은' : '는'))
    .replace(/([가-힣])을\(를\)/g, (_, c) => c + (hasBatchim(c) ? '을' : '를'))
    .replace(/([가-힣])과\(와\)/g, (_, c) => c + (hasBatchim(c) ? '과' : '와'))
    .replace(/([가-힣])이\(며\)/g, (_, c) => c + (hasBatchim(c) ? '이며' : '며'))
    .replace(/([가-힣])\(으\)로/g, (_, c) => {
      if (!hasBatchim(c)) return c + '로';
      // ㄹ 받침은 '로', 나머지는 '으로'
      const code = c.charCodeAt(0);
      const jongseong = (code - 0xAC00) % 28;
      return c + (jongseong === 8 ? '로' : '으로'); // 8 = ㄹ
    });
}

// ─── LOG HELPERS ────────────────────────
function renderDayLog(day, dayLogs) {
  const container = document.getElementById('log-entries');

  // Build day group, newest at top
  const group = document.createElement('div');
  group.className = 'log-day-group';

  const sep = document.createElement('div');
  sep.className = 'log-day-separator';
  const _d = getDayDate(day);
  sep.innerHTML = `<span>— ${_d.label} (Day ${day}) —</span>`;
  group.appendChild(sep);

  const gs = window.GS;
  // 전투 로그 줄별 딜레이 (설정: battleLogSpeed, 단위 ms/줄, 기본 800ms)
  const battleLineMs = gs.settings?.battleLogSpeed ?? 800;
  let battleIdx = 0;
  for (const log of dayLogs) {
    if (!log.text) continue;
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.logClass || 'log-system'}`;
    // 전투 로그는 순차적으로 등장하도록 딜레이 인덱스 설정
    if (log.logClass === 'log-battle') {
      entry.style.setProperty('--battle-delay', `${battleIdx * battleLineMs}ms`);
      battleIdx++;
    }
    const processed = colorizeLog(autoJosa(log.text), gs);
    entry.innerHTML = `<p>${processed}</p>`;
    group.appendChild(entry);
  }

  container.insertBefore(group, container.firstChild);
  container.scrollTop = 0;

  // Trim: keep newest 600 entries (increase from 300 for longer history)
  const allEntries = container.querySelectorAll('.log-entry');
  if (allEntries.length > 600) {
    const entries = Array.from(allEntries);
    for (let i = 600; i < entries.length; i++) entries[i].remove();
    // Remove orphaned separators
    container.querySelectorAll('.log-day-group').forEach(g => {
      if (!g.querySelector('.log-entry')) g.remove();
    });
  }
}

function appendToLog(logs) {
  const container = document.getElementById('log-entries');
  const gs = window.GS;
  const frag = document.createDocumentFragment();
  for (const log of logs) {
    if (!log.text) continue;
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.logClass || 'log-system'}`;
    const processed = colorizeLog(autoJosa(log.text), gs);
    entry.innerHTML = `<p>${processed}</p>`;
    frag.appendChild(entry);
  }
  container.insertBefore(frag, container.firstChild);
  container.scrollTop = 0;
}

function clearLog() {
  const container = document.getElementById('log-entries');
  container.innerHTML = '<div class="log-day-separator"><span>— 로그 삭제됨 —</span></div>';
}

// ─── NEXT EVENT (SKIP TO SIGNIFICANT) ────
async function nextEvent() {
  const gs = window.GS;
  if (gs.isRunning) return;
  if (gs.characters.length === 0) {
    showToast('캐릭터를 먼저 추가하세요!', 'warning');
    return;
  }
  if (gs.pendingChoices.length > 0) {
    showToast('미결 선택지를 먼저 처리하세요!', 'warning');
    return;
  }

  const mode = gs.settings.nextEventMode || 'choice';

  // 수동 모드: 1일만 진행
  if (mode === 'manual') {
    await nextDay();
    return;
  }

  const MAX_SKIP = 200;
  window._nextEventRunning = true;
  const neb = document.getElementById('next-event-btn');
  const ndb = document.getElementById('next-day-btn');
  if (neb) neb.disabled = true;
  if (ndb) ndb.disabled = true;

  try {
    for (let i = 0; i < MAX_SKIP; i++) {
      if (gs.pendingChoices.length > 0) break;

      const deadBefore    = new Set(gs.characters.filter(c => c.isDead).map(c => c.id));
      const promosBefore  = gs.pendingPromotions.length;
      const choicesBefore = gs.pendingChoices.length;

      // 'important' 모드: 관계 변화 스냅샷
      let loversBefore = new Set(), spousesBefore = new Set();
      if (mode === 'important') {
        for (const c of gs.characters) {
          for (const r of c.relationships) {
            if (r.type === 'lover')  loversBefore.add(c.id + '|' + r.targetId);
            if (r.type === 'spouse') spousesBefore.add(c.id + '|' + r.targetId);
          }
        }
      }

      await nextDay();
      if (ndb) ndb.disabled = true;

      const newDead   = gs.characters.some(c => c.isDead && !deadBefore.has(c.id));
      const newPromo  = gs.pendingPromotions.length > promosBefore;
      const newChoice = gs.pendingChoices.length > choicesBefore;

      // 항상 정지: 계절 말일 습격 or 위협도 위험 임계
      const dateNow = getDayDate(gs.day);
      if (dateNow.isSeasonEnd) {
        showToast(`⚔ ${dateNow.seasonEmoji}${dateNow.season} 말일 — 마왕군 습격! (${dateNow.label})`, 'danger');
        break;
      }
      if (gs.world.threatLevel >= 92) {
        showToast(`🚨 위협도 ${Math.round(gs.world.threatLevel)}! 극도 위기 — 즉각 대응 필요 (Day ${gs.day})`, 'danger');
        break;
      }

      // 'choice': 선택지·사망·전직 감지
      if (mode === 'choice') {
        if (newDead || newPromo || newChoice) {
          showToast(`⚡ 중요 이벤트 발생! (Day ${gs.day})`, 'info');
          break;
        }
      }

      // 'important': 위 + 연인·결혼·이별·특수(보라)·연애(분홍) 감지
      if (mode === 'important') {
        let relChange = false;
        outer: for (const c of gs.characters) {
          for (const r of c.relationships) {
            const key = c.id + '|' + r.targetId;
            if (r.type === 'lover'  && !loversBefore.has(key))  { relChange = true; break outer; }
            if (r.type === 'spouse' && !spousesBefore.has(key)) { relChange = true; break outer; }
            if (loversBefore.has(key) && r.type !== 'lover' && r.type !== 'spouse') { relChange = true; break outer; }
          }
        }
        if (newDead || newPromo || newChoice || relChange || gs._lastDayRomance || gs._lastDaySpecial) {
          const reason = newChoice ? '선택지' : newDead ? '사망' : newPromo ? '전직'
            : gs._lastDayRomance ? '💕 연애 이벤트' : gs._lastDaySpecial ? '✨ 특수 이벤트' : '관계 변화';
          showToast(`⚡ ${reason}! (Day ${gs.day})`, 'info');
          break;
        }
      }

      await new Promise(r => setTimeout(r, 60));
    }
  } finally {
    window._nextEventRunning = false;
    if (neb) neb.disabled = false;
    if (ndb) ndb.disabled = false;
  }
}

// ─── BUILDING VISIT EFFECTS ──────────────
function processBuildings(gs, dayLogs) {
  if (!gs.world.buildings) return;
  const alive = gs.characters.filter(c => !c.isDead && !c.isRetired);
  const speed = gs.settings?.storySpeed || 1;

  // 거점 레벨에 따른 건물 효과 배율 계산 (effectScale per level above minBaseLevel)
  const getBldScale = (bId) => {
    const def = BUILDINGS?.[bId];
    if (!def || !def.effectScale) return 1.0;
    const lvAbove = Math.max(0, (gs.world.baseLevel || 1) - (def.minBaseLevel || 1));
    return 1.0 + lvAbove * def.effectScale;
  };

  // Watchtower: global passive (no cost, survey effect)
  if (gs.world.buildings.watchtower) {
    const wScale = getBldScale('watchtower');
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 0.3 * wScale);
  }

  // 저체력 캐릭터는 인벤토리 포션 자동 사용
  for (const char of alive) {
    if (char.hp < char.maxHp * 0.35) {
      const potIdx = char.inventory.findIndex(it => it.id === 'healing_potion');
      if (potIdx >= 0) {
        const pot = char.inventory[potIdx];
        const heal = randInt(20, 35);
        char.hp = Math.min(char.maxHp, char.hp + heal);
        pot.qty = (pot.qty || 1) - 1;
        if (pot.qty <= 0) char.inventory.splice(potIdx, 1);
        dayLogs.push({ logClass: 'log-status', text: `🧪 ${char.name}이(가) 치유 포션을 마셨다. (HP +${heal})` });
      }
      // 포션 없고 골드 있으면 시장에서 자동 구매
      else if (char.gold >= 50 && gs.market?.healing_potion?.currentPrice <= char.gold) {
        const price = gs.market.healing_potion.currentPrice;
        if (char.gold >= price) {
          char.gold -= price;
          gs.world.townGold = (gs.world.townGold || 0) + price;
          const heal = randInt(20, 35);
          char.hp = Math.min(char.maxHp, char.hp + heal);
          gs.market.healing_potion.supplyIndex = Math.max(0, gs.market.healing_potion.supplyIndex - 5);
          dayLogs.push({ logClass: 'log-status', text: `🧪 ${char.name}이(가) 치유 포션을 구매해 마셨다. (-${price}G, HP +${heal})` });
        }
      }
    }
  }

  // Each character has a 35% chance to visit each built building
  // 중독된 캐릭터는 성당 우선 방문 (70%)
  for (const char of alive) {
    for (const [bId, active] of Object.entries(gs.world.buildings)) {
      if (!active) continue;
      const visitChance = (bId === 'temple' && char.statusEffects.includes('poison')) ? 0.70 : 0.35;
      if (Math.random() > visitChance) continue;

      switch (bId) {
        case 'inn': {
          const cost = 5;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          const innScale = getBldScale('inn');
          char.hp = Math.min(char.maxHp, char.hp + Math.round(15 * innScale));
          char.fatigue = Math.max(0, char.fatigue - Math.round(20 * innScale));
          break;
        }
        case 'temple': {
          const cost = 10;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          const templeScale = getBldScale('temple');
          char.sanity = Math.min(100, char.sanity + Math.round(5 * templeScale));
          for (const status of ['curse', 'poison', 'fear']) {
            if (char.statusEffects.includes(status) && Math.random() < 0.3) {
              char.statusEffects.splice(char.statusEffects.indexOf(status), 1);
              dayLogs.push({ logClass: 'log-status', text: `⛪ ${char.name}이(가) 성당을 방문해 ${STATUS_EFFECTS[status]?.name || status}을 치유받았다.` });
            }
          }
          break;
        }
        case 'training_ground': {
          const cost = 5;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          if (!char._statAccum) char._statAccum = {};
          const tgScale = getBldScale('training_ground');
          char._statAccum.str = (char._statAccum.str || 0) + 0.12 * speed * tgScale;
          char._statAccum.end = (char._statAccum.end || 0) + 0.08 * speed * tgScale;
          char.fatigue = Math.min(100, char.fatigue + 5);
          char.actionCounts.combat = (char.actionCounts.combat || 0) + 1;
          break;
        }
        case 'library': {
          const cost = 5;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          if (!char._statAccum) char._statAccum = {};
          const libScale = getBldScale('library');
          char._statAccum.int = (char._statAccum.int || 0) + 0.12 * speed * libScale;
          char.exp += Math.round(2 * speed * libScale);
          char.actionCounts.magic = (char.actionCounts.magic || 0) + 1;
          break;
        }
        case 'guild': {
          const guildScale = getBldScale('guild');
          const income = Math.round((15 + randInt(0, 10)) * speed * guildScale);
          char.gold += income;
          gs.world.totalGoldCirculated += income;
          char.exp += Math.round(2 * speed);
          char.actionCounts.combat = (char.actionCounts.combat || 0) + 1;
          break;
        }
        case 'shop': {
          // 상점: 저렴한 장비·소모품 구매 기회
          char.actionCounts.trade = (char.actionCounts.trade || 0) + 1;
          // 기본 장신구 구매 시도 (장신구 미착용 상태)
          if (!char.equipment.accessory && Math.random() < 0.30) {
            const shopAcc = Object.entries(EQUIPMENT_DEFS)
              .filter(([,d]) => d.slot === 'accessory' && d.tier === 1 && char.gold >= d.price);
            if (shopAcc.length) {
              const [aId, aDef] = shopAcc[Math.floor(Math.random() * shopAcc.length)];
              char.gold -= aDef.price;
              gs.world.townGold = (gs.world.townGold || 0) + aDef.price;
              equipItem(char, { id: aId, ...aDef }, dayLogs);
            }
          }
          // 포션 구매 (HP 60% 이하, 인벤토리에 없을 때)
          if (char.hp < char.maxHp * 0.6 && !char.inventory.some(i => i.id === 'healing_potion')) {
            const price = gs.market?.healing_potion?.currentPrice || 50;
            if (char.gold >= price) {
              char.gold -= price;
              gs.world.townGold = (gs.world.townGold || 0) + price;
              char.inventory.push({ id: 'healing_potion', name: '치유 포션', icon: '🧪', qty: 1 });
            }
          }
          break;
        }
        case 'forge': {
          // 기본 자재 채집
          const cost = 3;
          if (char.gold >= cost) {
            char.gold -= cost;
            gs.world.townGold = (gs.world.townGold || 0) + cost;
            gs.world.baseResources.iron_ore = (gs.world.baseResources.iron_ore || 0) + 2;
          }
          // 철광석 15개 이상이면 장비 제작 시도 (20%)
          if ((gs.world.baseResources.iron_ore || 0) >= 15 && Math.random() < 0.20) {
            const forgeable = Object.entries(EQUIPMENT_DEFS).filter(([,d]) => d.forge && d.tier <= 2);
            if (forgeable.length) {
              const [fId, fDef] = forgeable[Math.floor(Math.random() * forgeable.length)];
              const slot = fDef.slot;
              const cur = char.equipment[slot];
              const curTier = cur ? (EQUIPMENT_DEFS[cur.id]?.tier ?? -1) : -1;
              gs.world.baseResources.iron_ore -= 15;
              if (fDef.tier > curTier) {
                equipItem(char, { id: fId, ...fDef }, dayLogs);
                dayLogs.push({ logClass: 'log-system', text: `⚒ ${char.name}이(가) 대장간에서 ${fDef.icon} ${fDef.name}을(를) 제작해 장착했다! (-15 철광석)` });
              } else {
                char.inventory.push({ id: fId, name: fDef.name, icon: fDef.icon, qty: 1 });
                dayLogs.push({ logClass: 'log-system', text: `⚒ 대장간에서 ${fDef.icon} ${fDef.name}이(가) 제작됐다. (인벤토리)` });
              }
            }
          }
          break;
        }
        case 'warehouse': {
          gs.world.baseResources.wood = (gs.world.baseResources.wood || 0) + 1;
          break;
        }
        case 'plaza': {
          const others = alive.filter(c => c.id !== char.id);
          if (others.length > 0) {
            const other = others[Math.floor(Math.random() * others.length)];
            updateAffection(char, other, 1, gs); // 3 → 1
          }
          char.actionCounts.social = (char.actionCounts.social || 0) + 1;
          break;
        }
      }
    }
  }
}
