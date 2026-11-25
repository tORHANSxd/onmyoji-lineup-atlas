(() => {
  const el = name => document.getElementById('client-dungeons' + (name ? '-' + name : ''));
  const api = window.dungeonCatalog;
  const panel = el();
  const pageSize = 25;
  const titles = {
    pve_stage_data: '通用 PvE 关卡',
    BattleMonstersInfo: '战斗编组与波次',
    BattleScenesInfo: '战斗场景与站位',
    Combinesceneinfo: '关卡场景配置',
    normal_battle_config: '通用战斗模式',
    battle_mode_routes: '客户端初始场景注册',
    battle_team_routes: '客户端组队战斗注册',
    normal_battle_tips: '通用战斗规则索引',
    system_rule_dsc: '战斗与玩法规则原文',
    tipsInfoData_cn: '简体中文旧版玩法提示',
    dungeon_rune: '御魂副本',
    dungeon_awake: '觉醒副本',
    dungeon_challenge: '秘闻副本',
    dungeon_challenge_race: '秘闻竞速',
    dungeon_challenge_series: '秘闻关卡与独立规则',
    dungeon_yuling: '御灵副本',
    guild_crevice_battle: '阴阳寮狭间暗域战斗',
    guild_boss_show: '阴阳寮首领退治规则',
    guild_boss_reward: '阴阳寮首领奖励',
    guild_dinner_monster: '阴阳寮宴会首领',
    act_team_battle: '活动组队战斗',
    journey_hardbattle: '京畿净化首领挑战',
    journey_normalbattle_jinbi: '京畿净化战斗参数 · 金币',
    journey_normalbattle_jingyan: '京畿净化战斗参数 · 经验',
    journey_normalbattle_yuhun: '京畿净化战斗参数 · 御魂',
    journey_normalbattle_juexing: '京畿净化战斗参数 · 觉醒',
    MZB_fengmo: '逢魔首领',
    lbs_world_boss_type: '逢魔首领战斗规则',
    shilian_stage_detail: '六道之门试炼',
    shilian_event_battles: '六道之门战斗配置',
    shilian_event_exam: '六道之门试炼关卡',
    activity: '活动开放配置',
    storyChapter: '探索章节',
    mapnpc: '地图探索入口',
    story_room: '探索战斗点',
    BossTower: '探索式神挑战',
    DramaProcess: '主线剧情进程',
    DramaLevel: '剧情关卡',
    hunling_noraml_boss_battle: '契灵之境首领奖励',
    hunling_jijie_boss_battle: '契灵集结首领奖励',
    SuperGhost_bossmission: '超鬼王历史首领挑战',
    super_ghost_boss_accumulate_reward: '超鬼王累计奖励',
    rpg_chapter: '剧情副本章节',
    team_assist_stage: '阵容码副本目录',
    monster: '怪物属性与免疫',
    skill: '技能配置',
  };
  const labels = {
    groupid: '敌方编组 ID', hardLv: '难度', shishentotal: '式神上阵数',
    ssinitguihuo: '式神初始鬼火', yysinitguihuo: '阴阳师初始鬼火', gwinitguihuo: '敌方初始鬼火',
    oneboutaddguihuo: '回合鬼火增量', strength: '体力消耗', battleTime: '战斗时限',
    check_strength: '体力检查', tip: '关卡提示', no_yys: '阴阳师限制',
    resindex: '默认场景 ID', battlesceneinfo: '站位配置 ID', mapsrc: '场景资源路径',
    rule_key: '规则文本 ID', pve_data_flag: '通用 PvE 关卡 ID',
    replace_yysid: '替换阴阳师 ID', hpaddrate: '生命调整参数', sl_file: '关卡脚本',
    atk_alter: '攻击调整', def_alter: '防御调整', hp_alter: '生命调整',
    sp_alter: '速度调整', spd_alter: '速度调整', crt_alter: '暴击调整',
    menpiao: '门票配置', loot_id: '奖励表 ID', uptimes: '开放配置',
    fbtips: '规则提示 ID', passReward: '通关奖励 ID', save_round_hp: '跨轮保留敌方生命',
    halt_time: '默认战斗时限（秒）', group_battle: '共享敌方生命',
    select_hero_time_out: '默认选角时限（秒）', accumulate_damage_type: '伤害累计方式 ID',
    show_countdown: '显示倒计时', show_group_dps: '显示组队伤害', show_total_damage: '显示累计伤害',
    real_time_sync_dmg: '实时同步伤害', assist_hero_list: '支援式神 ID', replace_yys_id: '替换阴阳师 ID',
    act_id: '活动 ID', battle_id: '关卡 ID', team_player_num: '组队人数', team_battle_type: '组队类型 ID',
    board_index: '棋盘编号',
    team_type: '组队类型 ID', team_symbol: '组队类型常量',
    battleMode: '战斗模式 ID', mode_symbol: '战斗模式常量',
    map_path: '注册场景资源', scene_class: '场景类', engine_class: '战斗引擎类', route_module: '组队注册脚本',
    scene_engine: '场景声明引擎',
    can_single_fight: '允许单人', show_left_time: '显示剩余时间', show_wave_count: '显示波次',
    show_current_score: '显示当前积分',
    rule: '玩法规则', boss_rule: '首领机制', attack_tip: '战斗提示', challenge_time: '挑战时限',
    begin_time: '开放时间', end_time: '关闭时间', reward_id: '奖励 ID',
    openTime: '开放星期', activity_time: '开放配置 ID', open_type: '开放方式', level_limit: '等级限制',
    need_team: '组队要求', notice: '机制说明', fb1_defs: '秘闻竞速规则', spec_skill: '首领特殊技能',
    remain_time: '存在时限', private_time: '私人挑战时限', crazy_time: '狂暴时限',
    atk_chng: '攻击调整', def_chng: '防御调整', hp_chng: '生命调整',
    spd_chng: '速度调整', crt_chng: '暴击调整', drop_effect: '掉落机制',
    baseSpeed: '基础速度', baseCritRate: '基础暴击率', atkDelta: '攻击系数',
    attackDelta: '攻击系数', defenseDelta: '防御系数', hpDelta: '生命系数',
    immuDebuff: '减益免疫', immuHitBack: '退条免疫', immunity: '免疫类型',
    skill: '技能 ID', skillLv: '技能等级', skill_id: '技能 ID', cn: '规则原文',
    chapterID: '章节 ID', diff_unlock_level: '困难解锁等级', energy_cost: '体力消耗',
    MapEntryID: '探索地图 ID', MonsterEntryID: '地图敌人位置标记', MonsterID: '探索战斗 ID',
    difficulty: '难度', soulPoint: '御魂点数', wander: '巡游', wave: '配置波次',
    scene: '场景', BattleScene: '剧情场景资源', RelatedStory: '剧情关卡 ID',
    RelatedToStoryChapter: '关联剧情章节 ID', LevelGoalDesc: '剧情目标', KeyCount: '钥匙数量',
    LevelLimitDeep: '关卡层数', PaperGuyNum: '小纸人数量', RewardBoxID: '奖励箱 ID',
    HeroID: '挑战式神 ID', LevelID: '探索挑战入口 ID', cost: '挑战消耗', currencyID: '消耗物品 ID',
  };
  const links = {
    pve_stage_data: ['groupid', 'BattleMonstersInfo', '查看敌方编组'],
    BattleMonstersInfo: ['resindex', 'Combinesceneinfo', '查看默认场景'],
    act_team_battle: ['battle_id', 'pve_stage_data', '查看活动关卡'],
    battle_team_routes: ['battleMode', 'normal_battle_config', '查看战斗模式默认规则'],
    dungeon_rune: ['scene', 'Combinesceneinfo', '查看关卡场景'],
    Combinesceneinfo: ['battlesceneinfo', 'BattleScenesInfo', '查看战斗站位'],
    story_room: ['MonsterID', 'pve_stage_data', '查看探索 PvE 关卡'],
    DramaProcess: ['RelatedStory', 'DramaLevel', '查看剧情关卡'],
    journey_hardbattle: ['battle_id', 'pve_stage_data', '查看首领挑战关卡'],
  };
  const journeyVariantFields = {
    battle_id: '战斗参数编号', attack: '攻击参数', defence: '防御参数',
    hp: '生命参数', critical: '暴击参数', speed: '速度参数', weight: '权重',
  };
  const journeyBossFields = {hero_id: '首领编号', reward: '奖励编号', time: '时限参数', unlocked: '解锁参数'};
  const state = { token: 0, index: null, entry: null, rows: [], matches: [], page: 0, selected: -1 };
  const stage = { token: 0, loading: false, rows: null, byKey: new Map(), matches: [], page: 0, selected: null, mode: 'tables' };
  const option = (label, value) => new Option(label, value);
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const normalized = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
  const keyText = key => typeof key === 'object' ? JSON.stringify(key) : String(key);
  const entryKey = ({table, key}) => JSON.stringify([table, key]);
  const rowTitle = row => [row?.name, row?.title, row?.title_name, row?.boss_name, row?.chapter_name, row?.floordesc,
    row?.typedesc, row?.skill_name, row?.StoryName, row?.MapEntryID != null ? row.desc : null]
    .find(value => typeof value === 'string' && value.trim()) || '';

  function fieldsFor(row, table) {
    const fields = document.createElement('dl');
    const displayLabels = table?.startsWith('journey_normalbattle_') ? {...labels, ...journeyVariantFields} :
      table === 'journey_hardbattle' ? {...labels, ...journeyBossFields} : labels;
    for (const [field, label] of Object.entries(displayLabels)) {
      if (row == null || !Object.hasOwn(row, field)) continue;
      const value = row[field];
      let text = typeof value === 'boolean' ? (value ? '是' : '否') :
        typeof value === 'string' ? value : JSON.stringify(value);
      if (field === 'halt_time' && value === 0) text = '0（未设默认时限）';
      if (['begin_time', 'end_time'].includes(field) && Array.isArray(value)
          && value.length >= 5 && value.slice(0, 5).every(Number.isSafeInteger)) {
        const [y,m,d,h,min] = value.map(n => String(n).padStart(2, '0'));
        text = y + '-' + m + '-' + d + ' ' + h + ':' + min;
      }
      fields.append(node('dt', table === 'mapnpc' && field === 'battle_id' ? '玩法入口 ID' : label), node('dd', text));
    }
    return fields;
  }

  function openRecord(table, key) {
    setMode('tables');
    el('family').value = el('query').value = '';
    filterTables(table, false);
    void selectTable(table, keyText(key));
    el('table').focus();
  }

  function setMode(mode) {
    const showStages = mode === 'encounters' && !!state.index?.encounters;
    stage.mode = showStages ? 'encounters' : 'tables';
    el('encounters').hidden = !showStages;
    el('controls').hidden = showStages || !state.index;
    el('mode-encounters').setAttribute('aria-pressed', String(showStages));
    el('mode-tables').setAttribute('aria-pressed', String(!showStages));
    if (showStages) {
      el('status').textContent = '';
      if (!stage.rows && !stage.loading) void loadEncounters();
    }
  }

  async function loadEncounters() {
    const snapshot = state.index;
    stage.loading = true;
    el('encounter-count').textContent = '正在读取关卡索引…';
    try {
      const payload = JSON.parse(await api.encounters());
      if (snapshot !== state.index) return;
      if (payload?.schema !== 1 || payload.resourceVersion !== snapshot.resourceVersion ||
          !Array.isArray(payload.entries) || payload.entries.length !== snapshot.encounters.rowCount) {
        throw Error('关卡索引与客户端资料版本不一致');
      }
      const order = ['daily', 'guild', 'event', 'battle', 'other'];
      stage.rows = payload.entries.map(entry => ({...entry, search: normalized(
        [entry.title, entry.kind, titles[entry.table], entry.table, keyText(entry.key), ...entry.refs.map(ref => keyText(ref.key))].join(' ')
      )})).sort((a,b) => order.indexOf(a.family) - order.indexOf(b.family));
      stage.byKey = new Map(stage.rows.map(entry => [entryKey(entry), entry]));
      filterEncounters();
    } catch (error) {
      if (snapshot === state.index) el('encounter-count').textContent = '关卡索引读取失败。' + error.message;
    } finally {
      if (snapshot === state.index) stage.loading = false;
    }
  }

  function filterEncounters() {
    if (!stage.rows) return;
    const family = el('encounter-family').value;
    const words = normalized(el('encounter-query').value).split(/\s+/);
    stage.matches = stage.rows.filter(record => (!family || record.family === family) &&
      words.every(word => record.search.includes(word)));
    stage.page = 0;
    if (!stage.matches.includes(stage.selected)) {
      stage.token++;
      stage.selected = null;
      el('encounter-detail').replaceChildren();
    }
    renderEncounters();
  }

  function renderEncounters() {
    const start = stage.page * pageSize;
    const records = stage.matches.slice(start, start + pageSize);
    el('encounter-list').replaceChildren(...records.map((entry, index) => {
      const button = node('button', entry.title || titles[entry.table] || entry.kind, 'secondary');
      button.append(node('small', (titles[entry.table] || entry.kind) + ' · ' + keyText(entry.key)));
      button.type = 'button';
      button.dataset.index = start + index;
      button.setAttribute('aria-pressed', String(entry === stage.selected));
      return button;
    }));
    const count = stage.matches.length.toLocaleString('zh-CN') + ' 条关卡配置';
    el('encounter-count').textContent = records.length
      ? (stage.matches.length > pageSize ? '显示 ' + (start + 1) + '–' + (start + records.length) + ' / ' : '') + count
      : '没有匹配的关卡配置。';
    el('encounter-prev').disabled = start === 0;
    el('encounter-next').disabled = start + pageSize >= stage.matches.length;
  }

  function openEncounter(entry) {
    el('encounter-family').value = entry.family;
    el('encounter-query').value = keyText(entry.key);
    filterEncounters();
    const index = stage.matches.indexOf(entry);
    if (index < 0) return;
    stage.page = Math.floor(index / pageSize);
    renderEncounters();
    void showEncounter(entry);
    el('encounter-list').querySelector('[aria-pressed="true"]')?.focus();
  }

  function enemyWaves(table, row) {
    if (table === 'BattleMonstersInfo' && Array.isArray(row.MonstersInfos)) {
      return row.MonstersInfos.map(wave => Array.isArray(wave) ? wave.flatMap(slot =>
        Array.isArray(slot) && Number.isSafeInteger(slot[1]) && slot[1] > 0
          ? [{position: slot[0], id: slot[1], level: slot[2]}] : []) : []);
    }
    if (Array.isArray(row.monsterWaves) && row.monsterWaves.every(wave => Array.isArray(wave) &&
        wave.every(item => item == null || Array.isArray(item) && item.length === 2 && Number.isSafeInteger(item[0])))) {
      return row.monsterWaves.map(wave => wave.flatMap((unit, position) =>
        unit && unit[0] > 0 ? [{position: position + 1, id: unit[0], level: unit[1]}] : []));
    }
    if (table === 'dungeon_awake_monster' && Array.isArray(row.monsterids)) {
      return [row.monsterids.flatMap((id, i) => Number.isSafeInteger(id) && id > 0 ? [{id, position:i+1}] : [])];
    }
    return [];
  }

  async function monsterSkills(monster, target) {
    const skillIds = Array.isArray(monster.skill) ? monster.skill : [];
    const pairs = skillIds.flatMap((id, i) =>
      Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(monster.skillLv?.[i]) && monster.skillLv[i] > 0
        ? [[id, monster.skillLv[i]]] : []);
    if (!pairs.length) {target.textContent = '此怪物没有配置技能记录。';return;}
    const refs = pairs.flatMap(pair => [2, -1].map(mode => ({$tuple:[...pair,mode]})));
    try {
      const rows = await api.records('skill',refs);
      const memo = new Map(refs.map((key,i) => [keyText(key),rows[i]]));
      async function inherit(key, depth = 0) {
        const serialized = keyText(key);
        if (!memo.has(serialized)) memo.set(serialized, (await api.records('skill',[key]))[0]);
        const row = memo.get(serialized);
        if (!row || depth === 20 || !Array.isArray(row._proto_key)) return row;
        const result = {...await inherit({$tuple:row._proto_key}, depth+1), ...row};
        for (const field of row.__nullkeys__ ?? []) delete result[field];
        return result;
      }
      const entries = await Promise.all(pairs.map(async ([id,level],i) => {
        const row = await inherit(rows[i*2] ? refs[i*2] : refs[i*2+1]);
        const entry = node('div','','encounter-skill');
        entry.append(node('strong',(row?.skill_name || '技能 '+id) + ' · ' + level + ' 级'));
        const text = row?.combatDesc || row?.desc;
        if (typeof text === 'string' && text.trim()) entry.append(node('p',text));
        return entry;
      }));
      target.replaceChildren(...entries);
    } catch (error) {target.textContent = '技能资料读取失败。' + error.message;}
  }

  function appendWaves(block, waves, monsters) {
    if (!waves.some(wave => wave.length)) return;
    const grid = node('div', '', 'dungeon-encounter-waves');
    for (const [i, units] of waves.entries()) {
      if (!units.length) continue;
      const card = document.createElement('section'), list = document.createElement('ul');
      card.append(node('strong', '编组 ' + (i + 1)), list);
      for (const unit of units) {
        const monster = monsters.get(unit.id);
        const label = [rowTitle(monster) || '怪物 ' + unit.id];
        if (Number.isSafeInteger(unit.level) && unit.level > 0) label.push(unit.level + ' 级');
        if (Number.isSafeInteger(unit.position)) label.push(unit.position + ' 号位');
        const item = document.createElement('li');
        if (monster) {
          const detail = document.createElement('details');
          const skills = node('div','', 'encounter-skills');
          detail.append(node('summary', label.join(' · ')),fieldsFor(monster),skills);
          detail.addEventListener('toggle', () => {
            if (!detail.open || skills.hasChildNodes()) return;
            skills.textContent = '正在读取技能…';
            void monsterSkills(monster,skills);
          });
          const full = node('button','查看怪物配置','secondary');
          full.type='button';
          full.onclick=()=>openRecord('monster',unit.id);
          detail.append(full);
          item.append(detail);
        } else item.textContent=label.join(' · ');
        list.append(item);
      }
      grid.append(card);
    }
    block.append(grid);
  }

  function appendSpecialDetails(block, table, row) {
    if (table === 'normal_battle_config') {
      block.append(node('p', '关卡时限和独立引擎可覆盖模式默认参数。', 'caption'));
    }
    if (table === 'battle_mode_routes') {
      block.append(node('p', '客户端初始注册。组队、远程战斗和独立玩法入口可选用其他引擎或场景。', 'caption'));
      if (row?.scene_module && row.scene_marshal_sha256) {
        const details = document.createElement('details');
        details.append(node('summary','查看场景脚本来源'), node('p', row.scene_module, 'caption'),
          node('code', row.scene_marshal_sha256));
        block.append(details);
      }
    }
    const rule = table === 'system_rule_dsc' ? row?.rule_dsc : table === 'tipsInfoData_cn' ? row : null;
    if (typeof rule === 'string' && rule.trim()) {
      const text = rule.replace(/<\/?(?:green|orange|red|yellow|blue|white|purple)>|<\/>/gi,'').trim();
      block.append(node('p', text, 'encounter-rule-text'));
    }
    if (table !== 'BattleScenesInfo' || !row) return;
    const details = document.createElement('details');
    const slots = document.createElement('dl');
    for (const [prefix, side] of [['My','我方'],['Mon','敌方']]) {
      const format = new RegExp('^'+prefix+'Pos\\d+$');
      const rows = Object.entries(row).filter(([key,value]) => format.test(key) && typeof value === 'string');
      rows.sort(([a],[b]) => Number(a.slice(prefix.length+3))-Number(b.slice(prefix.length+3)));
      for (const [key,value] of rows) slots.append(node('dt', side+' '+key.slice(prefix.length+3)+' 号位'),node('dd',value));
    }
    if (slots.childElementCount) {
      details.append(node('summary','查看站位原始坐标'),slots);
      block.append(details);
    }
  }

  async function showEncounter(entry) {
    if (!entry) return;
    const token = ++stage.token, destination = el('encounter-detail');
    stage.selected = entry;
    for (const button of el('encounter-list').children) {
      button.setAttribute('aria-pressed', String(stage.matches[Number(button.dataset.index)] === entry));
    }
    const header = node('h3', entry.title || titles[entry.table] || entry.kind);
    destination.replaceChildren(header, node('p', '正在读取关卡与关联资料…', 'caption'));
    const refs = [{table:entry.table,key:entry.key,label:'关卡配置',primary:true,found:true}, ...entry.refs];
    const records = await Promise.allSettled(refs.map(ref => ref.found ? api.records(ref.table, [ref.key]) : null));
    if (token !== stage.token) return;
    const groups = refs.map((ref,i) => {
      const row = records[i].value?.[0];
      return {ref, row, error:records[i].reason?.message, waves:row ? enemyWaves(ref.table,row) : []};
    });
    const ids = [...new Set(groups.flatMap(group => group.waves.flat(2).map(unit => unit.id)))];
    const monsters = new Map();
    if (state.index.tables.some(t => t.name === 'monster' && t.status === 'decoded')) {
      await Promise.all(Array.from({length:Math.ceil(ids.length/64)}, async (_,index) => {
        const chunk = ids.slice(index*64,index*64+64);
        try {
          const rows = await api.records('monster', chunk);
          chunk.forEach((id,i) => {if (rows[i]) monsters.set(id,rows[i]);});
        } catch { /* numeric identities remain available in the source */ }
      }));
    }
    if (token !== stage.token) return;
    destination.replaceChildren(header, node('p', (titles[entry.table] || entry.kind) + ' · ' + keyText(entry.key), 'caption'));
    for (const {ref,row,error,waves} of groups) {
      const block = node('section', '', 'encounter-source');
      const heading = ref.primary?[ref.label]:[ref.label, rowTitle(row), keyText(ref.key)].filter(Boolean);
      block.append(node('h4', heading.join(' · ')));
      if (!row) {
        block.append(node('p', error ? '资料读取失败。' + error : '本资源中未找到对应记录。', 'caption'));
        destination.append(block);
        continue;
      }
      const fields = fieldsFor(row, ref.table);
      if (fields.childElementCount) block.append(fields);
      appendSpecialDetails(block, ref.table, row);
      appendWaves(block,waves,monsters);
      const details = document.createElement('details');
      const source = state.index.tables.find(t => t.name === ref.table)?.source;
      details.append(node('summary', '全部原始字段'),
        node('p', [row.route_module ?? source?.module, row.route_sha256 ?? source?.marshalSHA256].filter(Boolean).join(' · '), 'caption'),
        node('pre', JSON.stringify(row,null,2)));
      const browse = node('button', '在资料表中查看', 'secondary');
      browse.type = 'button';
      browse.onclick = () => openRecord(ref.table, ref.key);
      block.append(details, browse);
      const linkedEncounter = !ref.primary && stage.byKey.get(entryKey(ref));
      if (linkedEncounter) {
        const view = node('button', '查看关联关卡', 'secondary');
        view.type = 'button';
        view.onclick = () => openEncounter(linkedEncounter);
        block.append(view);
      }
      destination.append(block);
    }
  }

  async function selectTable(name, key = '') {
    const token = ++state.token;
    const entry = state.index?.tables.find(row => row.name === name);
    Object.assign(state, { entry, rows: [], matches: [], page: 0, selected: -1 });
    el('records').hidden = true;
    el('detail').replaceChildren();
    el('row-query').value = key;
    el('source').textContent = [entry?.source?.module, entry?.source?.marshalSHA256 && 'SHA-256 ' + entry.source.marshalSHA256]
      .filter(Boolean).join(' · ');
    el('status').textContent = '';
    if (!entry) return;
    if (entry.status !== 'decoded') {
      el('status').textContent = '这张表的规则暂未提取，已保留来源以便核查。';
      return;
    }
    el('status').textContent = '正在读取资料表…';
    try {
      const text = await api.table(entry.name);
      if (token !== state.token) return;
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || rows.length !== entry.rowCount) throw new Error('记录数量与索引不一致');
      state.rows = rows;
      el('status').textContent = '';
      el('records').hidden = false;
      filterRows();
      const exact = key && rows.findIndex(([id]) => keyText(id) === key);
      if (key && exact >= 0) {
        state.page = Math.floor(state.matches.indexOf(exact) / pageSize);
        renderRows();
        selectRow(exact);
      } else if (key) {
        el('status').textContent = '本版本未找到关联记录 ' + key + '。';
      }
    } catch (error) {
      if (token === state.token) el('status').textContent = '资料表读取失败。' + error.message;
    }
  }

  function filterTables(preferred = '', open = true) {
    const group = el('family').value;
    const query = normalized(el('query').value);
    const field = el('table');
    const tables = state.index.tables.filter(row => (!group || group === row.family)
      && normalized([row.name, titles[row.name], ...(row.fields ?? [])].join(' ')).includes(query));
    const current = preferred || field.value;
    field.replaceChildren(option(tables.length ? '选择资料表（' + tables.length + ' 张）' : '没有匹配的资料表', ''),
      ...tables.map(row => option(
        (titles[row.name] ? titles[row.name] + ' · ' : '') + row.name
        + (row.status === 'decoded' ? '（' + row.rowCount.toLocaleString('zh-CN') + '）' : '（待解析）'), row.name)));
    field.value = tables.some(row => row.name === current) ? current : '';
    if (open && field.value !== state.entry?.name) void selectTable(field.value);
  }

  function filterRows() {
    const query = normalized(el('row-query').value);
    state.matches = [];
    state.rows.forEach(([key, row], index) => {
      if (normalized(keyText(key) + ' ' + rowTitle(row)).includes(query)) state.matches.push(index);
    });
    state.page = 0;
    if (!state.matches.includes(state.selected)) {
      state.selected = -1;
      el('detail').replaceChildren();
    }
    renderRows();
  }

  function renderRows() {
    const start = state.page * pageSize;
    const matches = state.matches.slice(start, start + pageSize);
    const list = matches.map(index => {
      const [key, row] = state.rows[index];
      const label = rowTitle(row);
      const button = node('button', label ? label + ' · ' + keyText(key) : keyText(key), 'secondary');
      button.type = 'button';
      button.dataset.row = index;
      button.setAttribute('aria-pressed', String(index === state.selected));
      return button;
    });
    el('list').replaceChildren(...list);
    el('count').textContent = matches.length ? '显示 ' + (start + 1) + '–' + (start + matches.length)
      + ' / ' + state.matches.length.toLocaleString('zh-CN') + ' 条' : '没有匹配记录，试试记录 ID。';
    el('prev').disabled = state.page === 0;
    el('next').disabled = start + pageSize >= state.matches.length;
  }

  function selectRow(index) {
    state.selected = index;
    for (const button of el('list').children) button.setAttribute('aria-pressed', String(Number(button.dataset.row) === index));
    const [key, row] = state.rows[index];
    const details = el('detail');
    const fields = fieldsFor(row, state.entry.name);
    const raw = document.createElement('details');
    raw.append(node('summary', '查看全部原始字段'), node('pre', JSON.stringify(row, null, 2)));
    details.replaceChildren(node('h3', rowTitle(row) || '记录 ' + keyText(key)));
    if (fields.childElementCount) details.append(fields);
    appendSpecialDetails(details, state.entry.name, row);
    const [field, destination, label] = links[state.entry.name] ?? [];
    const related = row?.[field];
    if (related != null && state.index.tables.some(entry => entry.name === destination && entry.status === 'decoded')) {
      const link = node('button', label + ' ' + related, 'secondary');
      link.type = 'button';
      link.onclick = () => openRecord(destination, related);
      details.append(link);
    }
    details.append(raw);
  }

  function setIndex(index) {
    state.index = index;
    ++state.token;
    Object.assign(stage,{token:stage.token+1,loading:false,rows:null,byKey:new Map(),matches:[],page:0,selected:null});
    el('encounter-detail').replaceChildren();
    el('encounter-list').replaceChildren();
    el('encounter-family').value = el('encounter-query').value = '';
    el('modes').hidden = !index?.encounters;
    el('version').textContent = index ? '资源 ' + index.resourceVersion + ' · '
      + index.tables.length.toLocaleString('zh-CN') + ' 张资料表'
      + (index.encounters ? ' · ' + index.encounters.rowCount.toLocaleString('zh-CN') + ' 条关卡配置（含历史与内部配置）' : '')
      + ' · 开放状态以区服和游戏内活动为准'
      : '请选择本机解包产生的副本资料目录。';
    if (!index) {setMode('tables');return;}
    el('status').textContent = '';
    el('family').value = el('query').value = '';
    state.entry = null;
    el('records').hidden = true;
    filterTables(index.tables.some(row => row.name === 'pve_stage_data') ? 'pve_stage_data' : '', !index.encounters);
    setMode(index.encounters?'encounters':'tables');
  }

  if (!api) {
    el('choose').hidden = true;
    el('version').textContent = '请在御契桌面版打开离线副本资料。';
    return;
  }
  panel.addEventListener('toggle', () => {
    if (panel.open && !state.index) api.index().then(setIndex).catch(error => {
      el('status').textContent = '无法读取副本资料。' + error.message;
    });
  });
  el('choose').onclick = async () => {
    el('choose').disabled = true;
    try {
      const index = await api.choose();
      if (index) setIndex(index);
    } catch (error) {
      el('status').textContent = '无法打开副本资料目录。' + error.message;
    } finally {
      el('choose').disabled = false;
    }
  };
  el('mode-encounters').onclick = () => setMode('encounters');
  el('mode-tables').onclick = () => {
    setMode('tables');
    if (!state.entry && el('table').value) void selectTable(el('table').value);
  };
  el('encounter-family').onchange = filterEncounters;
  el('encounter-query').oninput = filterEncounters;
  el('encounter-list').onclick = event => {
    const button = event.target.closest('button[data-index]');
    if (button) void showEncounter(stage.matches[Number(button.dataset.index)]);
  };
  el('encounter-prev').onclick = () => {stage.page--;renderEncounters();};
  el('encounter-next').onclick = () => {stage.page++;renderEncounters();};
  el('table').onchange = event => { void selectTable(event.target.value); };
  el('family').onchange = () => filterTables();
  el('query').oninput = () => filterTables();
  el('row-query').oninput = filterRows;
  el('list').onclick = event => {
    const button = event.target.closest('button[data-row]');
    if (button) selectRow(Number(button.dataset.row));
  };
  el('prev').onclick = () => { state.page--; renderRows(); };
  el('next').onclick = () => { state.page++; renderRows(); };
})();
