"""Replay the ordinary exploration and capture paths of the original Hunling engines."""

HUNLING_NORMAL = 1031
HUNLING_BOSS = 1032
HUNLING_MODES = (HUNLING_NORMAL, HUNLING_BOSS)
CAPTURE_ITEMS = (777800, 777801, 777802)
HUNLING_REPLAY_SECONDS = 130

# The original solo PvE rows contain five exploration levels per species.
BOSS_STARTS = {100: 800001, 101: 800006, 102: 800011, 103: 800016,
               104: 800022, 105: 800027, 106: 800037, 107: 800032}
EXPLORATION_STARTS = {770001: (1, 800003), 770006: (2, 800004), 780001: (2, 800004)}


def challenge_stages():
    for spirit, first in BOSS_STARTS.items():
        region = 1 if spirit < 104 else 2
        for level in range(1, 6):
            yield first + level - 1, (region, level, spirit, 800001 if region == 1 else 800008)


def exploration_stages():
    for first, (region, scene) in EXPLORATION_STARTS.items():
        for level in range(1, 6):
            yield first + level - 1, (region, level, None, scene)


def hunling_stage(stage_id, mode, capture_item):
    from battleengine.engine.HunlingBossBattleEngine import HunlingBossBattleEngine, const
    from battleengine.engine.HunlingNormalBattleEngine import HunlingNormalBattleEngine
    from DynamicConfigData import BattleMonstersInfo, DATA_HUNLING_BASE, DATA_HUNLING_TANSUO, DATA_PVE_STAGE_DATA

    boss = mode == HUNLING_BOSS
    stages = dict(challenge_stages() if boss else exploration_stages())
    if stage_id not in stages or capture_item is not None and (not boss or capture_item not in CAPTURE_ITEMS):
        raise ValueError("Unknown original Hunling battle or capture item")
    region, level, spirit, scene = stages[stage_id]
    original_region = DATA_HUNLING_TANSUO.data[region]
    if boss and (spirit not in original_region["hunling_ids"] or spirit not in DATA_HUNLING_BASE.data):
        raise ValueError("The client does not match the verified Hunling region")
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    if stage["shishentotal"] != 5 or group["resindex"] != scene or len(group["MonstersInfos"]) != 1:
        raise ValueError("The client does not match the verified Hunling formation")
    engine_class = HunlingBossBattleEngine if boss else HunlingNormalBattleEngine
    info = {"fuben_id": region, "hunling_id": spirit or 0, "explore_lv": level,
            "capture_prop_num": {str(capture_item): 1} if capture_item is not None else {}}
    engine = engine_class({"pve_data_flag": str(stage_id), "battle_info": info})
    engine.battleMode = const.BattleMode.MODE_HUNLING_BOSS_BATTLE if boss else const.BattleMode.MODE_HUNLING_NORMAL_BATTLE
    return engine, group, (region, level, spirit, scene), const


class HunlingReplay:
    def __init__(self, engine, controller, group, route, const, capture_item, card_slots):
        self.engine, self.controller, self.states = engine, controller, const.BattleState
        self.route, self.capture_item, self.card_slots = route, capture_item, card_slots
        self.opening, self.weak_time, self.start_time, self.capture = [], None, None, None
        self.spawn = engine._createNextRoundMons
        self.expected = [(pos, id_, level) for pos, id_, level, *_ in group["MonstersInfos"][0] if id_]
        engine._createNextRoundMons = self.observe_spawn

    def observe_spawn(self):
        engine = self.engine
        create, created = engine.createMonsterEntity, []

        def observe(camp, owner, placement, *args, **kwargs):
            unit = create(camp, owner, placement, *args, **kwargs)
            created.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            result = self.spawn()
        finally:
            engine.createMonsterEntity = create
        units = sorted(created, key=lambda unit: unit.posIndex)
        if [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in units] != self.expected:
            raise RuntimeError("The engine created a different original Hunling formation")
        self.opening = [{"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                         "hp": unit.AttrComp.hp, "speed": unit.AttrComp.speed} for unit in units]
        return result

    def update(self):
        engine = self.engine
        if self.start_time is None and engine.battleState == self.states.BS_STARTED:
            self.start_time = engine.now_time()
        if self.route[2] is None or engine.battleState != self.states.BS_STARTED:
            return
        if engine.capture_engine_stage == engine.ES_BOSS_WEAK and self.weak_time is None:
            self.weak_time = engine.now_time() - self.start_time
            if self.capture_item is None:
                engine.do_capture_end()
                return
            engine.op_use_capture_prop(self.controller, self.capture_item)
            if engine.capture_engine_stage != engine.ES_SELECT_SHOW_HERO:
                raise RuntimeError("The original Hunling engine did not accept this capture item")
            cards = [f"member-{slot}" for slot in self.card_slots]
            if engine.check_hero_uid_list(cards) != -1:
                raise RuntimeError("The original Hunling engine did not accept the chosen capture cards")
            self.capture = {"itemId": self.capture_item, "cards": self.card_slots,
                            "baseRate": engine.base_capture_rate, "bonusRate": engine.get_hero_add_rate(self.controller, cards)}
            engine.op_select_hero_card(self.controller, cards, True)
            if engine.capture_engine_stage == engine.ES_SELECT_SHOW_HERO:
                raise RuntimeError("The original Hunling engine did not execute the capture attempt")
        if engine.capture_engine_stage == engine.ES_CATCH_ONCE_END and not engine.is_capture_real_end():
            engine.op_recapture_boss(self.controller, False)

    def report(self, completed):
        engine = self.engine
        region, level, spirit, _ = self.route
        if not self.opening or self.start_time is None:
            raise RuntimeError("The original Hunling battle did not start")
        result = {"regionId": region, "exploreLevel": level, "spiritId": spirit,
                  "opening": self.opening, "timedOut": engine.isHaltBattle,
                  "combatSeconds": round(engine.now_time() - self.start_time, 6)}
        if spirit is not None:
            result.update(weakened=self.weak_time is not None, weakenSeconds=self.weak_time,
                          capture=None if self.capture is None else {**self.capture, "success": engine.capture_result if completed else None})
            if completed and (result["weakened"] and not engine.boss_killed or
                              self.capture is not None and engine.engineUserData.get("capture_result") != engine.capture_result):
                raise RuntimeError("The original Hunling battle did not return a consistent capture settlement")
        else:
            skill = next(iter(engine.develop_skill_info), None)
            if skill != 77925:
                raise RuntimeError("The original exploration did not load its regional buff")
            result["regionSkill"] = skill
        return result
