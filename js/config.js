/* ═══════════════════════════════════════
   config.js — Constants & Data Definitions
   ═══════════════════════════════════════ */

'use strict';

// ─── EQUIPMENT DEFINITIONS ───────────────
// slot: 'weapon' | 'armor' | 'accessory'
// tier: 0(초급)~3(희귀) — 높을수록 상위 장비
// bonus: char.stats에 더해지는 보너스
const EQUIPMENT_DEFS = {
  // ── 무기 (Tier 0) ─────────────────────
  weapon_wooden:  { name: '목검',          slot: 'weapon',    tier: 0, icon: '🪵', bonus: { str: 1 },           price: 30,  forge: false, desc: 'STR +1. 초보 모험가의 연습용 목검.' },
  // ── 무기 (Tier 1) ─────────────────────
  weapon_dagger:  { name: '단검',          slot: 'weapon',    tier: 1, icon: '🗡',  bonus: { str: 2, agi: 1 },  price: 100, forge: true,  desc: 'STR +2, AGI +1. 빠르고 날카로운 단검.' },
  weapon_club:    { name: '철 곤봉',       slot: 'weapon',    tier: 1, icon: '🔨', bonus: { str: 2, end: 1 },  price: 90,  forge: true,  desc: 'STR +2, END +1. 둔기로 적을 압도하는 곤봉.' },
  weapon_wand:    { name: '마법 지팡이(초급)',slot:'weapon',   tier: 1, icon: '🪄', bonus: { int: 2 },           price: 110, forge: false, desc: 'INT +2. 마법 입문자용 지팡이.' },
  // ── 무기 (Tier 2) ─────────────────────
  weapon_sword:   { name: '롱소드',        slot: 'weapon',    tier: 2, icon: '⚔',  bonus: { str: 3 },           price: 220, forge: true,  desc: 'STR +3. 균형 잡힌 표준 장검.' },
  weapon_axe:     { name: '전투 도끼',     slot: 'weapon',    tier: 2, icon: '🪓', bonus: { str: 3, end: 1 },  price: 240, forge: true,  desc: 'STR +3, END +1. 강인한 전사를 위한 전투 도끼.' },
  weapon_bow:     { name: '합성궁',        slot: 'weapon',    tier: 2, icon: '🏹', bonus: { agi: 3, str: 1 },  price: 210, forge: true,  desc: 'AGI +3, STR +1. 원거리 정밀 타격에 특화된 합성궁.' },
  weapon_staff:   { name: '마법 지팡이',   slot: 'weapon',    tier: 2, icon: '🔮', bonus: { int: 3 },           price: 250, forge: false, desc: 'INT +3. 마력이 깃든 마법사의 지팡이.' },
  weapon_spear:   { name: '장창',          slot: 'weapon',    tier: 2, icon: '⚡', bonus: { str: 2, end: 2 },  price: 225, forge: true,  desc: 'STR +2, END +2. 돌격전에 강한 장창.' },
  // ── 무기 (Tier 3) ─────────────────────
  weapon_holy:    { name: '성검',          slot: 'weapon',    tier: 3, icon: '✨', bonus: { str: 2, fai: 3 },  price: 500, forge: false, desc: 'STR +2, FAI +3. 신성한 빛이 깃든 검.' },
  weapon_dark:    { name: '저주의 검',     slot: 'weapon',    tier: 3, icon: '🌑', bonus: { str: 4, int: 1 },  price: 450, forge: false, desc: 'STR +4, INT +1. 어둠의 힘이 깃든 금지의 검.' },
  weapon_great_axe:{ name: '분노의 대도끼',slot: 'weapon',   tier: 3, icon: '🪓', bonus: { str: 5 },           price: 470, forge: true,  desc: 'STR +5. 파괴력 극대화의 전사용 대형 도끼.' },
  weapon_longbow: { name: '장궁 엘시아',   slot: 'weapon',    tier: 3, icon: '🏹', bonus: { agi: 4, str: 1 },  price: 460, forge: true,  desc: 'AGI +4, STR +1. 정밀 사격의 정점.' },
  weapon_grimoire:{ name: '마법 대서',     slot: 'weapon',    tier: 3, icon: '📖', bonus: { int: 4, fai: 1 },  price: 480, forge: false, desc: 'INT +4, FAI +1. 고대 마법을 담은 술사용 대서.' },
  // ── 방어구 ────────────────────────────
  armor_cloth:    { name: '천 갑옷',       slot: 'armor',     tier: 0, icon: '👘', bonus: { end: 1 },           price: 40,  forge: false, desc: 'END +1. 기본 천 갑옷.' },
  armor_leather:  { name: '가죽 갑옷',     slot: 'armor',     tier: 1, icon: '🛡', bonus: { end: 2, str: 1 },  price: 120, forge: true,  desc: 'END +2, STR +1. 튼튼한 가죽 갑옷.' },
  armor_chain:    { name: '사슬 갑옷',     slot: 'armor',     tier: 2, icon: '⛓', bonus: { end: 3 },           price: 230, forge: true,  desc: 'END +3. 유연하고 방어력이 높은 사슬 갑옷.' },
  armor_plate:    { name: '판금 갑옷',     slot: 'armor',     tier: 3, icon: '🔰', bonus: { end: 4, str: 1 },  price: 480, forge: true,  desc: 'END +4, STR +1. 최고의 방어력을 자랑하는 판금 갑옷.' },
  armor_robe:     { name: '마법 로브',     slot: 'armor',     tier: 2, icon: '🧥', bonus: { int: 2, end: 1 },  price: 200, forge: false, desc: 'INT +2, END +1. 마나 흐름을 강화하는 로브.' },
  armor_shadow:   { name: '그림자 갑옷',   slot: 'armor',     tier: 2, icon: '🕶', bonus: { agi: 2, end: 1 },  price: 215, forge: false, desc: 'AGI +2, END +1. 은신과 기동성을 동시에 보장.' },
  armor_divine:   { name: '신성 갑옷',     slot: 'armor',     tier: 3, icon: '🌟', bonus: { end: 3, fai: 2 },  price: 490, forge: false, desc: 'END +3, FAI +2. 신의 가호가 깃든 성직자용 갑옷.' },
  // ── 장신구 ────────────────────────────
  acc_ring:       { name: '체력의 반지',   slot: 'accessory', tier: 1, icon: '💍', bonus: { end: 2 },           price: 150, forge: false, desc: 'END +2. 생명력을 강화시키는 반지.' },
  acc_amulet:     { name: '마력의 목걸이', slot: 'accessory', tier: 2, icon: '📿', bonus: { int: 2, fai: 1 },  price: 260, forge: false, desc: 'INT +2, FAI +1. 마력을 증폭시키는 목걸이.' },
  acc_charm:      { name: '행운의 부적',   slot: 'accessory', tier: 1, icon: '🍀', bonus: { agi: 2, cha: 1 },  price: 180, forge: false, desc: 'AGI +2, CHA +1. 행운을 부르는 부적.' },
  acc_cape:       { name: '질주의 망토',   slot: 'accessory', tier: 2, icon: '🧣', bonus: { agi: 3 },           price: 220, forge: false, desc: 'AGI +3. 이동 속도를 높여주는 마법 망토.' },
  acc_bracer:     { name: '전사의 완갑',   slot: 'accessory', tier: 2, icon: '🔱', bonus: { str: 2, end: 1 },  price: 230, forge: true,  desc: 'STR +2, END +1. 전투를 위해 단련된 완갑.' },
};

