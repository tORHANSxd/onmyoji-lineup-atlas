"""Replay versioned map boss battles with the original player positions."""

from rune_team import assign_local_party, verify_local_party, verify_local_party_selection

MODE = 3000
SEAL_MODE = 855
LBS_MODE = 3001
LBS_ACTIVITY_MODE = 3022
NIAN_MODE = 534
SPECIAL_NIAN_MODE = 535
MEITUAN_MODE = 880
NIAN_MODES = (NIAN_MODE, SPECIAL_NIAN_MODE)
SINGLE_TEAM_MODES = (*NIAN_MODES, MEITUAN_MODE)
MODES = (MODE, SEAL_MODE, LBS_MODE, LBS_ACTIVITY_MODE, *SINGLE_TEAM_MODES)
ENGINE = "battleengine.engine.WorldBossEngine"
LBS_ENGINE = "battleengine.engine.LBSBossEngine"
LBS_ACTIVITY_ENGINE = "battleengine.engine.LBSActivityBossEngine"
LBS_ACTIVITY_SKILLS = (101010, 101011, 101012, 101013)
LBS_ACTIVITY_ASSIST = 101006
LBS_ACTIVITY_SECONDS = 300
LBS_ACTIVITY_ENTRIES = {
    19042: (52, 408, "广州塔"),
    19043: (53, 409, "上海五角场"),
}
NIAN_ENTRIES = dict(zip((19015, 19016, 19017, 19018, 19019, 19020, 19026), range(238, 245)))
NIAN_STAGES = dict(zip(range(3340141, 3340150), range(10, 51, 5)))
SPECIAL_NIAN_STAGES = dict(zip(range(3340150, 3340156), range(1, 7)))
ARCHIVED_NIAN_STAGES = (3340033, 3340034)
NIAN_ENGINE = "battleengine.engine.NormalLBSNianEngine"
SPECIAL_NIAN_ENGINE = "battleengine.engine.SpecialLBSNianEngine"
NIAN_PASSIVE = 62050
SPECIAL_NIAN_WINDOW = 600
NIAN_PHASES = ("step_1", "step_2", "step_3")
SHARED_HP_LINEUP_SLOTS = (3, 4, 5, 6, 2)
MEITUAN_ENTRIES = tuple(range(19033, 19038))
MEITUAN_STAGES = dict(zip(range(20140, 20149), range(10, 51, 5)))
MEITUAN_ENGINE = "battleengine.engine.MTLBSBossEngine"
MEITUAN_SKILLS = (61270, 61271)
MEITUAN_ENEMIES = (4262369, 4262208, 4262312, 4262281, 4262301, 4262342)
SOURCE_HASHES = {
    NIAN_ENGINE: "294a00b948adb8855bf45e686b470ec987cd289b865a4c9dcdf9f1b5af8f4256",
    SPECIAL_NIAN_ENGINE: "48a2b5ffb7dcc0feb1172c13023cf503ba131b1acb70c5a42d5a9acda5a4f9f5",
    MEITUAN_ENGINE: "438bf4444da738e084f33dfe72a46c706945a840ffad2231d2e391e5124fe699",
    ENGINE: "d11c14d3eb97e361bee50a58ac8666a56f3332b484e851a8dde36a80c7fe53b4",
    LBS_ENGINE: "045487760b52efb8c5f3157471c4cc8d21a3a3cb020fc1e11310cd4f17386a7d",
    LBS_ACTIVITY_ENGINE: "e5fceb3cace7a72b6b323b83db6cfafe6a5bfb4a1dce013a84388992b32b9062",
    "com.data.cdata.map_boss": "d88b6c83b76e7daa399684185869702a2e4e94f179dc58f0c9cb8b718f8e2a2f",
}
KINDS = {
    69: ("stone", "is_Shi_Ju", 44, 23),
    73: ("angryStone", "is_Angry_Shi_Ju", 40055, 9991101),
    70: ("yearBeast", "is_Nian_Shou", 51, 30),
    74: ("yearBeast", "is_Nian_Shou", 51, 30),
    75: ("yearBeast", "is_Nian_Shou", 51, 30),
}
POSITIONS = {2: ((5, 6), (2, 3, 4)), 3: ((3,), (2, 5), (4, 6))}


