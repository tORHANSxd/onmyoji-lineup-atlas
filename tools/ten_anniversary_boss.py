"""Replay the original five-phase Shichangji scoring battle."""

from math import isfinite

from ten_anniversary_stage import TEN_ACTIVITY, TEN_BOSS_STAGES, TEN_SOURCES


TEN_BOSS_MODE = 9592
TEN_BOSS_TEAM = 2322
TEN_BOSS_STAGE = TEN_BOSS_STAGES.start
TEN_BOSS_ACT = 12135
TEN_BOSS_DEADLINE = 180
TEN_BOSS_SCRIPT = "battleengine.engine.TenAnniversaryBossBattleEngine"
TEN_BOSS_ASSIST_IDS = tuple(range(106, 114))
TEN_BOSS_SOURCES = {
    TEN_BOSS_SCRIPT: "1862c6eff43a9aa5b9d57f3d44502ca99270076e4ee627616742b7f20fbf2f9b",
    "module.team_types.team_type_ten_anniversary_boss_battle": "277cc0ed77214464447db15b15d676c4469b31d4278242d7ebc33785717a0604",
    "com.data.cdata.stake_boss": "60ab59f169fd58ec7d2af41cafa702234c7548b7acdcd08a94b7ee158348cd4d",
    "com.data.cdata.normal_battle_yys_replace": "0ed028082bc8f51caa6343fe206f1320283782593afdb8b1898c0d2324d19c5d",
    **{key: TEN_SOURCES[key] for key in (
        "battleengine.engine.NormalActivityEngine", "com.data.cdata.ten_anni_2026_const",
        "com.data.cdata.normal_battle_config", "com.data.cdata.normal_battle_assist_hero")},
}


def ten_boss_stage(modules):
    from battleengine.engine.TenAnniversaryBossBattleEngine import TenAnniversaryBossBattleEngine, const
    from com.data.cdata import stake_boss, ten_anni_2026_const
    from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_ASSIST_HERO,
                                   DATA_NORMAL_BATTLE_YYS_REPLACE, DATA_PVE_STAGE_DATA)

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in TEN_BOSS_SOURCES.items()):
        raise ValueError("The original Shichangji boss engine or table changed")
    boss = stake_boss.data[22]
    stages = ten_anni_2026_const.data[100]["value"]
    if (boss["battle_id"] != TEN_BOSS_STAGE or boss["team_battle_type"] != TEN_BOSS_TEAM
            or boss["last_limit"] != TEN_BOSS_DEADLINE or tuple(stages) != tuple(TEN_BOSS_STAGES)):
        raise RuntimeError("The original five-phase boss entry changed")
    groups = [BattleMonstersInfo.data[DATA_PVE_STAGE_DATA.data[str(stage)]["groupid"]] for stage in stages]
    if any(len(group["MonstersInfos"]) != 1 for group in groups):
        raise RuntimeError("A Shichangji boss phase does not have one original formation")
    engine = TenAnniversaryBossBattleEngine({
        "pve_data_flag": str(TEN_BOSS_STAGE), "act_id": TEN_ACTIVITY, "teamUid": "offline-ten-anniversary-boss",
    })
    engine.battleMode = TEN_BOSS_MODE
    return engine, const, groups, DATA_NORMAL_BATTLE_YYS_REPLACE.data[217], {
        index: DATA_NORMAL_BATTLE_ASSIST_HERO.data[index] for index in TEN_BOSS_ASSIST_IDS
    }