// ─── LEVEL SYSTEM ────────────────────────
// expForNextLevel(level) → EXP needed to go from `level` to `level+1`
// Level 1→2: 100, 2→3: 135, ..., each ~35% harder
// Level cap: 30. Reaching level ~10 takes ~4000 total EXP.
function expForNextLevel(level) {
  return Math.floor(100 * Math.pow(1.35, level - 1));
}

// Maps class → primary action type used for skill level growth & roll bonuses
const SKILL_ACTION_MAP = {
  warrior:     'combat',
  mage:        'magic',
  cleric:      'faith',
  rogue:       'stealth',
  knight:      'combat',
  bard:        'social',
  ranger:      'survival',
  druid:       'survival',
  sage:        'magic',
  merchant:    'trade',
  paladin:     'faith',
  necromancer: 'magic',
};

// Maps stat key → action type for roll() skill bonus matching
const STAT_ACTION_MAP = {
  str: 'combat',
  int: 'magic',
  fai: 'faith',
  agi: 'stealth',
  cha: 'social',
  end: 'survival',
};

// ─── KOREAN NAME GENERATOR ───────────────
const KR_SURNAMES   = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','전','고','남','문','방','백','엄','여','추','홍','탁'];
const KR_GIVEN_M    = ['준혁','민준','성호','재원','동훈','현우','승현','태양','진욱','민성','재현','성진','동현','준서','민호','석준','지훈','영준','경민','도현','우진','연우','승준','태민','재호'];
const KR_GIVEN_F    = ['지은','서연','수진','유나','하은','채원','소윤','지아','나은','민서','아린','세아','다은','예진','하윤','수아','지윤','예은','소희','은지','다인','혜원','세연','나린','가현'];
const KR_GIVEN_O    = ['가을','새봄','하늘','바람','나비','별이','은하','누리','아라','시온','다온','라온','한결','나루','새길'];

function randomKrName(gender) {
  const sur = KR_SURNAMES[Math.floor(Math.random() * KR_SURNAMES.length)];
  const pool = gender === 'female' ? KR_GIVEN_F : gender === 'male' ? KR_GIVEN_M : KR_GIVEN_O;
  return sur + pool[Math.floor(Math.random() * pool.length)];
}

// ─── EXTENDED MARKET ITEMS (거점 성장으로 해금) ──
// unlock: { baseLevel?: N, building?: 'id' }
const MARKET_EXTRA_ITEMS = {
  // ── Base Lv2 (마을) 해금 ──────────────
  enhanced_potion:  { name: '강화 치유 포션', cat: 'consumable', base: 150, supply: 50, demand: 70,  unlock: { baseLevel: 2 } },
  mana_elixir:      { name: '마나 회복약',    cat: 'consumable', base: 180, supply: 40, demand: 60,  unlock: { baseLevel: 2 } },
  fire_scroll:      { name: '화염 마법 스크롤',cat: 'consumable', base: 200, supply: 30, demand: 50,  unlock: { baseLevel: 2 } },
  // ── Base Lv3 (성채) 해금 ──────────────
  myth_elixir:      { name: '신화의 영약',    cat: 'rare',       base: 450, supply: 15, demand: 30,  unlock: { baseLevel: 3 } },
  magic_tome:       { name: '고대 마법서',     cat: 'rare',       base: 380, supply: 20, demand: 40,  unlock: { baseLevel: 3 } },
  hero_emblem:      { name: '영웅의 문장',     cat: 'artifact',   base: 600, supply: 8,  demand: 20,  unlock: { baseLevel: 3 } },
  // ── Base Lv4 (왕도) 해금 ──────────────
  dragon_blood:     { name: '드래곤 혈액',    cat: 'forbidden',  base: 1200,supply: 3,  demand: 10,  unlock: { baseLevel: 4 } },
  legend_crystal:   { name: '전설의 마정석',  cat: 'artifact',   base: 900, supply: 5,  demand: 15,  unlock: { baseLevel: 4 } },
  // ── 건물 해금 ─────────────────────────
  steel_ingot:      { name: '강철 주괴',      cat: 'material',   base: 80,  supply: 60, demand: 80,  unlock: { building: 'forge' } },
  rune_stone:       { name: '룬 석판',        cat: 'material',   base: 120, supply: 40, demand: 60,  unlock: { building: 'forge' } },
  spell_scroll:     { name: '마법 두루마리',  cat: 'consumable', base: 220, supply: 35, demand: 55,  unlock: { building: 'library' } },
  ancient_tome:     { name: '고서',           cat: 'material',   base: 300, supply: 15, demand: 35,  unlock: { building: 'library' } },
  holy_water:       { name: '성수',           cat: 'consumable', base: 120, supply: 50, demand: 65,  unlock: { building: 'temple' } },
  divine_talisman:  { name: '신성 부적',      cat: 'consumable', base: 250, supply: 20, demand: 40,  unlock: { building: 'temple' } },
  quality_meal:     { name: '고급 식사',      cat: 'food',       base: 35,  supply: 80, demand: 100, unlock: { building: 'inn' } },
  guild_contract:   { name: '길드 계약서',    cat: 'material',   base: 150, supply: 30, demand: 50,  unlock: { building: 'guild' } },
};

