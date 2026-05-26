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

    for (const char of aliveChars) {
      // Status effect passives
      applyStatusPassives(char, gs, dayLogs);
      if (char.isDead) continue;

      // Pick & resolve main event
      const ev = pickEvent(char, gs);
      const result = ev.resolve(char, gs);
      applyEventResult(char, gs, result, dayLogs);
    }

    // 4. Interaction events between characters
    if (gs.settings.characterInteraction && aliveChars.length >= 2) {
      processInteractions(aliveChars, gs, dayLogs);
    }

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

    // 10. Party checks
    processParties(aliveChars, gs, dayLogs);

    // 11. Death check (already done in applyEventResult, but double-check)
    for (const char of gs.characters) {
      if (!char.isDead && char.hp <= 0) {
        char.isDead = true;
        dayLogs.push({ logClass: 'log-death', text: `💀 ${char.name}이(가) 쓰러졌다... 모험가로서의 생을 마감했다. 명복을 빈다.` });
      }
    }

    // 12. Stat growth clamp
    for (const char of aliveChars) {
      for (const stat of Object.keys(char.stats)) {
        char.stats[stat] = Math.max(0, Math.min(10, char.stats[stat]));
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

    // 14. Output to log
    renderDayLog(gs.day, dayLogs);

    // 15. Auto-save
    saveGame(gs);

    // 16. UI update
    renderAll();

    // 17. Handle pending promotions
    if (gs.pendingPromotions.length > 0) {
      setTimeout(() => showNextPromotion(), 500);
    }

    // 18. Ending
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

// ─── WORLD THREAT ────────────────────────
function processWorldThreat(gs, dayLogs) {
  // Natural increase each day
  const naturalIncrease = gs.settings.developerMode ? 0 : 1;
  gs.world.threatLevel = Math.min(100, Math.max(0, gs.world.threatLevel + naturalIncrease));

  // Hero actions reduce it (calculated elsewhere via worldThreatDelta)
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

  // EXP
  if (fx.exp) {
    char.exp = char.exp + fx.exp;
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
        char.stats[stat] = Math.min(10, (char.stats[stat] || 0) + 1);
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

  // Base resource collection
  if (result.baseResource) {
    for (const [res, amt] of Object.entries(result.baseResource)) {
      gs.world.baseResources[res] = (gs.world.baseResources[res] || 0) + amt;
    }
  }

  // Log
  dayLogs.push({ logClass: result.logClass || 'log-system', text: result.text, char: char.name });

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

// ─── STATUS PASSIVES ─────────────────────
function applyStatusPassives(char, gs, dayLogs) {
  if (char.statusEffects.includes('poison')) {
    const dmg = 5;
    char.hp = Math.max(0, char.hp - dmg);
    dayLogs.push({ logClass: 'log-status', text: `☠ ${char.name}의 중독이 진행됐다. (HP -${dmg})` });
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

// ─── INTERACTIONS ────────────────────────
function processInteractions(aliveChars, gs, dayLogs) {
  const numInteractions = Math.min(3, Math.floor(aliveChars.length / 2) + (Math.random() < 0.5 ? 1 : 0));

  for (let i = 0; i < numInteractions; i++) {
    const a = pick(aliveChars);
    const others = aliveChars.filter(c => c.id !== a.id);
    if (others.length === 0) continue;
    const b = pick(others);

    // Pick an interaction event
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
        // Check gender settings
        const same = a.gender === b.gender;
        if (same && !gs.settings.allowSameSexCouple) return false;
        if (!same && !gs.settings.allowHeteroCouple) return false;
        // Check minor restriction
        if (gs.settings.minorRelationRestriction && (a.isMinor || b.isMinor)) return false;
        return true;
      }
      return true;
    });

    if (!validInteractions.length) continue;
    const ie = pick(validInteractions);
    const iResult = ie.resolve(a, b, gs);

    // Apply affection
    if (iResult.affectionDelta) {
      updateAffection(a, b, iResult.affectionDelta, gs);
    }

    // Gold transfer
    if (iResult.goldTransfer) {
      const amt = Math.min(a.gold, iResult.goldTransfer);
      a.gold -= amt;
      b.gold += amt;
      // Create debtor relation
      addOrUpdateRelation(b, a.id, 'debtor', -10);
    }

    // Party formation
    if (iResult.formParty) {
      formParty([a, b], gs, dayLogs);
    }

    dayLogs.push({ logClass: iResult.logClass || 'log-social', text: iResult.text });
  }
}

// ─── ROMANCE & RELATIONSHIPS ─────────────
function processRomance(aliveChars, gs, dayLogs) {
  if (gs.settings.friendshipMode) return;

  for (const char of aliveChars) {
    for (const rel of char.relationships) {
      const partner = gs.characters.find(c => c.id === rel.targetId && !c.isDead);
      if (!partner) continue;

      // High affection → lover event (if not already lovers)
      if (rel.affection >= 60 && rel.type === 'friend') {
        // Check gender/minor settings
        const same = char.gender === partner.gender;
        if (same && !gs.settings.allowSameSexCouple) continue;
        if (!same && !gs.settings.allowHeteroCouple) continue;

        const loverChance = Math.min(0.6, 0.15 * (gs.settings.storySpeed || 1));
        if (Math.random() < loverChance) {
          rel.type = 'lover';
          const pr = getRelationship(partner, char.id);
          if (pr) pr.type = 'lover';
          dayLogs.push({ logClass: 'log-relation', text: `💕 ${char.name}과(와) ${partner.name}이(가) 연인이 됐다! 두 사람의 사이가 더욱 깊어졌다.` });
        }
      }

      // Lover for days → marriage
      if (rel.type === 'lover') {
        if (!char.daysAsLovers) char.daysAsLovers = {};
        const key = rel.targetId;
        char.daysAsLovers[key] = (char.daysAsLovers[key] || 0) + 1;
        const marriageChance = Math.min(0.5, (0.01 + Math.floor(char.daysAsLovers[key] / 2) * 0.01) * (gs.settings.storySpeed || 1));

        if (Math.random() < marriageChance) {
          rel.type = 'spouse';
          const pr = getRelationship(partner, char.id);
          if (pr) pr.type = 'spouse';
          rel.affection = Math.min(rel.affection + 20, 200);
          dayLogs.push({ logClass: 'log-relation', text: `💍 ${char.name}과(와) ${partner.name}이(가) 결혼했다! 두 영혼이 하나가 됐다.` });

          // Oath bond check
          if (gs.settings.oathBondSystem && rel.affection > 80) {
            addOrUpdateRelation(char, partner.id, 'oathbound', 0);
            dayLogs.push({ logClass: 'log-relation', text: `🔮 ${char.name}과(와) ${partner.name}이(가) 맹약(Oath Bond)을 맺었다! 위기의 순간 서로를 자동으로 돕는다.` });
          }
        }
      }

      // Marriage → pregnancy
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

    // Pregnancy countdown
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
  // Check for party dissolution
  for (const party of [...gs.parties]) {
    const members = aliveChars.filter(c => c.currentPartyId === party.id);
    if (members.length < 2) {
      // Dissolve
      disbandParty(party, gs, dayLogs);
      continue;
    }

    // Internal conflict check
    if (members.length >= 2 && Math.random() < 0.05) {
      const a = pick(members);
      const b = pick(members.filter(m => m.id !== a.id));
      const rel = getRelationship(a, b.id);
      if (rel && rel.affection < 20) {
        disbandParty(party, gs, dayLogs);
        dayLogs.push({ logClass: 'log-party', text: `💥 파티 내 갈등으로 ${a.name}과(와) ${b.name}이(가) 결별했다. 파티가 해산됐다.` });
      }
    }
  }
}

function formParty(chars, gs, dayLogs) {
  const id = 'party_' + Date.now();
  const party = { id, memberIds: chars.map(c => c.id), sharedInventory: [], formedDay: gs.day };
  gs.parties.push(party);
  for (const c of chars) c.currentPartyId = id;
  dayLogs.push({ logClass: 'log-party', text: `🤝 ${chars.map(c => c.name).join(', ')}이(가) 파티를 결성했다!` });
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
  relA.affection = Math.max(-100, Math.min(200, relA.affection + scaledDelta));

  let relB = getRelationship(b, a.id);
  if (!relB) {
    relB = { targetId: a.id, type: 'friend', affection: 0 };
    b.relationships.push(relB);
  }
  relB.affection = Math.max(-100, Math.min(200, relB.affection + scaledDelta));

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

  const modal = document.getElementById('class-promo-modal');
  const content = document.getElementById('class-promo-content');
  content.innerHTML = `
    <div class="class-promo-info">
      <div class="class-promo-icon">${classDef.icon}</div>
      <div class="class-promo-name">${classDef.name}</div>
      <div class="class-promo-char">${char.name}이(가) 전직 조건을 달성했습니다!</div>
      <div class="class-promo-desc">${classDef.desc}</div>
      <div class="class-promo-skills">
        ${classDef.skills.map(s => `<span class="skill-badge">${s}</span>`).join('')}
      </div>
      <div class="class-promo-desc" style="margin-top:8px;font-size:12px;color:var(--text-muted)">
        경제 활동: ${classDef.economyRole}
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  document.getElementById('class-promo-accept').onclick = () => {
    applyClassPromotion(char, promo.classId, gs);
    gs.pendingPromotions.shift();
    modal.classList.add('hidden');
    renderAll();
    const nextDay_log = [{ logClass: 'log-class', text: `⬆ ${char.name}이(가) ${classDef.name}(으)로 전직했다! 새로운 스킬 [${classDef.skills.join(', ')}]을 익혔다.` }];
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
  char.class = classId;
  char.classSkills = [...classDef.skills];
  for (const [stat, bonus] of Object.entries(classDef.statBonus || {})) {
    char.stats[stat] = Math.min(10, (char.stats[stat] || 0) + bonus);
  }
  if (classDef.mpActive) {
    char.mp = char.maxMp;
  }
  char.maxHp = 50 + char.stats.str * 5 + char.stats.end * 3 + 10;
  char.hp = Math.min(char.hp + 20, char.maxHp);
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
  sep.innerHTML = `<span>— Day ${day} —</span>`;
  group.appendChild(sep);

  for (const log of dayLogs) {
    if (!log.text) continue;
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.logClass || 'log-system'}`;
    entry.innerHTML = `<p>${autoJosa(log.text)}</p>`;
    group.appendChild(entry);
  }

  container.insertBefore(group, container.firstChild);
  container.scrollTop = 0;

  // Trim: keep newest 300 entries
  const allEntries = container.querySelectorAll('.log-entry');
  if (allEntries.length > 300) {
    const entries = Array.from(allEntries);
    for (let i = 300; i < entries.length; i++) entries[i].remove();
    // Remove orphaned separators
    container.querySelectorAll('.log-day-group').forEach(g => {
      if (!g.querySelector('.log-entry')) g.remove();
    });
  }
}

function appendToLog(logs) {
  const container = document.getElementById('log-entries');
  const frag = document.createDocumentFragment();
  for (const log of logs) {
    if (!log.text) continue;
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.logClass || 'log-system'}`;
    entry.innerHTML = `<p>${autoJosa(log.text)}</p>`;
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

  const MAX_SKIP = 100;
  window._nextEventRunning = true;
  const neb = document.getElementById('next-event-btn');
  const ndb = document.getElementById('next-day-btn');
  if (neb) neb.disabled = true;
  if (ndb) ndb.disabled = true;

  try {
    for (let i = 0; i < MAX_SKIP; i++) {
      if (gs.pendingChoices.length > 0) break;

      const deadBefore = new Set(gs.characters.filter(c => c.isDead).map(c => c.id));
      const promosBefore = gs.pendingPromotions.length;
      const choicesBefore = gs.pendingChoices.length;

      await nextDay();
      if (ndb) ndb.disabled = true; // keep disabled between iterations

      const newDead = gs.characters.some(c => c.isDead && !deadBefore.has(c.id));
      const newPromo = gs.pendingPromotions.length > promosBefore;
      const newChoice = gs.pendingChoices.length > choicesBefore;

      if (newDead || newPromo || newChoice) {
        showToast(`⚡ 중요 이벤트 발생! (Day ${gs.day})`, 'info');
        break;
      }

      await new Promise(r => setTimeout(r, 80));
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

  // Watchtower: global passive (no cost, survey effect)
  if (gs.world.buildings.watchtower) {
    gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 0.3);
  }

  // Each character has a 35% chance to visit each built building
  for (const char of alive) {
    for (const [bId, active] of Object.entries(gs.world.buildings)) {
      if (!active || Math.random() > 0.35) continue;

      switch (bId) {
        case 'inn': {
          const cost = 5;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          char.hp = Math.min(char.maxHp, char.hp + 15);
          char.fatigue = Math.max(0, char.fatigue - 20);
          break;
        }
        case 'temple': {
          const cost = 10;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          char.sanity = Math.min(100, char.sanity + 10);
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
          char._statAccum.str = (char._statAccum.str || 0) + 0.12 * speed;
          char._statAccum.end = (char._statAccum.end || 0) + 0.08 * speed;
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
          char._statAccum.int = (char._statAccum.int || 0) + 0.12 * speed;
          char.exp += Math.round(2 * speed);
          char.actionCounts.magic = (char.actionCounts.magic || 0) + 1;
          break;
        }
        case 'guild': {
          const income = Math.round((15 + randInt(0, 10)) * speed);
          char.gold += income;
          gs.world.totalGoldCirculated += income;
          char.exp += Math.round(2 * speed);
          char.actionCounts.combat = (char.actionCounts.combat || 0) + 1;
          break;
        }
        case 'shop': {
          // Discount: save a bit on hypothetical purchase
          const save = Math.floor(char.gold * 0.01);
          char.gold += save;
          gs.world.totalGoldCirculated += save;
          char.actionCounts.trade = (char.actionCounts.trade || 0) + 1;
          break;
        }
        case 'forge': {
          const cost = 3;
          if (char.gold < cost) break;
          char.gold -= cost;
          gs.world.townGold = (gs.world.townGold || 0) + cost;
          gs.world.baseResources.iron_ore = (gs.world.baseResources.iron_ore || 0) + 2;
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
            updateAffection(char, other, 3, gs);
          }
          char.actionCounts.social = (char.actionCounts.social || 0) + 1;
          break;
        }
      }
    }
  }
}