def party_positions(mode, players):
    if players == 1:
        if mode in (*SINGLE_TEAM_MODES, LBS_ACTIVITY_MODE):
            return ((2, 3, 4, 5, 6),)
        return ((2, 3, 4),) if mode == LBS_MODE else None
    if mode in SINGLE_TEAM_MODES:
        return None
    return POSITIONS.get(players)


def is_fragment_entry(entry_id, row):
    return row.get("type") == 1 and str(entry_id) not in {"10", "11"}


def entry_for_stage(entries, stage_id, mode=None):
    for route_mode, stages, map_ids, kind, scene, boss in (
            (NIAN_MODE, NIAN_STAGES, NIAN_ENTRIES, "lbsNianNormal", 40061, 100031),
            (MEITUAN_MODE, MEITUAN_STAGES, MEITUAN_ENTRIES, "meituan", 41146, MEITUAN_ENEMIES[0])):
        if mode in (None, route_mode) and stage_id in stages:
            expected = (stage_id, stages[stage_id])
            if not all(any(tuple(pair) == expected for pair in entries.get(entry_id, {}).get("gk_list", ()))
                       for entry_id in map_ids):
                return None
            return kind, None, scene, boss, expected[1]
    if mode in (None, SPECIAL_NIAN_MODE) and stage_id in SPECIAL_NIAN_STAGES:
        return "lbsNianSpecial", None, 40061, 100031, SPECIAL_NIAN_STAGES[stage_id]
    if mode in (None, MODE):
        for entry_id, (kind, flag, scene, boss) in KINDS.items():
            for stage, level in entries.get(entry_id, {}).get("gk_list", ()):
                if stage == stage_id:
                    return kind, flag, scene, boss, level
    if mode in (None, LBS_ACTIVITY_MODE):
        for entry_id in LBS_ACTIVITY_ENTRIES:
            for stage, level in entries.get(entry_id, {}).get("gk_list", ()):
                if stage == stage_id:
                    return "lbsActivity", None, 233, None, level
    if mode in (None, SEAL_MODE, LBS_MODE):
        for entry_id, row in entries.items():
            kind = "seal" if mode != LBS_MODE and is_fragment_entry(entry_id, row) else (
                "lbs" if mode != SEAL_MODE and row.get("type") == 2 else None)
            if not kind:
                continue
            for stage, level in row.get("gk_list", ()):
                if stage == stage_id:
                    return kind, None, 39, None, level
    return None


