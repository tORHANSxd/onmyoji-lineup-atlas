"""Replay a single team's Forest of Secrets encounter in the original engine."""

import math


FOREST_MODE = 813
FOREST_TEAM = 668
FOREST_STAGES = range(500300, 500561)
FOREST_DEADLINE = 180
FOREST_ENGINE = "battleengine.engine.GuildFakeGodEngine"
FOREST_SOURCES = {
    FOREST_ENGINE: "1327a27badce8be5e7df60f37d8dafc5741ddcd4d146d1b9e6aa4365f93060d7",
    "module.team_types.team_type_guild_fake_god_normal": "cb19cca59409fd901e213dc1107852dac00bf0a07fe592af549eca0b5f0351d4",
    "com.data.cdata.guild_fake_god_event": "1e69baca28a0947db81247d442992c76335cd8d1694e5c3f9febad0085b06ed4",
}


def forest_stage(modules, stage_id, event_id):
    from battleengine.engine.GuildFakeGodEngine import GuildFakeGodEngine, const
    from com.data.cdata import guild_fake_god_event
    from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in FOREST_SOURCES.items()):
        raise ValueError("The original Forest of Secrets engine or event table changed")
    event = guild_fake_god_event.data.get(event_id)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if not event or event["battle_id"] != stage_id or not 1 <= event["type"] <= 5 or not stage:
        raise ValueError("The selected Forest of Secrets encounter does not use this stage")
    group = BattleMonstersInfo.data[stage["groupid"]]
    if (stage["shishentotal"] != 5 or stage["battleTime"] != FOREST_DEADLINE
            or len(group["MonstersInfos"]) != 1 or len(event["buff_info"]) != 3):
        raise RuntimeError("The original Forest of Secrets formation or deadline changed")
    engine = GuildFakeGodEngine({
        "pve_data_flag": str(stage_id), "work_id": event_id, "real_work_id": event_id,
        "work_buff": event["buff_info"], "teamUid": "offline-forest", "guild_mb": "offline-forest",
        "monsters_init_hp": {}, "monsters_max_hp": {}, "player_id": "local",
    })
    engine.battleMode = const.BattleMode.MODE_GUILD_FAKE_GOD_NORMAL
    return engine, group, const, event


class ForestReplay:
    def __init__(self, engine, group, const, event):
        self.engine, self.const, self.event = engine, const, event
        self.started, self.pending_damage, self.last_damage = None, None, {}
        self.opening, self.affected, self.uploads = [], [], 0
        self.score = 0
        engine.team = self
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
        expected = sorted((pos, hero, level) for pos, hero, level, *_ in group["MonstersInfos"][0] if hero)

        def observe_spawn():
            entities = []

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                entities.append(entity)
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if sorted((unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in entities) != expected:
                raise RuntimeError("The original Forest of Secrets engine opened with a different formation")
            self.opening = [
                {"position": unit.posIndex, "id": unit.protoid, "level": unit.AttrComp.level,
                 "hp": unit.AttrComp.hp, "maxHp": unit.AttrComp.maxHp}
                for unit in sorted(entities, key=lambda unit: unit.posIndex)
            ]
            if any(not math.isfinite(unit["hp"]) or unit["hp"] != unit["maxHp"] or unit["hp"] <= 0
                   for unit in self.opening):
                raise RuntimeError("The original Forest of Secrets enemies did not start at full health")
            return result

        engine._createNextRoundMons = observe_spawn
        broadcast = engine.broadCastCommand

        def observe_score(op, params=None, *args, **kwargs):
            if isinstance(params, list) and params[:1] == ["myTotalDmg"]:
                self.score = params[1]
            return broadcast(op, params, *args, **kwargs)

        engine.broadCastCommand = observe_score

    def call_server_method(self, receiver, method, payload):
        if receiver != "offline-forest" or method != "guild_fake_god.update_cell_hp_data":
            raise RuntimeError("Unexpected original Forest of Secrets room message")
        self.pending_damage = payload["lost_hp"]
        self.last_damage = self.pending_damage
        self.uploads += 1

    def update(self):
        engine = self.engine
        if engine.battleState != self.const.BattleState.BS_STARTED:
            return
        if self.started is None:
            self.started = engine.now_time()
            _, effect, level = self.event["buff_info"]
            skill_id = engine.debuff_to_skill_dict[effect]
            if engine.work_skill_id != skill_id:
                raise RuntimeError("The original Forest of Secrets engine selected a different terrain skill")
            for entity in engine.getAllAliveEntities(self.const.CampFlag.CAMP1):
                skill = entity.SkillMgrComp.getSkillComp(skill_id)
                if skill and skill._skillLevel == level:
                    self.affected.append(entity.protoid)
            if len(self.affected) != 5:
                raise RuntimeError("The original Forest of Secrets terrain skill did not reach all five shikigami")
        if self.pending_damage is not None:
            # The only participant's total is also the room total in this replay.
            engine.updateMonstersHpFromServer(0, self.pending_damage, self.pending_damage)
            self.pending_damage = None

    def report(self, completed):
        engine = self.engine
        if (self.started is None or not self.opening or engine.cur_battle_array_id is not None
                or abs(engine.haltBattleTime - self.started - FOREST_DEADLINE) > 1):
            raise RuntimeError("The original Forest of Secrets replay used different opening conditions")
        damage = sum(engine.my_total_dmg.values())
        if (not math.isfinite(damage) or damage < 0 or completed and
                (self.score != damage or self.last_damage != {
                    str(position): math.ceil(value) for position, value in engine.my_total_dmg.items()
                })):
            raise RuntimeError("The original Forest of Secrets damage ledger did not match its settlement")
        return {"eventId": self.event["id"], "encounterType": self.event["type"], "opening": self.opening,
                "terrainSkill": engine.work_skill_id, "terrainLevel": self.event["buff_info"][2],
                "affected": self.affected, "damage": sum(self.last_damage.values()), "rawDamage": self.score,
                "damageByEnemy": self.last_damage,
                "damageUpdates": self.uploads, "deadlineSeconds": FOREST_DEADLINE,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": engine.isHaltBattle}
