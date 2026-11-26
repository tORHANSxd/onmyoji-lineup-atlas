"""Inventory replay for the fixed Devil Feast battle configurations."""

from types import FunctionType, MethodType, SimpleNamespace


DEVIL_FEAST_MODE = 445
DEVIL_FEAST_TEAM = 190
DEVIL_FEAST_ACTIVITY = 1417
DEVIL_FEAST_FARM = (*range(450200, 450208), *range(450210, 450214))
DEVIL_FEAST_ENCOUNTERS = range(450215, 450231)
DEVIL_FEAST_BOSSES = range(450231, 450239)
DEVIL_FEAST_STAGES = (*DEVIL_FEAST_FARM, *DEVIL_FEAST_ENCOUNTERS, *DEVIL_FEAST_BOSSES)
DEVIL_FEAST_WALL_SECONDS = 145
SOURCES = {
    "battleengine.engine.DevilFeastEngine": "63b9fd2c3a691fd0cf5b0f1290d30bb08c8552873bcf86d25c865d669e9b7695",
    "module.devil_feast.Const": "3b685a517c0a8c614d6acdba795b2da28aeaf619f53622f141773d6b79509311",
    "module.team_types.team_type_deveil_feast": "62aafd67bed442898cf5755d300efe5c888944b27e1694207e0caa32406e62fa",
    "com.data.cdata.devil_battle": "f92a158479df35fb011e93549b8ff57009bb5e430926781bf07bc525952e04ae",
    "com.data.cdata.devil_feast_event5": "efba80263597811631f7269d7a9871a4d223080eb1331941b59b2e3e819a36be",
    "com.data.cdata.devil_feast_event6": "4e4fb56d24369f673d01c9e1fd31300a2bca274bb46321a07a64f4e8d527e99c",
    "com.data.cdata.devil_feast_event7": "7a780530eb8b3a02cc557198915519d64f78079a5a795eb87142e0f8f54b7ecc",
}


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