// ─── RARE MARKET EQUIPMENT (길드장 구매 선택지) ──
// 거점 레벨 2+에서 약 25일마다 하나가 등장하는 특수 장비
const RARE_EQUIPMENT_OFFERS = [
  { id: 'blade_ignis',    name: '불꽃검 [이그니스]',        icon: '🔥', slot: 'weapon',    tier: 4, price: 3800, bonus: { str: 4, int: 1 }, desc: '불꽃의 정령이 깃든 전설급 검. STR +4, INT +1.' },
  { id: 'frost_arbor',   name: '빙결 지팡이 [프로스트]',    icon: '❄', slot: 'weapon',    tier: 4, price: 4200, bonus: { int: 5 },          desc: '영구 동토의 얼음을 담은 지팡이. INT +5.' },
  { id: 'shadow_fang',   name: '암영의 단도 [섀도팽]',      icon: '🌑', slot: 'weapon',    tier: 4, price: 3500, bonus: { agi: 3, str: 2 },  desc: '그림자를 베는 도적의 성배. AGI +3, STR +2.' },
  { id: 'storm_bow',     name: '폭풍의 활 [스톰레인]',      icon: '🌪', slot: 'weapon',    tier: 4, price: 4000, bonus: { agi: 4, end: 1 },  desc: '질풍을 불러오는 고대의 활. AGI +4, END +1.' },
  { id: 'divine_plate',  name: '신성 판금 [세라피엘]',      icon: '✨', slot: 'armor',     tier: 4, price: 4500, bonus: { end: 4, fai: 2 },  desc: '천계의 빛으로 단련된 갑옷. END +4, FAI +2.' },
  { id: 'shadow_robe',   name: '어둠의 로브 [나이트쉐이드]',icon: '🌑', slot: 'armor',     tier: 4, price: 3800, bonus: { int: 3, agi: 2 },  desc: '심연의 어둠을 짠 마법 로브. INT +3, AGI +2.' },
  { id: 'crown_of_dawn', name: '여명의 왕관 [다운크라운]',  icon: '👑', slot: 'accessory', tier: 4, price: 5000, bonus: { fai: 3, cha: 3 },  desc: '전설 속 왕관. 착용자에게 신의 가호가. FAI +3, CHA +3.' },
  { id: 'ring_void',     name: '허공의 반지 [보이드링]',    icon: '💍', slot: 'accessory', tier: 4, price: 4200, bonus: { int: 3, end: 2 },  desc: '존재를 초월한 힘이 깃든 반지. INT +3, END +2.' },
  { id: 'cape_tempest',  name: '폭풍의 망토 [템페스트]',    icon: '🧣', slot: 'accessory', tier: 4, price: 3600, bonus: { agi: 4, str: 1 },  desc: '폭풍을 잠재운 망토. 착용자의 발이 바람처럼. AGI +4, STR +1.' },
];

// ─── PORTRAIT ICONS ──────────────────────
const PORTRAIT_ICONS = {
  male:   ['🧔','👨','👦','🧙‍♂️','⚔','🏹','🛡','🦸‍♂️','🤺','🧝‍♂️'],
  female: ['👩','👱‍♀️','🧝‍♀️','🧙‍♀️','💃','🔮','🏹','🦸‍♀️','🧚‍♀️','🌸'],
  other:  ['🧑','🧒','🎭','✨','🌟','🎪','🦄','🌈','🎨','🎵'],
};

// ─── MBTI ─────────────────────────────────
const MBTI_LIST = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
                   'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

const MBTI_TRAITS = {
  INTJ: { bonus: 'magic',    title: '전략가',    eventMod: { int: 0.2 } },
  INTP: { bonus: 'magic',    title: '논리주의자', eventMod: { int: 0.3 } },
  ENTJ: { bonus: 'social',   title: '지도자',    eventMod: { cha: 0.2, str: 0.1 } },
  ENTP: { bonus: 'magic',    title: '토론가',    eventMod: { int: 0.2, cha: 0.1 } },
  INFJ: { bonus: 'faith',    title: '옹호자',    eventMod: { fai: 0.2 } },
  INFP: { bonus: 'faith',    title: '중재자',    eventMod: { fai: 0.1, cha: 0.1 } },
  ENFJ: { bonus: 'social',   title: '선도자',    eventMod: { cha: 0.3 } },
  ENFP: { bonus: 'social',   title: '활동가',    eventMod: { cha: 0.2 } },
  ISTJ: { bonus: 'combat',   title: '현실주의자', eventMod: { str: 0.2, end: 0.1 } },
  ISFJ: { bonus: 'faith',    title: '수호자',    eventMod: { fai: 0.2, end: 0.1 } },
  ESTJ: { bonus: 'combat',   title: '경영인',    eventMod: { str: 0.2, cha: 0.1 } },
  ESFJ: { bonus: 'social',   title: '집정관',    eventMod: { cha: 0.2, fai: 0.1 } },
  ISTP: { bonus: 'stealth',  title: '장인',      eventMod: { agi: 0.2 } },
  ISFP: { bonus: 'survival', title: '모험가',    eventMod: { end: 0.2, agi: 0.1 } },
  ESTP: { bonus: 'combat',   title: '사업가',    eventMod: { str: 0.2 } },
  ESFP: { bonus: 'social',   title: '연예인',    eventMod: { cha: 0.3 } },
};

// ─── STATS ────────────────────────────────
const STAT_DEF = {
  str: { name: '전투',  abbr: 'STR', icon: '⚔',  color: '#e53935' },
  int: { name: '마법',  abbr: 'INT', icon: '✨', color: '#9c27b0' },
  fai: { name: '신성',  abbr: 'FAI', icon: '☀',  color: '#ff8f00' },
  agi: { name: '민첩',  abbr: 'AGI', icon: '💨', color: '#00897b' },
  cha: { name: '사교',  abbr: 'CHA', icon: '💬', color: '#1e88e5' },
  end: { name: '생존',  abbr: 'END', icon: '🌿', color: '#43a047' },
};

