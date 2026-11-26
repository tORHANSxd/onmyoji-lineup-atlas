((root, factory) => {
  const routes = factory();
  if (typeof module === 'object' && module.exports) module.exports = routes;
  else root.AtlasAsuraBoss = routes;
})(globalThis, () => {
  'use strict';
  const finalMode = 3342, towerMode = 3344;
  const engineHash = 'c8684fa2242935f355ea525a99455bd0625986486374ee4ffb74bdc9e8de49d1';
  const entries = [
    [602002, '圣帝·恶', 31419, 31425], [602001, '圣帝·天', 31418, 31424],
    [602006, '圣帝·人', 31420, 31426], [602004, '圣帝·兽', 31421, 31427],
    [602005, '圣帝·狱', 31422, 31428], [602003, '圣帝·鬼', 31423, 31429],
    [602000, '终末之战', 31436, 0],
  ].map(([stageId, name, skill, enrageSkill], index) => {
    const final = index === 6;
    return Object.freeze({stageId, name, skill, enrageSkill, index:index + 1, final,
      battleMode:final ? finalMode : towerMode, sceneId:final ? 42134 : 42118});
  });
  const maxHp = '46321995087944608';
  const deadlineSeconds = 240, rewardMinimum = 100000;
  const skills = [
    [31401,'看破',3],[31402,'息吹',3],[31403,'结缘',3],[31404,'茕火',2],[31450,'灵火',2],[31405,'魂爆',2],
    [31406,'红莲',2],[31407,'蝎毒',2],[31408,'鸣屋',2],[31409,'咒术',2],[31410,'鸦羽',2],[31411,'见切',2],
    [31412,'瞑火',1],[31413,'浮光',1],[31414,'针女',1],[31415,'先攻',1],[31416,'淬毒',1],[31417,'金莲',1],
  ];
  const costs = new Map(skills.map(([id, , cost]) => [id,cost]));
  const slotCount = level => [0,15,30,45,65,85].filter(threshold => level >= threshold).length;
  const usedSlots = ids => ids.reduce((sum,id) => sum + costs.get(id), 0);
  const distinct = (ids, valid, limit) => Array.isArray(ids) && ids.length <= limit &&
    ids.every(valid) && new Set(ids).size === ids.length;
  const within = (value,limit) => Number.isInteger(value) && value >= 1 && value <= limit;
  function validSettings(settings, entry){
    if (!settings || !entry || Object.keys(settings).length !== (entry.final ? 6 : 3)) return false;
    const {level,skills,specialKeys,enrage,activeTowers,bossHp} = settings;
    if (!Number.isSafeInteger(level) || level < 0 || !distinct(skills,id => costs.has(id), costs.size) ||
        usedSlots(skills) > slotCount(level) || !distinct(specialKeys,key => within(key,18),18)) return false;
    return !entry.final || typeof enrage === 'boolean' && distinct(activeTowers,id => within(id,6),6) &&
      (bossHp === null || typeof bossHp === 'string' && /^[1-9]\d{0,17}$/.test(bossHp) && BigInt(bossHp) <= BigInt(maxHp));
  }
  function monsterSkills(settings, entry){
    if(!entry.final) return [entry.skill];
    if(!settings.enrage) return settings.activeTowers.length ? [entry.skill] : [];
    return entries.filter(row => settings.activeTowers.includes(row.index)).map(row => row.enrageSkill);
  }
  return Object.freeze({resourceVersion:'0.0.816', finalMode,towerMode,deadlineSeconds,rewardMinimum,maxHp,skills,
    sourceGroups:['日','月','星','云','夕','夜'], entries,slotCount,usedSlots,validSettings,monsterSkills,
    entry:stage => entries.find(row => row.stageId === stage),
    engines:{[finalMode]:{name:'AsuraBossEngine',route:'asura-final-personal-score',sha256:engineHash},
     [towerMode]:{name:'AsuraBossEngine',route:'asura-tower-solo',sha256:engineHash}},
    tableSHA256:{asura_p2_config:'4a1401306a200389ea1edc1384dd7c3b87b2ab984919a79165318860bb295d28',
     asura_const:'0bfb1d2e062c8aa83f70babb33e080aff39cb93475bd7fd85a0e5967a9263975',
     asura_buff:'891fe0cfe4c2ae9eea5e3025920a732ea1150568d7a23fb054b54c7f268cfebf',
     asura_event_type2:'3e6a838cbc771ee8cdc5424b1a4e286cc8543928f29381317e54328a84b78104',
     asura_sa_hero_config:'ad79b9872aa4f4688a3a08bf8aecb3e479654fb2a697fb1af124245d5863c387'},
  });
});
