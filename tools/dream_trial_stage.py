"""Original fixed-roster battles in the 0.0.816 幻游问梦 activity."""

DREAM_TRIAL_MODE = 9606
DREAM_TRIAL_STAGES = range(34266, 34276)


def dream_trial(stage_id):
    from battleengine.engine.DreamSelfBattleEngine import DreamSelfBattleEngine, DATA_DRAMA_HERO, const
    from DynamicConfigData import BattleMonstersInfo, DATA_DREAM_ACT_BATTLE_COND, DATA_PVE_STAGE_DATA
    from com.data.cdata import dream_act_hero

    flag = str(stage_id)
    condition = DATA_DREAM_ACT_BATTLE_COND.data.get(stage_id)
    roster = DATA_DRAMA_HERO.data.get(flag, {})
    stage = DATA_PVE_STAGE_DATA.data.get(flag, {})
    formation = BattleMonstersInfo.data.get(stage.get("groupid"), {})
    hero_ids = roster.get("heroIds", ())
    if (stage_id not in DREAM_TRIAL_STAGES or not any(row["battle_id"] == stage_id for row in dream_act_hero.data.values())
            or not condition or condition["cond_type"] != 2 or condition["param1"] != 7
            or not stage.get("isplot") or roster.get("autoStartCombat") != 1 or len(hero_ids) != 6
            or not hero_ids[0] or any(hero_ids[1:]) or len(formation.get("MonstersInfos", ())) != 1):
        raise ValueError("The dream trial does not match the original fixed-roster rules")
    engine = DreamSelfBattleEngine({"pve_data_flag": flag})
    engine.battleMode = const.BattleMode.MODE_DREAM_ACT_SELF_BATTLE
    return engine, stage, formation, condition, hero_ids[0], const


def verify_dream_roster(engine, controller, expected):
    observed = [(entity.posIndex, entity.HeroComp.heroData) for entity in engine.heroEntities.values()
                if entity.ownerController is controller]
    if len(observed) != 1:
        raise RuntimeError("The dream trial did not spawn exactly one fixed character")
    position, hero = observed[0]
    if (position != 1 or [hero.heroId, hero.level, hero.star, hero.awake, hero.skinid] != list(expected)):
        raise RuntimeError("The dream trial spawned a different fixed character")
    return {"position": position, "heroId": hero.heroId, "level": hero.level,
            "star": hero.star, "awake": hero.awake}


def dream_basic_attack(engine, controller, const, action):
    if engine.battleState != const.BattleState.BS_STARTED:
        return False
    turn = engine.turnMgr
    entity = turn.GetCurrEntity()
    if (entity is None or entity.ownerController is not controller
            or not turn.isInLockState(const.LockSubState.SelectingSkill)):
        return False
    target = min((unit for unit in engine.monsterEntities.values() if unit.lifeState == const.CombatState.ALIVE),
                 key=lambda unit: unit.posIndex, default=None)
    if target is None:
        return False
    action.cast_opening(True, turn, entity, target, switch_auto=False)
    return True