const STAT_COLORS = {
  str: '#e53935', int: '#9c27b0', fai: '#ff8f00',
  agi: '#00897b', cha: '#1e88e5', end: '#43a047',
};

// ─── STATUS EFFECTS ───────────────────────
const STATUS_EFFECTS = {
  curse:     { name: '저주',  icon: '💀', desc: '전 스탯 -2. 성당·마법사 해제 또는 5%/일 자연해제', statMod: { str:-2,int:-2,fai:-2,agi:-2,cha:-2,end:-2 } },
  fear:      { name: '공포',  icon: '😱', desc: 'STR·AGI -3. 전투 기피. 20%/일 자연해제',            statMod: { str:-3, agi:-3 } },
  poison:    { name: '중독',  icon: '☠',  desc: 'HP -5/일. 해독제 구입 또는 성당으로 해제',           hpPerDay: -5 },
  confusion: { name: '혼란',  icon: '😵', desc: '매력(CHA) 무효화. 이성 50 이상 시 자연해제',         chaDisabled: true },
  madness:   { name: '광기',  icon: '🌀', desc: 'CHA 무효, 행동 왜곡. 이성 30 이상 시 서서히 해제',    chaDisabled: true, textDistort: true },
  charmed:   { name: '홀림',  icon: '💕', desc: '대상에게 무의식적으로 금화 지출. 30%/일 자연해제' },
};

// ─── ALIGNMENTS ───────────────────────────
const ALIGNMENTS = {
  Light:   { name: '선 (Light)',    color: '#ffd700', icon: '☀' },
  Neutral: { name: '중립 (Neutral)', color: '#9e9e9e', icon: '⚖' },
  Dark:    { name: '악 (Dark)',     color: '#7b1fa2', icon: '🌑' },
};

