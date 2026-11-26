"""Selected inventory replays of the original summoned Super Ghost encounter."""

from math import isclose, isfinite
from types import SimpleNamespace

SUPERGHOST_MODE = 3008
SUPERGHOST_STAGES = {*range(1, 62), 100}
SUPERGHOST_WALL_SECONDS = 150


def ghost_formation(stage):
    return [(position, unit[0], unit[1]) for position, unit in enumerate(stage["gk_list"], 1)
            if len(unit) == 2 and all(item is not None for item in unit)]


def ghost_route(stage_id, stage, monsters):
    if stage_id not in SUPERGHOST_STAGES or not stage or stage["id"] != stage_id or stage["actid"] != 369:
        raise ValueError(f"Unknown Super Ghost mission {stage_id}")
    formation = ghost_formation(stage)
    if not formation or formation[0][0] != 1 or not 1 <= stage["star"] <= 6 or stage["crazy_time"] not in (120, 150, 180):
        raise ValueError("Unexpected Super Ghost mission data")
    boss = monsters.get(formation[0][1])
    if not boss:
        raise ValueError("Missing original Super Ghost boss template")
    template = [(skill, level) for skill, level in zip(boss["skill"], boss["skillLv"]) if skill > 0 and level > 0]
    declared = stage["spec_skill"]
    route = {"formation": formation, "traits": declared, "sceneId": stage["sceneid"],
             "star": stage["star"], "deadlineSeconds": stage["crazy_time"]}
    if not set(map(tuple, declared)) <= set(template):
        route["templateSkills"] = template
    return route


def ghost_special_attack(day, days, groups):
    if day == 0:
        return []
    schedule = days[day]
    applied = [{"heroIds": groups[group]["hero_list"], "rate": groups[group]["value"]} for group in schedule["hero_group"]]
    if len(applied) != 2 or any(not group["heroIds"] or not 0 < group["rate"] <= 2 for group in applied):
        raise ValueError("Unexpected original daily Super Ghost special attack")
    return applied


def valid_ghost_settings(data):
    return (type(data) is dict and data.keys() == {"day", "attackType", "windowSeconds"}
            and all(type(value) is int for value in data.values()) and 0 <= data["day"] <= 7
            and data["attackType"] in (0, 1) and 1 <= data["windowSeconds"] <= 180)


