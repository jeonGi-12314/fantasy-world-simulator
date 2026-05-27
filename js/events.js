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

// ── Event success roll — 장비·스킬 레벨 보너스 포함 ──
function roll(char, statKey) {
  const base = char.stats[statKey] || 0;
  const equip = char._equipBonuses?.[statKey] || 0;

  // Skill level bonus: class primary action must match roll stat's action type
  // e.g. warrior (combat) gets bonus on STR rolls; mage (magic) on INT rolls
  let skillBonus = 0;
  if (char.class && char.skillLevels && Object.keys(char.skillLevels).length > 0) {
    const classAction = SKILL_ACTION_MAP[char.class];
    const rollAction  = STAT_ACTION_MAP[statKey];
    if (classAction && classAction === rollAction) {
      const levels = Object.values(char.skillLevels);
      const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
      skillBonus = Math.floor((avgLevel - 1) * 2); // +2 per average skill level above 1
    }
  }

  // MP bonus/penalty for magic-class stats (INT, FAI)
  let mpBonus = 0;
  if (char.class && CLASSES[char.class]?.mpActive && (statKey === 'int' || statKey === 'fai')) {
    const mpPct = (char.mp || 0) / Math.max(1, char.maxMp || 1);
    if (mpPct >= 0.7)      mpBonus = 12;   // 70%+ MP → 보너스
    else if (mpPct >= 0.3) mpBonus = 0;    // 30-70% → 중립
    else                   mpBonus = -18;  // 30% 미만 → 패널티 (마력 고갈)
  }

  const statVal = base + equip + skillBonus + mpBonus;
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
        text: `${char.name}이(가) 오랜 모험 끝에 잠시 쉬기로 했다. ${pick(tiredness)}. (피로 -25, 이성 +4)`,
        effects: fx({ fatigue: -25, sanity: 4, exp: 3 }),
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
        text: `${char.name}이(가) 탐험 중 길을 잃고 말았다. 이틀을 헤맨 끝에 간신히 돌아왔다. (피로 +20, 이성 -5)`,
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
        text: `${char.name}이(가) 가난한 이들에게 ${donate}G를 기부했다. 사람들의 감사가 마음을 따뜻하게 했다. (이성 +5)`,
        effects: fx({ gold: -donate, sanity: 5, exp: 8 }),
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
          : `${char.name}이(가) 밤새 마법 연구를 했지만 실패했다. (피로 +15, 이성 -5)`,
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
          ? `${char.name}이(가) 새벽 기도를 드리고 신성한 축복을 받았다. 오늘 하루 모든 판정에 가호가 깃든 느낌이다. (이성 +8, EXP +10)`
          : `${char.name}이(가) 기도를 올렸지만 신의 응답이 없었다. (이성 -5)`,
        effects: fx({ sanity: success ? 8 : -5, exp: success ? 10 : 0, hp: success ? 10 : 0 }),
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
          ? `${char.name}이(가) 달빛 아래 금지된 의식을 치렀다. 죽음의 기운이 주변에 서렸다. (EXP +20, 이성 -10)`
          : `${char.name}이(가) 의식 중 역술사의 저항을 받아 실패했다. (HP -${randInt(10,20)}, 이성 -15)`,
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
        effects: fx({ hp: 20, sanity: 8, fatigue: -15 }),
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
      const sanityGain = randInt(4, 8);
      const activities = ['맥주를 마시며 여행자들과 담소했다','카드 게임에서 이겼다','흥미로운 소문을 들었다','음유시인의 노래를 감상했다'];
      return {
        logClass: 'log-social',
        text: `${char.name}이(가) 선술집에 들렀다. ${pick(activities)}. (${cost}G 지출, 이성 +${sanityGain})`,
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
        { t: '길 잃은 아이를 집으로 데려다줬다. 아이의 부모가 감사의 표시로 금화를 건넸다.', gold: randInt(10,30), sanity: 5 },
        { t: '무거운 짐을 나르는 노인을 도왔다. 노인이 고맙다며 오래된 약초를 줬다.', gold: 0, sanity: 4 },
        { t: '다친 여행자를 치료해줬다. 여행자가 고마워하며 유용한 정보를 알려줬다.', gold: 0, sanity: 6, exp: 8 },
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
          ? `${char.name}이(가) 시장에서 상인과 분쟁이 생겼다. 뛰어난 말솜씨로 상황을 정리했다. (이성 +5)`
          : `${char.name}이(가) 시장에서 상인과 언쟁을 벌였다. 결국 손해를 보고 물러났다. (이성 -8, Gold -${randInt(5,20)})`,
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
        text: `${char.name}이(가) 노련한 선배 모험가에게서 ${subject}에 대한 조언을 들었다. 많은 것을 배웠다. (EXP +15, 이성 +4)`,
        effects: fx({ exp: 15, sanity: 4, fatigue: 5 }),
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
        effects: fx({ sanity: 5 }),
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
    conditions: { notDead: true, max이성: 50 },
    resolve(char, gs) {
      return {
        logClass: 'log-status',
        text: `${char.name}이(가) 심신이 지쳐가는 것을 느끼고 며칠 휴양을 취했다. 정신이 한결 안정됐다. (이성 +10, 피로 -15)`,
        effects: fx({ sanity: 10, fatigue: -15, gold: -randInt(15,25) }),
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
          text: `${char.name}이(가) 두려움을 이겨냈다! 강인한 의지로 공포를 극복했다. [공포 해제] (이성 +10)`,
          effects: fx({ sanity: 10 }),
          removeStatus: 'fear',
          addAction: {},
        };
      }
      return {
        logClass: 'log-status',
        text: `${char.name}은(는) 아직 두려움에서 벗어나지 못했다. (이성 -5)`,
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
        supply: { weapon_dark: -5, armor_plate: -5 },
        demand: { weapon_dark: 15, armor_plate: 15 },
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
        effects: fx({ sanity: 3 }),
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
        text: `[세계 이벤트] 왕국 수확제가 열렸다! 마을 곳곳에 축제 분위기가 넘쳤다. 시장 거래가 활발해졌다. (이성 +5)`,
        effects: fx({ sanity: 5, gold: randInt(10, 30) }),
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
        text: `${char.name}이(가) 궁핍한 나날을 보냈다. ${pick(struggles)} (HP -5, 이성 -5)`,
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
        effects: fx({ gold: goldGain, sanity: 5, exp: 5 }),
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
    weight: 6,
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

  // ─── 전직 사전 경험 이벤트 (클래스 없이도 전문 경험치 축적 가능) ───

  // ① 야간 정찰 — 도적 전직 경로 (stealth 경험)
  {
    id: 'night_recon',
    type: 'exploration',
    weight: 5,
    logClass: 'log-system',
    conditions: { notDead: true, minStats: { agi: 4 }, maxFatigue: 75 },
    resolve(char, gs) {
      const success = roll(char, 'agi') >= 45;
      const goldGain = success ? randInt(20, 60) : 0;
      return {
        logClass: 'log-system',
        text: success
          ? `${char.name}이(가) 야간에 적 진영을 정찰해 ${goldGain}G 상당의 정보를 수집했다. (EXP +12)`
          : `${char.name}이(가) 야간 정찰을 시도했으나 경비에게 들켜 빈손으로 돌아왔다. (피로 +8)`,
        effects: fx({ gold: goldGain, exp: success ? 12 : 3, fatigue: success ? 6 : 8 }),
        addAction: { stealth: 1 },
      };
    },
  },

  // ② 행상인 거래 — 상인 전직 경로 (trade 경험)
  {
    id: 'peddler_trade',
    type: 'economy',
    weight: 5,
    logClass: 'log-economy',
    conditions: { notDead: true, minStats: { cha: 3 }, minGold: 30 },
    resolve(char, gs) {
      const success = roll(char, 'cha') >= 40;
      const goldGain = success ? randInt(15, 50) : -randInt(5, 20);
      return {
        logClass: 'log-economy',
        text: success
          ? `${char.name}이(가) 행상인에게서 물건을 사서 더 비싸게 팔았다. +${goldGain}G 이익. (EXP +8)`
          : `${char.name}이(가) 물건 거래를 시도했으나 손해를 봤다. (${goldGain}G)`,
        effects: fx({ gold: goldGain, exp: success ? 8 : 3, fatigue: 4 }),
        addAction: { trade: 1 },
      };
    },
  },

  // ③ 마력 감지 훈련 — 마법사 전직 경로 (magic 경험, weight 상향)
  {
    id: 'mana_sense_train',
    type: 'magic',
    weight: 5,
    logClass: 'log-system',
    conditions: { notDead: true, minStats: { int: 3 }, maxFatigue: 80 },
    resolve(char, gs) {
      const success = roll(char, 'int') >= 40;
      return {
        logClass: 'log-system',
        text: success
          ? `${char.name}이(가) 마력의 흐름을 감지하는 훈련을 했다. 마나 감각이 예민해졌다. (EXP +10, INT +0.1)`
          : `${char.name}이(가) 마력 훈련을 했지만 집중에 실패했다. 피로만 쌓였다. (피로 +10)`,
        effects: fx({ exp: success ? 10 : 2, fatigue: success ? 5 : 10 }),
        addAction: { magic: 1 },
        statGrow: success ? { int: 0.1 } : null,
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
  // CLASS-SPECIFIC SPECIAL EVENTS (~12)
  // conditions.class filters to those classes only
  // ────────────────────────────────────────

  // ── 전사: 토너먼트 참가 ───────────────────
  {
    id: 'warrior_tournament',
    type: 'combat',
    weight: 4,
    conditions: { notDead: true, class: ['warrior','knight'] },
    resolve(char, gs) {
      const win = roll(char, 'str') >= 60;
      if (win) {
        const prize = randInt(100, 250);
        char.gold += prize;
        char.actionCounts.combat = (char.actionCounts.combat||0) + 3;
        return { logClass: 'log-class', text: `🏆 ${char.name}이(가) 지역 무술 토너먼트에서 우승했다! 상금 ${prize}G와 명성을 얻었다.`, effects: { exp: 15 } };
      } else {
        char.hp = Math.max(1, char.hp - randInt(10, 20));
        return { logClass: 'log-class', text: `🥊 ${char.name}이(가) 토너먼트에 참가했지만 결승에서 탈락했다. 좋은 경험이 됐다. (HP -10~20)`, effects: { exp: 8 } };
      }
    },
  },

  // ── 마법사: 마법 실험 ────────────────────
  {
    id: 'mage_experiment',
    type: 'magic',
    weight: 4,
    conditions: { notDead: true, class: ['mage','sage','necromancer'] },
    resolve(char, gs) {
      const success = roll(char, 'int') >= 55;
      if (success) {
        const bonus = pick(['str','int','fai','agi','cha','end']);
        char.stats[bonus] = Math.min(10, (char.stats[bonus]||0) + 1);
        return { logClass: 'log-class', text: `🔬 ${char.name}이(가) 새 마법 이론을 실험했다. 예상치 못한 결과로 ${STAT_DEF[bonus].name} 스탯이 강화됐다!`, effects: { exp: 20 } };
      } else {
        const dmg = randInt(5, 20);
        char.hp = Math.max(1, char.hp - dmg);
        char.sanity = Math.max(0, char.sanity - 5);
        return { logClass: 'log-class', text: `💥 ${char.name}의 마법 실험이 폭주했다! 심각한 역류가 발생했다. (HP -${dmg}, 이성 -5)` };
      }
    },
  },

  // ── 성직자: 기적의 치유 ──────────────────
  {
    id: 'cleric_miracle',
    type: 'faith',
    weight: 4,
    conditions: { notDead: true, class: ['cleric','paladin'] },
    resolve(char, gs) {
      const blessed = roll(char, 'fai') >= 55;
      if (blessed) {
        // Heal all other chars slightly
        const healed = gs.characters.filter(c => !c.isDead && c.id !== char.id);
        healed.forEach(c => { c.hp = Math.min(c.maxHp, c.hp + 15); c.sanity = Math.min(100, c.sanity + 4); });
        return { logClass: 'log-class', text: `✨ ${char.name}이(가) 신에게 기도하여 기적을 일으켰다! 길드원 전원이 치유됐다. (HP +15, 이성 +4)`, effects: { exp: 15 } };
      } else {
        char.hp = Math.min(char.maxHp, char.hp + 20);
        return { logClass: 'log-class', text: `🙏 ${char.name}이(가) 신성한 의식을 올렸다. 조용한 은혜를 받았다. (HP +20)`, effects: { exp: 5 } };
      }
    },
  },

  // ── 도적: 뒷골목 작전 ───────────────────
  {
    id: 'rogue_heist',
    type: 'stealth',
    weight: 4,
    conditions: { notDead: true, class: ['rogue'] },
    resolve(char, gs) {
      const success = roll(char, 'agi') >= 55;
      if (success) {
        const loot = randInt(80, 200);
        char.gold += loot;
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 2);
        return { logClass: 'log-class', text: `🗡 ${char.name}이(가) 뒷골목에서 비밀 작전을 수행했다. ${loot}G를 손에 넣었다. (위협도 +2)`, effects: { exp: 12 } };
      } else {
        char.hp = Math.max(1, char.hp - randInt(8, 18));
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 4);
        return { logClass: 'log-class', text: `⚠ ${char.name}이(가) 뒷골목 작전 중 경비대에게 발각됐다! 겨우 도망쳤다. (HP 손실, 위협도 +4)` };
      }
    },
  },

  // ── 바드: 감동 공연 ──────────────────────
  {
    id: 'bard_performance',
    type: 'social',
    weight: 4,
    conditions: { notDead: true, class: ['bard'] },
    resolve(char, gs) {
      const applause = roll(char, 'cha') >= 50;
      if (applause) {
        const tips = randInt(50, 150);
        char.gold += tips;
        // Boost affection with everyone in guild
        gs.characters.filter(c => !c.isDead && c.id !== char.id).forEach(c => {
          updateAffection(char, c, 1, gs);   // +5 → +1, 쌍방 적용
        });
        return { logClass: 'log-class', text: `🎵 ${char.name}의 공연이 마을 광장을 가득 채웠다! 팁 ${tips}G를 받았고 길드원들의 기분이 좋아졌다. (호감도 +1)`, effects: { exp: 10 } };
      } else {
        char.gold += randInt(10, 30);
        return { logClass: 'log-class', text: `🎵 ${char.name}이(가) 작은 주점에서 공연했다. 박수는 없었지만 약간의 수입이 생겼다.`, effects: { exp: 4 } };
      }
    },
  },

  // ── 레인저: 희귀 야수 포획 ───────────────
  {
    id: 'ranger_beast_hunt',
    type: 'survival',
    weight: 4,
    conditions: { notDead: true, class: ['ranger','druid'] },
    resolve(char, gs) {
      const found = roll(char, 'agi') >= 52;
      if (found) {
        const reward = randInt(60, 150);
        char.gold += reward;
        gs.world.baseResources.monster_material = (gs.world.baseResources.monster_material||0) + 15;
        return { logClass: 'log-class', text: `🏹 ${char.name}이(가) 희귀 야수를 추적해 포획했다! 소재 +15, ${reward}G의 현상금을 받았다.`, effects: { exp: 15 } };
      } else {
        char.fatigue = Math.min(100, char.fatigue + 20);
        return { logClass: 'log-class', text: `🏹 ${char.name}이(가) 야수를 종일 추적했지만 놓쳤다. 극도로 지쳐 귀환했다. (피로 +20)`, effects: { exp: 5 } };
      }
    },
  },

  // ── 상인: 대규모 거래 ───────────────────
  {
    id: 'merchant_big_deal',
    type: 'trade',
    weight: 4,
    conditions: { notDead: true, class: ['merchant'] },
    resolve(char, gs) {
      const chaRoll = roll(char, 'cha');
      if (chaRoll >= 60) {
        const profit = randInt(150, 400);
        char.gold += profit;
        gs.world.totalGoldCirculated = (gs.world.totalGoldCirculated||0) + profit;
        return { logClass: 'log-class', text: `💰 ${char.name}이(가) 원거리 상단과 대규모 계약을 체결했다! ${profit}G의 순이익을 올렸다.`, effects: { exp: 18 } };
      } else if (chaRoll >= 40) {
        const profit = randInt(40, 120);
        char.gold += profit;
        return { logClass: 'log-class', text: `📦 ${char.name}이(가) 중간 규모의 거래를 성사시켰다. ${profit}G를 벌었다.`, effects: { exp: 8 } };
      } else {
        const loss = randInt(20, 80);
        char.gold = Math.max(0, char.gold - loss);
        return { logClass: 'log-class', text: `📉 ${char.name}의 거래가 협상 실패로 손해를 봤다. (-${loss}G)` };
      }
    },
  },

  // ── 세이지: 고대 지식 발굴 ──────────────
  {
    id: 'sage_discovery',
    type: 'magic',
    weight: 4,
    conditions: { notDead: true, class: ['sage'] },
    resolve(char, gs) {
      const insight = roll(char, 'int') >= 55;
      if (insight) {
        // All chars get EXP from knowledge
        gs.characters.filter(c => !c.isDead).forEach(c => { c.exp = (c.exp||0) + 8; });
        return { logClass: 'log-class', text: `📚 ${char.name}이(가) 고대 서고에서 잊혀진 지식을 발굴했다! 길드원 모두가 혜택을 받았다. (전원 EXP +8)`, effects: { exp: 20 } };
      } else {
        return { logClass: 'log-class', text: `📚 ${char.name}이(가) 며칠째 서고에서 연구 중이다. 아직 뚜렷한 성과는 없지만 지식이 쌓인다.`, effects: { exp: 10 } };
      }
    },
  },

  // ── 드루이드: 자연의 의식 ───────────────
  {
    id: 'druid_ritual',
    type: 'survival',
    weight: 4,
    conditions: { notDead: true, class: ['druid'] },
    resolve(char, gs) {
      const attuned = roll(char, 'fai') >= 50;
      if (attuned) {
        char.hp = char.maxHp;
        char.fatigue = Math.max(0, char.fatigue - 40);
        char.sanity = Math.min(100, char.sanity + 8);
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 2);
        return { logClass: 'log-class', text: `🌿 ${char.name}이(가) 숲 속 성지에서 자연의 의식을 수행했다. 자연과 하나가 되며 완전히 회복됐다. (HP 전회복, 위협도 -2)`, effects: { exp: 12 } };
      } else {
        char.hp = Math.min(char.maxHp, char.hp + 25);
        return { logClass: 'log-class', text: `🌿 ${char.name}이(가) 새벽 숲에서 명상했다. 마음이 차분해졌다. (HP +25)`, effects: { exp: 6 } };
      }
    },
  },

  // ── 성기사: 신성한 결투 선언 ────────────
  {
    id: 'paladin_divine_duel',
    type: 'combat',
    weight: 4,
    conditions: { notDead: true, class: ['paladin'] },
    resolve(char, gs) {
      const blessed = roll(char, 'str') >= 55 && roll(char, 'fai') >= 50;
      if (blessed) {
        gs.world.threatLevel = Math.max(0, gs.world.threatLevel - 5);
        char.hp = Math.min(char.maxHp, char.hp + 20);
        return { logClass: 'log-class', text: `⚔✨ ${char.name}이(가) 신의 이름으로 악의 수장에게 결투를 선언했다! 신성한 승리를 거뒀다. (위협도 -5, HP +20)`, effects: { exp: 25 } };
      } else {
        char.hp = Math.max(1, char.hp - randInt(10, 25));
        return { logClass: 'log-class', text: `⚔ ${char.name}이(가) 악의 세력과 치열하게 싸웠다. 상처를 입었지만 신념은 흔들리지 않았다. (HP 손실)`, effects: { exp: 12 } };
      }
    },
  },

  // ── 네크로맨서: 금지된 의식 ────────────
  {
    id: 'necromancer_dark_ritual',
    type: 'magic',
    weight: 4,
    conditions: { notDead: true, class: ['necromancer'] },
    resolve(char, gs) {
      const controlled = roll(char, 'int') >= 58;
      if (controlled) {
        char.stats.int = Math.min(10, (char.stats.int||0) + 1);
        char.sanity = Math.max(0, char.sanity - 10);
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 3);
        return { logClass: 'log-class', text: `💀 ${char.name}이(가) 금지된 의식을 성공시켰다. 강력한 힘을 얻었지만 이성이 흔들린다. (INT +1, 이성 -10, 위협도 +3)`, effects: { exp: 20 } };
      } else {
        char.hp = Math.max(1, char.hp - randInt(15, 35));
        char.sanity = Math.max(0, char.sanity - 15);
        gs.world.threatLevel = Math.min(100, gs.world.threatLevel + 5);
        return { logClass: 'log-class', text: `☠ ${char.name}의 의식이 통제를 벗어났다! 언데드가 폭주해 심각한 피해를 입었다. (HP 대손실, 이성 -15, 위협도 +5)` };
      }
    },
  },

  // ── 기사: 귀족 결투 ─────────────────────
  {
    id: 'knight_noble_duel',
    type: 'combat',
    weight: 4,
    conditions: { notDead: true, class: ['knight'] },
    resolve(char, gs) {
      const honorWin = roll(char, 'str') >= 60;
      if (honorWin) {
        const bounty = randInt(100, 200);
        char.gold += bounty;
        char.stats.cha = Math.min(10, (char.stats.cha||0) + 1);
        return { logClass: 'log-class', text: `🛡 ${char.name}이(가) 귀족의 결투 신청을 받아들여 명예롭게 승리했다! 상금 ${bounty}G와 사회적 명성을 얻었다. (CHA +1)`, effects: { exp: 18 } };
      } else {
        char.hp = Math.max(1, char.hp - randInt(10, 20));
        char.gold = Math.max(0, char.gold - randInt(30, 80));
        return { logClass: 'log-class', text: `🛡 ${char.name}이(가) 결투에서 패배했다. 명예와 약간의 금화를 잃었다. (HP 손실, 골드 감소)`, effects: { exp: 8 } };
      }
    },
  },

  // ────────────────────────────────────────
  // 6-2: CLASS-SPECIFIC BLACK MARKET EVENTS
  // ────────────────────────────────────────
  {
    id: 'rogue_poison_craft',
    type: 'class',
    weight: 4,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['rogue'], blackMarketRequired: true },
    resolve(char, gs) {
      const r = roll(char, 'agi');
      if (r >= 55) {
        char.inventory = char.inventory || [];
        char.inventory.push({ id: 'antidote', name: '해독제', icon: '🧪', cat: 'consumable', qty: 2 });
        return { logClass: 'log-class', text: `[암시장] ${char.name}이(가) 독 제조 기술로 해독제를 만들어 암거래했다. 재고 2개 확보.`, effects: fx({ exp: 15, gold: 40 }), supply: { antidote: 3 }, addAction: { stealth: 1 } };
      } else {
        return { logClass: 'log-class', text: `[암시장] ${char.name}이(가) 독 제조에 실패해 손가락을 다쳤다. (HP -8)`, effects: fx({ hp: -8, exp: 5 }) };
      }
    },
  },
  {
    id: 'rogue_merchant_steal',
    type: 'class',
    weight: 3,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['rogue'], blackMarketRequired: true },
    resolve(char, gs) {
      const r = roll(char, 'agi');
      if (r >= 60) {
        const loot = randInt(60, 150);
        return { logClass: 'log-class', text: `[암시장] ${char.name}이(가) 상인 수레에서 ${loot}G 상당의 물건을 빼돌렸다. 아무도 눈치채지 못했다.`, effects: fx({ gold: loot, exp: 12 }), supply: { monster_material: 5 }, worldThreatDelta: 1, addAction: { stealth: 1 } };
      } else {
        const penalty = randInt(20, 60);
        return { logClass: 'log-class', text: `[암시장] ${char.name}이(가) 절도에 실패해 물건을 모두 내놔야 했다. (-${penalty}G, 이성 -5)`, effects: fx({ gold: -penalty, san: -5, exp: 5 }) };
      }
    },
  },
  {
    id: 'necromancer_soul_harvest',
    type: 'class',
    weight: 4,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['necromancer'], blackMarketRequired: true },
    resolve(char, gs) {
      char.inventory = char.inventory || [];
      char.inventory.push({ id: 'forbidden_material', name: '봉인된 마력 결정', icon: '🔮', cat: 'loot', qty: 1 });
      return {
        logClass: 'log-class',
        text: `[금제 의식] ${char.name}이(가) 전장의 잔해에서 봉인된 마력 결정을 수확했다. 이성이 갉아먹혔다.`,
        effects: fx({ san: -8, exp: 20 }),
        supply: { forbidden_material: 2 },
        addAction: { magic: 1 },
        worldThreatDelta: 3,
      };
    },
  },
  {
    id: 'necromancer_forbidden_rite',
    type: 'class',
    weight: 3,
    logClass: 'log-class',
    conditions: { notDead: true, class: ['necromancer'], sanity: [0, 70] },
    resolve(char, gs) {
      const r = roll(char, 'int');
      if (r >= 60) {
        const mpBonus = 20;
        char.mp = Math.min(char.maxMp || 100, (char.mp || 0) + mpBonus);
        return { logClass: 'log-class', text: `[금제 의식] ${char.name}이(가) 금지된 의식을 치러 어둠의 마력을 흡수했다. (MP +${mpBonus}, 이성 -10)`, effects: fx({ san: -10, exp: 25 }), addAction: { magic: 2 } };
      } else {
        return { logClass: 'log-class', text: `[금제 의식] ${char.name}이(가) 통제 실패로 역반사를 받았다. (HP -15, 이성 -15)`, effects: fx({ hp: -15, san: -15, exp: 8 }) };
      }
    },
  },

  // ────────────────────────────────────────
  // 6-3: EVENTS YIELDING RARE/ARTIFACT/FORBIDDEN MATERIALS
  // ────────────────────────────────────────
  {
    id: 'rare_material_find',
    type: 'adventure',
    weight: 3,
    logClass: 'log-special',
    conditions: { notDead: true, baseLevel: [2, 4] },
    resolve(char, gs) {
      const options = [
        { id: 'magic_crystal', name: '마법 결정', icon: '💎', cat: 'loot' },
        { id: 'dragon_scale',  name: '드래곤 비늘', icon: '🐉', cat: 'loot' },
      ];
      const mat = options[Math.floor(Math.random() * options.length)];
      char.inventory = char.inventory || [];
      char.inventory.push({ ...mat, qty: 1 });
      return {
        logClass: 'log-special',
        text: `[희귀 발견] ${char.name}이(가) 탐험 중 ${mat.icon}${mat.name}을(를) 발견했다! 시장에서 높은 값을 받을 수 있을 것이다.`,
        effects: fx({ exp: 20, fatigue: 8 }),
      };
    },
  },
  {
    id: 'ancient_artifact_discovery',
    type: 'adventure',
    weight: 2,
    logClass: 'log-special',
    conditions: { notDead: true, baseLevel: [3, 4] },
    resolve(char, gs) {
      char.inventory = char.inventory || [];
      char.inventory.push({ id: 'ancient_artifact', name: '고대 유물', icon: '🏺', cat: 'loot', qty: 1 });
      return {
        logClass: 'log-special',
        text: `[고대 유물] ${char.name}이(가) 봉인된 유적에서 고대 유물을 발굴했다! 학술원에 팔거나 연구에 활용할 수 있다.`,
        effects: fx({ exp: 30, sanity: -5 }),
      };
    },
  },
  {
    id: 'forbidden_tome_event',
    type: 'adventure',
    weight: 2,
    logClass: 'log-special',
    conditions: { notDead: true, class: ['mage','sage','necromancer','cleric'], baseLevel: [2, 4] },
    resolve(char, gs) {
      const r = roll(char, 'int');
      if (r >= 55) {
        char.inventory = char.inventory || [];
        char.inventory.push({ id: 'forbidden_material', name: '봉인된 마력 결정', icon: '🔮', cat: 'loot', qty: 1 });
        return { logClass: 'log-special', text: `[금지된 지식] ${char.name}이(가) 금서에서 봉인된 마력을 추출했다. 지식은 힘이지만 대가가 따른다. (이성 -8)`, effects: fx({ san: -8, exp: 35 }), supply: { forbidden_material: 1 } };
      } else {
        return { logClass: 'log-special', text: `[금지된 지식] ${char.name}이(가) 금서를 읽다가 봉인이 역발동했다. 정신이 흔들렸다. (이성 -15, HP -10)`, effects: fx({ san: -15, hp: -10, exp: 10 }) };
      }
    },
  },

  // ────────────────────────────────────────
  // RELATIONSHIP EVENTS (pair events)
  // These are called with two characters
  // ────────────────────────────────────────
  // These are handled separately as interactionEvents
];

