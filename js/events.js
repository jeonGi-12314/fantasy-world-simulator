/* ═══════════════════════════════════════
   events.js — Event Pool (60+ events)
   ═══════════════════════════════════════ */

'use strict';

// Helper: random integer between a and b inclusive
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randOf(...arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── 이름 조사 처리 (Korean particle helpers) ──
function josa(name, p1, p2) {
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xAC00 || last > 0xD7A3) return name + p1;
  return name + ((last - 0xAC00) % 28 === 0 ? p1 : p2);
}
function ga(n)  { return josa(n, '가', '이'); }    // 가/이
function eun(n) { return josa(n, '는', '은'); }   // 는(no batchim)/은(batchim)
function ul(n)  { return josa(n, '를', '을'); }   // 를/을
function ro(n)  { return josa(n, '로', '으로'); } // 로/으로

// ── Event success roll — 장비 보너스 포함 ──
function roll(char, statKey) {
  const base = char.stats[statKey] || 0;
  const equip = char._equipBonuses?.[statKey] || 0;
  const statVal = base + equip;
  const fatigueDebt = Math.floor(char.fatigue / 20);
  return randInt(1, 100) + statVal * 5 - fatigueDebt * 5;
}

// ── 장비 드랍 헬퍼 ──
function rollEquipDrop(char, tier = 1) {
  // 현재 장착 장비보다 좋은 것만 드랍
  const candidates = Object.entries(EQUIPMENT_DEFS).filter(([id, def]) => {
    const slot = def.slot;
    const current = char.equipment?.[slot];
    const currentTier = current ? (EQUIPMENT_DEFS[current.id]?.tier ?? -1) : -1;
    return def.tier <= tier && def.tier > currentTier;
  });
  if (!candidates.length) return null;
  const [id, def] = candidates[Math.floor(Math.random() * candidates.length)];
  return { id, ...def };
}

// ── Effect builder ──
function fx(obj) { return obj; }

// ═══════════════════════════════════════════
// EVENT POOL
// Each event: { id, type, weight, conditions, resolve(char, gs) }
// resolve → { text, effects, marketEffect?, logClass, choices? }
// ═══════════════════════════════════════════

