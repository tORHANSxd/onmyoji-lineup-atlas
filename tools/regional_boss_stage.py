"""Replay an explicit ordinary Regional Boss scenario with the original engine."""

import math

REGION_MODE = 3004
REGION_MAX_LEVEL = 60
RULE_PARAMS = {1: 1, 2: 1, 3: 2, 4: 1, 5: 1, 7: 1, 8: 2, 9: 1}


def valid_parameter(value, pool):
    if type(value) not in (int, float) or not math.isfinite(value) or not pool:
        return False
    if len(pool) == 1:
        return value == pool[0]
    if not pool[0] <= value <= pool[1]:
        return False
    step = pool[2] if len(pool) == 3 else 1
    position = (value - pool[0]) / step
    return math.isclose(position, round(position), abs_tol=1e-8)


def regional_boss_stage(stage_id, scenario, actor_id):
    from battleengine.engine.LBSWorldBossEngine import LBSWorldBossEngine, const
    from com.data.cdata import lbs_world_boss_area, lbs_world_boss_type
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if type(scenario) is not dict or set(scenario) != {"areaId", "level", "ruleId", "params"}:
        raise ValueError("An explicit Regional Boss area, level and ordinary rule are required")
    area_id, level, rule_id, params = (scenario[key] for key in ("areaId", "level", "ruleId", "params"))
    if (type(area_id) is not int or type(rule_id) is not int or type(level) is not int
            or not 1 <= level <= REGION_MAX_LEVEL or type(params) is not list):
        raise ValueError("Invalid Regional Boss scenario")
    area = lbs_world_boss_area.data.get(area_id)
    stage_key = str(stage_id)
    if not area or not any(str(key) == stage_key and weight > 0 for key, weight in area["weighted_battles"]):
        raise ValueError("The Regional Boss area does not use this PvE formation")
    if not any(key == rule_id and weight > 0 for pool in area["special_attacks"] for key, weight in pool):
        raise ValueError("The ordinary rule is absent from this area's client table")
    rule = lbs_world_boss_type.data.get(rule_id)
    rule_type = rule["type"] if rule else None
    if (rule_type not in RULE_PARAMS or len(params) != RULE_PARAMS[rule_type]
            or not all(valid_parameter(value, rule.get(f"p{index}")) for index, value in enumerate(params, 1))):
        raise ValueError("The ordinary Regional Boss rule parameters do not match its configured ranges")
    if rule_type == 7 and actor_id != params[0]:
        raise ValueError("The selected onmyoji does not match the Regional Boss condition")
    stage = DATA_PVE_STAGE_DATA.data[stage_key]
    group_id = stage["groupid"]
    formation = BattleMonstersInfo.data[group_id]
    setup = {"pve_data_flag": stage_key, "level": level, "special_attacks": [{"type": rule_type, "params": params}]}
    engine = LBSWorldBossEngine(setup)
    engine.battleMode = const.BattleMode.MODE_LBS_WORLD_BOSS
    if engine.battleMode != REGION_MODE:
        raise RuntimeError("The original Regional Boss registered a different battle mode")
    return engine, formation, group_id


class RegionalBossReplay:
    def __init__(self, engine, formation, scenario):
        self.engine = engine
        self.formation = formation
        self.scenario = scenario
        self.eligible = None
        self.settlement = None
        self.waves = []
        check = engine.check_hero_in_battle
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity

        def check_roster():
            rejected = check()
            self.eligible = not rejected
            return rejected

        def verify_wave():
            wave = engine.finishedWaveCount
            if wave != len(self.waves) or not wave < len(formation["MonstersInfos"]):
                raise RuntimeError("Unexpected Regional Boss wave index")
            created = []

            def record(camp, owner, placement):
                unit = create(camp, owner, placement)
                created.append((placement.Index, unit.protoid, placement.level, unit))
                return unit

            engine.createMonsterEntity = record
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            expected = sorted((slot[0], slot[1], scenario["level"]) for slot in formation["MonstersInfos"][wave] if slot[1] > 0)
            if sorted(unit[:3] for unit in created) != expected:
                raise RuntimeError("Regional Boss spawned a different formation")
            self.waves.append([
                {"position": position, "id": proto, "level": level, "hp": unit.AttrComp.hp, "speed": unit.AttrComp.speed}
                for position, proto, level, unit in created
            ])
            return result

        engine.check_hero_in_battle = check_roster
        engine._createNextRoundMons = verify_wave
        engine.onCalcRewards = self.capture_settlement

    def capture_settlement(self, _player, camp, params):
        if self.settlement is not None:
            raise RuntimeError("Regional Boss returned multiple settlements")
        hp, rounds = params["hp"], params["round"]
        if not math.isfinite(hp) or hp < 0 or type(rounds) is not int or rounds < 0:
            raise RuntimeError("Invalid original Regional Boss settlement metrics")
        self.settlement = {"receivedDamage": hp, "rounds": rounds, "camp": camp}

    def report(self, completed, winner):
        if completed and (self.eligible is not True or not self.settlement or self.settlement["camp"] != winner):
            raise RuntimeError("Regional Boss finished without a matching original settlement")
        return {**self.scenario, "eligible": self.eligible, "formations": self.waves,
                "metrics": {key: self.settlement[key] for key in ("receivedDamage", "rounds")} if completed else None}