class MapBossReplay:
    lbs_activity = False
    lineup_slots = None

    def __init__(self, modules, stage_id, players, mode):
        from com import const
        from com.data.cdata import map_boss
        from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

        engine_source = {LBS_MODE: LBS_ENGINE, LBS_ACTIVITY_MODE: LBS_ACTIVITY_ENGINE}.get(mode, ENGINE)
        sources = (engine_source, "com.data.cdata.map_boss")
        if any(modules.rows[name]["marshalSHA256"] != SOURCE_HASHES[name] for name in sources):
            raise ValueError("The map boss engine or stage table has changed")
        entry = entry_for_stage(map_boss.data, stage_id, mode)
        self.positions = party_positions(mode, players)
        if entry is None or not self.positions:
            raise ValueError("Map boss replay requires a verified stage and player count")
        self.kind, flag, scene, self.boss_id, self.level = entry
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group_id = stage["groupid"]
        formation = BattleMonstersInfo.data[self.group_id]
        if self.group_id != stage_id or stage.get("shishentotal") != 5 or formation["resindex"] != scene:
            raise RuntimeError("Original map boss stage and formation disagree")
        waves = formation["MonstersInfos"]
        self.wave_count = len(waves)
        self.lbs_activity = mode == LBS_ACTIVITY_MODE
        if self.lbs_activity:
            if stage.get("battleTime") != LBS_ACTIVITY_SECONDS or [len(wave) for wave in waves] != [3]:
                raise RuntimeError("Original LBS activity timing or formation differs from the verified route")
        elif flag is None:
            if [len(wave) for wave in waves] != [4, 4, 6]:
                raise RuntimeError("Original map boss has an unexpected set of waves")
        elif len(waves) != 1 or waves[0][0][:2] != [1, self.boss_id]:
            raise RuntimeError("Original map boss has an unexpected starting enemy")
        self.expected = [[(pos, proto, level) for pos, proto, level, *_ in wave] for wave in waves]
        self.const = const
        params = {"pve_data_flag": str(stage_id)}
        if flag:
            params[flag] = True
        if self.lbs_activity:
            from battleengine.engine.LBSActivityBossEngine import LBSActivityBossEngine, YYS_EXTRA_PASSIVE_SKILL_ID

            if YYS_EXTRA_PASSIVE_SKILL_ID != LBS_ACTIVITY_SKILLS[-1]:
                raise RuntimeError("Original LBS activity uses a different passive")
            self.engine = LBSActivityBossEngine(params)
            self.engine.battleMode = const.BattleMode.MODE_LBS_ACTIVITY_BOSS_NEW
            self.started = None
            self.passive_verified = False
            self.observe_deadline()
        elif mode == LBS_MODE:
            from battleengine.engine.LBSBossEngine import LBSBossEngine

            self.engine = LBSBossEngine(params)
            self.engine.battleMode = const.BattleMode.MODE_LBS_BOSS
        else:
            from battleengine.engine.WorldBossEngine import WorldBossEngine

            self.engine = WorldBossEngine(params)
            self.engine.battleMode = (const.BattleMode.MODE_YAOQI_FB_BATTLE if mode == SEAL_MODE
                                      else const.BattleMode.MODE_WORLD_BOSS)
        if self.engine.battleMode != mode or self.engine.combineSceneInfoId != scene:
            raise RuntimeError("The original map boss initialized another scene")
        if flag:
            self.engine.onCalcRewards = self.observe_rewards
        self.reward_inputs = {}
        self.waves = []
        self.observe_waves()

    def assign_players(self, player, fighters):
        return assign_local_party(player, fighters, self.positions)

    def verify_players(self, controllers):
        verify_local_party(controllers, self.positions)

    def verify_selection(self, controllers):
        onmyoji = verify_local_party_selection(self.engine, controllers, self.lineup_slots or self.positions)
        if self.lbs_activity:
            skill = onmyoji.SkillMgrComp.getSkillComp(LBS_ACTIVITY_SKILLS[-1])
            self.passive_verified = skill is not None and skill.skillLevel == 1
            if not self.passive_verified:
                raise RuntimeError("The original LBS activity did not install the Onmyoji passive")

    def observe_deadline(self):
        set_deadline = self.engine.set_haltBattleTime

        def record_deadline(value):
            now = self.engine.now_time()
            if value is None or abs(value - now - LBS_ACTIVITY_SECONDS) > 1e-7:
                raise RuntimeError("The original LBS activity set a different battle limit")
            self.started = now
            return set_deadline(value)

        self.engine.set_haltBattleTime = record_deadline

    def observe_waves(self):
        spawn, create = self.engine._createNextRoundMons, self.engine.createMonsterEntity

        def start_wave():
            wave = self.engine.finishedWaveCount
            if wave >= self.wave_count:
                return spawn()
            if wave != len(self.waves):
                raise RuntimeError("The original map boss wave order changed")
            observed = []

            def create_enemy(camp, owner, placement):
                entity = create(camp, owner, placement)
                observed.append((entity.posIndex, entity.protoid, entity.AttrComp.level))
                return entity

            self.engine.createMonsterEntity = create_enemy
            try:
                result = spawn()
            finally:
                self.engine.createMonsterEntity = create
            if observed != self.expected[wave]:
                raise RuntimeError("The original map boss generated a different formation")
            self.waves.append(observed)
            return result

        self.engine._createNextRoundMons = start_wave

    def observe_rewards(self, ratio, *args):
        if self.kind == "angryStone":
            count, player_id = args
        elif self.kind == "yearBeast":
            player_id, count = args
        else:
            player_id, = args
            count = 0
        self.reward_inputs[player_id] = (ratio, count)
        return {}

    def report(self, outcome):
        if not self.waves or outcome == "win" and len(self.waves) != self.wave_count:
            raise RuntimeError("The original map boss did not create enemies")
        if self.lbs_activity:
            if self.started is None or not self.passive_verified:
                raise RuntimeError("The original LBS activity did not start combat")
            return {"kind": self.kind, "level": self.level, "players": len(self.positions),
                    "positions": self.positions, "waves": self.waves, "passiveSkill": LBS_ACTIVITY_SKILLS[-1],
                    "deadlineSeconds": LBS_ACTIVITY_SECONDS, "timedOut": outcome == "loss" and bool(self.engine.isHaltBattle),
                    "combatSeconds": round(self.engine.now_time() - self.started, 6)}
        if self.wave_count > 1:
            return {"kind": self.kind, "level": self.level, "players": len(self.positions),
                    "positions": self.positions, "waves": self.waves}
        rewards = None
        if outcome == "win":
            if set(self.reward_inputs) != set(range(1, len(self.positions) + 1)) or len(set(self.reward_inputs.values())) != 1:
                raise RuntimeError("The original map boss did not settle identical reward inputs for every teammate")
            ratio, paper_men = next(iter(self.reward_inputs.values()))
            rewards = {"phaseDamageRatio": ratio, "paperManCount": paper_men}
        return {"kind": self.kind, "level": self.level, "bossId": self.boss_id, "players": len(self.positions),
                "positions": self.positions, "opening": self.waves[0], "rewardInputs": rewards}


