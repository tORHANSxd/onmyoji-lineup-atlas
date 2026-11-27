"""Replay the base-state encounters from the original Shan Feng trial engine."""

import sys
from types import ModuleType

from pve_clock import NativePveClock


SHANFENG_MODE = 660
SHANFENG_STAGES = {*range(3340001, 3340017), 3340017, 3340019, 3340021}
SHANFENG_ACTOR = (1454, 40)
SHANFENG_DEADLINE = 180
SHANFENG_WALL_SECONDS = 145
ENGINE_MODULE = "battleengine.engine.SpShanFengHardEngine"
CONSTANT_MODULE = "com.data.cdata.super_ghost6_constant"
NATIVE_HASHES = {
    ENGINE_MODULE: "1c19a9c038a3c9cdb95d6fa2b97469c3745859fe7cd28db276c8edcba17f935f",
    CONSTANT_MODULE: "76a913700fd649ef9fdce10ecb3436a4614bbdad42ba1d8b16a3e3d83b586150",
}


def is_shanfeng_stage(stage):
    return 3340001 <= stage <= 3340022


def bind_constant_table(modules):
    for name, digest in NATIVE_HASHES.items():
        if modules.rows.get(name, {}).get("marshalSHA256") != digest:
            raise RuntimeError("The original Shan Feng replay resources differ")

    from com.data.cdata import super_ghost6_constant

    # The engine shares its code with the server. The client ships the
    # corresponding activity constants, without the server's lookup module.
    def constant(table, key):
        if table is not constants or key not in (5, 6, 7, 16, 17, 18):
            raise RuntimeError("Unexpected Shan Feng server constant lookup")
        values = table.data[key]["value"]
        return values[0] if len(values) == 1 else values

    package = sys.modules.setdefault("cdata", ModuleType("cdata"))
    package.__path__ = getattr(package, "__path__", [])
    constants = ModuleType("cdata.sg_constant")
    constants.data = super_ghost6_constant.data
    helpers = ModuleType("module.helpers")
    helpers.activity_get_const_value = constant
    if any(name in sys.modules for name in (constants.__name__, helpers.__name__)):
        raise RuntimeError("The offline Shan Feng constant bridge is already bound")
    sys.modules[constants.__name__] = constants
    sys.modules[helpers.__name__] = helpers


class ShanFengReplay:
    def __init__(self, modules, stage_id):
        if stage_id not in SHANFENG_STAGES:
            raise ValueError("Select a verified Shan Feng activity encounter")
        bind_constant_table(modules)

        from battleengine.engine.SpShanFengHardEngine import SpShanFengHardEngine, const
        from com.data.cdata import super_ghost6_pve
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        self.const = const
        self.day = 0 if stage_id < 3340017 else (stage_id - 3340017) // 2 + 1
        config = super_ghost6_pve.data[17 if self.day else stage_id - 3340000]
        expected = config[f"final_battle_id_day{self.day}"][0] if self.day else config["battle_id"]
        if int(expected) != stage_id:
            raise RuntimeError("The original activity selected a different formation")
        self.stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[self.stage["groupid"]]
        self.engine = SpShanFengHardEngine({
            "pve_data_flag": str(stage_id),
            "act_params": {"game_type": self.day, "superheroids": [], "super_vals": [0, 0]},
        })
        self.engine.battleMode = SHANFENG_MODE
        if (self.engine.get_limit_seconds() != SHANFENG_DEADLINE
                or tuple(self.engine.get_game_const_value(7)) != SHANFENG_ACTOR
                or self.engine.monstergroup != stage_id or self.stage["shishentotal"] != 5):
            raise RuntimeError("The original Shan Feng activity used different battle conditions")
        self.clock = NativePveClock(self.engine, SHANFENG_DEADLINE)
        self.actor = None
        self.waves = []
        self.observe_formation()

    def observe_formation(self):
        spawn, create = self.engine._createNextRoundMons, self.engine.createMonsterEntity

        def observe_spawn():
            index = self.engine.finishedWaveCount
            expected = [(pos, proto, level) for pos, proto, level, *_ in self.group["MonstersInfos"][index]]
            seen = []

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                seen.append((entity.posIndex, entity.protoid, placement.level))
                return entity

            self.engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                self.engine.createMonsterEntity = create
            if sorted(seen) != sorted(expected):
                raise RuntimeError("The original Shan Feng activity spawned a different formation")
            self.waves.append(index)
            return result

        self.engine._createNextRoundMons = observe_spawn

    def check_actor(self, controller):
        units = [unit for unit in self.engine.heroEntities.values()
                 if unit.ownerController is controller and unit.posIndex == 1]
        if len(units) != 1 or (units[0].protoid, units[0].AttrComp.level) != SHANFENG_ACTOR:
            raise RuntimeError("The original Shan Feng activity did not create its fixed actor")
        self.actor = {"id": units[0].protoid, "level": units[0].AttrComp.level, "position": 1}

    def report(self):
        if self.actor is None or self.clock.started is None or not self.waves:
            raise RuntimeError("The original Shan Feng battle did not start")
        engine = self.engine
        return {"actor": self.actor, "day": self.day, "deadlineSeconds": SHANFENG_DEADLINE,
                "timedOut": engine.isHaltBattle, "damage": engine.final_score(),
                "combatSeconds": round(engine.now_time() - self.clock.started, 6)}
