/* ═══════════════════════════════════════
   market.js — Market Economy System
   ═══════════════════════════════════════ */

'use strict';

// ── Price recalculation ───────────────────
function recalcMarketPrices(gs) {
  if (!gs.settings.marketPriceFluctuation) return;

  const threatFactor = 1.0 + (gs.world.threatLevel / 100) * 0.5;
  const baseLevelBonus = (gs.world.baseLevel - 1) * 0.05; // stability

  for (const [id, item] of Object.entries(gs.market)) {
    item.prevPrice = item.currentPrice;

    const supplyI = Math.max(1, item.supplyIndex);
    const demandI = Math.max(1, item.demandIndex);
    const baseCalc = item.basePrice * (demandI / supplyI);

    // region factor: high threat → expensive (especially weapons)
    let regionFactor = threatFactor;
    if (item.cat === 'equipment') regionFactor *= threatFactor;
    if (item.cat === 'food') regionFactor *= (1.0 + (gs.world.threatLevel / 100) * 0.3);

    // base stability from settlement
    const stabilityFactor = Math.max(0.7, 1.0 - baseLevelBonus);
    const rawPrice = baseCalc * regionFactor;

    // clamp to [basePrice * 0.3, basePrice * 5]
    item.currentPrice = Math.max(
      Math.floor(item.basePrice * 0.3),
      Math.min(Math.floor(item.basePrice * 5), Math.floor(rawPrice))
    );

    item.regionFactor = regionFactor;

    // 공급은 자연 소모로 서서히 감소 (캐릭터 구매·판매로만 보충)
    // 단, 식료품·소모품은 소량 자연 생산 (완전 고갈 방지)
    const isBasic = ['food','consumable'].includes(item.cat);
    const naturalDecay = isBasic ? -0.2 : -0.5; // 기본 소모율
    const naturalRegen = isBasic ? 0.8 : 0.0;   // 식료품·소모품만 소폭 자연 생산
    item.supplyIndex = Math.max(isBasic ? 10 : 2, item.supplyIndex + naturalDecay + naturalRegen);
    // 수요는 여전히 균형으로 복귀
    item.demandIndex = Math.max(5, item.demandIndex + (100 - item.demandIndex) * 0.02);
  }
}

// ── Apply supply changes from an event ───
function applySupplyChange(gs, supplyObj) {
  if (!supplyObj) return;
  for (const [id, delta] of Object.entries(supplyObj)) {
    if (!gs.market[id] || delta === 0) continue;
    gs.market[id].supplyIndex = Math.max(1, gs.market[id].supplyIndex + delta);
  }
}

// ── Apply demand changes from an event ───
function applyDemandChange(gs, demandObj) {
  if (!demandObj) return;
  for (const [id, delta] of Object.entries(demandObj)) {
    if (!gs.market[id] || delta === 0) continue;
    gs.market[id].demandIndex = Math.max(1, gs.market[id].demandIndex + delta);
  }
}

// ── Update demand based on world state ───
function updateDemandFromWorld(gs) {
  const threat = gs.world.threatLevel;

  // High threat → more weapon/armor demand
  if (threat > 40) {
    gs.market['weapon_basic'].demandIndex += 2;
    gs.market['armor_basic'].demandIndex += 2;
  }
  if (threat > 60) {
    gs.market['healing_potion'].demandIndex += 3;
    gs.market['weapon_basic'].demandIndex += 3;
  }

  // Many characters injured → potion demand rises
  const numInjured = gs.characters.filter(c => !c.isDead && c.hp < c.maxHp * 0.5).length;
  if (numInjured > 0) {
    gs.market['healing_potion'].demandIndex += numInjured * 2;
  }

  // Many poisoned → antidote demand
  const numPoisoned = gs.characters.filter(c => c.statusEffects.includes('poison')).length;
  if (numPoisoned > 0) {
    gs.market['antidote'].demandIndex += numPoisoned * 3;
  }

  // Party size → general supply boost
  const partyMembers = gs.characters.filter(c => c.currentPartyId).length;
  if (partyMembers > 0) {
    gs.market['travel_food'].demandIndex += partyMembers;
    gs.market['healing_potion'].demandIndex += partyMembers;
  }
}