class SoloNianRaid:
    """Receive the original team's broadcasts in a room with one participant."""

    def __init__(self):
        self.win_sent = False

    def raid_send_property(self, header, name, value, merge_policy):
        # The only participant already has its own local boss HP and stage changes.
        pass

    def raid_send_msgs(self, header, messages):
        self.win_sent |= any(message["op"] == "battle_win" for message in messages)


class NianReplay(MapBossReplay):
    lineup_slots = (SHARED_HP_LINEUP_SLOTS,)

    def __init__(self, modules, stage_id, players, mode, start_time):
        from com import const
        from com.data.cdata import map_boss
        from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

        self.special = mode == SPECIAL_NIAN_MODE
        engine_name = SPECIAL_NIAN_ENGINE if self.special else NIAN_ENGINE
        for name in (engine_name, "com.data.cdata.map_boss"):
            if modules.rows[name]["marshalSHA256"] != SOURCE_HASHES[name]:
                raise ValueError("The LBS Nian engine or stage table has changed")
        entry = entry_for_stage(map_boss.data, stage_id, mode)
        self.positions = party_positions(mode, players)
        if not entry or not self.positions:
            raise ValueError("LBS Nian replay requires a verified stage and one participant")
        self.kind, _, scene, self.boss_id, self.level = entry
        self.const = const
        self.group_id = stage_id
        self.wave_count = 1
        self.waves = []
        self.phases = []
        self.start_time = start_time

        stage_key = str(stage_id)
        stage = DATA_PVE_STAGE_DATA.data[stage_key]
        formation = BattleMonstersInfo.data[stage_id]
        waves = formation["MonstersInfos"]
        if (stage["groupid"] != stage_id or stage["shishentotal"] != 5 or formation["resindex"] != scene
                or stage.get("battleTime") is not None or [len(wave) for wave in waves] != [1]
                or waves[0][0][:2] != [1, self.boss_id]):
            raise RuntimeError("The original LBS Nian stage has a different opening")
        self.expected = [[tuple(waves[0][0][:3])]]
        params = {"pve_data_flag": stage_key, "teamUid": "local-nian"}
        if self.special:
            from battleengine.engine.SpecialLBSNianEngine import SpecialLBSNianEngine

            self.raid = SoloNianRaid()
            self.shared_max_hp = SpecialLBSNianEngine.calcSharedMonMaxHp(stage_key, True)
            if set(self.shared_max_hp) != {"0_1", "0_2"} or min(self.shared_max_hp.values()) <= 0:
                raise RuntimeError("The original special LBS Nian shared HP data has changed")
            params.update(team=self.raid, raid_header={"status": 1}, boss_info={
                "id": "local-nian", "timeout": start_time + SPECIAL_NIAN_WINDOW,
                "total_attackers": 1, "boss_hp": self.shared_max_hp.copy(),
            })
            self.engine = SpecialLBSNianEngine(params)
            self.engine.battleMode = const.BattleMode.MODE_SPECIAL_LBS_NIANSHOU_2021
        else:
            from battleengine.engine.NormalLBSNianEngine import NormalLBSNianEngine

            params.update(is_leader=True, status_info={"status": 1})
            self.engine = NormalLBSNianEngine(params)
            self.engine.battleMode = const.BattleMode.MODE_NORMAL_LBS_NIANSHOU_2021
        if self.engine.battleMode != mode or self.engine.combineSceneInfoId != scene:
            raise RuntimeError("The original LBS Nian engine initialized a different scene")
        self.observe_waves()
        change = self.engine.change_to_state

        def record_phase(state, param_dict=None):
            previous = self.engine.state
            result = change(state, param_dict)
            if self.engine.state != previous:
                self.phases.append(self.engine.state)
            return result

        self.engine.change_to_state = record_phase

    def verify_selection(self, controllers):
        super().verify_selection(controllers)
        boss = self.engine.boss_entity
        passive = boss.SkillMgrComp.getSkillById(NIAN_PASSIVE)
        if passive is None or passive.skillLevel != 1:
            raise RuntimeError("The original LBS Nian did not install the boss passive")
        self.opening_hp = boss.AttrComp.hp
        expected_hp = self.shared_max_hp["0_1"] if self.special else boss.AttrComp.maxHp
        if self.opening_hp != expected_hp or self.special and boss.uid not in self.engine.sharedEntityUids:
            raise RuntimeError("The original LBS Nian did not start at full boss HP")

    def report(self, outcome):
        engine = self.engine
        ordered = [phase for phase in NIAN_PHASES if phase in self.phases]
        if not self.waves or self.phases[:1] != [NIAN_PHASES[0]] or self.phases != ordered:
            raise RuntimeError("The original LBS Nian did not follow the verified phase order")
        timed_out = bool(engine.is_timeout)
        remaining_hp = engine.boss_entity.AttrComp.hp
        if outcome == "win" and (remaining_hp != 0 or self.special and not self.raid.win_sent):
            raise RuntimeError("The original LBS Nian did not confirm the boss defeat")
        return {"kind": self.kind, "level": self.level, "bossId": self.boss_id, "players": 1,
                "positions": self.positions, "lineupSlots": SHARED_HP_LINEUP_SLOTS, "opening": self.waves[0], "passiveSkill": NIAN_PASSIVE,
                "openingHp": self.opening_hp, "remainingHp": remaining_hp, "phases": self.phases,
                "personalDamage": engine.myTotalDmg if self.special else engine.my_total_damage,
                "raidWindowSeconds": SPECIAL_NIAN_WINDOW if self.special else None, "timedOut": timed_out,
                "roomElapsedSeconds": round(engine.now_time() - self.start_time, 6)}