const EVENT_POOL = [

  // ────────────────────────────────────────
  // REST EVENTS (저체력 캐릭터 전용)
  // ────────────────────────────────────────
  {
    id: 'rest_recover',
    type: 'rest',
    weight: 8,
    conditions: { notDead: true },
    resolve(char, gs) {
      const hpGain = randInt(5, 15);
      const fatigueReduce = randInt(10, 20);
      const msgs = [
        `${char.name}이(가) 오늘은 무리하지 않고 충분히 쉬었다. 내일을 위한 힘을 비축했다.`,
        `${char.name}이(가) 몸 상태를 살피며 하루를 쉬었다. 상처가 조금씩 아물었다.`,
        `${char.name}이(가) 여관에서 온종일 쉬며 회복에 집중했다.`,
      ];
      return {
        logClass: 'log-system',
        text: `${pick(msgs)} (HP +${hpGain}, 피로 -${fatigueReduce})`,
        effects: fx({ hp: hpGain, fatigue: -fatigueReduce }),
      };
    },
  },
  {
    id: 'rest_heal_poison',
    type: 'rest',
    weight: 12,
    conditions: { notDead: true, hasStatus: 'poison' },
    resolve(char, gs) {
      const hpGain = randInt(3, 8);
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 중독 증세로 인해 하루를 쉬며 해독에 집중했다. (HP +${hpGain})`,
        effects: fx({ hp: hpGain, fatigue: -10 }),
      };
    },
  },

  // ────────────────────────────────────────
  // COMBAT EVENTS
  // ────────────────────────────────────────
  {
    id: 'combat_bandit',
    type: 'combat',
    weight: 10,
    logClass: 'log-combat',
    conditions: { notDead: true, minFatigue: 0, maxFatigue: 80 },
    resolve(char, gs) {
      const threshold = 40;
      const r = roll(char, 'str');
      const success = r >= threshold;
      const goldGain = success ? randInt(20, 60) : 0;
      const hpLoss  = success ? randInt(0, 8)   : randInt(10, 20);
      const addAction = { combat: 1 };
      const drop = success && Math.random() < 0.10 ? rollEquipDrop(char, 1) : null;
      return {
        logClass: 'log-combat',
        text: success
          ? `${eun(char.name)} 숲 길을 걷다 산적과 마주쳤다. 단호한 반격으로 산적들을 물리치고 금화 ${goldGain}G를 획득했다! (HP -${hpLoss})`
          : `${eun(char.name)} 산적의 기습을 받았다. 가까스로 도망쳤지만 부상을 입었다. (HP -${hpLoss})`,
        effects: fx({ hp: -hpLoss, gold: goldGain, exp: success ? 15 : 5, fatigue: 8 }),
        supply: { monster_material: success ? 5 : 0 },
        addAction,
        equipDrop: drop,
      };
    },
  },

  {
    id: 'combat_monster',
    type: 'combat',
    weight: 9,
    logClass: 'log-combat',
    conditions: { notDead: true, maxFatigue: 85 },
    resolve(char, gs) {
      const threshold = 50;
      const r = roll(char, 'str');
      const success = r >= threshold;
      const monsters = ['고블린','오크','스켈레톤','좀비','울프','슬라임','트롤'];
      const monster = pick(monsters);
      const goldGain = success ? randInt(30, 80) : 0;
      const hpLoss   = success ? randInt(3, 12)  : randInt(15, 30);
      const expGain  = success ? 20 : 8;
      const drop2 = success && Math.random() < 0.12 ? rollEquipDrop(char, 1) : null;
      return {
        logClass: 'log-combat',
        text: success
          ? `${char.name}이(가) ${monster}을(를) 사냥했다! 몬스터 소재를 획득하고 금화 ${goldGain}G의 현상금을 받았다. (HP -${hpLoss}, EXP +${expGain})`
          : `${char.name}이(가) ${monster}과(와) 싸웠으나 패배했다. 간신히 살아 도망쳤다. (HP -${hpLoss})`,
        effects: fx({ hp: -hpLoss, gold: goldGain, exp: expGain, fatigue: 12 }),
        supply: { monster_material: success ? 10 : 0 },
        addAction: { combat: 1 },
        statusAdd: success ? null : (randInt(1,100) > 80 ? 'fear' : null),
        equipDrop: drop2,
      };
    },
  },

  {
    id: 'combat_dungeon',
    type: 'combat',
    weight: 7,
    logClass: 'log-combat',
    conditions: { notDead: true, minStats: { str: 3 }, maxFatigue: 70 },
    resolve(char, gs) {
      const threshold = 55;
      const r = roll(char, 'str');
      const success = r >= threshold;
      const dungeons = ['어둠의 동굴','망자의 묘지','고대 유적','버려진 성','마왕의 탑 전초기지'];
      const dungeon = pick(dungeons);
      const goldGain = success ? randInt(50, 150) : randInt(0, 20);
      const hpLoss   = success ? randInt(5, 15)   : randInt(20, 40);
      const expGain  = success ? 30 : 10;
      const dropD = success && Math.random() < 0.22 ? rollEquipDrop(char, 2) : null;
      return {
        logClass: 'log-combat',
        text: success
          ? `${char.name}이(가) ${dungeon}을 탐험했다! 강적을 물리치고 보물 ${goldGain}G와 함께 귀환했다. (HP -${hpLoss}, EXP +${expGain})`
          : `${char.name}이(가) ${dungeon}에 도전했다가 강적에게 패배했다. 가까스로 탈출했다. (HP -${hpLoss})`,
        effects: fx({ hp: -hpLoss, gold: goldGain, exp: expGain, fatigue: 20 }),
        supply: { monster_material: success ? 20 : 0, magic_stone: success ? 5 : 0 },
        addAction: { combat: 1 },
        statusAdd: success ? null : (randInt(1,100) > 70 ? pick(['poison', 'fear']) : null),
        equipDrop: dropD,
      };
    },
  },

  {
    id: 'combat_protection',
    type: 'combat',
    weight: 6,
    logClass: 'log-combat',
    conditions: { notDead: true, class: ['warrior','knight','paladin'] },
    resolve(char, gs) {
      const r = roll(char, 'str');
      const success = r >= 45;
      const goldGain = success ? randInt(60, 120) : 0;
      return {
        logClass: 'log-combat',
        text: success
          ? `${char.name}이(가) 상인 호위 의뢰를 완수했다. 의뢰인이 감사의 표시로 금화 ${goldGain}G를 지불했다.`
          : `${char.name}이(가) 상인 호위 중 적에게 기습당했다. 상인을 지키긴 했으나 보수를 받지 못했다. (HP -${randInt(10,20)})`,
        effects: fx({ hp: success ? 0 : -randInt(10,20), gold: goldGain, exp: 18, fatigue: 10 }),
        addAction: { combat: 1 },
      };
    },
  },

  {
    id: 'combat_bounty',
    type: 'combat',
    weight: 5,
    logClass: 'log-combat',
    conditions: { notDead: true, minStats: { str: 4 }, worldThreat: [21, 100] },
    resolve(char, gs) {
      const r = roll(char, 'str');
      const success = r >= 50;
      const targets = ['지명수배 도적','탈주한 오크 족장','부패한 기사','마왕의 전위대'];
      const target = pick(targets);
      const goldGain = success ? randInt(100, 250) : 0;
      return {
        logClass: 'log-combat',
        text: success
          ? `${char.name}이(가) 현상수배된 ${target}을(를) 토벌했다! 상금 ${goldGain}G를 획득했다. (EXP +35)`
          : `${char.name}이(가) ${target}에게 도전했으나 패배했다. (HP -${randInt(20, 35)}, 피로 증가)`,
        effects: fx({ hp: success ? -randInt(5,15) : -randInt(20,35), gold: goldGain, exp: success ? 35 : 10, fatigue: 15 }),
        addAction: { combat: 1 },
        worldThreatDelta: success ? -2 : 0,
      };
    },
  },

  // ────────────────────────────────────────
  // EXPLORATION EVENTS
  // ────────────────────────────────────────
  {
    id: 'explore_ruin',
    type: 'exploration',
    weight: 8,
    logClass: 'log-system',
    conditions: { notDead: true },
    resolve(char, gs) {
      const r = roll(char, 'end');
      const success = r >= 45;
      const ruins = ['고대 마법사의 탑','잊혀진 신전','용이 잠들었다는 동굴','봉인된 지하 미궁'];
      const ruin = pick(ruins);
      const goldGain = success ? randInt(40, 100) : 0;
      return {
        logClass: 'log-system',
        text: success
          ? `${char.name}이(가) ${ruin}을 발견하고 탐험했다! 고대의 보물 ${goldGain}G와 귀중한 유물을 발견했다. (EXP +20)`
          : `${char.name}이(가) ${ruin}을 탐험하다 함정에 걸렸다. (HP -${randInt(5,15)}, 피로 증가)`,
        effects: fx({ hp: success ? 0 : -randInt(5,15), gold: goldGain, exp: success ? 20 : 5, fatigue: 15 }),
        supply: { ancient_artifact: success ? 1 : 0 },
        addAction: { survival: 1 },
      };
    },
  },

  {
    id: 'explore_gather',
    type: 'exploration',
    weight: 10,
    logClass: 'log-system',
    conditions: { notDead: true },
    resolve(char, gs) {
      const r = roll(char, 'end');
      const success = r >= 35;
      const herbGain = success ? randInt(5, 15) : 0;
      const goldGain = success ? randInt(10, 30) : 0;
      const items = ['약초','버섯','열매','식물 줄기','이끼'];
      const item = pick(items);
      return {
        logClass: 'log-system',
        text: success
          ? `${char.name}이(가) 숲에서 ${item}을(를) 채집했다. 시장에 팔아 ${goldGain}G를 벌었다.`
          : `${char.name}이(가) 채집을 나갔지만 별다른 수확이 없었다. 피로만 쌓였다.`,
        effects: fx({ gold: goldGain, exp: 8, fatigue: 8 }),
        supply: { herb: herbGain, travel_food: success ? randInt(3,8) : 0 },
        addAction: { survival: 1 },
      };
    },
  },

  {
    id: 'explore_ancient_map',
    type: 'exploration',
    weight: 4,
    logClass: 'log-system',
    conditions: { notDead: true, minStats: { int: 3 } },
    resolve(char, gs) {
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 낡은 고지도를 발견했다. 지도에는 누구도 모르는 유적의 위치가 표시돼 있었다. (EXP +15)`,
        effects: fx({ exp: 15, fatigue: 5 }),
        addAction: { survival: 1 },
        worldThreatDelta: 0,
      };
    },
  },

  {
    id: 'explore_rest',
    type: 'exploration',
    weight: 8,
    logClass: 'log-system',
    conditions: { notDead: true, minFatigue: 30 },
    resolve(char, gs) {
      const tiredness = ['등이 땅에 닿자마자 잠들었다','폭신한 풀밭에 쓰러져 쉬었다','냇가에 발을 담그며 피로를 풀었다'];
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 오랜 모험 끝에 잠시 쉬기로 했다. ${pick(tiredness)}. (피로 -25, Sanity +10)`,
        effects: fx({ fatigue: -25, sanity: 10, exp: 3 }),
        addAction: {},
      };
    },
  },

  {
    id: 'explore_lost',
    type: 'exploration',
    weight: 5,
    logClass: 'log-system',
    conditions: { notDead: true },
    resolve(char, gs) {
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 탐험 중 길을 잃고 말았다. 이틀을 헤맨 끝에 간신히 돌아왔다. (피로 +20, Sanity -5)`,
        effects: fx({ fatigue: 20, sanity: -5, exp: 5 }),
        addAction: { survival: 1 },
      };
    },
  },

  // ────────────────────────────────────────
  // ECONOMY EVENTS
  // ────────────────────────────────────────
  {
    id: 'eco_trade',
    type: 'economy',
    weight: 10,
    logClass: 'log-economy',
    conditions: { notDead: true, minGold: 30 },
    resolve(char, gs) {
      const r = roll(char, 'cha');
      const success = r >= 40;
      const chaBonus = computeChaBonus(char);
      const invest = Math.min(char.gold, randInt(20, 60));
      const profit = success
        ? Math.floor(invest * (0.2 + chaBonus) * (1 + Math.random() * 0.3))
        : Math.floor(-invest * 0.1);
      return {
        logClass: 'log-economy',
        text: success
          ? `${char.name}이(가) 시장에서 물건을 사고팔아 ${profit}G 이익을 남겼다. (CHA 보정: ${(chaBonus*100).toFixed(0)}%)`
          : `${char.name}이(가) 교역을 시도했으나 가격을 잘못 판단해 ${-profit}G를 손해봤다.`,
        effects: fx({ gold: profit, exp: 8, fatigue: 5 }),
        supply: { monster_material: 0 },
        addAction: { trade: 1 },
      };
    },
  },

  {
    id: 'eco_service_cleric',
    type: 'economy',
    weight: 12,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['cleric', 'paladin', 'druid'] },
    resolve(char, gs) {
      const patients = randInt(2, 6);
      const goldGain = patients * randInt(15, 30);
      return {
        logClass: 'log-economy',
        text: `${char.name}이(가) 마을에서 ${patients}명을 치유했다. 감사의 금화 총 ${goldGain}G를 받았다. (EXP +12)`,
        effects: fx({ gold: goldGain, exp: 12, fatigue: 10 }),
        supply: { healing_potion: -2 },
        addAction: { faith: 1 },
      };
    },
  },

  {
    id: 'eco_performance_bard',
    type: 'economy',
    weight: 12,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['bard'] },
    resolve(char, gs) {
      const r = roll(char, 'cha');
      const success = r >= 40;
      const crowd = success ? randInt(10, 40) : randInt(1, 8);
      const goldGain = success ? crowd * randInt(3, 8) : crowd * 1;
      return {
        logClass: 'log-economy',
        text: success
          ? `${char.name}이(가) 광장에서 공연을 펼쳐 관중 ${crowd}명에게서 ${goldGain}G를 모았다. 박수 소리가 거리를 메웠다!`
          : `${char.name}이(가) 거리 공연을 했지만 반응이 시들했다. 그래도 ${goldGain}G는 벌었다.`,
        effects: fx({ gold: goldGain, exp: 10, fatigue: 8 }),
        addAction: { social: 1 },
      };
    },
  },

  {
    id: 'eco_sage_appraisal',
    type: 'economy',
    weight: 10,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['sage'] },
    resolve(char, gs) {
      const clients = randInt(1, 3);
      const goldGain = clients * randInt(50, 150);
      return {
        logClass: 'log-economy',
        text: `${char.name}이(가) 의뢰인 ${clients}명의 유물을 감정했다. 감정료 ${goldGain}G를 받았다. (EXP +18)`,
        effects: fx({ gold: goldGain, exp: 18, fatigue: 7 }),
        supply: { ancient_artifact: 1 },
        addAction: { magic: 1 },
      };
    },
  },

  {
    id: 'eco_merchant_arbitrage',
    type: 'economy',
    weight: 12,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['merchant'] },
    resolve(char, gs) {
      const r = roll(char, 'cha');
      const success = r >= 35;
      const goldGain = success ? randInt(80, 300) : randInt(-50, -10);
      const items = ['향신료','직물','마법 재료','식량','금속'];
      const item = pick(items);
      return {
        logClass: 'log-economy',
        text: success
          ? `${char.name}이(가) 원거리 ${item} 교역에 성공했다! 가격 차이로 ${goldGain}G의 차익을 남겼다.`
          : `${char.name}이(가) ${item} 교역에서 손실이 발생했다. (${goldGain}G)`,
        effects: fx({ gold: goldGain, exp: 20, fatigue: 8 }),
        addAction: { trade: 1 },
      };
    },
  },

  {
    id: 'eco_craft_ranger',
    type: 'economy',
    weight: 10,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['ranger','druid'] },
    resolve(char, gs) {
      const goldGain = randInt(20, 60);
      return {
        logClass: 'log-economy',
        text: `${char.name}이(가) 하루 종일 채집과 채취에 나섰다. 약초와 식량을 잔뜩 모아 시장에서 ${goldGain}G를 받았다.`,
        effects: fx({ gold: goldGain, exp: 10, fatigue: 12 }),
        supply: { herb: 15, travel_food: 10 },
        addAction: { survival: 1 },
      };
    },
  },

  {
    id: 'eco_black_market',
    type: 'economy',
    weight: 6,
    logClass: 'log-economy',
    conditions: { notDead: true, class: ['rogue','necromancer'], blackMarketRequired: true },
    resolve(char, gs) {
      const r = roll(char, 'agi');
      const success = r >= 50;
      const goldGain = success ? randInt(100, 300) : randInt(-30, 0);
      return {
        logClass: 'log-economy',
        text: success
          ? `${char.name}이(가) 암시장에서 금지 거래를 성사시켰다. ${goldGain}G를 챙겼다. 흔적은 남기지 않았다.`
          : `${char.name}이(가) 암시장에서 불법 거래를 시도했다가 관리에게 들킬 뻔했다. 피해를 보고 달아났다. (${goldGain}G)`,
        effects: fx({ gold: goldGain, exp: 12, fatigue: 10 }),
        supply: { forbidden_material: success ? 2 : 0 },
        addAction: { stealth: 1 },
        worldThreatDelta: 2,
      };
    },
  },

  {
    id: 'eco_donate',
    type: 'economy',
    weight: 5,
    logClass: 'log-economy',
    conditions: { notDead: true, minGold: 50, alignment: ['Light'] },
    resolve(char, gs) {
      const donate = Math.floor(char.gold * 0.1);
      return {
        logClass: 'log-economy',
        text: `${char.name}이(가) 가난한 이들에게 ${donate}G를 기부했다. 사람들의 감사가 마음을 따뜻하게 했다. (Sanity +10)`,
        effects: fx({ gold: -donate, sanity: 10, exp: 8 }),
        addAction: { faith: 1 },
        worldThreatDelta: -1,
      };
    },
  },

  // ────────────────────────────────────────
  // CLASS-SPECIFIC EVENTS
  // ────────────────────────────────────────
  {
    id: 'class_warrior_train',
    type: 'class',
    weight: 9,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['warrior','knight'] },
    resolve(char, gs) {
      const r = roll(char, 'str');
      const success = r >= 40;
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) 훈련장에서 혹독한 수련을 마쳤다. 근력이 한층 강해진 것이 느껴진다. (STR 성장 가능성, EXP +12)`
          : `${char.name}이(가) 훈련 중 과로로 쓰러졌다. (피로 +20, HP -5)`,
        effects: fx({ hp: success ? 0 : -5, exp: success ? 12 : 3, fatigue: success ? 10 : 20 }),
        statGrow: success ? { str: 0.1 } : null,
        addAction: { combat: 1 },
      };
    },
  },

  {
    id: 'class_mage_research',
    type: 'class',
    weight: 9,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['mage','sage','necromancer'] },
    resolve(char, gs) {
      const r = roll(char, 'int');
      const success = r >= 45;
      const spells = ['방어막','번개 화살','얼음 침묵','공간 왜곡','원소 폭발'];
      const spell = pick(spells);
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) 마법 연구 끝에 ${spell} 술식을 완성했다! 마력이 크게 증폭됐다. (EXP +15, MP 활성화)`
          : `${char.name}이(가) 밤새 마법 연구를 했지만 실패했다. (피로 +15, Sanity -5)`,
        effects: fx({ exp: success ? 15 : 3, fatigue: success ? 8 : 15, sanity: success ? 0 : -5, mp: success ? 10 : 0 }),
        supply: { magic_stone: -2 },
        statGrow: success ? { int: 0.1 } : null,
        addAction: { magic: 1 },
      };
    },
  },

  {
    id: 'class_cleric_blessing',
    type: 'class',
    weight: 9,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['cleric','paladin'] },
    resolve(char, gs) {
      const r = roll(char, 'fai');
      const success = r >= 40;
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) 새벽 기도를 드리고 신성한 축복을 받았다. 오늘 하루 모든 판정에 가호가 깃든 느낌이다. (Sanity +15, EXP +10)`
          : `${char.name}이(가) 기도를 올렸지만 신의 응답이 없었다. (Sanity -5)`,
        effects: fx({ sanity: success ? 15 : -5, exp: success ? 10 : 0, hp: success ? 10 : 0 }),
        addAction: { faith: 1 },
      };
    },
  },

  {
    id: 'class_rogue_infiltrate',
    type: 'class',
    weight: 8,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['rogue'] },
    resolve(char, gs) {
      const r = roll(char, 'agi');
      const success = r >= 50;
      const goldGain = success ? randInt(60, 180) : 0;
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) 귀족 저택에 잠입, 금고에서 ${goldGain}G를 빼내왔다. 흔적조차 남기지 않았다.`
          : `${char.name}이(가) 잠입을 시도했으나 경비에게 발각됐다. 가까스로 도망쳤다. (HP -${randInt(10,20)})`,
        effects: fx({ gold: goldGain, hp: success ? 0 : -randInt(10,20), exp: success ? 20 : 5, fatigue: 12 }),
        addAction: { stealth: 1 },
      };
    },
  },

  {
    id: 'class_ranger_track',
    type: 'class',
    weight: 9,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['ranger','druid'] },
    resolve(char, gs) {
      const r = roll(char, 'end');
      const success = r >= 40;
      const prey = pick(['사슴','멧돼지','산양','독수리']);
      const goldGain = success ? randInt(30, 70) : 0;
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) ${prey}을(를) 추적해 사냥에 성공했다. 식량과 가죽을 시장에 팔아 ${goldGain}G를 얻었다.`
          : `${char.name}이(가) 사냥감을 추적했지만 놓쳤다. (피로 +10)`,
        effects: fx({ gold: goldGain, exp: 12, fatigue: success ? 10 : 15 }),
        supply: { travel_food: success ? 12 : 0 },
        addAction: { survival: 1 },
      };
    },
  },

  {
    id: 'class_necromancer_ritual',
    type: 'class',
    weight: 7,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['necromancer'] },
    resolve(char, gs) {
      const r = roll(char, 'int');
      const success = r >= 50;
      return {
        logClass: 'log-class',
        text: success
          ? `${char.name}이(가) 달빛 아래 금지된 의식을 치렀다. 죽음의 기운이 주변에 서렸다. (EXP +20, Sanity -10)`
          : `${char.name}이(가) 의식 중 역술사의 저항을 받아 실패했다. (HP -${randInt(10,20)}, Sanity -15)`,
        effects: fx({ exp: success ? 20 : 3, sanity: success ? -10 : -15, hp: success ? 0 : -randInt(10,20), mp: success ? 15 : 0 }),
        supply: { forbidden_material: success ? 1 : 0 },
        addAction: { magic: 1 },
        worldThreatDelta: success ? 3 : 1,
      };
    },
  },

  {
    id: 'class_paladin_shrine',
    type: 'class',
    weight: 7,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['paladin'], alignment: ['Light'] },
    resolve(char, gs) {
      char.visitedShrine = true;
      return {
        logClass: 'log-class',
        text: `${char.name}이(가) 빛의 신전에서 기도를 올렸다. 신성한 빛이 온몸을 감싸며 상태이상이 해제됐다. (HP 회복, 저주 해제)`,
        effects: fx({ hp: 20, sanity: 15, fatigue: -15 }),
        removeAllStatus: true,
        addAction: { faith: 1 },
        worldThreatDelta: -2,
      };
    },
  },

  // ────────────────────────────────────────
  // SOCIAL / RELATIONSHIP EVENTS
  // ────────────────────────────────────────
  {
    id: 'social_tavern',
    type: 'social',
    weight: 10,
    logClass: 'log-social',
    conditions: { notDead: true },
    resolve(char, gs) {
      const cost = randInt(10, 30);
      const sanityGain = randInt(10, 20);
      const activities = ['맥주를 마시며 여행자들과 담소했다','카드 게임에서 이겼다','흥미로운 소문을 들었다','음유시인의 노래를 감상했다'];
      return {
        logClass: 'log-social',
        text: `${char.name}이(가) 선술집에 들렀다. ${pick(activities)}. (${cost}G 지출, Sanity +${sanityGain})`,
        effects: fx({ gold: -cost, sanity: sanityGain, fatigue: -10, exp: 3 }),
        addAction: { social: 1 },
      };
    },
  },

  {
    id: 'social_help_stranger',
    type: 'social',
    weight: 7,
    logClass: 'log-social',
    conditions: { notDead: true },
    resolve(char, gs) {
      const outcomes = [
        { t: '길 잃은 아이를 집으로 데려다줬다. 아이의 부모가 감사의 표시로 금화를 건넸다.', gold: randInt(10,30), sanity: 10 },
        { t: '무거운 짐을 나르는 노인을 도왔다. 노인이 고맙다며 오래된 약초를 줬다.', gold: 0, sanity: 8 },
        { t: '다친 여행자를 치료해줬다. 여행자가 고마워하며 유용한 정보를 알려줬다.', gold: 0, sanity: 12, exp: 8 },
      ];
      const o = pick(outcomes);
      return {
        logClass: 'log-social',
        text: `${char.name}이(가) 어려운 이를 도왔다. ${o.t}`,
        effects: fx({ gold: o.gold||0, sanity: o.sanity||0, exp: o.exp||5 }),
        addAction: { social: 1 },
      };
    },
  },

  {
    id: 'social_rumor',
    type: 'social',
    weight: 8,
    logClass: 'log-social',
    conditions: { notDead: true },
    resolve(char, gs) {
      const rumors = [
        '마왕의 부하들이 북쪽 산맥을 넘어오고 있다는 소식이 퍼졌다.',
        '어느 상인이 용의 동굴에서 살아 돌아와 엄청난 보물을 갖고 있다는 소문이 돌았다.',
        '왕국 서쪽에서 정체불명의 역병이 퍼지고 있다는 여행자의 이야기를 들었다.',
        '전설의 검이 호수 밑에 봉인돼 있다는 오래된 전설을 배웠다.',
      ];
      return {
        logClass: 'log-social',
        text: `${char.name}이(가) 소문을 들었다. "${pick(rumors)}" (EXP +5)`,
        effects: fx({ exp: 5, fatigue: 3 }),
        addAction: { social: 1 },
      };
    },
  },

  {
    id: 'social_argument',
    type: 'social',
    weight: 5,
    logClass: 'log-social',
    conditions: { notDead: true },
    resolve(char, gs) {
      const r = roll(char, 'cha');
      const success = r >= 40;
      return {
        logClass: 'log-social',
        text: success
          ? `${char.name}이(가) 시장에서 상인과 분쟁이 생겼다. 뛰어난 말솜씨로 상황을 정리했다. (Sanity +5)`
          : `${char.name}이(가) 시장에서 상인과 언쟁을 벌였다. 결국 손해를 보고 물러났다. (Sanity -8, Gold -${randInt(5,20)})`,
        effects: fx({ sanity: success ? 5 : -8, gold: success ? 0 : -randInt(5,20), exp: 5 }),
        addAction: { social: 1 },
      };
    },
  },

  {
    id: 'social_mentor',
    type: 'social',
    weight: 5,
    logClass: 'log-social',
    conditions: { notDead: true, minStats: { cha: 3 } },
    resolve(char, gs) {
      const subjects = ['전투 기술','마법 이론','상인의 마음가짐','야생 생존술','신앙의 길'];
      const subject = pick(subjects);
      return {
        logClass: 'log-social',
        text: `${char.name}이(가) 노련한 선배 모험가에게서 ${subject}에 대한 조언을 들었다. 많은 것을 배웠다. (EXP +15, Sanity +8)`,
        effects: fx({ exp: 15, sanity: 8, fatigue: 5 }),
        addAction: { social: 1 },
      };
    },
  },

  // ────────────────────────────────────────
  // STATUS EFFECT EVENTS
  // ────────────────────────────────────────
  {
    id: 'status_cursed_artifact',
    type: 'status',
    weight: 4,
    logClass: 'log-status',
    conditions: { notDead: true },
    resolve(char, gs) {
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 의문의 유물에 손을 댔다가 저주에 걸렸다! 몸이 무거워지고 스탯이 하락했다. [저주 발생]`,
        effects: fx({ exp: 0, sanity: -5 }),
        statusAdd: 'curse',
        addAction: {},
      };
    },
  },

  {
    id: 'cleanse_curse',
    type: 'life',
    weight: 3,
    logClass: 'log-status',
    conditions: { notDead: true, hasStatus: 'curse', minGold: 50 },
    resolve(char, gs) {
      const cost = 50;
      char.gold -= cost;
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 마을 현자에게 ${cost}G를 지불하고 저주를 해제받았다. 몸이 한결 가벼워졌다.`,
        effects: fx({ sanity: 10 }),
        removeStatus: 'curse',
      };
    },
  },

  {
    id: 'status_poison_trap',
    type: 'status',
    weight: 5,
    logClass: 'log-status',
    conditions: { notDead: true },
    resolve(char, gs) {
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 탐험 중 독 함정에 걸렸다. 독이 서서히 퍼지고 있다. [중독 발생]`,
        effects: fx({ hp: -5, exp: 0 }),
        statusAdd: 'poison',
        addAction: { survival: 1 },
      };
    },
  },

  {
    id: 'status_cure_poison',
    type: 'status',
    weight: 8,
    logClass: 'log-status',
    conditions: { notDead: true, hasStatus: 'poison' },
    resolve(char, gs) {
      const cost = randInt(20, 40);
      if (char.gold >= cost) {
        return {
          logClass: 'log-status',
          text: `${char.name}이(가) 약사에게 해독제를 구입했다. (${cost}G) 중독이 해제됐다!`,
          effects: fx({ gold: -cost }),
          removeStatus: 'poison',
          supply: { antidote: -1 },
          addAction: {},
        };
      }
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 해독제를 구하려 했으나 금화가 부족했다. 중독이 계속 진행된다. (HP -5)`,
        effects: fx({ hp: -5 }),
        addAction: {},
      };
    },
  },

  {
    id: 'status_sanity_recover',
    type: 'status',
    weight: 6,
    logClass: 'log-status',
    conditions: { notDead: true, maxSanity: 60 },
    resolve(char, gs) {
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 심신이 지쳐가는 것을 느끼고 며칠 휴양을 취했다. 정신이 한결 안정됐다. (Sanity +20, 피로 -15)`,
        effects: fx({ sanity: 20, fatigue: -15, gold: -randInt(15,25) }),
        addAction: {},
      };
    },
  },

  {
    id: 'status_madness_episode',
    type: 'status',
    weight: 5,
    logClass: 'log-status',
    conditions: { notDead: true, hasStatus: 'madness' },
    resolve(char, gs) {
      const goldLoss = randInt(10, 50);
      return {
        logClass: 'log-status',
        text: `${char.name}에게 광기의 발작이 일었다! 기억이 흐릿하다. 정신을 차리고 보니 금화 ${goldLoss}G가 없어졌다.`,
        effects: fx({ gold: -goldLoss, sanity: -5 }),
        addAction: {},
      };
    },
  },

  {
    id: 'status_fear_overcome',
    type: 'status',
    weight: 6,
    logClass: 'log-status',
    conditions: { notDead: true, hasStatus: 'fear' },
    resolve(char, gs) {
      const r = roll(char, 'end');
      if (r >= 45) {
        return {
          logClass: 'log-status',
          text: `${char.name}이(가) 두려움을 이겨냈다! 강인한 의지로 공포를 극복했다. [공포 해제] (Sanity +10)`,
          effects: fx({ sanity: 10 }),
          removeStatus: 'fear',
          addAction: {},
        };
      }
      return {
        logClass: 'log-status',
        text: `${char.name}은(는) 아직 두려움에서 벗어나지 못했다. (Sanity -5)`,
        effects: fx({ sanity: -5 }),
        addAction: {},
      };
    },
  },

  // ────────────────────────────────────────
  // WORLD EVENTS
  // ────────────────────────────────────────
  {
    id: 'world_threat_rise',
    type: 'world',
    weight: 4,
    logClass: 'log-world',
    conditions: { notDead: true },
    resolve(char, gs) {
      const events = [
        '마왕의 군대가 왕국 국경에서 목격됐다는 전령이 도착했다.',
        '마을 인근에서 정체불명의 검은 안개가 나타나 사람들을 공포에 빠뜨렸다.',
        '북쪽 산맥에서 마왕의 선봉대가 마을을 약탈했다는 소식이 전해졌다.',
      ];
      return {
        logClass: 'log-world',
        text: `[세계 이벤트] ${pick(events)} 세계 위협도가 상승했다.`,
        effects: fx({ sanity: -5 }),
        worldThreatDelta: randInt(3, 8),
        supply: { weapon_basic: -5, armor_basic: -5 },
        demand: { weapon_basic: 15, armor_basic: 15 },
        addAction: {},
      };
    },
  },

  {
    id: 'world_threat_calm',
    type: 'world',
    weight: 3,
    logClass: 'log-world',
    conditions: { notDead: true, worldThreat: [21, 100] },
    resolve(char, gs) {
      const events = [
        '영웅들의 활약으로 마왕의 전진 기지 하나가 무너졌다는 소식이 전해졌다.',
        '왕국 기사단이 광야를 순찰하며 몬스터 소탕에 나섰다.',
        '성직자들의 대규모 봉인 의식이 어둠의 물결을 잠시 막아냈다.',
      ];
      return {
        logClass: 'log-world',
        text: `[세계 이벤트] ${pick(events)} 세계 위협도가 소폭 하락했다.`,
        effects: fx({ sanity: 5 }),
        worldThreatDelta: -randInt(2, 5),
        addAction: {},
      };
    },
  },

  {
    id: 'world_disaster',
    type: 'world',
    weight: 3,
    logClass: 'log-world',
    conditions: { notDead: true, worldThreat: [41, 100] },
    resolve(char, gs) {
      const disasters = ['대홍수로 강이 범람했다.','건기가 길어져 식량 부족이 심화됐다.','역병이 퍼져 마을들이 봉쇄됐다.'];
      return {
        logClass: 'log-world',
        text: `[세계 이벤트] ${pick(disasters)} 식량 가격이 급등하고 있다.`,
        effects: fx({ hp: -5, sanity: -8 }),
        supply: { travel_food: -20 },
        demand: { travel_food: 30, healing_potion: 20 },
        worldThreatDelta: 5,
        addAction: {},
      };
    },
  },

  {
    id: 'world_festival',
    type: 'world',
    weight: 4,
    logClass: 'log-world',
    conditions: { notDead: true, worldThreat: [0, 40] },
    resolve(char, gs) {
      return {
        logClass: 'log-world',
        text: `[세계 이벤트] 왕국 수확제가 열렸다! 마을 곳곳에 축제 분위기가 넘쳤다. 시장 거래가 활발해졌다. (Sanity +10)`,
        effects: fx({ sanity: 10, gold: randInt(10, 30) }),
        supply: { travel_food: 25 },
        addAction: {},
      };
    },
  },

  {
    id: 'world_tax',
    type: 'world',
    weight: 3,
    logClass: 'log-world',
    conditions: { notDead: true, baseLevel: [2, 4] },
    resolve(char, gs) {
      const taxRate = gs.settings.taxSystem ? BASE_STAGES[gs.world.baseLevel - 1].taxRate : 0;
      const taxAmount = Math.floor(char.gold * taxRate);
      return {
        logClass: 'log-world',
        text: taxAmount > 0
          ? `[세금] 거점의 세금 징수관이 세금 ${taxAmount}G를 걷어갔다.`
          : `[세금] 거점 세금 납부일이지만 면제를 받았다.`,
        effects: fx({ gold: -taxAmount }),
        addAction: {},
      };
    },
  },

  // ────────────────────────────────────────
  // DAILY LIFE EVENTS (no class required)
  // ────────────────────────────────────────
  {
    id: 'daily_shopping',
    type: 'daily',
    weight: 8,
    logClass: 'log-system',
    conditions: { notDead: true, minGold: 20 },
    resolve(char, gs) {
      const cost = randInt(10, 30);
      const items = ['식량을 구입했다','소모품을 보충했다','새 장갑을 샀다','방어구를 수리했다'];
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 시장에서 ${pick(items)}. (-${cost}G)`,
        effects: fx({ gold: -cost, fatigue: 3 }),
        supply: { travel_food: -3 },
        addAction: {},
      };
    },
  },

  {
    id: 'daily_training',
    type: 'daily',
    weight: 7,
    logClass: 'log-system',
    conditions: { notDead: true, maxFatigue: 60, noClass: true },
    resolve(char, gs) {
      const domains = [
        { key: 'str', label: '검술 훈련을 했다', action: 'combat' },
        { key: 'int', label: '마법서를 공부했다', action: 'magic' },
        { key: 'agi', label: '몸의 유연성을 단련했다', action: 'stealth' },
        { key: 'fai', label: '기도와 묵상에 몰두했다', action: 'faith' },
        { key: 'cha', label: '마을 사람들과 대화하며 사교술을 닦았다', action: 'social' },
        { key: 'end', label: '야외에서 체력 훈련을 했다', action: 'survival' },
      ];
      const d = pick(domains);
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) ${d.label}. 꾸준한 노력이 성장을 만든다. (EXP +8)`,
        effects: fx({ exp: 8, fatigue: 10 }),
        statGrow: { [d.key]: 0.05 },
        addAction: { [d.action]: 1 },
      };
    },
  },

  {
    id: 'daily_inn',
    type: 'daily',
    weight: 7,
    logClass: 'log-system',
    conditions: { notDead: true, minGold: 15 },
    resolve(char, gs) {
      const cost = randInt(10, 20);
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 여관에서 하룻밤을 보냈다. (-${cost}G, 피로 -20, HP +10)`,
        effects: fx({ gold: -cost, fatigue: -20, hp: 10 }),
        addAction: {},
      };
    },
  },

  {
    id: 'daily_hardship',
    type: 'daily',
    weight: 5,
    logClass: 'log-system',
    conditions: { notDead: true, maxGold: 30 },
    resolve(char, gs) {
      const struggles = [
        '며칠째 끼니를 굶었다.',
        '빚쟁이를 피해 거리를 전전했다.',
        '비를 맞으며 길바닥에서 잤다.',
      ];
      return {
        logClass: 'log-system',
        text: `${char.name}이(가) 궁핍한 나날을 보냈다. ${pick(struggles)} (HP -5, Sanity -5)`,
        effects: fx({ hp: -5, sanity: -5, exp: 3 }),
        addAction: {},
      };
    },
  },

  {
    id: 'daily_miracle',
    type: 'daily',
    weight: 2,
    logClass: 'log-system',
    conditions: { notDead: true },
    resolve(char, gs) {
      const miracles = [
        `시장에서 지갑을 발견했다. 안에는 금화 ${randInt(50,200)}G가 들어 있었다!`,
        `길가에서 반짝이는 마법 결정 하나를 주웠다. 작은 행운이 찾아왔다!`,
        `오래된 낡은 상자를 열었더니 고대 동전 다발이 가득 들어 있었다!`,
      ];
      const goldGain = randInt(30, 150);
      return {
        logClass: 'log-system',
        text: `[행운] ${char.name}에게 작은 기적이 일어났다! ${pick(miracles)}`,
        effects: fx({ gold: goldGain, sanity: 10, exp: 5 }),
        addAction: {},
      };
    },
  },

  // ─── RESOURCE GATHERING ─────────────────
  {
    id: 'gather_wood',
    type: 'survival',
    weight: 8,
    logClass: 'log-survival',
    conditions: {},
    resolve(char, gs) {
      const amt = randInt(5, 15);
      return {
        text: `${char.name}이(가) 숲에서 목재 ${amt}개를 채집해 거점으로 가져왔다.`,
        effects: fx({ fatigue: 8 }),
        baseResource: { wood: amt },
        addAction: { survival: 1 },
      };
    },
  },
  {
    id: 'gather_iron',
    type: 'survival',
    weight: 5,
    logClass: 'log-survival',
    conditions: { minStats: { str: 3 } },
    resolve(char, gs) {
      const amt = randInt(3, 10);
      return {
        text: `${char.name}이(가) 광산에서 철광석 ${amt}개를 캐내 거점에 보관했다.`,
        effects: fx({ fatigue: 12, hp: -3 }),
        baseResource: { iron_ore: amt },
        addAction: { survival: 1 },
        statGrow: { str: 0.1 },
      };
    },
  },
  {
    id: 'gather_crystal',
    type: 'magic',
    weight: 3,
    logClass: 'log-survival',
    conditions: { minStats: { int: 3 } },
    resolve(char, gs) {
      const amt = randInt(1, 4);
      return {
        text: `${char.name}이(가) 마력이 응집된 동굴에서 마법 결정 ${amt}개를 발견해 확보했다.`,
        effects: fx({ mp: -5, fatigue: 10 }),
        baseResource: { magic_crystal: amt },
        addAction: { magic: 1 },
        statGrow: { int: 0.1 },
      };
    },
  },

  // ─── RETIREMENT ─────────────────────────
  {
    id: 'retirement',
    type: 'life',
    weight: 1,
    logClass: 'log-class',
    conditions: { minGold: 500, minExp: 500 },
    resolve(char, gs) {
      char.isRetired = true;
      return {
        text: `${char.name}이(가) 오랜 모험 끝에 은퇴를 선언했다. 조용하고 평화로운 여생이 시작됐다.`,
        effects: fx({ sanity: 30, fatigue: -50 }),
      };
    },
  },

  // ────────────────────────────────────────
  // RELATIONSHIP EVENTS (pair events)
  // These are called with two characters
  // ────────────────────────────────────────
  // These are handled separately as interactionEvents
];

// ─── INTERACTION EVENTS (between 2 chars) ─
const INTERACTION_EVENTS = [
  {
    id: 'interact_help',
    weight: 10,
    resolve(a, b, gs) {
      const afDelta = randInt(5, 15);
      return {
        logClass: 'log-social',
        text: `${a.name}이(가) ${b.name}을(를) 도왔다. 두 사람의 유대가 깊어졌다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_spar',
    weight: 7,
    resolve(a, b, gs) {
      const afDelta = randInt(-3, 10);
      return {
        logClass: 'log-social',
        text: `${a.name}과(와) ${b.name}이(가) 훈련 중 스파링을 했다. ${afDelta >= 0 ? '서로를 인정하게 됐다.' : '약간의 갈등이 생겼다.'}`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_trade',
    weight: 2, // 6 → 2, 빈도 대폭 감소
    // a가 여유 있고 b가 실제로 금화가 부족할 때만 발동
    condition: (a, b) => a.gold >= 120 && b.gold < 50,
    resolve(a, b, gs) {
      const goldAmount = randInt(10, 40);
      const afDelta = randInt(5, 12);
      return {
        logClass: 'log-economy',
        text: `${a.name}이(가) 금화가 부족한 ${b.name}에게 ${goldAmount}G를 빌려줬다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
        goldTransfer: goldAmount,
      };
    },
  },
  {
    id: 'interact_conflict',
    weight: 4,
    resolve(a, b, gs) {
      const afDelta = -randInt(5, 20);
      const reasons = ['의견 충돌로','생활 방식 차이로','사소한 오해로','금전 문제로'];
      return {
        logClass: 'log-social',
        text: `${a.name}과(와) ${b.name}이(가) ${pick(reasons)} 다퉜다. 사이가 소원해졌다. (호감도 ${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_secret',
    weight: 5,
    resolve(a, b, gs) {
      const afDelta = randInt(10, 20);
      return {
        logClass: 'log-social',
        text: `${a.name}이(가) ${b.name}에게 마음속 깊은 비밀을 털어놓았다. 두 사람의 신뢰가 크게 깊어졌다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_romance',
    weight: 3,
    romanceOnly: true,
    resolve(a, b, gs) {
      const afDelta = randInt(8, 18);
      const moments = ['달빛 아래 함께 걸으며 시간을 보냈다','서로의 꿈을 이야기하며 밤을 보냈다','위기의 순간 서로를 지켜줬다'];
      return {
        logClass: 'log-relation',
        text: `${a.name}과(와) ${b.name}이(가) ${pick(moments)}. 마음이 더욱 가까워졌다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_party_form',
    weight: 5,
    partyFormCheck: true,
    resolve(a, b, gs) {
      return {
        logClass: 'log-party',
        text: `${a.name}과(와) ${b.name}이(가) 파티를 결성했다! 함께라면 더 강해질 수 있다.`,
        affectionDelta: 5,
        formParty: true,
      };
    },
  },
];

// ── Class promotion check ─────────────────
function checkClassPromotion(char) {
  if (char.class) return null;
  for (const [classId, classDef] of Object.entries(CLASSES)) {
    const cond = classDef.conditions;
    let passed = true;

    if (cond.minStats) {
      for (const [stat, min] of Object.entries(cond.minStats)) {
        if ((char.stats[stat] || 0) < min) { passed = false; break; }
      }
    }
    if (!passed) continue;

    if (cond.alignment && char.alignment !== cond.alignment) continue;

    if (cond.minActions) {
      for (const [act, min] of Object.entries(cond.minActions)) {
        if ((char.actionCounts[act] || 0) < min) { passed = false; break; }
      }
    }
    if (!passed) continue;

    if (classId === 'paladin' && !char.visitedShrine) continue;

    return classId;
  }
  return null;
}

// ── CHA bonus calculation ─────────────────
function computeChaBonus(char) {
  if (!char) return 0;
  const hasDisabled = char.statusEffects.includes('confusion') || char.statusEffects.includes('madness');
  if (hasDisabled) return 0;
  const classMult = char.class === 'merchant' ? 2.0 : 1.0;
  return (char.stats.cha / 10) * 0.15 * classMult;
}

// ── Pick a random event for a character ──
function pickEvent(char, gs) {
  const eligible = EVENT_POOL.filter(ev => {
    const c = ev.conditions || {};
    if (c.notDead && char.isDead) return false;
    if (c.minFatigue !== undefined && char.fatigue < c.minFatigue) return false;
    if (c.maxFatigue !== undefined && char.fatigue > c.maxFatigue) return false;
    if (c.minSanity !== undefined && char.sanity < c.minSanity) return false;
    if (c.maxSanity !== undefined && char.sanity > c.maxSanity) return false;
    if (c.minGold !== undefined && char.gold < c.minGold) return false;
    if (c.maxGold !== undefined && char.gold > c.maxGold) return false;
    if (c.minExp !== undefined && char.exp < c.minExp) return false;
    if (c.minStats) {
      for (const [s, v] of Object.entries(c.minStats)) {
        if ((char.stats[s] || 0) < v) return false;
      }
    }
    if (c.class && !c.class.includes(char.class)) return false;
    if (c.noClass && char.class) return false;
    if (c.alignment && !c.alignment.includes(char.alignment)) return false;
    if (c.hasStatus && !char.statusEffects.includes(c.hasStatus)) return false;
    if (c.worldThreat) {
      const [mn, mx] = c.worldThreat;
      if (gs.world.threatLevel < mn || gs.world.threatLevel > mx) return false;
    }
    if (c.baseLevel) {
      const [mn, mx] = c.baseLevel;
      if (gs.world.baseLevel < mn || gs.world.baseLevel > mx) return false;
    }
    if (c.blackMarketRequired && !gs.settings.blackMarket) return false;
    return true;
  });

  if (!eligible.length) return EVENT_POOL.find(e => e.id === 'explore_gather');

  // HP 25% 미만이면 위험 이벤트 제외 → 휴식/안전 이벤트만
  if (char.hp < char.maxHp * 0.25) {
    const safeEvents = eligible.filter(e => e.type === 'rest' || e.id === 'explore_gather' || e.id === 'explore_gather');
    if (safeEvents.length > 0) {
      // 중독 상태면 치유 휴식 우선
      if (char.statusEffects.includes('poison')) {
        const healRest = safeEvents.find(e => e.id === 'rest_heal_poison');
        if (healRest) return healRest;
      }
      return safeEvents[Math.floor(Math.random() * safeEvents.length)];
    }
  }

  // weighted random
  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ev of eligible) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return eligible[eligible.length - 1];
}
