"""Inventory replays for the Devil Feast and Kyoto Investigation battle routes."""

from types import FunctionType, MethodType, SimpleNamespace


DEVIL_FEAST_MODE = 445
DEVIL_FEAST_TEAM = 190
DEVIL_FEAST_ACTIVITY = 1417
DEVIL_FEAST_FARM = (*range(450200, 450208), *range(450210, 450214))
DEVIL_FEAST_ENCOUNTERS = range(450215, 450231)
DEVIL_FEAST_BOSSES = range(450231, 450239)
DEVIL_FEAST_STAGES = (*DEVIL_FEAST_FARM, *DEVIL_FEAST_ENCOUNTERS, *DEVIL_FEAST_BOSSES)
DEVIL_FEAST_WALL_SECONDS = 145
TOWER_MODE = 502
TOWER_TEAM = 211
TOWER_GROUP_STAGES = range(461001, 461177)
TOWER_SOLO_STAGES = range(463001, 463131)
TOWER_BOSS_STAGES = range(462026, 462177)
TOWER_WALL_SECONDS = 175
SOURCES = {
    "battleengine.engine.DevilFeastEngine": "63b9fd2c3a691fd0cf5b0f1290d30bb08c8552873bcf86d25c865d669e9b7695",
    "module.devil_feast.Const": "3b685a517c0a8c614d6acdba795b2da28aeaf619f53622f141773d6b79509311",
    "module.team_types.team_type_deveil_feast": "62aafd67bed442898cf5755d300efe5c888944b27e1694207e0caa32406e62fa",
    "com.data.cdata.devil_battle": "f92a158479df35fb011e93549b8ff57009bb5e430926781bf07bc525952e04ae",
    "com.data.cdata.devil_feast_event5": "efba80263597811631f7269d7a9871a4d223080eb1331941b59b2e3e819a36be",
    "com.data.cdata.devil_feast_event6": "4e4fb56d24369f673d01c9e1fd31300a2bca274bb46321a07a64f4e8d527e99c",
    "com.data.cdata.devil_feast_event7": "7a780530eb8b3a02cc557198915519d64f78079a5a795eb87142e0f8f54b7ecc",
}
TOWER_SOURCES = {
    "battleengine.engine.GhostKingEngine": "1ffefd1ad7410850c8956b21b6c243a358813367515f52b2f9aefeb7752d3f85",
    "battleengine.engine.JSNormalEngine": "8187430f673787f702577fb3c292d6cafe2517bd46800e9befe44dd16dee90de",
    "module.team_types.team_type_ghost_king_normal": "f43f433d0ac4037dfa138f76d193df89d1b77c73f0347fc22cc96b8ea437bf0c",
    "module.happydinner.HappydinnerBattlePanel": "2e8a22be026bd5540b2c25fceca999838e798fd075d5624dd1099dbb7e224e89",
    "module.happydinner.HappydinnerTowerPanel": "a38225ac17239ff691831f5cb78b9415bab60747f6a46e00488106a8cad3a1e4",
    "com.data.cdata.feast_for_devils_tower_event1": "501ece59f5781daacdfb28ea77ccc30ff15ee2f2378489c5483d70a29c512264",
    "com.data.cdata.feast_for_devils_tower_event1_danti": "bf758528a756e221aa91a50cad5378fcf734d7d7b3480a0087d2aeb082eefcce",
    "com.data.cdata.feast_for_devils_tower_event1_boss": "d04b030fed1648c6b6f24e362475cc59ddeaacea6496fa0de96ddc991b7a36e3",
    "com.data.cdata.feast_for_devils_tower_event6": "770b3db477b271dfe81c4a355938972abd89e8825ae03c69e498a190fd1ae2ae",
    "com.data.cdata.feast_for_devils_dawnexpedition": "9f87699dbbc119126bcc42ea699d929beee1cfd3850b6d9dcce70c6cf355f40b",
    "com.data.cdata.feast_for_devils_const": "56121d8b95f51421b859da1fa489df05cc1409b54a06bee9c3159b659f22a676",
    "com.data.cdata.pve_stage_data": "7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0",
    "com.data.cdata.BattleMonstersInfo": "8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111",
}