class SuperGhostReplay:
    def __init__(self, stage_id, settings):
        from battleengine.engine import SuperGhostEngine as original
        from com.data.cdata import monster, super_ghost_hjs_special_attack, super_ghost_hjs_special_attack_group

        self.const, self.stage = original.const, original.DATA_SUPERGHOST_MISSION.data.get(stage_id)
        self.route = ghost_route(stage_id, self.stage, monster.data)
        self.settings = settings
        if settings["windowSeconds"] > self.route["deadlineSeconds"]:
            raise ValueError("Super Ghost scoring window exceeds the original mission deadline")
        self.special_attack = ghost_special_attack(settings["day"], super_ghost_hjs_special_attack.data,
                                                  super_ghost_hjs_special_attack_group.data)
        # The client-side branch uses the original personal mission timer.
        original.__CLIENT_SIDE__ = True
        attack = settings["attackType"]
        self.reduction = -float(original.helpers.global_get_const_value(7096 if attack == 0 else 7097,
                                                                         0.0 if attack == 0 else 1.5))
        self.engine = original.SuperGhostEngine({
            "fbId": stage_id, "sgid": "offline-superghost", "finduid": "offline-owner", "teamuid": "offline-team",
            "atktype": attack, "mvp_heroids": [group["heroIds"] for group in self.special_attack] or [[], []],
            "mvp_vals": [[group["rate"]] * 3 for group in self.special_attack] or [[0] * 3, [0] * 3],
        })
        self.engine.battleMode = self.const.BattleMode.MODE_SUPER_GHOST
        # The recorder includes the native scene timestamp. Source it from
        # the same fixed-step clock as the original local deadline.
        original.time = SimpleNamespace(time=self.engine.now_time, strptime=original.time.strptime, mktime=original.time.mktime)
        self.opening, self.bonuses = [], []
        self.started, self.reason, self.outcome = None, None, "unknown"
        self.spawn = self.engine._createNextRoundMons
        self.engine._createNextRoundMons = self.observe_spawn

    def observe_spawn(self):
        create = self.engine.createMonsterEntity
        before = {}

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            before[unit.posIndex] = unit.AttrComp.hurtReductionRate
            return unit

        self.engine.createMonsterEntity = observe
        try:
            result = self.spawn()
        finally:
            self.engine.createMonsterEntity = create
        monsters = sorted(self.engine.monsterEntities.values(), key=lambda unit: unit.posIndex)
        formation = [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in monsters]
        if self.opening or formation != self.route["formation"]:
            raise RuntimeError("The original Super Ghost engine opened with a different formation")
        boss_traits = {(skill.skillId, skill.skillLevel) for skill in monsters[0].SkillMgrComp.skillCompList}
        if not set(map(tuple, self.route.get("templateSkills", self.route["traits"]))) <= boss_traits:
            raise RuntimeError("The original Super Ghost boss did not load all native traits")
        if any(not isclose(unit.AttrComp.hurtReductionRate - before[unit.posIndex], self.reduction) for unit in monsters):
            raise RuntimeError("The original Super Ghost engine applied a different attack type")
        self.opening = [{"position": pos, "id": proto, "level": level, "startingHp": unit.AttrComp.hp}
                        for (pos, proto, level), unit in zip(formation, monsters)]
        return result

    def update(self, winner):
        engine, const = self.engine, self.const
        if self.started is None and engine.battleState == const.BattleState.BS_STARTED:
            self.started = engine.now_time()
            if engine.haltBattleTime - int(self.started) != self.route["deadlineSeconds"]:
                raise RuntimeError("The original Super Ghost deadline changed")
            for unit in engine.heroEntities.values():
                if unit.ownerController is None or not 2 <= unit.posIndex <= 6 or unit.camp != const.CampFlag.CAMP1:
                    continue
                rate = next((group["rate"] for group in self.special_attack if unit.protoid in group["heroIds"]), 0)
                actual = engine.mvp_hero_add_attack_value.get(unit.uid, 0)
                if not isclose(actual, unit.sourceAttack * rate if rate else 0):
                    raise RuntimeError("The original Super Ghost engine applied a different special attack")
                if actual:
                    self.bonuses.append({"position": unit.posIndex, "heroId": unit.protoid, "attackAdded": actual})
        if self.started is None:
            return
        if engine.battleState == const.BattleState.BS_OVER:
            self.outcome = "win" if winner == const.CampFlag.CAMP1 else "loss"
            self.reason = "cleared" if self.outcome == "win" else "native-timeout" if engine.isHaltBattle else "team-defeated"
        elif self.settings["windowSeconds"] < self.route["deadlineSeconds"] and (
                round((engine.now_time() - self.started) * 1000) >= self.settings["windowSeconds"] * 1000):
            self.reason, self.outcome = "window-expired", "loss"

    def report(self):
        engine = self.engine
        if self.started is None or engine.currFbInfo is None or not self.opening or not isfinite(engine.myTotalDmg) or engine.myTotalDmg > 0:
            raise RuntimeError("The original Super Ghost did not return its personal damage")
        entities = engine.currFbInfo.monInfo
        return {**self.settings, "star": self.route["star"], "deadlineSeconds": self.route["deadlineSeconds"],
                "damage": round(-engine.myTotalDmg), "reason": self.reason, "enemyDamageReduction": self.reduction,
                "combatSeconds": round(engine.now_time() - self.started, 6), "specialAttack": self.bonuses,
                "enemies": [{**row, "remainingHp": entities[row["position"]]["hp"]} for row in self.opening]}