// ─── CLASSES ──────────────────────────────
// skills: 각 스킬은 { name, mpCost, effect } 객체
const CLASSES = {
  warrior: {
    name: '전사', icon: '⚔', mpActive: false,
    conditions: { minStats: { str: 6 }, minActions: { combat: 5 } },
    skills: [
      { name: '방어 태세', mpCost: 5, effect: 'END +2 임시 강화. 받는 피해 감소.' },
      { name: '도발',     mpCost: 4, effect: '적의 주의를 끌어 동료를 보호한다.' },
      { name: '연속 공격', mpCost: 7, effect: 'STR 기반 2연타. 추가 피해 부여.' },
    ],
    economyRole: '토벌 의뢰 수임, 경비 고용',
    statBonus: { str: 1, end: 1 },
    goldPerDay: [12, 35],
    supply: { monster_material: 15 },
    desc: '강인한 전투 본능과 육체적 힘을 갖춘 전사.',
  },
  mage: {
    name: '마법사', icon: '🔮', mpActive: true,
    conditions: { minStats: { int: 5 }, minActions: { magic: 3 } },
    skills: [
      { name: '파이어볼',  mpCost: 15, effect: 'INT 기반 강력한 원거리 화염 공격.' },
      { name: '마법 감지', mpCost: 5,  effect: '함정·마법·숨겨진 위험 사전 감지.' },
      { name: '마력 증폭', mpCost: 12, effect: '다음 마법 스킬의 위력 2배 증폭.' },
    ],
    economyRole: '마법 재료 수요 생성',
    statBonus: { int: 1 },
    goldPerDay: [10, 28],
    demand: { magic_stone: 10, magic_crystal: 5 },
    desc: '마력을 통해 세계를 변화시키는 마법사.',
  },
  cleric: {
    name: '성직자', icon: '✝', mpActive: false,
    conditions: { minStats: { fai: 6 }, minActions: { faith: 4 } },
    skills: [
      { name: '치유의 손길', mpCost: 10, effect: '대상 HP +20 회복. FAI에 비례.' },
      { name: '언데드 퇴치', mpCost: 12, effect: '언데드·저주 속성 적에 특효 공격.' },
      { name: '축복',        mpCost: 8,  effect: '팀 전원 이성 +5, 피로 -5.' },
    ],
    economyRole: '치유 서비스 제공',
    statBonus: { fai: 1, cha: 1 },
    goldPerDay: [10, 32],
    supply: { healing_potion: 10, antidote: 8 },
    desc: '신성한 빛으로 동료를 치유하는 성직자.',
  },
  rogue: {
    name: '도적', icon: '🗡', mpActive: false,
    conditions: { minStats: { agi: 5 }, minActions: { stealth: 3 } },
    skills: [
      { name: '잠입',     mpCost: 6, effect: 'AGI 기반 은신. 발각 위험 대폭 감소.' },
      { name: '급소 공격', mpCost: 8, effect: '적의 급소를 노린 단타. AGI 기반 고피해.' },
      { name: '함정 해제', mpCost: 4, effect: '탐험 중 함정 감지·무력화.' },
    ],
    economyRole: '암시장 접근권',
    statBonus: { agi: 1 },
    goldPerDay: [12, 45],
    demandBlackMarket: true,
    desc: '그림자 속에서 기회를 노리는 도적.',
  },
  knight: {
    name: '기사', icon: '🛡', mpActive: false,
    conditions: { minStats: { str: 5, fai: 5 }, minActions: { combat: 3 } },
    skills: [
      { name: '성검 격발', mpCost: 10, effect: 'FAI+STR 기반 신성 공격. 언데드 특효.' },
      { name: '맹세',      mpCost: 8,  effect: '동료 보호 맹세. 대신 피해를 받을 수 있다.' },
      { name: '신성 방어', mpCost: 6,  effect: '팀 전원 방어력 일시 상승.' },
    ],
    economyRole: '귀족 의뢰 수임',
    statBonus: { str: 1, fai: 1 },
    goldPerDay: [22, 55],
    desc: '명예와 신념으로 무장한 기사.',
  },
  bard: {
    name: '음유시인', icon: '🎵', mpActive: false,
    conditions: { minStats: { cha: 6 }, minActions: { social: 5 } },
    skills: [
      { name: '용기의 노래', mpCost: 8,  effect: '팀 전원 공격력 +3, 이성 +3.' },
      { name: '매혹',        mpCost: 10, effect: 'CHA 기반 적·NPC 매혹. 전투 회피 가능.' },
      { name: '이야기꾼',    mpCost: 5,  effect: '파티 사기 상승, 피로 -10.' },
    ],
    economyRole: '공연 수입, 시장 정보 획득',
    statBonus: { cha: 2 },
    goldPerDay: [8, 22],
    marketInfoBonus: true,
    desc: '음악과 이야기로 사람들의 마음을 움직이는 음유시인.',
  },
  ranger: {
    name: '레인저', icon: '🏹', mpActive: false,
    conditions: { minStats: { agi: 5, end: 5 }, minActions: { survival: 4 } },
    skills: [
      { name: '추적',      mpCost: 4, effect: '위험 사전 감지. 매복·기습 회피.' },
      { name: '야영 달인', mpCost: 3, effect: '야영 시 HP·피로 추가 회복.' },
      { name: '정밀 사격', mpCost: 9, effect: '원거리 정밀 타격. AGI 기반 고피해.' },
    ],
    economyRole: '채집 효율 상승',
    statBonus: { agi: 1, end: 1 },
    goldPerDay: [10, 28],
    supply: { herb: 12, travel_food: 10, monster_material: 8 },
    desc: '광야를 누비며 자연과 하나가 된 레인저.',
  },
  druid: {
    name: '드루이드', icon: '🌿', mpActive: false,
    conditions: { minStats: { fai: 3, end: 5 }, minActions: { survival: 4 } },
    skills: [
      { name: '자연의 가호', mpCost: 10, effect: '팀 HP 소량 회복 + 피로 감소.' },
      { name: '변신',        mpCost: 15, effect: '동물로 변신해 정찰·은신 가능.' },
      { name: '식물 치유',   mpCost: 8,  effect: '약초를 이용한 자연 치유. FAI+END 기반.' },
    ],
    economyRole: '농산물·약초 생산',
    statBonus: { end: 2 },
    goldPerDay: [7, 20],
    supply: { herb: 20, travel_food: 15, healing_potion: 5 },
    desc: '자연의 힘을 빌려 세계와 교감하는 드루이드.',
  },
  sage: {
    name: '현자', icon: '📚', mpActive: true,
    conditions: { minStats: { int: 6 }, minActions: { magic: 5 } },
    skills: [
      { name: '고대어 해독', mpCost: 5,  effect: '유적 탐험 성공률 상승. 유물 가치 파악.' },
      { name: '유물 감정',   mpCost: 6,  effect: '유물의 진위·능력을 정확히 판별.' },
      { name: '예언',        mpCost: 15, effect: '미래의 위험 또는 기회를 예고한다.' },
    ],
    economyRole: '유물 감정 서비스',
    statBonus: { int: 2 },
    goldPerDay: [18, 45],
    supply: { ancient_artifact: 3 },
    desc: '수십 년의 학문으로 세계의 비밀을 꿰뚫는 현자.',
  },
  merchant: {
    name: '상인', icon: '💰', mpActive: false,
    conditions: { minStats: { cha: 5 }, minActions: { trade: 4 } },
    skills: [
      { name: '교역',      mpCost: 4, effect: '시장 거래 시 수익 +5% 추가.' },
      { name: '가격 협상', mpCost: 5, effect: '구매가 -10% / 판매가 +10% 적용.' },
      { name: '밀수',      mpCost: 8, effect: '금지 재료·희귀품 암거래 접근권.' },
    ],
    economyRole: '시장 가격에 가장 강한 영향력',
    statBonus: { cha: 2 },
    goldPerDay: [18, 70],
    chaBonus: 2.0,
    desc: '황금의 언어를 구사하는 천재 상인.',
  },
  paladin: {
    name: '팔라딘', icon: '⚜', mpActive: true,
    conditions: { minStats: { str: 5, fai: 5 }, alignment: 'Light', specialEvent: true },
    skills: [
      { name: '성스러운 심판', mpCost: 10, effect: 'FAI+STR 기반 신성 타격. 암흑 속성 특효.' },
      { name: '치유의 빛',     mpCost: 10, effect: '대상 HP +25 회복. FAI에 비례.' },
      { name: '신성의 보호막', mpCost: 8,  effect: '팀 전원 피해 경감. 5라운드 지속.' },
    ],
    economyRole: '헌금·기부 이벤트',
    statBonus: { str: 1, fai: 1 },
    goldPerDay: [28, 65],
    desc: '빛의 신께 헌신한 가장 고귀한 전사.',
  },
  necromancer: {
    name: '네크로맨서', icon: '💀', mpActive: true,
    conditions: { minStats: { int: 5 }, minActions: { magic: 4 } },
    skills: [
      { name: '언데드 소환', mpCost: 18, effect: '언데드를 소환해 전투를 보조한다.' },
      { name: '생명 흡수',   mpCost: 12, effect: '적의 HP를 흡수해 자신을 회복한다.' },
      { name: '공포의 기운', mpCost: 10, effect: '적 전체에 공포를 주입. 공격력 감소.' },
    ],
    economyRole: '암시장 전용 재료 수요',
    statBonus: { int: 1 },
    goldPerDay: [10, 42],
    demandBlackMarket: true,
    demand: { forbidden_material: 8, magic_stone: 6 },
    desc: '죽음의 힘을 다루는 금기의 마법사.',
  },
};