// ─── INTERACTION EVENTS (between 2 chars) ─
// ── 호감도 설계 기준 ──
// - 자연 감소: -0.6/일 (game.js processAffectionDecay)
// - 긍정 이벤트 delta 소형화 (+1~2), 부정 이벤트 명확화 (-3~10)
// - 무관심(ignore) weight 최고 → 대부분의 하루는 그냥 지나간다
// - 목표: 특정 페어가 꾸준히 help 해야 200일+ 걸려서 lover 가능
// - weighted pick은 game.js weightedPick() 으로 처리됨
const INTERACTION_EVENTS = [
  {
    id: 'interact_help',
    weight: 10,  // 빈도 증가
    resolve(a, b, gs) {
      const afDelta = randInt(4, 7);  // +4~7 (was +1~2)
      const acts = [
        `${a.name}이(가) ${b.name}의 임무를 묵묵히 도왔다`,
        `${a.name}이(가) 지친 ${b.name}을(를) 대신해 일을 처리해줬다`,
        `${a.name}이(가) ${b.name}에게 필요한 정보를 먼저 알려줬다`,
        `${a.name}이(가) ${b.name}이(가) 힘들 때 곁에 있어줬다`,
      ];
      return {
        logClass: 'log-social',
        text: `${pick(acts)}. 신뢰가 쌓였다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_spar',
    weight: 7,
    resolve(a, b, gs) {
      const afDelta = randInt(-1, 2);
      return {
        logClass: 'log-social',
        text: `${a.name}과(와) ${b.name}이(가) 훈련 중 스파링을 했다. ${afDelta >= 0 ? '서로의 실력을 인정했다.' : '지쳐서 사이가 서먹해졌다.'}${afDelta !== 0 ? ` (호감도 ${afDelta > 0 ? '+' : ''}${afDelta})` : ''}`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_trade',
    weight: 2,
    condition: (a, b) => a.gold >= 120 && b.gold < 50,
    resolve(a, b, gs) {
      const goldAmount = randInt(10, 40);
      const afDelta = randInt(3, 6);
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
    weight: 5,
    resolve(a, b, gs) {
      const afDelta = -randInt(3, 7);
      const reasons = ['의견 충돌로','생활 방식 차이로','사소한 오해로','금전 문제로','자존심 문제로','지난 일을 꺼내며','임무 방식 차이로','성격 차이로'];
      const outcomes = [
        '둘 사이가 서먹해졌다','관계에 금이 가기 시작했다','미운 감정이 쌓였다',
        '사이가 냉랭해졌다','갈등이 깊어졌다','마음이 멀어졌다',
        '서로 등을 돌렸다','불편한 침묵이 흘렀다',
      ];
      return {
        logClass: 'log-social',
        text: `${a.name}과(와) ${b.name}이(가) ${pick(reasons)} 다퉜다. ${pick(outcomes)}. (호감도 ${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_ignore',
    weight: 9,   // 16 → 9 (무관심 빈도 감소)
    resolve(a, b, gs) {
      return {
        logClass: 'log-social',
        text: `${a.name}과(와) ${b.name}이(가) 같은 공간에 있었지만 서로 말 한마디 없이 하루를 보냈다.`,
        affectionDelta: 0,  // 무관심은 패널티 없음
      };
    },
  },
  {
    id: 'interact_secret',
    weight: 2,
    resolve(a, b, gs) {
      const afDelta = randInt(6, 10);  // +6~10 (was +2~4)
      const secrets = [
        `${a.name}이(가) ${b.name}에게 마음속 깊은 비밀을 털어놓았다`,
        `${a.name}이(가) 아무에게도 말하지 않았던 과거를 ${b.name}에게 처음 이야기했다`,
        `${a.name}이(가) ${b.name}에게만 자신의 진짜 꿈을 말해줬다`,
      ];
      return {
        logClass: 'log-social',
        text: `${pick(secrets)}. 두 사람의 신뢰가 깊어졌다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_heartfelt',   // 새 이벤트: 진심 어린 대화 (호감도 > 30 이상일 때)
    weight: 3,
    condition: (a, b) => (getRelationship(a, b.id)?.affection || 0) >= 30,
    resolve(a, b, gs) {
      const afDelta = randInt(7, 13);
      const moments = [
        `${a.name}이(가) ${b.name}에게 진심 어린 고마움을 전했다`,
        `${a.name}과(와) ${b.name}이(가) 밤새 서로의 이야기를 나눴다`,
        `${a.name}이(가) ${b.name}의 고민을 들어주며 함께 답을 찾았다`,
        `${a.name}이(가) 위기 속에서 ${b.name}을(를) 믿고 등을 맡겼다`,
      ];
      return {
        logClass: 'log-relation',
        text: `${pick(moments)}. 둘의 유대가 한층 깊어졌다. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_romance',
    weight: 5,   // 3 → 5
    romanceOnly: true,
    resolve(a, b, gs) {
      const afDelta = randInt(5, 10);  // +5~10 (was +1~4)
      const moments = [
        '달빛 아래 함께 걷다 손이 닿았다','서로의 꿈을 속삭이며 밤을 보냈다',
        '위기의 순간 서로를 지켜줬다','말없이 곁에 있어 주는 것만으로 충분했다',
        '우연히 눈이 마주쳐 한참을 그 자리에 서 있었다',
      ];
      return {
        logClass: 'log-relation',
        text: `${a.name}과(와) ${b.name}이(가) ${pick(moments)}. (호감도 +${afDelta})`,
        affectionDelta: afDelta,
      };
    },
  },
  {
    id: 'interact_party_form',
    weight: 4,
    partyFormCheck: true,
    resolve(a, b, gs) {
      return {
        logClass: 'log-party',
        text: `${a.name}과(와) ${b.name}이(가) 파티를 결성했다! 함께라면 더 강해질 수 있다.`,
        affectionDelta: 3,
        formParty: true,
      };
    },
  },
];

// ── Class promotion check ─────────────────
function checkClassPromotion(char) {
  // 재전직: 이미 클래스가 있으면 더 높은 기준으로만 다른 클래스 허용
  const isReclass = !!char.class;
  const statBoost  = isReclass ? 2 : 0;   // 재전직은 최소 스탯 +2 필요
  const actionMult = isReclass ? 1.8 : 1; // 재전직은 액션 카운트 1.8배 필요

  for (const [classId, classDef] of Object.entries(CLASSES)) {
    if (classId === char.class) continue; // 현재 직업은 제외
    const cond = classDef.conditions;
    let passed = true;

    if (cond.minStats) {
      for (const [stat, min] of Object.entries(cond.minStats)) {
        if ((char.stats[stat] || 0) < min + statBoost) { passed = false; break; }
      }
    }
    if (!passed) continue;

    if (cond.alignment && char.alignment !== cond.alignment) continue;

    if (cond.minActions) {
      for (const [act, min] of Object.entries(cond.minActions)) {
        if ((char.actionCounts[act] || 0) < Math.ceil(min * actionMult)) { passed = false; break; }
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
  if (!char._eventHistory) char._eventHistory = {};
  const eligible = EVENT_POOL.filter(ev => {
    const c = ev.conditions || {};
    if (c.notDead && char.isDead) return false;
    if (c.minFatigue !== undefined && char.fatigue < c.minFatigue) return false;
    if (c.maxFatigue !== undefined && char.fatigue > c.maxFatigue) return false;
    if (c.min이성 !== undefined && char.sanity < c.min이성) return false;
    if (c.max이성 !== undefined && char.sanity > c.max이성) return false;
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

    // ── 반복 방지 쿨다운: weight가 높을수록 짧고, 희귀할수록 길다 ──
    const cooldown = ev.weight >= 10 ? 12 : ev.weight >= 6 ? 22 : ev.weight >= 3 ? 40 : 70;
    const lastUsed = char._eventHistory[ev.id] || 0;
    if (gs.day - lastUsed < cooldown) return false;

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

  // ── Alignment-based weight adjustments ──────────────────────────────
  // Dark  → combat/stealth events up, faith/social events down
  // Light → faith/social/rest events up, combat/dark events slightly down
  // Neutral → no change
  const ALIGN_WEIGHT = {
    Dark:    { combat:1.6, stealth:1.5, magic:1.2, faith:0.4, social:0.5, rest:0.7, trade:0.8, survival:1.0 },
    Light:   { faith:1.7, social:1.5, rest:1.3, trade:1.1, magic:1.0, survival:1.0, stealth:0.6, combat:0.7 },
    Neutral: {},
  };
  const aMult = ALIGN_WEIGHT[char.alignment] || {};

  // weighted random (with alignment multiplier)
  const weightOf = (ev) => {
    const base = ev.weight;
    const mult = aMult[ev.type] ?? 1.0;
    return base * mult;
  };
  const totalWeight = eligible.reduce((s, e) => s + weightOf(e), 0);
  let r = Math.random() * totalWeight;
  for (const ev of eligible) {
    r -= weightOf(ev);
    if (r <= 0) return ev;
  }
  return eligible[eligible.length - 1];
}