// ── Inflation system ──────────────────────
function checkInflation(gs) {
  if (!gs.settings.inflationSystem) return null;

  const totalGold = gs.characters.reduce((s, c) => s + c.gold, 0);
  const avgGold = gs.characters.length > 0 ? totalGold / gs.characters.length : 0;

  if (avgGold > 2000) {
    // inflation: nudge all prices up
    for (const item of Object.values(gs.market)) {
      item.demandIndex = Math.min(300, item.demandIndex * 1.02);
    }
    return '📈 [시장] 골드 과다 유통으로 물가가 상승했다.';
  }
  return null;
}

// ── Market anomaly detection ──────────────
function checkMarketAnomalies(gs) {
  const anomalies = [];

  // Shortage: any item supply < 10
  for (const [id, item] of Object.entries(gs.market)) {
    // Only flag non-rare items that have dropped significantly
    if (item.supplyIndex < 10 && !['rare','artifact','forbidden'].includes(item.cat)) {
      anomalies.push({ type: 'shortage', text: `⚠ [품귀] ${item.name}의 재고가 바닥났다! 가격이 폭등했다.` });
    }
  }

  // Inflation check
  const inflationMsg = checkInflation(gs);
  if (inflationMsg) {
    anomalies.push({ type: 'inflation', text: inflationMsg });
  }

  // Economic collapse
  if (gs.settings.economicCollapseEvent) {
    const lowCount = Object.values(gs.market).filter(i => i.supplyIndex < 10).length;
    const totalGold = gs.characters.reduce((s, c) => s + c.gold, 0);
    if (lowCount >= 4 || totalGold < 20) {
      anomalies.push({ type: 'collapse', text: '💥 [경제 붕괴] 시장이 무너지고 있다! 물물교환이 시작됐다.' });
    }
  }

  // Black market activation
  if (gs.settings.blackMarket && gs.world.threatLevel > 60) {
    const hasRogueOrNecro = gs.characters.some(c => c.class === 'rogue' || c.class === 'necromancer');
    if (hasRogueOrNecro) {
      gs.market['forbidden_material'].demandIndex += 5;
      anomalies.push({ type: 'blackmarket', text: '🕵 [암시장] 어둠이 짙어지면서 암시장 활동이 활발해졌다.' });
    }
  }

  // Dumping: merchant selling too much
  if (gs.market['monster_material'].supplyIndex > 250) {
    anomalies.push({ type: 'dumping', text: '📉 [덤핑] 몬스터 소재 과잉 공급으로 시세가 폭락했다.' });
  }

  return anomalies;
}

// ── Get effective buy/sell price ─────────
function getEffectiveBuyPrice(char, itemId) {
  const gs = window.GS;
  if (!gs || !gs.market[itemId]) return 0;
  const basePrice = gs.market[itemId].currentPrice;
  const chaBonus = computeChaBonus(char);
  return Math.max(1, Math.floor(basePrice * (1 - chaBonus)));
}

function getEffectiveSellPrice(char, itemId) {
  const gs = window.GS;
  if (!gs || !gs.market[itemId]) return 0;
  const basePrice = gs.market[itemId].currentPrice;
  const chaBonus = computeChaBonus(char);
  return Math.floor(basePrice * (1 + chaBonus));
}

// ── Apply class economic effects each day ─
function applyClassEconomicEffects(char, gs) {
  if (!char.class || char.isDead) return [];
  const classDef = CLASSES[char.class];
  if (!classDef) return [];

  const logs = [];

  // Gold from class activity — 10일마다 한 번 (매일 소액 대신 10일치 일괄)
  const [goldMin, goldMax] = classDef.goldPerDay || [0, 0];
  if (goldMin > 0 && gs.day % 10 === 0) {
    const earned = randInt(goldMin * 10, goldMax * 10);
    char.gold += earned;
    gs.world.totalGoldCirculated += earned;
    logs.push({ type: 'economy', text: `[클래스 수입] ${char.name}(${classDef.name})이(가) 10일치 활동으로 ${earned}G를 벌었다.` });
  }

  // Class supply contributions
  if (classDef.supply) {
    for (const [item, delta] of Object.entries(classDef.supply)) {
      if (gs.market[item]) {
        gs.market[item].supplyIndex = Math.max(1, gs.market[item].supplyIndex + delta);
      }
    }
  }

  // Class demand effects
  if (classDef.demand) {
    for (const [item, delta] of Object.entries(classDef.demand)) {
      if (gs.market[item]) {
        gs.market[item].demandIndex += delta;
      }
    }
  }

  return logs;
}