class MeituanTeam:
    """One local participant, with the group properties read by the original engine."""

    def __init__(self, uid):
        self.battle_teams = {uid: {"bmembers": [1]}}
        self.properties = {}
        self.winner = None

    def group_get_property(self, team_uid, name, default):
        return self.properties.get(name, default)

    def group_set_property(self, team_uid, name, value):
        self.properties[name] = value

    def group_forward_msgs(self, team_uid, messages):
        for message in messages:
            if message["op"] == "members_win" and message["params"]["member_id"] == 1:
                self.winner = message["params"]["winCamp"]


class MeituanReplay(MapBossReplay):
    lineup_slots = (SHARED_HP_LINEUP_SLOTS,)

    def __init__(self, modules, stage_id, players):
        from com import const
        from com.data.cdata import map_boss
        from DynamicConfigData import DATA_CONSTANT, DATA_PVE_STAGE_DATA, BattleMonstersInfo
        from battleengine.engine.MTLBSBossEngine import MTLBSBossEngine

        for name in (MEITUAN_ENGINE, "com.data.cdata.map_boss"):
            if modules.rows[name]["marshalSHA256"] != SOURCE_HASHES[name]:
                raise ValueError("The Meituan engine or stage table has changed")
        entry = entry_for_stage(map_boss.data, stage_id, MEITUAN_MODE)
        self.positions = party_positions(MEITUAN_MODE, players)
        if not entry or not self.positions:
            raise ValueError("Meituan replay requires a verified banquet stage and one participant")
        self.kind, _, scene, self.boss_id, self.level = entry
        self.const = const
        self.group_id = stage_id
        self.wave_count = 1
        self.waves = []
        self.started = None
        self.final_hp = None
        stage_key = str(stage_id)
        stage = DATA_PVE_STAGE_DATA.data[stage_key]
        formation = BattleMonstersInfo.data[stage_id]
        self.expected = [[(slot, enemy, min(self.level, 40)) for slot, enemy in enumerate(MEITUAN_ENEMIES, 1)]]
        if (stage["groupid"] != stage_id or stage["shishentotal"] != 5 or stage.get("battleTime") is not None
                or formation["resindex"] != scene
                or [[tuple(enemy[:3]) for enemy in wave] for wave in formation["MonstersInfos"]] != self.expected):
            raise RuntimeError("The original Meituan stage has a different opening")
        if DATA_CONSTANT.data[10090]["value"] != [2, 2.8, 3.6, 4.3, 5]:
            raise RuntimeError("The original Meituan team HP scaling has changed")

        uid = "local-meituan"
        self.team = MeituanTeam(uid)
        self.engine = MTLBSBossEngine({"pve_data_flag": stage_key, "teamUid": uid, "team": self.team, "is_leader": True})
        self.engine.battleMode = const.BattleMode.MODE_LBS_MEITUAN_BOSS
        if self.engine.battleMode != MEITUAN_MODE or self.engine.combineSceneInfoId != scene:
            raise RuntimeError("The original Meituan engine initialized a different scene")
        self.observe_waves()
        change = self.engine.onBattleStateChanged
        finish = self.engine.doBattleEnded

        def record_start(*args):
            result = change(*args)
            if self.started is None and self.engine.battleState == const.BattleState.BS_STARTED:
                self.started = self.engine.now_time()
            return result

        def record_end(camp):
            self.final_hp = self.boss.AttrComp.hp
            return finish(camp)

        self.engine.onBattleStateChanged = record_start
        self.engine.doBattleEnded = record_end

    def verify_selection(self, controllers):
        super().verify_selection(controllers)
        self.boss = self.engine.getAliveEntity(self.engine.bossUid)
        if (self.boss.protoid != self.boss_id or self.boss.posIndex != 1 or self.boss.AttrComp.hp != 1
                or self.boss.AttrComp.specialMaxHpAdditionRate != 2 or self.boss.uid not in self.engine.shared_entity_uids
                or any(self.boss.SkillMgrComp.getSkillById(skill) is None for skill in MEITUAN_SKILLS)):
            raise RuntimeError("The original Meituan engine did not initialize the banquet mechanics")
        self.target_hp = self.boss.AttrComp.maxHp

    def report(self, outcome):
        if not self.waves or self.started is None or self.engine.timeout_stamp is not None:
            raise RuntimeError("The original Meituan battle did not start with the verified rules")
        completion_hp = self.final_hp if self.final_hp is not None else self.boss.AttrComp.hp
        if outcome == "win" and (completion_hp < self.target_hp or self.team.winner != self.const.CampFlag.CAMP1):
            raise RuntimeError("The original Meituan engine did not confirm full satisfaction")
        return {"kind": self.kind, "level": self.level, "players": 1, "positions": self.positions,
                "lineupSlots": SHARED_HP_LINEUP_SLOTS, "opening": self.waves[0], "skills": MEITUAN_SKILLS,
                "bossId": self.boss_id, "openingHp": 1, "targetHp": self.target_hp, "completionHp": completion_hp,
                "personalSatisfaction": self.engine.my_total_damage,
                "combatSeconds": round(self.engine.now_time() - self.started, 6)}
