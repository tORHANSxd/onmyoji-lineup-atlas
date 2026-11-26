"""Replay an explicit Regional Boss scenario with the original client engines."""

import math

REGION_MODE = 3004
REGION_HARD_MODE = 3023
REGION_MODES = (REGION_MODE, REGION_HARD_MODE)
REGION_MAX_LEVEL = 60
REGION_MAX_STAR = 10
SNAKE_ID = 1192078
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


def hard_setup(scenario):
    from DynamicConfigData import DATA_CONSTANT

    star, modifiers = scenario["star"], scenario["modifierIds"]
    if (type(star) is not int or not 1 <= star <= REGION_MAX_STAR or type(modifiers) is not list
            or len(modifiers) > REGION_MAX_STAR or any(type(skill) is not int for skill in modifiers)
            or len(set(modifiers)) != len(modifiers)):
        raise ValueError("Invalid Regional Boss star or modifier selection")
    constants = DATA_CONSTANT.data
    allowed = set(constants[10409]["value"])
    if star == REGION_MAX_STAR:
        allowed.update(constants[10418]["value"])
    if not set(modifiers).issubset(allowed):
        raise ValueError("The selected Regional Boss star does not offer these modifiers")
    level = REGION_MAX_LEVEL + star * int(constants[10414]["value"][0])
    return {"level": REGION_MAX_LEVEL, "lbs_world_boss_extre_star": star, "buff_ids": modifiers}, level


def ordinary_setup(area, scenario, actor_id):
    from com.data.cdata import lbs_world_boss_type

    level, rule_id, params = (scenario[key] for key in ("level", "ruleId", "params"))
    if (type(rule_id) is not int or type(level) is not int
            or not 1 <= level <= REGION_MAX_LEVEL or type(params) is not list):
        raise ValueError("Invalid ordinary Regional Boss scenario")
    if not any(key == rule_id and weight > 0 for pool in area["special_attacks"] for key, weight in pool):
        raise ValueError("The ordinary rule is absent from this area's client table")
    rule = lbs_world_boss_type.data.get(rule_id)
    rule_type = rule["type"] if rule else None
    if (rule_type not in RULE_PARAMS or len(params) != RULE_PARAMS[rule_type]
            or not all(valid_parameter(value, rule.get(f"p{index}")) for index, value in enumerate(params, 1))):
        raise ValueError("The ordinary Regional Boss rule parameters do not match its configured ranges")
    if rule_type == 7 and actor_id != params[0]:
        raise ValueError("The selected onmyoji does not match the Regional Boss condition")
    return {"level": level, "special_attacks": [{"type": rule_type, "params": params}]}, level


def regional_boss_stage(stage_id, scenario, actor_id, mode):
    from battleengine.engine.LBSWorldBossEngine import LBSWorldBossEngine, const
    from com.data.cdata import lbs_world_boss_area
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    hard = mode == REGION_HARD_MODE
    fields = {"areaId", "star", "modifierIds"} if hard else {"areaId", "level", "ruleId", "params"}
    if type(scenario) is not dict or set(scenario) != fields or type(scenario["areaId"]) is not int:
        raise ValueError("An explicit Regional Boss area and difficulty setup are required")
    area = lbs_world_boss_area.data.get(scenario["areaId"])
    stage_key = str(stage_id)
    if not area or not any(str(key) == stage_key and weight > 0 for key, weight in area["weighted_battles"]):
        raise ValueError("The Regional Boss area does not use this PvE formation")
    if hard:
        from battleengine.engine.LBSWorldBossXEngine import LBSWorldBossXEngine

        setup, effective_level = hard_setup(scenario)
        engine_class, expected_mode = LBSWorldBossXEngine, const.BattleMode.MODE_LBS_WORLD_BOSSX
    else:
        setup, effective_level = ordinary_setup(area, scenario, actor_id)
        engine_class, expected_mode = LBSWorldBossEngine, const.BattleMode.MODE_LBS_WORLD_BOSS
    stage = DATA_PVE_STAGE_DATA.data[stage_key]
    group_id = stage["groupid"]
    formation = BattleMonstersInfo.data[group_id]
    engine = engine_class({"pve_data_flag": stage_key, **setup})
    engine.battleMode = expected_mode
    if engine.battleMode != mode:
        raise RuntimeError("The original Regional Boss registered a different battle mode")
    return engine, formation, group_id, effective_level


class RegionalBossReplay:
    def __init__(self, engine, formation, scenario, effective_level, const):
        self.engine = engine
        self.alive = const.CombatState.ALIVE
        self.scenario = scenario
        self.effective_level = effective_level
        self.hard = engine.battleMode == REGION_HARD_MODE
        self.eligible = None
        self.settlement = None
        self.waves = []
        self.snakes = []
        self.applied_modifiers = set()
        check = engine.check_hero_in_battle
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
        modifiers = scenario.get("modifierIds", ())

        def check_roster():
            rejected = check()
            self.eligible = not rejected
            return rejected

        def verify_wave():
            wave = engine.finishedWaveCount
            if wave != len(self.waves) or not wave < len(formation["MonstersInfos"]):
                raise RuntimeError("Unexpected Regional Boss wave index")
            created = []

            def record(camp, owner, placement, *args, **kwargs):
                unit = create(camp, owner, placement, *args, **kwargs)
                if unit.protoid != SNAKE_ID or not self.hard:
                    created.append((placement.Index, unit.protoid, placement.level, unit))
                return unit

            engine.createMonsterEntity = record
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            expected = sorted((slot[0], slot[1], effective_level) for slot in formation["MonstersInfos"][wave] if slot[1] > 0)
            if sorted(unit[:3] for unit in created) != expected:
                raise RuntimeError("Regional Boss spawned a different formation")
            self.waves.append([
                {"position": position, "id": proto, "level": level, "hp": unit.AttrComp.hp, "speed": unit.AttrComp.speed}
                for position, proto, level, unit in created
            ])
            return result

        if self.hard:
            start, init_entity, create_snake = engine.startBattle, engine.onEntityCreated, engine.create_yaoguaita

            def start_hard():
                result = start()
                self.eligible = engine.battleState == const.BattleState.BS_STARTED
                return result

            def verify_entity(entity):
                result = init_entity(entity)
                skills = getattr(entity, "SkillMgrComp", None)
                if skills:
                    self.applied_modifiers.update(skill for skill in modifiers if skills.getSkillById(skill))
                return result

            def observe_snakes():
                before = engine.createMonsterEntity

                def record(camp, owner, placement, *args, **kwargs):
                    unit = before(camp, owner, placement, *args, **kwargs)
                    if unit.protoid == SNAKE_ID:
                        self.snakes.append({"wave": engine.finishedWaveCount + 1, "position": placement.Index,
                                            "id": unit.protoid, "level": placement.level})
                    return unit

                engine.createMonsterEntity = record
                try:
                    return create_snake()
                finally:
                    engine.createMonsterEntity = before

            engine.startBattle = start_hard
            engine.onEntityCreated = verify_entity
            engine.create_yaoguaita = observe_snakes
        else:
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
        report = {**self.scenario, "eligible": self.eligible, "formations": self.waves,
                  "metrics": {key: self.settlement[key] for key in ("receivedDamage", "rounds")} if completed else None}
        if self.hard:
            doll = getattr(self.engine, "xiaozhiren", None)
            report.update(effectiveLevel=self.effective_level, snakeSpawns=self.snakes,
                          paperDollAlive=doll.lifeState == self.alive if doll else None,
                          appliedModifiers=sorted(self.applied_modifiers | ({61711} if self.snakes else set())))
        return report