def tower_stage_kind(stage_id):
    if stage_id in TOWER_GROUP_STAGES:
        return "group"
    if stage_id in TOWER_SOLO_STAGES:
        return "solo"
    if stage_id in TOWER_BOSS_STAGES:
        return "boss"
    return None


def valid_tower_settings(settings, kind):
    if (type(settings) is not dict or set(settings) - {"blessings", "factions", "enemyHp"}
            or not isinstance(blessings := settings.get("blessings"), list) or len(blessings) > 6
            or any(type(row) is not list or len(row) != 2 or type(row[0]) is not int or not 1 <= row[0] <= 18
                   or type(row[1]) is not int or not 1 <= row[1] <= 11 for row in blessings)
            or len({row[0] for row in blessings}) != len(blessings)
            or not isinstance(factions := settings.get("factions"), list)
            or any(type(faction) is not int or not 1100 <= faction <= 1105 for faction in factions)
            or len(set(factions)) != len(factions)):
        return False
    if "enemyHp" not in settings:
        return True
    hp = settings["enemyHp"]
    return (kind == "boss" and type(hp) is list and len(hp) == 6
            and all(type(value) in (int, float) and 0 <= value < 2 ** 53 for value in hp) and any(hp))


class DevilFeastReplay:
    def __init__(self, modules, stage_id, boss_hp):
        from battleengine.engine.DevilFeastEngine import DevilFeastEngine, const
        from com.data.cdata import devil_battle, devil_feast_event5, devil_feast_event6, devil_feast_event7
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA
        from module.devil_feast import Const as df_const

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise ValueError("The original Devil Feast battle route changed")
        if stage_id in DEVIL_FEAST_FARM:
            configs, kind, battle_type = devil_battle.data, "farm", df_const.DFBattleType.Farm
        elif stage_id in DEVIL_FEAST_ENCOUNTERS:
            configs, kind, battle_type = devil_feast_event5.data, "encounter", df_const.DFBattleType.Normal
        else:
            configs, kind, battle_type = devil_feast_event6.data, "boss", df_const.DFBattleType.Boss
        self.config, = (row for row in configs.values() if row["battle_id"] == stage_id)
        self.kind, self.const, self.boss_hp = kind, const, boss_hp
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        wave, = self.group["MonstersInfos"]
        self.formation = sorted((pos, proto, level) for pos, proto, level, *_ in wave if proto)
        limit = 120 if kind == "boss" else stage["battleTime"]
        scene = {"farm": 51, "encounter": 1063, "boss": 1062}[kind]
        if (stage["shishentotal"] != 5 or self.group["ID"] != stage_id or self.group["resindex"] != scene or not self.formation
                or (kind == "boss" and (len(self.formation) != 1 or self.formation[0][0] != 1
                                        or "限时2分钟" not in self.config["rule_desc"]))
                or limit not in (120, 600)):
            raise RuntimeError("Unexpected Devil Feast formation or challenge time")
        self.limit, self.started, self.enemies = limit, None, []
        settings = {"time_limit": limit}
        if boss_hp is not None:
            settings["round_hp"] = {"1": boss_hp}
        self.engine = engine = DevilFeastEngine({
            "pve_data_flag": str(stage_id), "df_battle_type": battle_type, "df_battle_data": settings,
        })
        engine.battleMode = const.BattleMode.MODE_DEVIL_FEAST_BATTLE
        native_spawn = engine._createNextRoundMons.__func__
        original_import = native_spawn.__builtins__["__import__"]
        # The fixed formations use the current enum; the legacy random-wave helper is unused on these routes.
        legacy = {"module.const": SimpleNamespace(const=df_const),
                  "module.random_helper": SimpleNamespace(random_helper=None),
                  "cdata.devil_feast_event7": SimpleNamespace(devil_feast_event7=devil_feast_event7)}

        def import_legacy(name, globals_=None, locals_=None, fromlist=(), level=0):
            if name in legacy:
                return legacy[name]
            return original_import(name, globals_, locals_, fromlist, level)

        spawn_bindings = dict(native_spawn.__globals__, __builtins__=dict(native_spawn.__builtins__, __import__=import_legacy))
        self.spawn = MethodType(FunctionType(native_spawn.__code__, spawn_bindings), engine)
        engine._createNextRoundMons = self.observe_spawn

        native_deadline = engine.getHaltBattleTime.__func__
        bindings = dict(native_deadline.__globals__, time=SimpleNamespace(time=engine.now_time))
        engine.getHaltBattleTime = MethodType(FunctionType(native_deadline.__code__, bindings), engine)

    def observe_spawn(self):
        engine, create = self.engine, self.engine.createMonsterEntity
        enemies = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            enemies.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            self.spawn()
        finally:
            engine.createMonsterEntity = create
        enemies.sort(key=lambda unit: unit.posIndex)
        if self.enemies or [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in enemies] != self.formation:
            raise RuntimeError("The original Devil Feast engine created a different enemy formation")
        self.enemies = [(unit, unit.AttrComp.hp, unit.AttrComp.maxHp) for unit in enemies]
        if self.boss_hp is not None:
            _, starting_hp, maximum = self.enemies[0]
            if self.boss_hp > maximum or abs(starting_hp - self.boss_hp) > 0.001:
                raise ValueError("Starting HP exceeds the original boss's maximum health")

    def update(self):
        engine = self.engine
        if self.started is None and engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = engine.now_time()
            if abs(engine.haltBattleTime - self.started - self.limit) > 1:
                raise RuntimeError("The original Devil Feast engine set a different deadline")

    def report(self):
        if self.started is None or not self.enemies:
            raise RuntimeError("The original Devil Feast battle did not start")
        engine = self.engine
        return {"kind": self.kind, "configId": self.config["id"], "deadlineSeconds": self.limit,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": bool(engine.isHaltBattle),
                "enemies": [{"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                             "maxHp": maximum, "startingHp": hp, "remainingHp": max(0, unit.AttrComp.hp)}
                            for unit, hp, maximum in self.enemies]}


class GhostKingTowerReplay:
    def __init__(self, modules, stage_id, settings):
        from battleengine.engine.GhostKingEngine import GhostKingEngine, const
        from com.data.cdata import feast_for_devils_const, feast_for_devils_dawnexpedition
        from DynamicConfigData import (BattleMonstersInfo, DATA_HAPPYDINNER_EVENT1, DATA_HAPPYDINNER_EVENT1_BOSS,
                                       DATA_HAPPYDINNER_EVENT1_DANTI, DATA_HAPPYDINNER_EVENT6, DATA_PVE_STAGE_DATA)
        from resource_stage import SoloResourceTeam

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in TOWER_SOURCES.items()):
            raise ValueError("The archived Kyoto Investigation battle source changed")
        self.kind = tower_stage_kind(stage_id)
        table = {"group": DATA_HAPPYDINNER_EVENT1, "solo": DATA_HAPPYDINNER_EVENT1_DANTI,
                 "boss": DATA_HAPPYDINNER_EVENT1_BOSS}[self.kind]
        self.config_ids = sorted(row["id"] for row in table.data.values() if row["battleId"] == stage_id)
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        wave, = self.group["MonstersInfos"]
        self.formation = sorted((pos, proto, level) for pos, proto, level, *_ in wave if proto)
        boss = self.kind == "boss"
        if (not self.config_ids or self.group["ID"] != stage_id or stage["shishentotal"] != 5 or not self.formation
                or (boss and (len(self.config_ids) != 1 or [unit[0] for unit in self.formation] != list(range(1, 7))))):
            raise RuntimeError("Unexpected original Kyoto Investigation configuration")
        blessings, factions = settings["blessings"], settings["factions"]
        self.guest_ids = sorted({hero for faction in factions
                                 for hero in feast_for_devils_dawnexpedition.data[faction]["herolist"]})
        self.blessing_skills = [DATA_HAPPYDINNER_EVENT6.data[buff][f"level{level - 1}"] for buff, level in blessings]
        self.settings, self.const, self.started, self.enemies = settings, const, None, []
        self.hp = settings.get("enemyHp")
        self.team = SoloResourceTeam()
        self.engine = engine = GhostKingEngine({
            "pve_data_flag": str(stage_id), "is_boss": boss, "ghost_id": self.config_ids[0] if boss else 0,
            "gain_buff": blessings, "sa_heroes": self.guest_ids,
            "round_hp": {str(pos): hp for pos, hp in enumerate(self.hp, 1)} if self.hp is not None else {},
            "is_leader": True, "teamUid": 1, "team": self.team,
        })
        engine.battleMode = const.BattleMode.MODE_GHOST_KING_NORMAL
        self.limit = engine.get_limit_seconds()
        if self.limit != (120 if boss else 0) or engine.get_choose_buff_skill() != self.blessing_skills:
            raise RuntimeError("The original Kyoto Investigation engine resolved different battle rules")
        native = engine.onEntityCreated.__func__
        import_original = native.__builtins__["__import__"]

        # The original engine uses the older table name. Its client UI reads the
        # same five values from feast_for_devils_const via GHOSTKING_EX_CONST.
        original_constants = SimpleNamespace(
            ghost_king_const=SimpleNamespace(get_values=lambda key: tuple(map(float, feast_for_devils_const.data[key]["value"].split("|")))))

        def import_constants(name, globals_=None, locals_=None, fromlist=(), level=0):
            if name == "cdata.ghost_king_const":
                return original_constants
            return import_original(name, globals_, locals_, fromlist, level)

        bindings = dict(native.__globals__, __builtins__=dict(native.__builtins__, __import__=import_constants))
        engine.onEntityCreated = MethodType(FunctionType(native.__code__, bindings, closure=native.__closure__), engine)
        self.spawn = engine._createNextRoundMons
        engine._createNextRoundMons = self.observe_spawn
        timer = engine.getHaltBattleTime.__func__
        clock = dict(timer.__globals__, time=SimpleNamespace(time=engine.now_time))
        engine.getHaltBattleTime = MethodType(FunctionType(timer.__code__, clock), engine)

    def observe_spawn(self):
        engine, create = self.engine, self.engine.createMonsterEntity
        enemies = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            enemies.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            self.spawn()
        finally:
            engine.createMonsterEntity = create
        enemies.sort(key=lambda unit: unit.posIndex)
        expected = [unit for unit in self.formation if self.hp is None or self.hp[unit[0] - 1]]
        if self.enemies or [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in enemies] != expected:
            raise RuntimeError("The original Kyoto Investigation engine created a different enemy formation")
        self.enemies = [(unit, unit.AttrComp.hp, unit.AttrComp.maxHp) for unit in enemies]
        if self.hp is not None and any(abs(hp - self.hp[unit.posIndex - 1]) > 0.001 or self.hp[unit.posIndex - 1] > maximum
                                       for unit, hp, maximum in self.enemies):
            raise ValueError("Starting health exceeds the original enemy's maximum health")

    def update(self):
        engine = self.engine
        if self.started is None and engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = engine.now_time()
            if self.limit and abs(engine.haltBattleTime - self.started - self.limit) > 1:
                raise RuntimeError("The original Kyoto Investigation engine set a different deadline")

    def report(self):
        if self.started is None or not self.enemies or self.engine.group_members:
            raise RuntimeError("The original Kyoto Investigation local battle did not start")
        engine = self.engine
        return {"kind": self.kind, "configIds": self.config_ids, "settings": self.settings,
                "blessingSkills": self.blessing_skills, "guestIds": self.guest_ids, "deadlineSeconds": self.limit,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": bool(engine.isHaltBattle),
                "enemies": [{"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                             "maxHp": maximum, "startingHp": hp, "remainingHp": max(0, unit.AttrComp.hp)}
                            for unit, hp, maximum in self.enemies]}
