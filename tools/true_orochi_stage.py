"""Use the original continuous solo fight for a chosen True Orochi roster."""

from rune_team import auto_setting, hero_data, selected_team


OROCHI_MODE = 3005
OROCHI_STAGE = 71
OROCHI_REPLAY_SECONDS = 130


def orochi_team(plan, suits):
    active, reserves = plan["members"], plan["reserves"]
    if not isinstance(active, list) or len(active) != 6 or not isinstance(reserves, list) or len(reserves) != 4:
        raise ValueError("True Orochi needs six starters and four distinct owned reserves")
    actor, fighters, inventory, settings = selected_team(
        {"onmyoji": plan["onmyoji"], "members": active + reserves}, suits, member_limit=10)
    reserve = hero_data(plan["reserveOnmyoji"], onmyoji=True)
    if reserve["heroId"] == actor["heroId"]:
        raise ValueError("True Orochi needs two different onmyoji")
    actors = {"selected-onmyoji": (actor, plan.get("spirit")),
              "reserve-onmyoji": (reserve, plan.get("reserveSpirit"))}
    settings["reserve-onmyoji"] = auto_setting(plan["reserveOnmyoji"])
    return fighters, inventory, settings, actors


def orochi_stage(stage_id):
    from battleengine.engine.ZhenDaSheEngine import MAP_BOSS, DaSheMapBossId, ZhenDaSheEngine, const
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if stage_id != OROCHI_STAGE or stage_id != DaSheMapBossId:
        raise ValueError("Unknown True Orochi entry")
    stage_ids = [row[0] for row in MAP_BOSS.data[stage_id]["gk_list"]]
    if stage_ids != list(range(25100, 25110)):
        raise ValueError("The runtime has different True Orochi floor data")
    stages = []
    for stage in stage_ids:
        group_id = DATA_PVE_STAGE_DATA.data[str(stage)]["groupid"]
        group = BattleMonstersInfo.data[group_id]
        if group_id != stage or group["resindex"] != 40007 or len(group["MonstersInfos"]) != 1:
            raise ValueError("The runtime has different True Orochi enemy data")
        stages.append((group_id, [(pos, enemy, level) for pos, enemy, level, *_ in group["MonstersInfos"][0]]))
    engine = ZhenDaSheEngine({})
    engine.battleMode = const.BattleMode.MODE_ZHEN_DASHE
    return engine, stages, const


class OrochiReplay:
    def __init__(self, engine, controller, const, stages, fighters, actors, settings, spirits):
        self.engine, self.controller, self.states = engine, controller, const.BattleState
        self.stages, self.fighters, self.actors = stages, fighters, actors
        self.settings, self.spirits = settings, spirits
        self.fighter_slots = {alias: index for index, alias in enumerate(fighters, 1)}
        self.heroes = {**fighters, **{alias: actor for alias, (actor, _) in actors.items()}}
        self.formations, self.starts = [], []
        self.confirmed = False
        self.spawn, self.state_changed = engine._createNextRoundMons, engine.onBattleStateChanged
        engine._createNextRoundMons = self.observe_spawn
        engine.onBattleStateChanged = self.observe_state

    def observe_spawn(self):
        engine = self.engine
        floor = engine.finishedWaveCount + 1
        group_id, expected = self.stages[floor - 1]
        created, create = [], engine.createMonsterEntity

        def observe(camp, owner, position, *args, **kwargs):
            unit = create(camp, owner, position, *args, **kwargs)
            created.append((position.Index, unit.protoid, position.level))
            return unit

        engine.createMonsterEntity = observe
        try:
            result = self.spawn()
        finally:
            engine.createMonsterEntity = create
        if created != expected:
            raise RuntimeError(f"Different original True Orochi formation on floor {floor}")
        self.formations.append({"floor": floor, "groupId": group_id, "units": created})
        return result

    def selected(self):
        for entity in self.engine.heroEntities.values():
            if entity.ownerController is self.controller:
                alias = entity.HeroComp.heroData.heroUid
                if alias not in self.heroes:
                    raise RuntimeError("The original True Orochi selected a character outside the chosen roster")
                yield entity, alias

    def observe_state(self):
        self.state_changed()
        engine = self.engine
        if engine.battleState == self.states.BS_STARTED:
            lineup = [{"position": entity.posIndex, "id": entity.protoid,
                       "rosterSlot": self.fighter_slots.get(alias), "hp": entity.AttrComp.hp,
                       "maxHp": entity.AttrComp.maxHp}
                      for entity, alias in self.selected()]
            self.starts.append({"floor": engine.finishedWaveCount + 1, "lineup": sorted(lineup, key=lambda unit: unit["position"])})

    def prepare(self):
        engine, controller = self.engine, self.controller
        if self.confirmed or engine.battleState != self.states.BS_LOADED or controller not in engine.presetSSInfo:
            return
        for slot, alias in enumerate(self.fighters, 1):
            engine.op_add_preset_ss(controller, alias, slot)
        for slot, alias in enumerate(self.actors, 1):
            engine.op_add_preset_yys(controller, alias, slot)
        # The native fallback confirms when fewer than 13 slots are supplied.
        # The avatar only contains the explicitly supplied 10 members and 2 onmyoji.
        engine.autoChoosePresetHeroes()
        if (not controller._presetConfirmed or list(engine.presetSSInfo[controller].values()) != list(self.fighters)
                or list(engine.presetYYSInfo[controller].values()) != list(self.actors)):
            raise RuntimeError("The original True Orochi did not accept the exact roster")
        self.confirmed = True

    def select(self):
        engine, controller = self.engine, self.controller
        selected = sorted(self.selected(), key=lambda item: item[0].posIndex)
        if not self.starts and [alias for _, alias in selected] != [next(iter(self.actors)), *list(self.fighters)[:6]]:
            raise RuntimeError("The original True Orochi changed the chosen starting team")
        for entity, alias in selected:
            hero = entity.HeroComp.heroData
            if sorted(uid for uid in hero.equips if uid) != sorted(self.heroes[alias]["equips"]):
                raise RuntimeError("The original True Orochi changed the selected equipment")
            if alias in self.actors and getattr(entity.get_hunlingData(), "uuid", None) != self.spirits.get(str(entity.protoid)):
                raise RuntimeError("The original True Orochi changed the selected spirit")
            setting = self.settings[alias]
            if setting:
                engine.op_setAutoSkill(controller, entity.uid, setting)
                if controller.autoSkill.get(entity.uid) != setting:
                    raise RuntimeError("The original True Orochi rejected the selected automatic skill")
        engine.op_setAuto(controller, True)
        engine.op_selectHeroOk(controller)
        return controller.selectHeroOk

    def report(self):
        return {"formations": self.formations, "starts": self.starts}
