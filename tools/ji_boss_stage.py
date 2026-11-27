"""Replay original Shiki boss encounters using a known local lineup."""

from pve_clock import NativePveClock


JI_BOSS_MODE = 926
JI_BOSS_SCENE = 128
JI_BOSS_STAGES = {505101: 1, 505102: 4, 505103: 2, 505104: 5, 505105: 3, 505106: 6}
JI_BOSS_SUPPORTED = JI_BOSS_STAGES.keys() - {505105}
JI_STORY_ACTOR_STAGE = 505103
JI_BOSS_WALL_SECONDS = 175


class JiBossReplay:
    def __init__(self, stage_id):
        from battleengine.engine.JiBossEngine import JiBossEngine, const
        from com.data.cdata import shiki_boss
        from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_NORMAL_BATTLE_YYS_REPLACE,
                                       DATA_PVE_STAGE_DATA)

        if stage_id not in JI_BOSS_SUPPORTED:
            raise ValueError("The Shiki boss encounter requires a verified original actor and formation")
        level = JI_BOSS_STAGES[stage_id]
        self.day = (level - 1) % 3 + 1
        self.hard = level > 3
        config = shiki_boss.data[level]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[JI_BOSS_MODE]
        self.limit = stage.get("battleTime") or rules["halt_time"]
        if (config["battle_id"] != stage_id or config["boss_type"] != 1 + self.hard
                or self.group["ID"] != stage_id or self.group["resindex"] != JI_BOSS_SCENE
                or len(self.group["MonstersInfos"]) != 1 or stage["shishentotal"] != 5
                or self.limit != (180 if self.hard else 300) or rules["group_battle"]):
            raise RuntimeError("The original Shiki boss formation or rules differ")

        self.fixed_actor = None
        if stage_id == JI_STORY_ACTOR_STAGE:
            replace_id = JiBossEngine.getConstantValue(37)
            replacement = DATA_NORMAL_BATTLE_YYS_REPLACE.data[replace_id]
            self.fixed_actor = tuple(replacement[key] for key in ("yys_id", "yys_level", "yys_star"))
            if replace_id != 19 or self.fixed_actor != (1805, 40, 6):
                raise RuntimeError("The original Shiki story actor differs")

        self.const = const
        self.engine = JiBossEngine({"pve_data_flag": str(stage_id), "battle_day": self.day, "hard_mode": self.hard})
        self.engine.battleMode = JI_BOSS_MODE
        self.clock = NativePveClock(self.engine, self.limit)
        self.actor = None
        self.formation_verified = False
        self.observe_opening()

    def observe_opening(self):
        engine = self.engine
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
        expected = sorted((pos, proto, level) for pos, proto, level, *_ in self.group["MonstersInfos"][0])

        def verify_spawn():
            opened = []

            def create_witness(camp, owner, placement):
                entity = create(camp, owner, placement)
                if camp == self.const.CampFlag.CAMP2:
                    opened.append((entity.posIndex, entity.protoid, placement.level))
                return entity

            engine.createMonsterEntity = create_witness
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if sorted(opened) != expected:
                raise RuntimeError("The original Shiki boss spawned a different formation")
            self.formation_verified = True
            return result

        engine._createNextRoundMons = verify_spawn

    def check_actor(self, controller, expected_actor):
        engine = self.engine
        unit = engine.getCampYYSHeroEntity(self.const.CampFlag.CAMP1)
        if unit is None or unit.ownerController is not controller or unit.posIndex != 1:
            raise RuntimeError("The original Shiki boss did not create its selected actor")
        actual = (unit.protoid, unit.AttrComp.level, unit.AttrComp.star)
        if actual != (self.fixed_actor or expected_actor) or bool(engine.replace_yys_flag) != bool(self.fixed_actor):
            raise RuntimeError("The original Shiki boss used a different actor")
        self.actor = {"id": actual[0], "level": actual[1], "star": actual[2], "replaced": bool(self.fixed_actor)}

    def report(self, completed):
        if not self.formation_verified or self.clock.started is None or self.actor is None:
            raise RuntimeError("The original Shiki boss did not begin combat")
        engine = self.engine
        damage = engine.get_my_total_damage()
        if type(damage) is not int or damage < 0 or completed and engine.statistics.sphiganbanady.get("total_dps") != damage:
            raise RuntimeError("The original Shiki boss did not return its verified damage total")
        return {"day": self.day, "hard": self.hard, "actor": self.actor, "deadlineSeconds": self.limit,
                "damage": damage, "timedOut": engine.isHaltBattle,
                "combatSeconds": round(engine.now_time() - self.clock.started, 6)}