// ─── MARKET ITEMS ─────────────────────────
const MARKET_ITEMS = {
  // ── 소모품 ────────────────────────────────
  healing_potion:    { name: '치유 포션',       cat: 'consumable', base: 50,   supply: 100, demand: 100 },
  mana_potion:       { name: '마나 포션',       cat: 'consumable', base: 60,   supply: 80,  demand: 80 },
  antidote:          { name: '해독제',          cat: 'consumable', base: 30,   supply: 100, demand: 80 },
  stamina_herb:      { name: '강장 약초',       cat: 'consumable', base: 25,   supply: 80,  demand: 60 },
  fire_oil:          { name: '화염 기름',       cat: 'consumable', base: 45,   supply: 60,  demand: 50 },
  // ── 식료품 ────────────────────────────────
  travel_food:       { name: '여행 식량',       cat: 'food',       base: 10,   supply: 150, demand: 120 },
  dried_meat:        { name: '말린고기',        cat: 'food',       base: 18,   supply: 130, demand: 110 },
  bread:             { name: '빵',              cat: 'food',       base: 8,    supply: 180, demand: 150 },
  potato:            { name: '감자',            cat: 'food',       base: 5,    supply: 200, demand: 130 },
  salt_fish:         { name: '소금에 절인 생선', cat: 'food',      base: 12,   supply: 120, demand: 90 },
  // ── 재료 ──────────────────────────────────
  herb:              { name: '약초',            cat: 'material',   base: 15,   supply: 120, demand: 100 },
  monster_material:  { name: '몬스터 소재',     cat: 'loot',       base: 40,   supply: 80,  demand: 100 },
  magic_stone:       { name: '마석',            cat: 'material',   base: 80,   supply: 60,  demand: 90 },
  wood:              { name: '목재',            cat: 'material',   base: 20,   supply: 200, demand: 100 },
  iron_ore:          { name: '철광석',          cat: 'material',   base: 35,   supply: 150, demand: 100 },
  wolf_pelt:         { name: '늑대 가죽',       cat: 'loot',       base: 55,   supply: 70,  demand: 80 },
  bone_fragment:     { name: '뼛가루',          cat: 'loot',       base: 20,   supply: 90,  demand: 60 },
  // ── 무기 ─────────────────────────────────
  weapon_dagger:     { name: '단검',            cat: 'equipment',  base: 100,  supply: 90,  demand: 100 },
  weapon_club:       { name: '철 곤봉',         cat: 'equipment',  base: 90,   supply: 80,  demand: 80 },
  weapon_wand:       { name: '마법 지팡이(초급)',cat: 'equipment',  base: 110,  supply: 70,  demand: 75 },
  weapon_sword:      { name: '롱소드',          cat: 'equipment',  base: 220,  supply: 60,  demand: 90 },
  weapon_axe:        { name: '전투 도끼',       cat: 'equipment',  base: 240,  supply: 50,  demand: 80 },
  weapon_bow:        { name: '합성궁',          cat: 'equipment',  base: 210,  supply: 55,  demand: 80 },
  weapon_staff:      { name: '마법 지팡이',     cat: 'equipment',  base: 250,  supply: 45,  demand: 75 },
  weapon_spear:      { name: '장창',            cat: 'equipment',  base: 225,  supply: 55,  demand: 70 },
  weapon_dark:       { name: '저주의 검',       cat: 'equipment',  base: 450,  supply: 15,  demand: 60 },
  weapon_holy:       { name: '성검',            cat: 'equipment',  base: 500,  supply: 10,  demand: 50 },
  weapon_grimoire:   { name: '마법 대서',       cat: 'equipment',  base: 480,  supply: 12,  demand: 55 },
  weapon_longbow:    { name: '장궁 엘시아',     cat: 'equipment',  base: 460,  supply: 12,  demand: 55 },
  weapon_great_axe:  { name: '분노의 대도끼',   cat: 'equipment',  base: 470,  supply: 12,  demand: 50 },
  // ── 갑옷 ──────────────────────────────────
  armor_leather:     { name: '가죽 갑옷',       cat: 'equipment',  base: 120,  supply: 90,  demand: 95 },
  armor_robe:        { name: '마법 로브',       cat: 'equipment',  base: 200,  supply: 60,  demand: 80 },
  armor_shadow:      { name: '그림자 갑옷',     cat: 'equipment',  base: 215,  supply: 50,  demand: 75 },
  armor_chain:       { name: '사슬 갑옷',       cat: 'equipment',  base: 230,  supply: 65,  demand: 80 },
  armor_plate:       { name: '판금 갑옷',       cat: 'equipment',  base: 480,  supply: 20,  demand: 60 },
  armor_divine:      { name: '신성 갑옷',       cat: 'equipment',  base: 490,  supply: 10,  demand: 45 },
  // ── 희귀·유물·금제 ────────────────────────
  magic_crystal:     { name: '마법 결정',       cat: 'rare',       base: 200,  supply: 30,  demand: 60 },
  ancient_artifact:  { name: '고대 유물',       cat: 'artifact',   base: 500,  supply: 10,  demand: 40 },
  forbidden_material:{ name: '봉인된 마력 결정', cat: 'forbidden', base: 300,  supply: 5,   demand: 20 },
  dragon_scale:      { name: '드래곤 비늘',     cat: 'rare',       base: 1000, supply: 5,   demand: 30 },
  // ── 건축 자재 (별도 카테고리, 거점 건설용) ─
  building_stone:    { name: '건축 석재',       cat: 'material',   base: 45,   supply: 100, demand: 60 },
};

// ─── RELATIONSHIP TYPES ───────────────────
const RELATION_TYPES = {
  friend:    { name: '친구',     icon: '🤝', positive: true },
  comrade:   { name: '전우',     icon: '⚔',  positive: true },
  rival:     { name: '라이벌',   icon: '🔥', positive: false },
  enemy:     { name: '적',       icon: '💢', positive: false },
  lover:     { name: '연인',     icon: '💕', positive: true },
  spouse:    { name: '배우자',   icon: '💍', positive: true },
  parent:    { name: '부모',     icon: '👨‍👧', positive: true },
  child:     { name: '자녀',     icon: '👶', positive: true },
  sibling:   { name: '형제',     icon: '👫', positive: true },
  benefactor:{ name: '은인',     icon: '🌟', positive: true },
  employer:  { name: '고용주',   icon: '📋', positive: true },
  employee:  { name: '고용인',   icon: '🔧', positive: true },
  creditor:  { name: '채권자',   icon: '💸', positive: false },
  debtor:    { name: '채무자',   icon: '💰', positive: false },
  fan:       { name: '팬',       icon: '⭐', positive: true },
  oathbound: { name: '맹약',     icon: '🔮', positive: true },
};

// ─── WORLD THREAT STAGES ─────────────────
const THREAT_STAGES = [
  { min:  0, max: 20, name: '평화로운 왕국',  color: '#4caf50', marketMod: 1.0 },
  { min: 21, max: 40, name: '불안한 징조',    color: '#8bc34a', marketMod: 1.1 },
  { min: 41, max: 60, name: '전쟁의 기운',    color: '#ff9800', marketMod: 1.25 },
  { min: 61, max: 80, name: '어둠의 확산',    color: '#ff5722', marketMod: 1.5 },
  { min: 81, max:100, name: '마왕의 강림',    color: '#f44336', marketMod: 2.0 },
];