class TenBossReplay:
    def __init__(self, engine, groups, const, actor, assist_config):
        self.engine, self.groups, self.const = engine, groups, const
        self.actor, self.assist_config = actor, assist_config
        self.started, self.actor_report, self.settled_score = None, None, None
        self.phases, self.assists, self.minion_respawns = [], [], 0
        engine._createNextRoundMons = self.observe(engine._createNextRoundMons)
        engine._create_last_wave_minions = self.observe(engine._create_last_wave_minions, minions=True)
        create_assist = engine._create_one_assist_hero
        end_battle = engine.doBattleEnded

        def observe_assist(assist_id):
            unit = create_assist(assist_id)
            if unit:
                data = self.assist_config[assist_id]
                if unit.protoid != data["hero_id"] or unit.posIndex != data["pos_index"]:
                    raise RuntimeError("The original Shichangji boss summoned a different assist")
                self.assists.append({"phase": engine.defeat_monster_wave + 1, "configId": assist_id,
                                     "heroId": unit.protoid, "position": unit.posIndex})
            return unit

        engine._create_one_assist_hero = observe_assist

        def observe_settlement(camp):
            self.settled_score = engine.my_total_damage, engine.get_my_total_damage()
            return end_battle(camp)

        engine.doBattleEnded = observe_settlement

    def observe(self, spawn, *, minions=False):
        engine = self.engine
        create = engine.createMonsterEntity

        def capture(*args, **kwargs):
            units = []

            def observe_entity(camp, owner, placement):
                unit = create(camp, owner, placement)
                units.append(unit)
                return unit

            engine.createMonsterEntity = observe_entity
            try:
                result = spawn(*args, **kwargs)
            finally:
                engine.createMonsterEntity = create
            index = engine.defeat_monster_wave
            group = self.groups[index]
            phase = index + 1
            expected = sorted((pos, identity, level) for pos, identity, level, *_ in group["MonstersInfos"][0]
                              if identity and (not minions or pos != 1))
            if (str(group["ID"]) != engine.pve_data_flag or group["resindex"] != engine.combineSceneInfoId
                    or minions and index != len(self.groups) - 1
                    or not minions and phase != len(self.phases) + 1
                    or sorted((unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in units) != expected):
                raise RuntimeError("The original Shichangji boss spawned a different formation")
            if not minions and phase == len(self.groups) and not any(
                    unit.posIndex == 1 and getattr(unit, "this_is_boss", False) and unit.isSkipBattleEndCheck
                    for unit in units):
                raise RuntimeError("The original final-phase boss was not protected from normal settlement")
            if minions:
                self.minion_respawns += 1
            else:
                self.phases.append({"phase": phase, "stageId": group["ID"], "sceneId": group["resindex"],
                                    "seconds": self.elapsed(), "enemies": [
                                        {"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                                         "protectedBoss": bool(getattr(unit, "this_is_boss", False))}
                                        for unit in sorted(units, key=lambda entity: entity.posIndex)
                                    ]})
            return result

        return capture

    def elapsed(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def verify_actor(self, controller):
        engine = self.engine
        actor = engine.getEntity(engine.replace_yys_uid)
        if not actor or actor.ownerController is not controller or any(actor.HeroComp.heroData.equips):
            raise RuntimeError("The original Shichangji boss did not select the stage actor")
        attr = actor.AttrComp
        expected = (self.actor["yys_id"], self.actor["yys_level"], self.actor["yys_star"], self.actor["yys_awake"])
        if (actor.posIndex != 1 or (actor.protoid, attr.level, attr.star, actor.HeroComp.heroData.awake) != expected):
            raise RuntimeError("The original Shichangji boss used a different stage actor")
        self.actor_report = {"configId": engine.replace_yys_id, "id": actor.protoid, "level": attr.level,
                             "star": attr.star, "position": actor.posIndex,
                             "skills": sorted([skill.skillId, skill.skillLevel] for skill in actor.SkillMgrComp.skillCompList)}

    def update(self):
        if self.started is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = self.engine.now_time()

    def report(self, completed, outcome):
        engine = self.engine
        data = engine.engineUserData
        raw, damage = self.settled_score or (engine.my_total_damage, engine.get_my_total_damage())
        if (self.actor_report is None or self.started is None or not self.phases or engine.group_members
                or tuple(engine.assist_hero_list) != TEN_BOSS_ASSIST_IDS or not engine.replace_yys_flag
                or self.actor_report["configId"] != 217
                or abs(engine.haltBattleTime - self.started - TEN_BOSS_DEADLINE) > 1
                or type(damage) is not int or damage < 0):
            raise RuntimeError("The original Shichangji boss did not use the signed scoring conditions")
        if completed and (data.get("damage") != raw or (outcome == "win") != (raw > 0)
                          or not isfinite(data.get("used_time", float("nan")))):
            raise RuntimeError("The original Shichangji boss returned inconsistent scoring")
        return {"actId": TEN_BOSS_ACT, "actor": self.actor_report, "phases": self.phases, "assists": self.assists,
                "minionRespawns": self.minion_respawns, "damage": damage, "deadlineSeconds": TEN_BOSS_DEADLINE,
                "timedOut": bool(engine.isHaltBattle), "combatSeconds": self.elapsed()}
