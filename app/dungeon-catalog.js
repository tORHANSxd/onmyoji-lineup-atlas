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
    map_boss: '地图首领入口',
    dungeon_awake: '觉醒副本',
    dungeon_challenge: '秘闻副本',
    dungeon_challenge_race: '秘闻竞速',
    dungeon_challenge_series: '秘闻关卡与独立规则',
    dungeon_yuling: '御灵副本',
    guild_crevice_battle: '阴阳寮狭间暗域战斗',
    guild_boss_show: '阴阳寮首领退治规则',
    guild_boss_reward: '阴阳寮首领奖励',
    gve_battleinfo: '麒麟狩猎战斗配置',
    boss_info: '退治首领阶段参数',
    raid_info: '首领池与难度配置',
    boss_troops: '首领机关编组',
    active_time: '玩法开放时间表',
    guild_dinner_monster: '阴阳寮宴会首领',
    act_team_battle: '活动组队战斗',
    journey_hardbattle: '京畿净化首领挑战',
    journey_normalbattle_jinbi: '京畿净化战斗参数 · 金币',
    journey_normalbattle_jingyan: '京畿净化战斗参数 · 经验',
    journey_normalbattle_yuhun: '京畿净化战斗参数 · 御魂',
    journey_normalbattle_juexing: '京畿净化战斗参数 · 觉醒',
    MZB_fengmo: '逢魔木桩练习',
    event4: '逢魔实战首领',
    event4_honor_limit: '极逢魔实战门槛',
    event4_timescore: '逢魔用时积分',
    event4_rankscore: '逢魔名次积分',
    event4_damage_rank2: '极逢魔名次奖励',
    lbs_world_boss_area: '地域鬼王',
    lbs_world_boss_init: '地域鬼王地图分区',
    lbs_world_boss_type: '地域鬼王普通特殊条件',
    shilian_stage_detail: '六道之门关卡规则',
    shilian_event_battles: '六道之门战斗配置',
    shilian_event_exam: '六道之门试炼关卡',
    shilian_liudao: '六道之门路线',
    shilian_area: '六道之门岛屿',
    shilian_level: '六道之门结算评级',
    shilian_event_campsit: '六道之门营地商品',
    shilian_event_chest: '六道之门宝匣',
    shilian_event_question: '六道之门奇遇',
    shilian_yanling_event: '六道之门真言塔事件',
    activity: '活动开放配置',
    storyChapter: '探索章节',
    mapnpc: '地图探索入口',
    story_room: '探索战斗点',
    BossTower: '探索式神挑战',
    DramaProcess: '主线剧情进程',
    DramaLevel: '剧情关卡',
    hunling_noraml_boss_battle: '契灵之境首领奖励',
    hunling_jijie_boss_battle: '契灵集结首领奖励',
    hunling_tansuo: '契灵探查地区',
    hunling_base: '契灵首领与收服规则',
    hunling_tansuo_lv: '契灵探查等级与星级池',
    hunling_prop: '契灵收服式盘',
    hunling_weak_soul: '契灵收服缘分',
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
    open_week_day: '开放星期索引', open_time: '开放时段',
    guild_boss_hard_limit: '首领退治最高难度',
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
  const tableFields = {
    SuperGhost_mission: {crazy_time:'单次追击时限',private_time:'发现者专属时长',remain_time:'首领剩余时长',
      minus_fatigue:'疲劳参数',spec_skill:'任务表词条',gk_list:'敌方编组',score_mul:'积分系数',help_mul:'协战系数'},
    SuperGhost_bossmission: {challenge_time:'历史挑战时限',begin_time:'开放时间',end_time:'结束时间',
      cost:'入场消耗',first_rewardid:'首次奖励编号',rewardid:'奖励编号',gk_list:'敌方编组'},
    super_ghost_hjs_special_attack: {begin_time:'特攻开始时间',end_time:'特攻结束时间',hero_group:'特攻分组'},
    super_ghost_hjs_special_attack_group: {hero_list:'特攻式神 ID',value:'攻防加成系数',desc:'原版增益说明'},
    hunling_base: {battle_tips:'共鸣规则',shoufu_tips:'首领机制'},
    hunling_tansuo_lv: {hunling_begin_star:'低星与权重',hunling_end_star:'高星与权重',need_exp:'探查经验门槛'},
    hunling_prop: {base_rate:'按探查等级的基础概率',times:'最多使用次数'},
    hunling_weak_soul: {weak_hero_ids:'缘分式神 ID',add_rate:'每个缘分式神的概率加成系数'},
    map_boss: {countlmt: '配置奖励次数', gk_base_id: '基础关卡 ID', gk_list: '原版关卡配置'},
    lbs_world_boss_area: {dist_id: '分区 ID', progress: '配置进度', reward: '世界排名奖励类型', group_reward: '分组奖励类型'},
    lbs_world_boss_init: {dist_name: '分区'},
    lbs_world_boss_type: {desc: '原版条件模板', detail: '战斗内条件提示模板', p1: '参数池 1', p2: '参数池 2', type: '条件类型'},
    team_assist_stage: {search_id: '阵容码检索 ID', ss_num: '式神人数', yys_num: '阴阳师人数'},
    shilian_liudao: {hero: '可选试炼式神 ID', system_hero: '原表系统试炼式神开关', guard_id: '助战守护 ID', pve_id: '路线配置 PvE'},
    shilian_stage_detail: {mode: '关卡规则类型', desc: '玩法说明', body: '规则正文', skills: '关联技能'},
    shilian_event_exam: {battle_name: '试炼首领', battle_type: '战斗类型', drop_show: '奖励预览'},
    shilian_event_battles: {group_id: '候选组', battle_type: '战斗类型', battle_rate: '候选权重', drop_show: '奖励预览'},
    shilian_area: {type: '岛屿类型', subtype: '岛屿子类型', event_group: '事件组', desc: '玩法说明', can_leave: '可离开'},
    shilian_level: {grade_str: '评级', min: '下限', max: '上限', desc: '评级说明'},
    shilian_event_campsit: {group_id: '候选组', item_id: '商品 ID', money_id: '货币 ID', price: '价格', weight: '权重'},
    shilian_event_chest: {group_id: '候选组', chest_rate: '出现权重', drop_desc: '宝匣奖励'},
    shilian_event_question: {desc: '奇遇说明', option_infos: '可选项', drop_show: '奖励预览'},
    shilian_yanling_event: {desc: '事件说明', params: '原版事件参数', tips: '事件提示'},
  };
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
  const openingNumber = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
  const entryKey = ({table, key}) => JSON.stringify([table, key]);
  const rowTitle = row => [row?.name, row?.title, row?.title_name, row?.boss_name, row?.area_name, row?.chapter_name, row?.floordesc,
    row?.typedesc, row?.skill_name, row?.StoryName, row?.MapEntryID != null ? row.desc : null]
    .find(value => typeof value === 'string' && value.trim()) || '';

  function fieldsFor(row, table) {
    const fields = document.createElement('dl');
    const displayLabels = table?.startsWith('journey_normalbattle_') ? {...labels, ...journeyVariantFields} :
      table === 'journey_hardbattle' ? {...labels, ...journeyBossFields} :
      table === 'dungeon_yuling' ? {...labels,strength:'原表体力字段'} :
      Object.hasOwn(tableFields, table) ? {...labels, ...tableFields[table]} : labels;
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
    } else window.AtlasPveWorkbench?.cancel();
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
      const yanwu = matchesOpeningSource(window.AtlasFengmoYanwu)?window.AtlasFengmoYanwu.routes:{};
      const practice=matchesOpeningSource(window.AtlasTuzhizhuPractice)?window.AtlasTuzhizhuPractice:null;
      const live=window.AtlasFengmoLive;
      const liveEntries=matchesOpeningSource(live)?live.encounters(new Set(snapshot.tables.filter(table=>table.status==='decoded').map(table=>table.name))):[];
      stage.rows = [...payload.entries,...liveEntries].map(record => {
        const entry=withPracticeReferences(record,practice);
        const battle = entry.table==='act_team_battle'&&yanwu[entry.refs.find(ref=>ref.table==='pve_stage_data')?.key];
        const title = battle?`逢魔演武·${battle.name}`:entry.title;
        const alias=entry.kind==='真·八岐大蛇'?'真蛇 真八岐大蛇':entry.table==='hunling_boss'?'契灵集结':'';
        return {...entry,title,search:normalized(
          [title, entry.kind, titles[entry.table], entry.table, keyText(entry.key), alias, ...entry.refs.map(ref => keyText(ref.key))].join(' ')
        )};
      }).sort((a,b) => order.indexOf(a.family) - order.indexOf(b.family));
      stage.byKey = new Map(stage.rows.map(entry => [entryKey(entry), entry]));
      filterEncounters();
    } catch (error) {
      if (snapshot === state.index) el('encounter-count').textContent = '关卡索引读取失败。' + error.message;
    } finally {
      if (snapshot === state.index) stage.loading = false;
    }
  }

  function filterEncounters(relatedEntry) {
    if (!stage.rows) return;
    const family = el('encounter-family').value;
    const words = normalized(el('encounter-query').value).split(/\s+/);
    stage.matches = relatedEntry ? [relatedEntry] : stage.rows.filter(record => (!family || record.family === family) &&
      words.every(word => record.search.includes(word)));
    const ids = words.filter(word => /^\d+$/.test(word));
    if (!relatedEntry && ids.length) {
      const exact = record => Number(ids.includes(keyText(record.key)));
      stage.matches.sort((first,second)=>exact(second)-exact(first));
    }
    stage.page = 0;
    if (!stage.matches.includes(stage.selected)) {
      window.AtlasPveWorkbench?.unmount();
      stage.token++;
      stage.selected = null;
      el('encounter-detail').replaceChildren();
    }
    renderEncounters();
  }

  function renderEncounters() {
    const start = stage.page * pageSize;
    const records = stage.matches.slice(start, start + pageSize);
    const secret = window.AtlasSecretOpenings;
    const secretFloors = matchesOpeningSource(secret) ? secret.floors : {};
    const entranceNames = {solo:'单人',team:'组队',race:'竞速'};
    el('encounter-list').replaceChildren(...records.map((entry, index) => {
      const button = node('button', entry.title || titles[entry.table] || entry.kind, 'secondary');
      const entrance=entry.table==='dungeon_challenge_series'&&entranceNames[secretFloors[entry.key]?.entrance];
      const metadata=[encounterKind(entry),encounterKeyLabel(entry),entrance].filter(Boolean).join(' · ');
      button.append(node('small',metadata));
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
    el('encounter-query').value = entry.title || keyText(entry.key);
    filterEncounters(entry);
    void showEncounter(entry);
    el('encounter-list').querySelector('[aria-pressed="true"]')?.focus();
  }

  function enemyWaves(table, row) {
    if (['SuperGhost_mission','SuperGhost_bossmission'].includes(table)&&Array.isArray(row.gk_list)) {
      return [row.gk_list.flatMap((unit,i)=>Number.isSafeInteger(unit?.[0])&&unit[0]>0&&Number.isSafeInteger(unit[1])?
        [{position:i+1,id:unit[0],level:unit[1]}]:[])];
    }
    if (table==='gve_battleinfo'&&row.difficulty!==100&&Array.isArray(row.monsters)) {
      return [row.monsters.map(([id,level],index)=>({id,level,position:index+1}))];
    }
    if (table==='boss_troops'&&Array.isArray(row.monsterWaves)&&row.monsterWaves.every(unit=>Array.isArray(unit)&&unit.length===4)) {
      return [row.monsterWaves.map(([id,position,camp,level])=>({id,position,level,side:camp===1?'我方':camp===2?'敌方':''}))];
    }
    if (table === 'BattleMonstersInfo' && Array.isArray(row.MonstersInfos)) {
      return row.MonstersInfos.map(wave => Array.isArray(wave) ? wave.flatMap(slot =>
        Array.isArray(slot) && Number.isSafeInteger(slot[1]) && slot[1] > 0
          ? [{position: slot[0], id: slot[1], level: slot[2]}] : []) : []);
    }
    if (Array.isArray(row.monsterWaves) && row.monsterWaves.every(wave => Array.isArray(wave) &&
        wave.every(item => item == null || Array.isArray(item) && item.length === 2 && Number.isSafeInteger(item[0])))) {
      return row.monsterWaves.map(wave => wave.flatMap((unit, position) => {
        if (!unit) return [];
        const copy = table==='dungeon_challenge_series'&&unit[0]===-1;
        return unit[0]>0||copy ? [{position:position+1,id:unit[0],level:unit[1],copy}] : [];
      }));
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
        const text = row?.desc && /\[s_.+?\]/.test(row.combatDesc) ? row.desc : row?.combatDesc || row?.desc;
        if (typeof text === 'string' && text.trim()) entry.append(node('p',text));
        return entry;
      }));
      target.replaceChildren(...entries);
    } catch (error) {target.textContent = '技能资料读取失败。' + error.message;}
  }

  function appendWaves(block, waves, monsters, sequential=false, first=1) {
    if (!waves.some(wave => wave.length)) return;
    const grid = node('div', '', 'dungeon-encounter-waves');
    for (const [i, units] of waves.entries()) {
      if (!units.length) continue;
      const card = document.createElement('section'), list = document.createElement('ul');
      card.append(node('strong', sequential?`第 ${i+first} 波`:'编组 ' + (i+first)), list);
      for (const unit of units) {
        const monster = monsters.get(unit.id);
        const label = [unit.copy?`复制我方 ${unit.position} 号位`:rowTitle(monster) || '怪物 ' + unit.id];
        if(unit.side)label.push(unit.side);
        if (Number.isSafeInteger(unit.level) && unit.level > 0) label.push(unit.level + ' 级');
        if (Number.isSafeInteger(unit.position)) label.push(unit.position + ' 号位');
        if (unit.opening) label.push('开场速度 ' + openingNumber.format(unit.opening.speed));
        const item = document.createElement('li');
        if (monster) {
          const detail = document.createElement('details');
          const skills = node('div','', 'encounter-skills');
          detail.append(node('summary', label.join(' · ')));
          if (unit.opening) {
            const stats = unit.opening;
            const text = [['生命',stats.hp],['攻击',stats.attack],['防御',stats.defense],['暴击',100*stats.critRate]]
              .map(([key,value])=>key+' '+openingNumber.format(value)+(key==='暴击'?'%':'')).join(' · ');
            detail.append(node('p','原版开场 · '+text,'caption'));
          }
          detail.append(fieldsFor(monster),skills);
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
    if (table === 'lbs_world_boss_area') {
      block.append(node('p', '普通难度的每日条件及其实际参数由服务器下发。下方列出客户端静态候选、权重及原版引擎。', 'caption'));
    }
    if (table === 'battle_mode_routes' && row?.mode_symbol === 'MODE_LBS_WORLD_BOSSX') {
      block.append(node('p', '极难入口额外提交挑战星级和玩家勾选的词条。部分词条会改变计分或胜负条件。', 'caption'));
    }
    if (table === 'skill' && (row?.combatDesc || row?.desc)) {
      block.append(node('p', row.combatDesc || row.desc, 'encounter-rule-text'));
    }
    if(table==='dungeon_challenge_series'&&matchesOpeningSource(window.AtlasSecretOpenings)){
      if(row.type===20)block.append(node('p','原版召唤裁判，选技时限为 45 秒。','caption'));
      const protection=AtlasSecretOpenings.floors[row.id]?.protection;
      if(protection){
        const support=node('button','查看鲤鱼精配置','secondary');
        support.type='button';
        support.onclick=()=>openRecord('monster',protection.supportId);
        const target=node('button','查看河童配置','secondary');
        target.type='button';
        target.onclick=()=>openRecord('monster',protection.targetId);
        block.append(node('p','开场在我方 101 号位召唤 40 级六星鲤鱼精。鲤鱼精或敌方河童阵亡时可判负，敌方仅剩存活河童时可判胜。','caption'),support,target);
      }
    }
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

  function matchesOpeningSource(source) {
    return source?.resourceVersion===state.index.resourceVersion&&
      Object.entries(source.tableSHA256).every(([name,hash])=>
        state.index.tables.find(table=>table.name===name)?.source?.marshalSHA256===hash);
  }

  function encounterKind(entry) {
    return entry.fengmoLive||['阴界之门入口','妖气封印'].includes(entry.kind)||
      entry.table==='pve_stage_data'&&['daily','guild'].includes(entry.family)?entry.kind:titles[entry.table]||entry.kind;
  }

  function encounterKeyLabel(entry){
    return entry.fengmoLive?`事件 ${entry.fengmoLive.eventId}`:keyText(entry.key);
  }

  function awakeOpening(entry,groups) {
    const source = window.AtlasAwakeOpenings;
    if (entry.table!=='dungeon_awake'||!matchesOpeningSource(source)) return null;
    const opening=source.floors[entry.key],config=groups[0].row;
    const formation=groups.find(group=>group.ref.table==='dungeon_awake_monster');
    const scene=groups.find(group=>group.ref.table==='dungeon_awake_scene');
    if (!opening||config?.monsterid!==opening.groupId||formation?.ref.key!==opening.groupId||
        scene?.row?.sceneid!==opening.sceneId||!Array.isArray(formation.row?.monsterids)||
        formation.row.monsterids.length!==opening.enemies.length||
        !opening.enemies.every((unit,i)=>unit.id===formation.row.monsterids[i]&&unit.position===i+1&&unit.level===config.level)) return null;
    formation.waves=[opening.enemies.map(unit=>({...unit,opening:unit}))];
    return opening;
  }

  function secretOpening(entry,group) {
    const source=window.AtlasSecretOpenings;
    if(entry.table!=='dungeon_challenge_series'||!matchesOpeningSource(source))return null;
    const opening=source.floors[entry.key],waves=group.waves.filter(wave=>wave.length>0);
    if(!opening||opening.sceneId!==group.row?.scene||waves.length!==opening.waves.length||
       (opening.entrance==='race')!==(group.row.advanced===1)||
       (group.row.type===19?!opening.replacement:(opening.replacement?.templateId??0)!==(group.row.yys_replacement_id??0))||
       !opening.waves.every((wave,i)=>wave.length===waves[i].length&&wave.every((unit,j)=>
         ['id','position','level'].every(key=>unit[key]===waves[i][j][key]))))return null;
    group.waves=opening.waves.map(wave=>wave.map(unit=>unit.id===-1?{...unit,copy:true}:{...unit,opening:unit}));
    return opening;
  }

  function showResourceEncounter(destination,stageId,row,formation){
    const source=window.AtlasResourceEncounters;
    if(!matchesOpeningSource(source))return;
    const resource=source.routes[stageId];
    if(!resource)return;
    const {ids=[resource.enemy.id],enemy}=resource;
    const initial=formation?.waves[0];
    if(row.groupid!==resource.groupId||formation?.row?.resindex!==resource.sceneId||formation.waves.length!==1||
       initial?.length!==ids.length||row.shishentotal!==resource.memberCount||
       !initial.every((unit,i)=>unit.id===ids[i]&&unit.position===i+1&&unit.level===enemy.level))return;
    formation.waves=[initial.map(unit=>({...unit,opening:enemy}))];
    const label=resource===source.firstExperience?'新服首次经验妖怪':resource.requiredKills?'普通经验妖怪':'金币妖怪';
    const goal=resource.requiredKills?`击杀 ${resource.requiredKills} 只 · 首批 ${ids.length} 只 · 击杀后补位`:'击破首领';
    destination.append(node('p',`${label} · ${goal} · 强制自动战斗 · 引擎时限 ${resource.deadlineSeconds} 秒 · 4 个观战位`,'caption'));
    if(resource.reinforcementIds)destination.append(node('p','原版补怪池包含 23 种模板。单队复跑会按种子抽取补怪。','caption'));
    if(resource.baseRange)destination.append(node('p','金币预览随首领剩余生命变化，基础金币为 5,000–7,500。战报同时给出基础金币取下限的预览。','caption'));
    window.AtlasPveWorkbench?.mount(destination,{...resource,label,version:source.resourceVersion,openingSpeed:enemy.speed});
  }

  function showYulingEncounter(destination,entry,group){
    const source=window.AtlasYulingOpenings;
    if(entry.table!=='dungeon_yuling'||!matchesOpeningSource(source))return;
    const opening=source.floors[entry.key],initial=group.waves[0],config=group.row;
    if(!opening||opening.sceneId!==config?.scene||group.waves.length!==1||initial.length!==opening.enemies.length||
       !opening.enemies.every((unit,i)=>['id','position','level'].every(key=>unit[key]===initial[i][key])))return;
    group.waves=[opening.enemies.map(unit=>({...unit,opening:unit}))];
    const codeScene=DATA.gameConfig.stages[opening.codeStageId],ticket=config.menpiao?.[1];
    destination.append(node('p',`1 波 · 我方开场 ${opening.allyOrbs} 火 · 敌方开场 ${opening.enemyOrbs} 火 · `+
      `消耗 ${ticket} 张御灵境之钥 · 阴阳师 ${source.minPlayerLevel} 级 · 御灵 ${source.minGuardianLevel} 级`,'caption'));
    destination.append(node('p','小纸人不能被敌方选中或标记，只有第一只参与行动。首领会反击，并随战斗推进强化。','caption'));
    window.AtlasPveWorkbench?.mount(destination,{stageId:Number(entry.key),groupId:Number(entry.key),memberCount:5,
      battleMode:267,waveCount:1,label:'御灵单人配装',version:source.resourceVersion,
      codeStageId:codeScene?.actors===1&&codeScene.shikigami===5?opening.codeStageId:null,codeLabel:codeScene?.name,
      openingSpeed:opening.enemies[0].speed});
  }

  function showGuildHunt(destination,entry,group){
    const source=window.AtlasGuildHuntOpenings;
    if(entry.table!=='gve_battleinfo'||!matchesOpeningSource(source))return;
    const opening=source.floors[entry.key],unit=group.waves[0]?.[0];
    if(!opening||!unit||opening.sceneId!==group.row?.scene||
       !['id','position','level'].every(key=>unit[key]===opening.enemy[key]))return;
    group.waves=[[{...unit,opening:opening.enemy}]];
    destination.append(node('p',`挑战时限 240 秒 · 我方开场 ${opening.allyOrbs} 火 · 敌方开场 ${opening.enemyOrbs} 火`,'caption'));
    if(group.row.difficulty===6)destination.append(node('p','30 秒和 150 秒触发分裂，击败两只小麒麟解除。90 秒触发属性召唤。','caption'));
    destination.append(node('p','个人伤害可以计入寮内结算。战报另外记录首领是否清场。离线复跑只用五位自有式神。','caption'));
    const stageId=Number(entry.key),scene=DATA.gameConfig.stages[opening.codeStageId];
    window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:stageId,memberCount:5,battleMode:2000,waveCount:1,
      label:'麒麟狩猎个人成绩',version:source.resourceVersion,openingSpeed:opening.enemy.speed,
      scoreWindowSeconds:240,
      codeStageId:scene?.actors===1&&scene.shikigami===5?opening.codeStageId:null,codeLabel:scene?.name});
  }

  function showFengmoYanwu(destination,groups){
    const source=window.AtlasFengmoYanwu;
    if(!matchesOpeningSource(source))return false;
    const config=groups.find(group=>group.ref.table==='pve_stage_data')?.row;
    const stageId=Number(config?.id),entry=source.routes[stageId];
    if(!entry)return false;
    const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===config.groupid);
    if(config.groupid!==stageId||formation?.row?.resindex!==entry.sceneId||
       formation.waves.length!==1||formation.waves[0][0]?.id!==entry.bossId)return false;
    const activity=groups.find(group=>group.ref.table==='act_team_battle')?.row;
    if(activity&&(activity.act_id!==entry.actId||activity.team_battle_type!==source.teamType))return false;
    destination.append(node('p',`单人演练 · 计分时限 300 秒 · 自有式神 ${entry.memberCount} 位 · 伊吹固定支援`,'caption'),
      node('p','使用本地队伍的原版个人伤害。超时未清场仍可计分。活动开放时间以关联的原表为准。','caption'));
    const scene=DATA.gameConfig.stages[entry.codeStageId];
    window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:stageId,memberCount:entry.memberCount,
      battleMode:source.battleMode,waveCount:1,label:`逢魔演武·${entry.name}个人伤害`,version:source.resourceVersion,
      scoreWindowSeconds:300,
      codeStageId:scene?.actors===1&&scene.shikigami===entry.memberCount?entry.codeStageId:null,codeLabel:scene?.name});
    return true;
  }

  function showActivityScore(destination,entry,groups){
    if(!['act_team_battle','pve_stage_data'].includes(entry.table))return;
    const activity=entry.table==='act_team_battle'?groups[0].row:null;
    const trial=AtlasGeneralSoulTrial.stages[activity?.battle_id??Number(entry.key)];
    if(!trial||!matchesOpeningSource(trial))return;
    const stage=groups.find(group=>group.ref.table==='pve_stage_data')?.row;
    const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===trial.stageId);
    if(activity&&(activity.id!==trial.activityRow||activity.act_id!==trial.actId||activity.team_battle_type!==trial.teamType)||
       stage?.groupid!==trial.stageId||stage.shishentotal!==trial.memberCount||formation?.row?.resindex!==trial.sceneId||
       formation.waves.length!==1||formation.waves[0].map(unit=>unit.id).join()!==trial.enemies.join())return;
    if(trial.playerCount){
      destination.append(node('p',`原版组队入口 · ${trial.playerCount} 名玩家 · 关卡时限 ${trial.deadlineSeconds} 秒。组队模拟需要当局队友阵容及入场状态。`,'caption'));
      return;
    }
    const scene=DATA.gameConfig.stages[trial.codeStageId];
    if(scene?.actors!==1||scene.shikigami!==trial.memberCount)return;
    destination.append(node('p',`可用已知阵容离线模拟活动的单人挑战，按原版 ${trial.deadlineSeconds} 秒时限统计个人伤害。`,'caption'));
    window.AtlasPveWorkbench?.mount(destination,{stageId:trial.stageId,groupId:trial.stageId,memberCount:trial.memberCount,
      battleMode:trial.battleMode,waveCount:1,label:`${trial.label} · 单人个人伤害`,version:trial.resourceVersion,
      scoreWindowSeconds:trial.deadlineSeconds,codeStageId:trial.codeStageId,codeLabel:scene.name});
  }

  function showJourneyHard(destination,entry,groups){
    const source=window.AtlasJourneyHard;
    if(entry.table!=='journey_hardbattle'||!matchesOpeningSource(source))return;
    const challenge=groups[0].row,stageId=challenge?.battle_id,route=source.routes[stageId];
    const stage=groups.find(group=>group.ref.table==='pve_stage_data')?.row;
    const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===stageId);
    if(challenge?.id!==route?.challengeId||!route||stage?.groupid!==stageId||stage.shishentotal!==source.memberCount||
       formation?.row?.resindex!==source.sceneId||formation.waves.length!==1||
       formation.waves[0].map(unit=>[unit.position,unit.id]).join()!==route.enemies.join())return;
    destination.append(node('p','按当局填写祝福层数和战斗时限。敌方使用本版关卡原表配置。','caption'));
    window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:stageId,memberCount:source.memberCount,
      battleMode:source.battleMode,waveCount:1,label:`京畿净化 · ${challenge.title}`,version:source.resourceVersion,
      journeyHard:true});
  }

  function showTianfa(destination,entry,groups){
    if(!['xinghen_battle','pve_stage_data'].includes(entry.table)||!matchesOpeningSource(AtlasTianfa))return;
    const source=AtlasTianfa,stage=groups.find(group=>group.ref.table==='pve_stage_data')?.row;
    const stageId=Number(stage?.id),route=source.stages[stageId];
    if(!route||stage.groupid!==stageId||stage.shishentotal!==source.memberCount)return;
    const difficulty=groups.find(group=>group.ref.table==='xinghen_battle')?.row;
    const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===stageId);
    if(difficulty&&(difficulty.difficulty!==route.difficulty||difficulty.stage_id!==stageId)||
       formation?.row?.resindex!==source.sceneId||formation.waves.length!==1||
       formation.waves[0].map(unit=>[unit.position,unit.id]).join()!==source.formation(route).join())return;
    const scene=DATA.gameConfig.stages[source.codeStageId];
    if(scene?.actors!==1||scene.shikigami!==source.memberCount)return;
    for(const rule of difficulty?.battle_tips??[])destination.append(node('p',rule,'caption'));
    destination.append(node('p','按原版缺省入场参数模拟单人挑战。原表无战斗时限。','caption'));
    window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:stageId,memberCount:source.memberCount,
      battleMode:source.battleMode,waveCount:1,label:`彼世逢魔 · ${route.name}`,version:source.resourceVersion,
      codeStageId:source.codeStageId,codeLabel:scene.name});
  }

  function liveScoreTable(label,columns,rows){
    const detail=node('details'),table=node('table'),head=node('thead'),heading=node('tr'),body=node('tbody');
    for(const text of columns){
      const column=node('th',text);
      column.scope='col';
      heading.append(column);
    }
    head.append(heading);
    for(const row of rows){
      const line=node('tr');
      line.append(...row.map(value=>node('td',String(value))));
      body.append(line);
    }
    table.append(head,body);
    detail.append(node('summary',label),table);
    return detail;
  }

  function showFengmoLive(destination,entry,groups){
    const scenario=entry.fengmoLive;
    if(!scenario)return;
    const row=(table,key)=>groups.find(group=>group.ref.table===table&&(key===undefined||group.ref.key===key))?.row;
    const event=row('event4'),schedule=row('events',scenario.eventId);
    const formation=row('BattleMonstersInfo',scenario.stage),route=row('battle_mode_routes',scenario.mode);
    if(event?.id!==scenario.eventParam||schedule?.param!==scenario.eventParam||formation?.ID!==scenario.stage||
       scenario.mode&&route?.battleMode!==scenario.mode)return;
    const block=node('section','','encounter-source');
    const days=schedule.rate_extra?.flatMap(([day,weight])=>weight>0&&day>=0&&day<7?['星期'+'一二三四五六日'[day]]:[])??[];
    block.append(node('h4','实战入场与计分'),
      node('p',`原表轮换 ${days.join('、')} · 阴阳师 ${schedule.level} 级 · 客户端人数上限 ${event.limit_user}`,'caption'),
      node('p',`集结模式 ${scenario.rally}${route?` · 战斗模式 ${route.battleMode} · ${route.scene_engine??route.scene_class}`:''}`,'caption'),
      node('p','联机战斗提供共享生命、实时名次和结算。','caption'));
    const byDamage=scenario.soil&&!scenario.hard,extremeSoil=scenario.hard&&scenario.soil;
    const bands=AtlasFengmoLive.ratingBands(event,row('Constant',10761)?.value,scenario);
    const rule=byDamage?'普通土蜘蛛按个人伤害比较评级门槛。':
      '客户端把个人名次积分与队伍用时积分相加。用时按严格大于战报秒数的首档取分；名次先按「名次 × 100 ÷ 总人数」向下取整，再取严格大于该值的首档。';
    block.append(node('p',rule));
    if(extremeSoil){
      const minimum=row('Constant',10760)?.value?.[0];
      if(Number.isFinite(minimum))block.append(node('p',`极土蜘蛛个人伤害低于 ${openingNumber.format(minimum)} 时，两项积分均为 0。`));
    }
    if(bands.length)block.append(liveScoreTable('评级门槛',['评级档位',byDamage?'个人伤害下限':'积分下限'],
     bands.map(({grade,minimum})=>[grade,openingNumber.format(minimum)])));
    const [rate]=row('Constant',228)?.value??[],[,cap]=row('Constant',209)?.value??[];
    const [step,boost,max]=row('Constant',3643)?.value??[];
    if([rate,cap,step,boost,max].every(Number.isFinite)){
      block.append(node('p',`客户端金币预览按 ${rate} × (√(个人伤害 + 2,500) − 50) 取整，基础上限 ${openingNumber.format(cap)}。同寮人数扣除本人后，每 ${step} 人增加 ${openingNumber.format(boost*100)}%，最高 ${openingNumber.format(max*100)}%。`,'caption'));
    }
    if(scenario.hard)block.append(node('p','极词条按服务器周序号与星期索引之和对轮换池长度取余。下方可逐条查看词条技能。','caption'));
    const tables=[
     ...(!byDamage?[['event4_timescore','队伍用时积分表',['秒数档位','积分']],
      ['event4_rankscore','个人名次积分表',['名次百分比档位','积分']]]:[]),
     ...(scenario.hard?[['event4_damage_rank2','个人名次奖励表',['奖档','边界','奖励编号']]]:[]),
    ];
    if(tables.length){
      const details=node('details'),body=node('div');
      details.append(node('summary','查看客户端积分与奖励表'),body);
      details.addEventListener('toggle',async()=>{
        if(!details.open||body.hasChildNodes())return;
        body.textContent='正在读取计分表…';
        try{
          const decoded=await Promise.all(tables.map(([name])=>api.table(name).then(JSON.parse)));
          const names=['特赏·一','特赏·二','特赏·三','大赏','次赏','中赏','末赏'];
          const cards=tables.map(([name,label,columns],index)=>{
            const rows=decoded[index].slice().sort(([a],[b])=>a-b);
            return liveScoreTable(label,columns,rows.map(([key,config])=>name!=='event4_damage_rank2'?[key,config.score]:
             [names[key-1],key<=3?`第 ${key} 名`:`${openingNumber.format(config.right*100)}%`,config['reward_id_'+scenario.eventId]]));
          });
          body.replaceChildren(...cards);
        }catch(error){body.textContent='计分表读取失败。'+error.message;}
      });
      block.append(details);
    }
    destination.append(block);
  }

  function showTuzhizhuPractice(destination,entry,groups){
    const source=window.AtlasTuzhizhuPractice;
    if(entry.table!=='MZB_fengmo'||!matchesOpeningSource(source))return;
    const stageId=Number(entry.key),config=groups[0].row,trait=source.traits[stageId];
    if(trait===undefined||config?.mook_jong_id!==stageId||config.skill_id!==trait)return;
    const battleMode=trait?5551:5550,mode=source.modes[battleMode];
    const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===mode.groupId);
    const traitEntry=groups.find(group=>group.ref.table==='skill'&&group.ref.label==='木桩增益词条')?.row;
    const rules=groups.find(group=>group.ref.table==='normal_battle_config')?.row;
    if(mode.groupId!==config.battle_id||mode.bossId!==config.boss_id||formation?.row?.resindex!==source.sceneId||
       formation.waves[0]?.length!==4||rules?.battleMode!==battleMode||rules.halt_time!==3600||trait&&!traitEntry?.skill_name)return;
    destination.append(node('p','单人木桩 · 一位阴阳师和五位自有式神 · 击破本体、钳、背、脚后结算通关','caption'));
    if(trait)destination.append(node('p',`词条 ${traitEntry.skill_name} · 原版对白茧的处理会影响部位恢复。`,'caption'));
    const scene=DATA.gameConfig.stages[mode.codeStageId];
    window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:mode.groupId,memberCount:5,battleMode,waveCount:1,openingSpeed:mode.bossSpeed,
      label:trait?`极·土蜘蛛木桩 · ${traitEntry.skill_name}`:'普通土蜘蛛木桩',version:source.resourceVersion,
      codeStageId:scene?.actors===1&&scene.shikigami===5?mode.codeStageId:null,
      codeLabel:trait?`极土蜘蛛木桩·${traitEntry.skill_name}`:'土蜘蛛木桩'});
  }

  function withPracticeReferences(entry,source){
    if(entry.table!=='MZB_fengmo'||!source)return entry;
    const trait=source.traits[entry.key];
    if(trait===undefined||entry.refs.some(ref=>ref.table==='normal_battle_config'&&[5550,5551].includes(ref.key)))return entry;
    // Previous catalogs have the same raw tables but omitted practice-specific links.
    const mode=trait?5551:5550,kind='逢魔木桩练习';
    const extras=[
      ['normal_battle_config',mode,'单人木桩默认规则'],
      ['battle_team_routes',mode,'单人木桩入口'],
      ['team_assist_stage',source.modes[mode].codeStageId,'对应阵容码分类'],
      ['fengmo_muzhuang_constant',trait?9:8,'通关所需击破部位'],
    ];
    if(trait)extras.push(['skill',{$tuple:[trait,1,-1]},'木桩增益词条'],
      ['fengmo_muzhuang_constant',5,'白茧等待时限'],['monster',1250179,'白茧（高生命）'],['monster',1250180,'白茧']);
    const title=[kind,trait?'极·土蜘蛛':'土蜘蛛',source.traitNames[trait]].filter(Boolean).join(' · ');
    return {...entry,title,kind,refs:[...entry.refs,...extras.map(([table,key,label])=>({table,key,label,found:true}))]};
  }

  const regionalRuleFields = {
    1: ['回合上限'], 2: ['最少存活单位数'], 3: ['最少上阵数', '稀有度'], 4: ['治疗效果降低（%）'],
    5: ['自动回复鬼火减少量'], 7: ['指定阴阳师'], 8: ['最少上阵数', '指定式神'], 9: ['式神属性编号'],
  };

  async function showHardRegionalBoss(target, stageField, mountScenario) {
    const route = stage.byKey.get(entryKey({table:'battle_mode_routes',key:3023}));
    const modifierRefs = route?.refs.filter(ref => ref.table==='skill' && ref.found) || [];
    if (!modifierRefs.length) {
      target.replaceChildren(node('p','当前目录缺少极难词条的原表关联。','caption'));
      return;
    }
    const [skills, [stepRow]] = await Promise.all([
      api.records('skill', modifierRefs.map(ref => ref.key)), api.records('Constant',[10414]),
    ]);
    if (!target.isConnected) return;
    const step = stepRow?.value?.[0];
    if (!Number.isSafeInteger(step) || step<1 || skills.some(skill => !skill?.skill_name)) {
      target.replaceChildren(node('p','当前目录无法核对极难等级与词条。','caption'));
      return;
    }
    const star = node('select'), picker = node('fieldset','', 'regional-modifiers'), workbench = node('div');
    for (let value=1; value<=10; value++) star.add(option(`${value} 星 · 敌方 ${60+value*step} 级`,value));
    const chosen = [];
    const rows = modifierRefs.map((ref, index) => {
      const skill = skills[index], id = ref.key.$tuple[0];
      const label = node('label'), box = node('input');
      box.type='checkbox';
      box.value=String(id);
      const name = node('span',skill.skill_name);
      name.append(node('small',skill.combatDesc||skill.desc||'','caption'));
      label.append(box,name);
      picker.append(label);
      return {id,label,box,name:skill.skill_name,reward:ref.label==='极难奖励词条'};
    });
    const legend = node('legend','词条');
    picker.prepend(legend);
    const controls = node('div','','dungeon-controls'), starLabel = node('label','挑战星级');
    starLabel.append(star);
    controls.append(starLabel);
    const stageInput = stageField.cloneNode(true);
    if (stageInput.options.length>1) {
      const label = node('label','战斗候选');
      label.append(stageInput);
      controls.append(label);
    }
    target.replaceChildren(controls,picker,node('p','按勾选顺序应用词条。实机挑战和词条使用受账号解锁进度限制。','caption'),workbench);
    const render = () => {
      const value = Number(star.value);
      for (const {id,reward,box,label} of rows) {
        const available = !reward || value===10, index = chosen.indexOf(id);
        if (!available && index>=0) chosen.splice(index,1);
        const selected = chosen.includes(id);
        label.hidden = !available;
        box.checked = selected;
        box.disabled = !available || !selected && chosen.length>=10;
      }
      legend.textContent = `词条（${chosen.length} / 10）`;
      const names = chosen.map(id => rows.find(row=>row.id===id).name);
      mountScenario(workbench,stageInput.value,{star:value,modifierIds:[...chosen]},3023,
        `极难 ${value} 星${names.length?' · '+names.join('、'):''}`,null,chosen.includes(61707)?20:0);
    };
    for (const {id,box} of rows) box.addEventListener('change',()=>{
      if (box.checked) chosen.push(id);
      else chosen.splice(chosen.indexOf(id),1);
      render();
    });
    star.addEventListener('change',render);
    stageInput.addEventListener('change',render);
    render();
  }

  function showRegionalBoss(destination, entry, groups, monsters) {
    if (entry.table !== 'lbs_world_boss_area' || state.index.resourceVersion !== AtlasRuneLineup.resourceVersion) return;
    const stages = groups.filter(group => group.ref.table === 'pve_stage_data' && group.row?.shishentotal === 5);
    const conditions = new Map(groups.flatMap(({ref,row}) => {
      const fields = ref.table === 'lbs_world_boss_type' && regionalRuleFields[row?.type];
      return fields && fields.every((_,index) => {
        const range = row['p'+(index+1)];
        return Array.isArray(range) && range.length && range.length<=3 && range.every(Number.isFinite) &&
          (range[1]??range[0])>=range[0] && (range[2]??1)>0;
      }) ? [[String(ref.key),row]] : [];
    }));
    if (!stages.length || !conditions.size) return;
    const panel = node('section', '', 'encounter-source');
    const tabs = node('div','','actions regional-modes'), host = node('div'), ordinary = node('section');
    tabs.setAttribute('role','group');
    tabs.setAttribute('aria-label','地域鬼王难度');
    const regularTab = node('button','普通','secondary'), hardTab = node('button','极难','secondary');
    regularTab.type = hardTab.type = 'button';
    tabs.append(regularTab,hardTab);
    panel.append(tabs,host);
    const controls = node('div', '', 'dungeon-controls'), params = node('div', '', 'dungeon-controls');
    const workbench = node('div');
    const wrap = (caption, control) => {
      const label = node('label', caption);
      label.append(control);
      return label;
    };
    const stageField = node('select');
    for (const {ref,row} of stages) stageField.add(option(row.name || keyText(ref.key), ref.key));
    const level = node('input');
    Object.assign(level, {type:'number', min:'1', max:'60', step:'1', value:'60', required:true});
    const condition = node('select');
    for (const [id,rule] of conditions) condition.add(option(regionalRuleFields[rule.type][0]+' · '+id, id));
    const stageLabel = wrap('战斗候选', stageField);
    if (stages.length > 1) controls.append(stageLabel);
    controls.append(wrap('难度等级', level), wrap('普通特殊条件', condition));
    ordinary.append(node('h4', '普通地域鬼王离线演练'),
      node('p', '按游戏内显示选择等级和条件，或试算下列静态候选。战报显示清波、回合数和我方承伤。排行榜积分由游戏服务器计算。', 'caption'),
      controls, params, workbench);
    destination.append(panel);
    const mountScenario = (target, stageKey, setup, battleMode, label, actorId, speedBonus=0) => {
      const selected = stages.find(group => String(group.ref.key) === stageKey);
      const groupId = selected?.row.groupid;
      const formation = groups.find(group => group.ref.table === 'BattleMonstersInfo' && group.ref.key === groupId);
      if (!formation?.waves.length) return;
      const scenario = `${groups[0].row.area_name} · ${label}`;
      const baseSpeed = Math.max(0, ...formation.waves.flatMap(wave => wave.map(unit => Number(monsters.get(unit.id)?.baseSpeed)||0)));
      const codeId = battleMode===3023 ? 10020216 : 10020215;
      const code = groups.find(group => group.ref.table === 'team_assist_stage' && group.ref.key === codeId)?.row;
      target.replaceChildren();
      window.AtlasPveWorkbench?.mount(target, {
        stageId:Number(selected.ref.key), groupId, memberCount:5, battleMode, waveCount:formation.waves.length,
        openingSpeed:baseSpeed + (formation.row.spd_alter||0) + speedBonus, label:scenario, region:{areaId:Number(entry.key),...setup},
        actorId, codeStageId:code?.ss_num===5&&code?.yys_num===1?code.id:null, codeLabel:scenario, version:state.index.resourceVersion,
      });
    };
    const render = () => {
      const rule = conditions.get(condition.value);
      const fields = [...params.querySelectorAll('input,select')];
      if ([level, ...fields].some(field => !field.checkValidity())) {
        window.AtlasPveWorkbench?.unmount();
        workbench.replaceChildren(node('p', '请填写相符的等级和特殊条件参数。', 'caption'));
        return;
      }
      const region = {level:level.valueAsNumber, ruleId:Number(condition.value),
        params:fields.map(field => Number(field.value)/Number(field.dataset.scale||1))};
      const text = fields.map(field => field.selectedOptions?.[0]?.textContent ?? field.value+(field.dataset.scale?'%':''));
      const scenario = `普通 ${region.level} 级 · 条件 ${region.ruleId}（${text.join('、')}）`;
      mountScenario(workbench,stageField.value,region,3004,scenario,rule.type===7?region.params[0]:null);
    };
    const updateRule = () => {
      const rule = conditions.get(condition.value);
      params.replaceChildren(...regionalRuleFields[rule.type].map((name,index) => {
        const [min,max=min,step=1] = rule['p'+(index+1)];
        if (rule.type===7 || index===1&&[3,8].includes(rule.type)) {
          const field = node('select');
          for (let value=min; value<=max; value+=step) {
            const label = rule.type===3 ? ['','N','R','SR','SSR'][value] : DATA.gameConfig.heroes[value]?.name;
            field.add(option(label||String(value),value));
          }
          field.addEventListener('change',render);
          return wrap(name,field);
        }
        const scale = rule.type===4 ? 100 : 1;
        const field = node('input');
        Object.assign(field, {type:'number', min:String(min*scale), max:String(max*scale), step:String(step*scale),
          value:String(min*scale), required:true});
        if (scale!==1) field.dataset.scale=scale;
        field.addEventListener('input',render);
        return wrap(name, field);
      }));
      render();
    };
    condition.addEventListener('change',updateRule);
    stageField.addEventListener('change',render);
    level.addEventListener('input',render);
    const switchMode = hard => {
      if (hard === (hardTab.getAttribute('aria-pressed')==='true') && host.firstChild) return;
      window.AtlasPveWorkbench?.unmount();
      regularTab.setAttribute('aria-pressed',String(!hard));
      hardTab.setAttribute('aria-pressed',String(hard));
      if (!hard) {
        host.replaceChildren(ordinary);
        updateRule();
        return;
      }
      const hardPanel = node('section');
      hardPanel.append(node('p','正在读取极难等级与词条…','caption'));
      host.replaceChildren(hardPanel);
      void showHardRegionalBoss(hardPanel,stageField,mountScenario).catch(()=>{
        if(hardPanel.isConnected) hardPanel.replaceChildren(node('p','极难词条读取失败。','caption'));
      });
    };
    regularTab.onclick=()=>switchMode(false);
    hardTab.onclick=()=>switchMode(true);
    switchMode(false);
  }

  function showUnderworld(destination,entry,config){
    if(entry.table!=='gve_battleinfo'||config?.difficulty!==100)return;
    const waveTable=state.index.tables.find(table=>table.name==='gve_monster_wave'&&table.status==='decoded');
    if(!waveTable)return;
    const route=state.index.resourceVersion==='0.0.816';
    const block=node('section','','encounter-source');
    block.append(node('h4','阴界之门战斗波次'));
    if(route){
      block.append(node('p','单人可带一位阴阳师及五位式神。我方起始共享鬼火 2，敌方起始鬼火 4。原版最多上阵四轮队伍，战斗结束时按已清波数结算。','caption'),
        node('p','换队时已上阵的式神实例不可再用。只剩一位可用阴阳师时，可以继续使用该阴阳师。','caption'));
      for(const [label,table,key] of [['原版战斗入口','battle_mode_routes',2001],['阵容码目标','team_assist_stage',19005]]){
        const button=node('button',label,'secondary');
        button.type='button';
        button.onclick=()=>openRecord(table,key);
        block.append(button);
      }
      const stageId=Number(entry.key),scene=DATA.gameConfig.stages[19005];
      window.AtlasPveWorkbench?.mount(block,{stageId,groupId:stageId,memberCount:5,battleMode:2001,waveCount:70,
        label:'阴界之门单人接力（最多四队）',version:state.index.resourceVersion,
        codeStageId:scene?.actors===1&&scene.shikigami===5?19005:null,codeLabel:scene?.name});
    }
    const waves=document.createElement('details'),body=node('div');
    waves.append(node('summary',`${waveTable.rowCount} 波 · 查看随机编组与属性修正`),body);
    block.append(waves);
    destination.append(block);
    waves.addEventListener('toggle',async()=>{
      if(!waves.open||body.hasChildNodes())return;
      body.textContent='正在读取波次…';
      try{
        const keys=Array.from({length:waveTable.rowCount},(_,i)=>i+1);
        const rows=(await Promise.all(Array.from({length:Math.ceil(keys.length/64)},(_,i)=>
          api.records('gve_monster_wave',keys.slice(i*64,i*64+64))))).flat();
        if(rows.some((row,i)=>row?.mon_wave!==keys[i]))throw Error('波次记录与索引不一致');
        body.replaceChildren(...rows.map(underworldWave));
      }catch(error){body.textContent='波次资料读取失败。'+error.message;}
    });
  }

  function underworldWave(row){
    const detail=document.createElement('details'),body=node('div');
    const rate=new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:2,signDisplay:'exceptZero'});
    const extra=[['攻击',row.attack_factor],['防御',row.defence_factor],['生命',row.hp_factor]]
      .map(([name,value])=>`${name} ${rate.format(value)}`);
    detail.append(node('summary',`第 ${row.mon_wave} 波 · ${row.level} 级 · 随机组 ${row.mon_rand_group}`),
      node('p',[...extra,`速度 ${row.speed_factor>0?'+':''}${row.speed_factor}`].join(' · '),'caption'),body);
    detail.addEventListener('toggle',async()=>{
      if(!detail.open||body.hasChildNodes())return;
      body.textContent='正在读取编组…';
      try{
        const [choices]=await api.records('gve_monster_random',[row.mon_rand_group]);
        if(!choices?.length||!choices.every(choice=>choice.weight>0&&Array.isArray(choice.mon_list)))throw Error('找不到有效随机编组');
        const label=node('label','随机编组 '),menu=document.createElement('select'),preview=node('div');
        choices.forEach((choice,i)=>{
          const option=node('option',`方案 ${i+1} · 权重 ${choice.weight}`);
          option.value=String(i);
          menu.append(option);
        });
        label.append(menu);
        body.replaceChildren(label,preview);
        let request=0;
        const render=async()=>{
          const current=++request,selected=Number(menu.value),choice=choices[selected];
          const units=choice.mon_list.flatMap((id,i)=>id>0?[{id,position:i+1,level:row.level}]:[]);
          const ids=[...new Set(units.map(unit=>unit.id))],monsters=new Map();
          preview.textContent='正在读取敌方阵容…';
          try{
            const records=await api.records('monster',ids);
            ids.forEach((id,i)=>{if(records[i])monsters.set(id,records[i]);});
          }catch{/* original IDs still identify the formation */}
          if(current!==request)return;
          preview.replaceChildren();
          appendWaves(preview,[units],monsters,false,selected+1);
        };
        menu.onchange=()=>void render();
        await render();
      }catch(error){body.textContent='编组资料读取失败。'+error.message;}
    });
    return detail;
  }

  function appendRetreatDetails(block,table,row){
    if(table==='guild_boss_reward'){
      const fields=document.createElement('dl');
      for(const [key,label] of [['turn','首领轮数'],['cost_score','开启消耗阴阳寮勋章'],['player_reward','各轮个人奖励 ID']]){
        if(Object.hasOwn(row,key))fields.append(node('dt',label),node('dd',String(row[key])));
      }
      block.append(fields);
    }
    if(table==='raid_info'&&row.fbId===1){
      const fields=document.createElement('dl');
      for(const [key,label] of [['attackAdditionVal','各轮攻击调整'],['defenseAdditionVal','各轮防御调整'],
       ['maxHpAdditionVal','各轮生命调整'],['critRateAdditionVal','各轮暴击调整'],['speedAdditionVal','各轮速度调整']]){
        if(Array.isArray(row.attr_adjust?.[key]))fields.append(node('dt',label),node('dd',row.attr_adjust[key].join(' / ')));
      }
      block.append(node('p',`${row.boss_num} 轮 · ${row.randomSelect?'首领从配置池随机选择':'固定首领顺序'}`,'caption'),fields);
      mountRetreatWindow(block,row);
    }
    if(table==='boss_info'&&row.param){
      const indices={601:[2,3],611:[2,3],621:[0,1]}[row.ctrlSkill]||[];
      const groups=indices.map(index=>row.param[index]?.[0]).filter(Number.isSafeInteger);
      for(const group of groups){
        const button=node('button',`查看机关编组 ${group}`,'secondary');
        button.type='button';
        button.onclick=()=>{
          el('encounter-family').value='guild';
          el('encounter-query').value=`首领退治 编组 ${group} 方案`;
          filterEncounters();
          el('encounter-list').querySelector('button')?.click();
          el('encounter-list').querySelector('[aria-pressed="true"]')?.focus();
        };
        block.append(button);
      }
    }
  }

  function mountRetreatWindow(block,row){
    const source=window.AtlasGuildRetreatOpenings;
    if(!matchesOpeningSource(source)||!source.difficulties[row.id])return;
    const choices=node('div','','actions'),panel=document.createElement('dl'),workbench=node('div');
    function select(label,options){
      const field=node('label',label+' '),menu=document.createElement('select');
      for(const [value,title] of options){
        const option=node('option',title);
        option.value=String(value);
        menu.append(option);
      }
      field.append(menu);
      choices.append(field);
      return menu;
    }
    const names=Object.fromEntries(Object.entries(source.bosses).map(([id,{codeStageId}])=>
      [id,DATA.gameConfig.stages[codeStageId]?.name?.split('·').at(-1)??`首领 ${id}`]));
    const boss=select('首领',Object.entries(names));
    const round=select('所在轮次',[[1,'第 1 轮'],[2,'第 2 轮'],[3,'第 3 轮']]);
    const windowLabel=node('label','计分窗口（秒） '),windowLength=document.createElement('input');
    Object.assign(windowLength,{type:'number',min:'1',max:'1800',step:'1',value:'1800'});
    windowLength.setAttribute('list','retreat-score-windows');
    const suggested=document.createElement('datalist');
    suggested.id='retreat-score-windows';
    for(const [seconds,name] of [[60,'1 分钟'],[180,'3 分钟'],[300,'5 分钟'],[600,'10 分钟'],[1800,'30 分钟']]){
      const option=node('option',name);
      option.value=String(seconds);
      suggested.append(option);
    }
    windowLabel.append(windowLength,suggested);
    choices.append(windowLabel);
    const memberLabel=node('label','参加人数增伤 '),memberCount=document.createElement('input');
    Object.assign(memberCount,{type:'number',min:'0',max:'50',step:'1',value:'0'});
    memberLabel.append(memberCount);
    choices.append(memberLabel);
    block.append(node('h5','原版开场与单队伤害演练'),choices,
      node('p','首领从满血开始。参加人数只用于计算集结增伤。演练只计入当前库存队伍的伤害。','caption'),panel,workbench);
    const render=()=>{
      const invalidWindow=!windowLength.checkValidity()||windowLength.value==='';
      if(invalidWindow||!memberCount.checkValidity()||memberCount.value===''){
        window.AtlasPveWorkbench?.unmount();
        workbench.replaceChildren(node('p',invalidWindow?'计分窗口请输入 1 至 1,800 秒的整数。':'参加人数请输入 0 至 50 的整数。','caption'));
        return;
      }
      const groupId=Number(boss.value),raidRound=Number(round.value),guildMembers=Number(memberCount.value),windowSeconds=Number(windowLength.value);
      const opening=source.difficulties[row.id][raidRound-1][groupId];
      panel.replaceChildren(...[['站位',opening.position],['等级',opening.level],['生命',opening.hp],['攻击',opening.attack],
        ['防御',opening.defense],['速度',opening.speed],['暴击',opening.critRate*100]].flatMap(([label,value])=>
        [node('dt',label),node('dd',openingNumber.format(value)+(label==='暴击'?'%':''))]));
      workbench.replaceChildren();
      const {codeStageId}=source.bosses[groupId];
      window.AtlasPveWorkbench?.mount(workbench,{stageId:row.id,groupId,battleMode:306,memberCount:5,waveCount:1,
        retreat:{raidRound,guildMembers,windowSeconds},scoreWindowSeconds:windowSeconds,
        openingSpeed:opening.speed,version:source.resourceVersion,
        codeStageId,codeLabel:`${names[groupId]} · 退治难度 ${row.id} 第 ${raidRound} 轮`,label:`${names[groupId]} · 个人伤害`});
    };
    for(const field of [boss,round,windowLength,memberCount])field.addEventListener('change',render);
    render();
  }

  function mountQiLingWindow(block,stageId){
    const source=window.AtlasQiLingGroups;
    if(!matchesOpeningSource(source))return;
    const route=source.routes[stageId];
    if(!route)return;
    const fields=node('div','','actions'),workbench=node('div');
    const input=(label,marker,max,value,placeholder='')=>{
      const field=node('label',label,'pve-lineup-field'),control=document.createElement('input');
      Object.assign(control,{type:'number',min:'1',max:String(max),step:'1',value,placeholder});
      control.dataset[marker]='';
      field.append(control);fields.append(field);
      return control;
    };
    const length=input('计分窗口（秒）','qilingWindow',source.windowLimit,String(source.windowLimit));
    const hp=input('开场剩余生命','qilingHp',Math.floor(route.maxHp),'','默认满血');
    const skill=AtlasGame.skill(DATA.gameConfig,route.skillId,1,0)?.name||`技能 ${route.skillId}`;
    block.append(node('p',`共享生命上限 ${openingNumber.format(route.maxHp)} · ${skill}作用于${route.skillTargets===1?'阴阳师':'本队阴阳师和式神'}`,'caption'),
      fields,node('p','使用一队已知阵容，伤害只计入本队。','caption'),workbench);
    const render=()=>{
      if(!length.value||!length.checkValidity()||!hp.checkValidity()){
        window.AtlasPveWorkbench?.unmount();
        workbench.replaceChildren(node('p',!length.value||!length.checkValidity()?`计分窗口请输入 1 至 ${source.windowLimit.toLocaleString('zh-CN')} 秒的整数。`:
          '开场剩余生命请输入 1 至满血值之间的整数，也可留空。','caption'));
        return;
      }
      const windowSeconds=Number(length.value),qilingWindow={windowSeconds,...(hp.value?{startingHp:Number(hp.value)}:{})};
      workbench.replaceChildren();
      window.AtlasPveWorkbench?.mount(workbench,{stageId,groupId:route.groupId,battleMode:source.battleMode,
        memberCount:5,waveCount:1,qilingWindow,scoreWindowSeconds:windowSeconds,version:source.resourceVersion,
        codeStageId:route.codeStageId,label:`契灵集结 · ${route.name} · 个人伤害`});
    };
    length.addEventListener('change',render);hp.addEventListener('change',render);
    render();
  }

  function showMapBoss(destination,entry,groups){
    const source=window.AtlasMapBoss,isMap=entry.table==='map_boss';
    if(!matchesOpeningSource(source)||!isMap&&entry.table!=='pve_stage_data')return false;
    const row=groups[0].row;
    const ids=isMap?row?.gk_list?.map(([id])=>id)??[]:[Number(entry.key)];
    const stages=ids.filter(id=>{
      const route=source.stages[id],mapId=isMap?Number(entry.key):null;
      if(!route||mapId!==null&&!route.entries.includes(mapId))return false;
      const stage=isMap?groups.find(({ref})=>ref.table==='pve_stage_data'&&Number(ref.key)===id)?.row:row;
      const formation=groups.find(({ref})=>ref.table==='BattleMonstersInfo'&&ref.key===id);
      return stage?.groupid===id&&stage.shishentotal===5&&formation?.row?.resindex===route.sceneId&&
        formation.waves.length===route.waves.length&&formation.waves.every((wave,waveIndex)=>
          wave.length===route.waves[waveIndex].length&&wave.every(({position,id,level},i)=>{
            const [expectedSlot,expectedId,expectedLevel]=route.waves[waveIndex][i];
            return position===expectedSlot&&id===expectedId&&level===expectedLevel;
          }));
    });
    if(!stages.length)return false;
    const controls=node('div','','actions'),workbench=node('div'),slots=node('p','','caption');
    const select=(name,marker,options)=>{
      const label=node('label',name,'pve-lineup-field'),control=document.createElement('select');
      control.dataset[marker]='';
      control.replaceChildren(...options.map(([value,text])=>new Option(text,String(value))));
      label.append(control);controls.append(label);
      return control;
    };
    const stage=select('关卡等级档','mapBossStage',stages.map(id=>[id,`${source.stages[id].level} 级档 · ${id}`]));
    const players=select('参战人数','mapBossPlayers',[[2,'两人组队'],[3,'三人组队']]);
    destination.append(controls,node('p','离线模拟把本账号的一位阴阳师和五位式神按原版规则分给队长与队友。按阵容码顺序站在 2 至 6 号位。','caption'),slots,workbench);
    const render=()=>{
      const stageId=Number(stage.value),mapBossPlayers=Number(players.value),route=source.stages[stageId];
      const assignments=source.positions[mapBossPlayers].map((indices,i)=>
        `${i?'队友 '+i:'队长'} ${indices.join('、')} 号位`);
      const enemies=route.battleMode===source.sealMode?`敌方 ${route.waves.length} 波`:`敌方 ${Math.min(route.level,40)} 级`;
      slots.textContent=`${enemies} · ${assignments.join(' · ')}`;
      workbench.replaceChildren();
      window.AtlasPveWorkbench?.mount(workbench,{stageId,groupId:stageId,memberCount:5,battleMode:route.battleMode,
        mapBossPlayers,waveCount:route.waves.length,label:`${route.label} · ${route.level} 级档`,version:source.resourceVersion});
    };
    stage.addEventListener('change',render);players.addEventListener('change',render);
    render();
    return true;
  }

  function mountCreviceWindow(block,stageId,row,formation){
    const source=window.AtlasGuildCrevice,route=source.routes[stageId];
    if(!matchesOpeningSource(source)||row?.groupid!==route.groupId||row?.shishentotal!==5||
       formation?.row?.resindex!==source.sceneId||formation.waves.length!==1||
       formation.waves[0].length!==route.formation.length||!route.formation.every(([position,id,level],i)=>{
         const unit=formation.waves[0][i];
         return unit.position===position&&unit.id===id&&unit.level===level;
       }))return;
    const controls=node('div','','actions'),workbench=node('div'),label=node('label','计分窗口（秒）','pve-lineup-field');
    const input=document.createElement('input'),limit=source.deadlineSeconds;
    Object.assign(input,{type:'number',min:'1',max:String(limit),step:'1',value:String(limit),required:true});
    input.dataset.creviceWindow='';
    label.append(input);
    controls.append(label);
    block.append(node('p',route.kind===1?'小怪使用本队独立敌方血量。':
      '敌方共享生命按原版满血初始化，战报只计本队伤害。','caption'),controls,workbench);
    const render=()=>{
      if(!input.checkValidity()){
        window.AtlasPveWorkbench?.unmount();
        workbench.replaceChildren(node('p',`计分窗口请输入 1 至 ${limit} 秒的整数。`,'caption'));
        return;
      }
      const seconds=input.valueAsNumber;
      workbench.replaceChildren();
      window.AtlasPveWorkbench?.mount(workbench,{stageId,groupId:route.groupId,battleMode:source.battleMode,
        memberCount:5,waveCount:1,creviceWindow:seconds,scoreWindowSeconds:seconds,version:source.resourceVersion,
        codeStageIds:route.codeStageIds,label:`狭间暗域 · ${route.label}`});
    };
    input.addEventListener('change',render);
    render();
  }

  function showSuperGhost(block,entry,group){
    const source=window.AtlasSuperGhost;
    const historical=entry.table==='SuperGhost_bossmission';
    if((!historical&&entry.table!=='SuperGhost_mission')||!matchesOpeningSource(source))return;
    const id=Number(entry.key),route=(historical?source.historicalRoutes:source.routes)[id],wave=group.waves[0];
    if(!route||group.row?.sceneid!==route.sceneId||
       (historical?group.row.challenge_time!==route.deadlineSeconds:group.row.star!==route.star||group.row.crazy_time!==route.deadlineSeconds)||
       wave?.length!==route.formation.length||!route.formation.every(([position,id,level],i)=>
         wave[i].position===position&&wave[i].id===id&&wave[i].level===level))return;
    const controls=node('div','','actions'),workbench=node('div'),limit=route.deadlineSeconds;
    const field=(name,element)=>{
      const label=node('label',name,'pve-lineup-field');
      label.append(element);controls.append(label);
      return element;
    };
    let attack,day;
    if(!historical){
      attack=field('追击方式',document.createElement('select'));
      attack.dataset.ghostAttack='';
      attack.replaceChildren(new Option('普通追击','0'),new Option('强力追击','1'));
      day=field('特攻日期',document.createElement('select'));
      day.dataset.ghostDay='';
      day.replaceChildren(new Option('无当日特攻','0'),...Object.entries(source.days).map(([id,row])=>new Option(row.date.join('-'),id)));
    }
    const duration=field('计分窗口（秒）',document.createElement('input'));
    duration.dataset.ghostWindow='';
    Object.assign(duration,{type:'number',min:'1',max:String(limit),step:'1',value:String(limit),required:true});
    const description=historical?'仅计 1 号位首领的生命减少量。原版时钟到点后完成结算。':'敌方开场 8 火 · 从满血开始统计本队伤害';
    block.append(node('p',`原版时限 ${limit} 秒 · ${description}`,'caption'),controls,workbench);
    if(route.templateSkills)block.append(node('p','本条任务词条与敌方模板不同，模拟使用原版实际载入的敌方技能。','caption'));
    const render=()=>{
      if(!duration.checkValidity()){
        window.AtlasPveWorkbench?.unmount();
        workbench.replaceChildren(node('p',`计分窗口请输入 1 至 ${limit} 秒的整数。`,'caption'));
        return;
      }
      const windowSeconds=duration.valueAsNumber,code=source.codeStageIds[route.star];
      const options=historical?{battleMode:source.historicalBattleMode,historicalGhostWindow:windowSeconds,label:group.row.desc}:
        {battleMode:source.battleMode,ghostSettings:{attackType:Number(attack.value),day:Number(day.value),windowSeconds},
         codeStageIds:code?[code]:[],label:group.row.remarks};
      workbench.replaceChildren();
      window.AtlasPveWorkbench?.mount(workbench,{stageId:id,groupId:id,...options,
        memberCount:5,waveCount:1,scoreWindowSeconds:windowSeconds,version:source.resourceVersion});
    };
    for(const input of [attack,day,duration])input?.addEventListener('change',render);
    render();
  }

  async function showEncounter(entry) {
    if (!entry) return;
    window.AtlasPveWorkbench?.unmount();
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
    const ids = [...new Set(groups.flatMap(group => group.waves.flat(2).filter(unit=>unit.id>0).map(unit => unit.id)))];
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
    destination.replaceChildren(header, node('p', encounterKind(entry) + ' · ' + encounterKeyLabel(entry), 'caption'));
    showSuperGhost(destination,entry,groups[0]);
    const awake=awakeOpening(entry,groups);
    if (awake) {
      const codeScene=DATA.gameConfig.stages[awake.codeStageId];
      const note='普通编组开场 · 我方鬼火 '+awake.allyOrbs+' · 敌方鬼火 '+awake.enemyOrbs+' · 阴阳师等级要求 '+awake.minPlayerLevel+
        (groups[0].row.floor_num===10?' · 第十层的实机单人队伍入口另行结算。':'');
      destination.append(node('p',note,'caption'));
      window.AtlasPveWorkbench?.mount(destination,{stageId:Number(entry.key),groupId:awake.groupId,memberCount:5,
        battleMode:29,waveCount:1,label:'觉醒普通单人编组',version:state.index.resourceVersion,
        codeStageId:codeScene?.actors===1&&codeScene.shikigami===5?awake.codeStageId:null,codeLabel:codeScene?.name,
        openingSpeed:Math.max(...awake.enemies.map(unit=>unit.speed))});
    }
    const secret=secretOpening(entry,groups[0]);
    if(secret){
      const config=groups[0].row,codeScene=DATA.gameConfig.stages[secret.codeStageId];
      const entryLabel=config.advanced?'竞速配置':secret.solo&&config.need_team?'游戏内走单人组队挑战':
        config.need_team?'游戏内走组队入口':'游戏内走单人入口';
      destination.append(node('p',[`${secret.waves.length} 波`,`我方开场 ${secret.allyOrbs} 火`,
        `敌方开场 ${secret.enemyOrbs} 火`,`需阴阳师 ${config.level_limit} 级`,`消耗 ${config.strength} 体力`,entryLabel].join(' · '),'caption'));
      if(secret.replacement){
        const {name,level,star}=secret.replacement;
        destination.append(node('p',`阴阳师位由关卡指定 · ${name} · ${level} 级 · ${star} 星`,'caption'));
      }
      if(!secret.solo&&!config.advanced)
        destination.append(node('p','该层的独立机制仍待离线复跑核验。','caption'));
      if(secret.solo&&secret.entrance==='race')destination.append(node('p',
        '使用该层原版竞速编组。可手动选择已知阵容，战报显示本地复跑耗时。','caption'));
      if(secret.solo)window.AtlasPveWorkbench?.mount(destination,{stageId:Number(entry.key),groupId:Number(entry.key),memberCount:5,
        battleMode:266,waveCount:secret.waves.length,label:secret.entrance==='race'?'秘闻竞速 · 本地演练':secret.protection?'溯问鲤踪 · 保护挑战':
          config.need_team?'秘闻单人组队挑战':'秘闻普通单人',version:state.index.resourceVersion,
        codeStageId:codeScene?.actors===1&&codeScene.shikigami===5?secret.codeStageId:null,codeLabel:codeScene?.name,
        replacementActor:secret.replacement,
        openingSpeed:Math.max(...secret.waves.flat().filter(unit=>unit.id>0).map(unit=>unit.speed))});
    }
    if(entry.table==='dungeon_challenge_series'&&matchesOpeningSource(window.AtlasSecretOpenings)&&
       groups[0].waves.some(wave=>wave.some(unit=>unit.copy))){
      destination.append(node('p','复制位读取我方同号位的式神及御魂技能。缺少可复制模板时使用原版默认怪物。','caption'));
    }
    showYulingEncounter(destination,entry,groups[0]);
    showGuildHunt(destination,entry,groups[0]);
    showFengmoLive(destination,entry,groups);
    showTuzhizhuPractice(destination,entry,groups);
    const yanwu=['act_team_battle','pve_stage_data'].includes(entry.table)&&showFengmoYanwu(destination,groups);
    showActivityScore(destination,entry,groups);
    showJourneyHard(destination,entry,groups);
    showTianfa(destination,entry,groups);
    showRegionalBoss(destination,entry,groups,monsters);
    showUnderworld(destination,entry,groups[0].row);
    const exams=window.AtlasSixRealmsExams;
    const sixRealmsEvent=entry.table==='shilian_event_battles';
    if((sixRealmsEvent||entry.table==='shilian_event_exam')&&matchesOpeningSource(exams)){
      const exam=groups[0].row,stageId=exam?.battle_id;
      const trial=sixRealmsEvent?exams.eventRoute(stageId):exams.routes[stageId];
      const group=groups.find(({ref})=>ref.table==='BattleMonstersInfo');
      const realm=groups.find(({ref})=>ref.table==='shilian_liudao');
      const codeScene=DATA.gameConfig.stages[trial?.codeStageId];
      const routeAgrees=sixRealmsEvent?Math.floor(exam?.group_id/10)===trial?.dao&&[0,1,2].includes(exam?.battle_type)&&
        state.index.tables.find(table=>table.name==='shilian_event_battles')?.source?.marshalSHA256===exams.eventTableSHA256:
        exam?.dao===trial?.dao;
      if(trial&&routeAgrees&&realm?.row?.hero?.join()===trial.eligible.join()&&
         group?.ref.key===stageId&&group?.row?.resindex===trial.sceneId&&codeScene?.actors===1&&codeScene.shikigami===6){
        const readSource=(name,hash)=>state.index.tables.find(table=>table.name===name)?.source?.marshalSHA256===hash?
          api.table(name).then(JSON.parse).catch(()=>[]):[];
        const [marks,items,skillRules,guards]=await Promise.all([
          readSource('shilian_yinji',exams.markTableSHA256),
          readSource('shilian_currency',exams.skillTableSHA256.shilian_currency),
          readSource('shilian_fight_skill',exams.skillTableSHA256.shilian_fight_skill),
          readSource('shilian_guard_ghost',exams.guardTableSHA256),
        ]);
        if(token!==stage.token)return;
        const markOptions=marks.filter(([id,row])=>id===row.id)
          .map(([id,row])=>({id,name:row.name,level:row.level,heroId:row.hero_id,source:row.src,
            owner:DATA.gameConfig.heroes[row.hero_id]?.name}))
          .sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.level-b.level);
        const rules=new Map(skillRules);
        const skillOptions=items.flatMap(([id,row])=>{
          const rule=row.type===3?rules.get(row.extra_params?.[0]):null;
          return rule&&(rule.hero_id===0||trial.eligible.includes(rule.hero_id))?
            [{id,name:row.name,heroId:rule.hero_id,description:row.desc}]:[];
        }).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
        const artifactOptions=items.filter(([,row])=>row.type===2).map(([id,row])=>({
          id,name:row.name,description:row.desc,maxRefinement:[660023,660024,660025].includes(id)?15:1,
        })).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
        const guardOptions=guards.flatMap(([,row])=>row.level===1?[{id:row.guard_id,name:row.name}]:[])
          .sort((a,b)=>a.id-b.id);
        const scenario=sixRealmsEvent?'填写当局难度和前行步数。':'首领试炼使用档位 1。';
        destination.append(node('p',scenario,'caption'));
        if(trial.phases)destination.append(node('p','月之海按原版两阶段战斗复跑，演出等待使用原版服务端超时机制并在战报单列。','caption'));
        window.AtlasPveWorkbench?.mount(destination,{stageId,groupId:group.ref.key,memberCount:6,waveCount:trial.phases?.length??1,
          battleMode:sixRealmsEvent?exams.eventMode:exams.battleMode,version:exams.resourceVersion,codeStageId:trial.codeStageId,codeLabel:codeScene.name,
          trialEligible:trial.eligible,markOptions,skillOptions,maxRunSkills:exams.maxRunSkills,shilianEventId:sixRealmsEvent?exam.id:null,
          artifactOptions,maxRunArtifacts:exams.maxRunArtifacts,artifactRefinement:trial.dao===4,
          guardOptions,guardMaxLevel:exams.guardMaxLevel,
          label:sixRealmsEvent?'六道之门 · 途中战斗':'六道之门 · 单场首领试炼'});
      }
    }
    if(entry.table==='hunling_boss')mountQiLingWindow(destination,Number(entry.key));
    const orochi=AtlasTrueOrochi;
    if(entry.table==='map_boss'&&Number(entry.key)===orochi.stageId&&state.index.resourceVersion===AtlasRuneLineup.resourceVersion&&
       groups.filter(group=>group.ref.table==='pve_stage_data'&&group.row).length===orochi.floorCount){
      const codeScene=DATA.gameConfig.stages[orochi.codeStageId];
      if(codeScene?.actors===1&&codeScene.shikigami===6)window.AtlasPveWorkbench?.mount(destination,{
        stageId:orochi.stageId,groupId:orochi.firstFloor,memberCount:6,battleMode:orochi.battleMode,waveCount:orochi.floorCount,
        label:'真·八岐大蛇原版单人十层',version:state.index.resourceVersion,codeStageId:orochi.codeStageId,codeLabel:codeScene.name,
      });
    }
    const mapBossMounted=showMapBoss(destination,entry,groups);
    if(!mapBossMounted&&entry.table==='map_boss'&&Number(entry.key)!==orochi.stageId&&entry.refs.some(ref=>ref.table==='pve_stage_data')){
      destination.append(node('p','可查看原表的关卡配置、敌方编组和规则。此入口的原版复跑待接入。','caption'));
    }
    if (!yanwu&&!mapBossMounted&&entry.table==='pve_stage_data'&&!Object.hasOwn(AtlasGeneralSoulTrial.stages,Number(entry.key))&&
        !Object.hasOwn(AtlasTianfa.stages,Number(entry.key))&&
        state.index.resourceVersion===AtlasRuneLineup.resourceVersion) {
      const row=groups[0].row,stageId=Number(entry.key),memberCount=row?.shishentotal,groupId=row?.groupid;
      const formation=groups.find(group=>group.ref.table==='BattleMonstersInfo'&&group.ref.key===groupId);
      const regional=entry.refs.some(ref=>ref.table==='lbs_world_boss_area');
      const shilian=entry.refs.some(ref=>['shilian_liudao','shilian_event_exam','shilian_event_battles'].includes(ref.table));
      const orochiFloor=orochi.isFloor(stageId);
      const hunling=AtlasHunlingEncounters;
      const spiritRoute=matchesOpeningSource(hunling)?hunling.routes[stageId]:null;
      const practice=Object.values(window.AtlasTuzhizhuPractice?.modes??{}).some(mode=>mode.groupId===stageId);
      if(practice)destination.append(node('p','请在「逢魔木桩练习」中选择普通入口或极词条，再按对应原版引擎复跑。','caption'));
      else if(window.AtlasGuildCrevice.routes[stageId])mountCreviceWindow(destination,stageId,row,formation);
      else if(AtlasJourneyHard.routes[stageId])destination.append(node('p','从关联的京畿净化首领挑战入口填写祝福和时限。','caption'));
      else if(window.AtlasFengmoLive?.isLiveStage(stageId))destination.append(node('p','此编组用于逢魔实战。集结、评级与联机战报条件见逢魔实战入口。','caption'));
      else if(window.AtlasResourceEncounters.isResourceStage(row))showResourceEncounter(destination,stageId,row,formation);
      else if(orochiFloor)destination.append(node('p','真·八岐大蛇沿用同一场战斗的十层进度，选角与生命状态见玩法入口。','caption'));
      else if(spiritRoute&&spiritRoute.groupId===groupId&&memberCount===5)window.AtlasPveWorkbench?.mount(destination,{
        stageId,groupId,memberCount,battleMode:spiritRoute.battleMode,waveCount:1,label:spiritRoute.label,
        version:state.index.resourceVersion,codeStageIds:spiritRoute.codeStageIds,
        captureItems:spiritRoute.spiritId===null?null:hunling.items,
      });
      else if(hunling.routes[stageId])destination.append(node('p','契灵原版复跑需要与此关卡匹配的客户端资料。','caption'));
      else if(stageId===800021||stageId>=810001&&stageId<=810009)
        destination.append(node('p','此编组由契灵教程、集结或集结后的收服入口使用，入场条件取自对应原版流程。','caption'));
      else if (regional) destination.append(node('p','此编组供地域鬼王入口使用。离线演练还需要该玩法下发的实际参数。','caption'));
      else if (shilian) destination.append(node('p','此编组由六道之门专用引擎使用。请从关联入口核对试炼式神及途中规则。','caption'));
      else if (window.AtlasMapBoss?.stages[stageId]) destination.append(node('p','地图首领组队复跑需要匹配的客户端关卡与编组资料。','caption'));
      else if (entry.refs.some(ref=>ref.table==='map_boss')) destination.append(node('p','对应玩法的入场与结算条件见关联的地图首领入口。','caption'));
      else if (Number.isSafeInteger(stageId)&&stageId>0&&Number.isSafeInteger(groupId)&&groupId>0&&
          Number.isSafeInteger(memberCount)&&memberCount>=1&&memberCount<=5&&
          formation?.row?.MonstersInfos?.length&&!['no_yys','replace_yysid','isplot','sl_file'].some(field=>row[field])) {
        window.AtlasPveWorkbench?.mount(destination,{stageId,groupId,memberCount,version:state.index.resourceVersion});
      }
    }
    for (const {ref,row,error,waves} of groups) {
      const block = node('section', '', 'encounter-source');
      const pool = ref.pool && groups[0].row?.special_attacks?.length > 1 ? `候选池 ${ref.pool}` : '';
      const id = ref.table === 'skill' && Array.isArray(ref.key?.$tuple) ? `技能 ${ref.key.$tuple[0]}` : keyText(ref.key);
      const heading = ref.primary?[ref.label]:[ref.label, pool, rowTitle(row), id].filter(Boolean);
      block.append(node('h4', heading.join(' · ')));
      if (!row) {
        block.append(node('p', error ? '资料读取失败。' + error : '本资源中未找到对应记录。', 'caption'));
        destination.append(block);
        continue;
      }
      const fields = fieldsFor(row, ref.table);
      if (fields.childElementCount) block.append(fields);
      appendSpecialDetails(block, ref.table, row);
      appendRetreatDetails(block, ref.table, row);
      appendWaves(block,waves,monsters,entry.table==='dungeon_challenge_series'&&ref.primary);
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
    window.AtlasPveWorkbench?.unmount();
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
    if (!panel.open) window.AtlasPveWorkbench?.cancel();
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
  el('encounter-family').onchange = () => filterEncounters();
  el('encounter-query').oninput = () => filterEncounters();
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