// ─── BUILDINGS ───────────────────────────
// minBaseLevel: 건설에 필요한 최소 거점 레벨 (1=야영지, 2=마을, 3=성채, 4=왕도)
// effectScale: 거점 레벨당 효과 배수 (레벨 N → baseEffect × (1 + (N-minLevel)×effectScale))
const BUILDINGS = {
  warehouse: {
    name: '공동 창고', icon: '🏗',
    cost: { wood: 30, gold: 80 },
    desc: '자재 채집량 +50%, 전리품이 마을 창고로 자동 귀속',
    effect: 'resource_boost', minBaseLevel: 1, effectScale: 0.15,
  },
  guild: {
    name: '모험가 길드', icon: '⚔',
    cost: { wood: 30, iron_ore: 10, gold: 200 },
    desc: '의뢰 수입 +20G/일, 전직 조건 소폭 완화',
    effect: 'quest_income', minBaseLevel: 2, effectScale: 0.20,
  },
  shop: {
    name: '상점', icon: '🏪',
    cost: { wood: 20, gold: 150 },
    desc: '시장 물가 5% 할인, 소모품 공급 안정화',
    effect: 'market_discount', minBaseLevel: 2, effectScale: 0.10,
  },
  inn: {
    name: '여관', icon: '🏨',
    cost: { wood: 40, gold: 100 },
    desc: '전원 HP +5/일, 피로 -8/일',
    effect: 'daily_regen', minBaseLevel: 2, effectScale: 0.20,
  },
  training_ground: {
    name: '훈련장', icon: '🥊',
    cost: { wood: 20, iron_ore: 30, gold: 100 },
    desc: '전투 경험치 +10%, STR·END 성장률 증가',
    effect: 'combat_boost', minBaseLevel: 2, effectScale: 0.15,
  },
  temple: {
    name: '성당', icon: '⛪',
    cost: { wood: 30, iron_ore: 10, magic_crystal: 5, gold: 200 },
    desc: '이성 +3/일, 저주·중독·공포 해제 확률 +20%',
    effect: 'sanity_regen', minBaseLevel: 3, effectScale: 0.25,
  },
  forge: {
    name: '대장간', icon: '⚒',
    cost: { iron_ore: 50, magic_crystal: 5, gold: 150 },
    desc: '철광석 채집량 +50%, 장비 공급 증가',
    effect: 'forge_bonus', minBaseLevel: 3, effectScale: 0.20,
  },
  library: {
    name: '도서관', icon: '📚',
    cost: { wood: 30, magic_crystal: 10, gold: 200 },
    desc: '마법 경험치 +15%, INT 성장률 증가',
    effect: 'magic_boost', minBaseLevel: 3, effectScale: 0.20,
  },
  watchtower: {
    name: '감시탑', icon: '🗼',
    cost: { wood: 30, iron_ore: 40, gold: 150 },
    desc: '세계 위협도 자연 증가 -0.5/일',
    effect: 'threat_reduce', minBaseLevel: 3, effectScale: 0.15,
  },
  plaza: {
    name: '광장', icon: '🎪',
    cost: { wood: 20, gold: 80 },
    desc: '음유시인·상인 수입 +15%, 사교 이벤트 빈도 증가',
    effect: 'social_boost', minBaseLevel: 4, effectScale: 0.30,
  },
};

// ─── BASE STAGES ──────────────────────────
const BASE_STAGES = [
  { level: 1, name: '야영지', icon: '⛺',
    features: ['기본 휴식', '임시 노점'],
    nextCost: { wood: 50, iron_ore: 30 },
    maxBuildings: 2, taxRate: 0,
  },
  { level: 2, name: '마을', icon: '🏘',
    features: ['의뢰 게시판', '고정 시장'],
    nextCost: { wood: 150, iron_ore: 100, magic_crystal: 10 },
    maxBuildings: 5, taxRate: 0.03,
  },
  { level: 3, name: '성채', icon: '🏰',
    features: ['방어 이벤트', '세금 수취'],
    nextCost: { wood: 400, iron_ore: 300, magic_crystal: 50 },
    maxBuildings: 8, taxRate: 0.06,
  },
  { level: 4, name: '왕도', icon: '👑',
    features: ['왕국 정책', '최종 이벤트 해금', '가격 상한제'],
    nextCost: null,
    maxBuildings: 99, taxRate: 0.08,
  },
];

// ─── ENDINGS ─────────────────────────────
const ENDINGS = [
  {
    id: 'hero_return',
    name: '영웅의 귀환',
    icon: '🦸',
    desc: '세계의 어둠이 걷히고, 모험가들은 영웅으로 역사에 이름을 남겼다.',
    condition: (gs) => gs.world.threatLevel <= 0 && gs.characters.some(c => !c.isDead && c.currentPartyId),
  },
  {
    id: 'kingdom_prosperity',
    name: '왕국의 번영',
    icon: '🏰',
    desc: '거점이 왕도로 성장하고, 경제는 안정을 되찾았다. 모험가들의 활약이 세계를 바꿨다.',
    condition: (gs) => gs.world.baseLevel >= 4 && !checkMarketCollapse(gs),
  },
  {
    id: 'golden_merchant',
    name: '황금 상인',
    icon: '💰',
    desc: '시장을 손아귀에 쥔 전설의 상인이 탄생했다. 세계의 경제가 그의 손에 달려 있다.',
    condition: (gs) => gs.characters.some(c => c.class === 'merchant' && c.gold >= 10000),
  },
  {
    id: 'darkness_consumed',
    name: '어둠에 잠식',
    icon: '💀',
    desc: '모든 영혼이 어둠에 삼켜졌다. 세계는 침묵했다.',
    condition: (gs) => gs.characters.length > 0 && gs.characters.every(c => c.isDead),
    bad: true,
  },
  {
    id: 'economic_collapse',
    name: '경제 붕괴',
    icon: '📉',
    desc: '시장이 무너지고 골드는 휴지조각이 됐다. 물물교환의 시대가 열렸다.',
    condition: (gs) => checkMarketCollapse(gs),
    bad: true,
  },
  {
    id: 'legend_adventurer',
    name: '전설의 모험가',
    icon: '⭐',
    desc: '최고의 경지에 오른 모험가. 그의 이름은 수백 년이 지나도 회자될 것이다.',
    condition: (gs) => gs.characters.some(c => (c.level || 1) >= 15 && Object.values(c.stats).some(v => v >= 9)),
  },
  {
    id: 'eternal_companions',
    name: '영원한 동반자',
    icon: '💑',
    desc: '죽음도 갈라놓지 못한 두 영혼. 그들의 이야기는 전설이 됐다.',
    condition: (gs) => {
      for (const c of gs.characters) {
        for (const r of c.relationships) {
          if (r.type === 'oathbound' && r.affection >= 100) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'dark_lord',
    name: '어둠의 군주',
    icon: '👿',
    desc: '세계를 정복한 어둠의 군주가 탄생했다. 두려움이 왕국을 지배한다.',
    condition: (gs) => gs.characters.some(c => c.class === 'necromancer' && c.alignment === 'Dark' && gs.world.threatLevel >= 90),
    bad: true,
  },
  {
    id: 'quiet_retirement',
    name: '조용한 은퇴',
    icon: '🌅',
    desc: '오랜 모험을 마친 영웅이 조용히 자리를 내려놓았다. 평화로운 노후가 기다린다.',
    condition: (gs) => gs.characters.some(c => c.isRetired),
  },
];

function checkMarketCollapse(gs) {
  if (!gs || !gs.market) return false;
  let lowSupplyCount = 0;
  const totalGold = gs.characters.reduce((s, c) => s + c.gold, 0);
  for (const item of Object.values(gs.market)) {
    if (item.supplyIndex < 10) lowSupplyCount++;
  }
  return lowSupplyCount >= 5 || totalGold < 50;
}

// ─── DEFAULT SETTINGS ─────────────────────
const DEFAULT_SETTINGS = {
  // Relation
  allowSameSexCouple: false,
  allowHeteroCouple: true,
  pureMode: false,
  friendshipMode: false,
  oathBondSystem: true,
  economicRelations: true,
  // Gameplay
  statusEffectSystem: true,
  storyChoices: true,
  characterInteraction: true,
  autoClassPromotion: true,
  autoStatDistribution: true,
  autoRecruitment: false,
  // Story speed & next-event stop condition
  nextEventMode: 'choice', // 'choice' | 'important'
  // 전투 로그 줄별 딜레이 (ms) — 0: 즉시, 400: 빠름, 800: 보통, 1500: 느림
  battleLogSpeed: 800,
  // Economy
  marketPriceFluctuation: true,
  inflationSystem: true,
  blackMarket: true,
  taxSystem: true,
  economicCollapseEvent: true,
  // Display
  showThreatLevel: true,
  showEventNumbers: false,
  developerMode: false,
  // Story speed multiplier (0.5 = slow, 1 = normal, 1.5 = fast, 3 = ultra)
  storySpeed: 1.0,
};

// ─── INITIAL GAME STATE ───────────────────
function createInitialState() {
  const market = {};
  for (const [id, def] of Object.entries(MARKET_ITEMS)) {
    market[id] = {
      name: def.name,
      cat: def.cat,
      basePrice: def.base,
      currentPrice: def.base,
      supplyIndex: def.supply,
      demandIndex: def.demand,
      regionFactor: 1.0,
      prevPrice: def.base,
    };
  }
  return {
    day: 1,
    characters: [],
    parties: [],
    market,
    world: {
      threatLevel: 10,
      baseLevel: 1,
      baseResources: { wood: 0, iron_ore: 0, magic_crystal: 0 },
      buildings: { warehouse: true, guild: true }, // 공동창고·모험가 길드는 기본 건설
      townGold: 3000, // 길드 공동 창고 초기 자금
      policies: [],
      totalGoldCirculated: 0,
    },
    settings: { ...DEFAULT_SETTINGS },
    log: [],
    pendingPromotions: [],
    pendingChoices: [],
    endingsAchieved: [],
    isRunning: false,
  };
}

// ─── CHARACTER FACTORY ────────────────────
let charIdCounter = 1;
function createCharacter(opts = {}) {
  const id = 'char_' + (charIdCounter++);
  const name = opts.name || '이름 없음';
  const gender = opts.gender || 'male';
  const mbti = opts.mbti || 'ISTJ';
  const alignment = opts.alignment || 'Neutral';
  const mental = opts.mental || 'stable';
  const stats = opts.stats || { str:2, int:2, fai:2, agi:2, cha:2, end:2 };

  const sanityInit = mental === 'anxious' ? 70
                   : mental === 'traumatized' ? 50
                   : mental === 'determined' ? 90 : 100;

  const maxHp = 50 + stats.str * 5 + stats.end * 3;
  const maxMp = 30 + stats.int * 4 + Math.floor(stats.fai * 2);

  return {
    id,
    name,
    portraitIcon: opts.portraitIcon || '',
    gender,
    mbti,
    alignment,
    stats: { ...stats },
    hp: maxHp,
    maxHp,
    mp: maxMp,   // 처음부터 가득 채움
    maxMp,
    fatigue: 0,
    sanity: sanityInit,
    gold: 100,
    exp: 0,
    class: null,
    classSkills: [],
    actionCounts: { combat:0, magic:0, faith:0, stealth:0, social:0, survival:0, trade:0 },
    classCondProgress: {},
    statusEffects: [],
    equipment: { weapon: null, armor: null, accessory: null },
    _equipBonuses: { str:0, int:0, fai:0, agi:0, cha:0, end:0 },
    debts: [],   // [{ creditorId, amount, remaining, dayTaken, deadline, purpose }]
    inventory: [],
    relationships: (opts.relationships || []).map(r => ({ ...r, affection: r.affection || 30 })),
    currentPartyId: null,
    isDead: false,
    isRetired: false,
    // Romance tracking
    daysAsLovers: {},
    pregnant: null,
    age: opts.age || 20,
    isMinor: (opts.age || 20) < 18,
    // Paladin special event tracker
    visitedShrine: false,
    memorized: false,
    // Level & growth system
    level: 1,
    statPoints: 0,
    skillLevels: {},   // { skillName: 1~5 }
  };
}
