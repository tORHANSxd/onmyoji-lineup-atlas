"""Replay the Four Seasons Challenge with the client's engine and buff templates."""

from math import isclose

SOCIAL_PLAY_ACTIVITY = 8772
SOCIAL_PLAY_MODE = 938
SOCIAL_PLAY_TICKET = 1401145
SOCIAL_PLAY_BUFFS = (120004, 120005)
SOCIAL_PLAY_STAGES = range(310001, 310029)
SOCIAL_PLAY_SCENE = 310001
SOCIAL_PLAY_SECONDS = 180
SOCIAL_PLAY_POSITIONS = {
    1: ((1, 2, 3, 4, 5, 6),),
    2: ((1, 5, 6), (2, 3, 4)),
    3: ((1, 3), (2, 5), (4, 6)),
}


def social_play_stage(stage_id):
    from battleengine.engine.SocialTeamBattleEngine import SocialTeamBattleEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA,
                                   DATA_SOCIAL_PLAY_STAGE)

    if stage_id not in SOCIAL_PLAY_STAGES:
        raise ValueError("Unknown Four Seasons Challenge stage")
    level_id = stage_id - SOCIAL_PLAY_STAGES.start + 1
    day, level = divmod(level_id - 1, 4)
    config = DATA_SOCIAL_PLAY_STAGE.data[level_id]
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    rules = DATA_NORMAL_BATTLE_CONFIG.data[SOCIAL_PLAY_MODE]
    waves = group["MonstersInfos"]
    if (config["stage_id"] != stage_id or config["day"] != day + 1 or config["level"] != level + 1
            or group["ID"] != stage_id or group["resindex"] != SOCIAL_PLAY_SCENE
            or len(waves) != 1 or len(waves[0]) != 6
            or rules["halt_time"] != SOCIAL_PLAY_SECONDS or rules["replace_yys_id"] or rules["group_battle"]):
        raise RuntimeError("The original Four Seasons stage or battle rules differ")
    engine = SocialTeamBattleEngine({"pve_data_flag": str(stage_id)})
    engine.battleMode = SOCIAL_PLAY_MODE
    return engine, group, const, {"activityId": SOCIAL_PLAY_ACTIVITY, "levelId": level_id,
                                  "day": config["day"], "level": config["level"]}


class SocialPlayParty:
    def __init__(self, engine, const, party_size):
        from DynamicConfigData import DATA_BUFF, DATA_SOCIAL_PLAY_CONST

        self.engine, self.const = engine, const
        self.positions = SOCIAL_PLAY_POSITIONS[party_size]
        self.buff_id = SOCIAL_PLAY_BUFFS[party_size - 2] if party_size > 1 else None
        if tuple(DATA_SOCIAL_PLAY_CONST.data[3]["value"]) != SOCIAL_PLAY_BUFFS:
            raise RuntimeError("The original Four Seasons party buffs differ")
        self.buff_rate = (party_size + 1) / 10 if self.buff_id is not None else 0
        self.buff_attrs = {}
        if self.buff_id is not None:
            self.buff_attrs = dict(DATA_BUFF.getBuffData(self.buff_id, 1)["attrList"])
            if self.buff_attrs != dict.fromkeys(("hurtAdditionRate", "hurtReductionRate"), self.buff_rate):
                raise RuntimeError("The original Four Seasons group buff attributes differ")
        self.automatic = False
        self.buffed_positions = []

    def assign_players(self, player, fighters):
        uids = list(fighters)
        return [{**player, "id": index, "heroes": {uids[pos - 1]: fighters[uids[pos - 1]] for pos in slots}}
                for index, slots in enumerate(self.positions, 1)]

    def verify_players(self, controllers):
        actual = [(ctrl.ctrlPlayer.hasYYS, tuple(ctrl.ctrlPlayer.ssPosIndexList)) for ctrl in controllers]
        if actual != [(False, positions) for positions in self.positions]:
            raise RuntimeError("The original Four Seasons engine assigned different player positions")

    def verify_selection(self, controllers):
        expected = {uid: (ctrl, pos) for ctrl, slots in zip(controllers, self.positions)
                    for uid, pos in zip(ctrl.ctrlPlayer.defaultHeros, slots)}
        selected = {hero.HeroComp.heroData.heroUid: hero for hero in self.engine.heroEntities.values()
                    if hero.ownerController in controllers and hasattr(hero, "HeroComp")}
        if {uid: (hero.ownerController, hero.posIndex) for uid, hero in selected.items()} != expected:
            raise RuntimeError("The original Four Seasons engine selected a different roster")
        if not self.buff_id:
            return
        for hero in selected.values():
            # The offline host supplies the room's activity buff. The original
            # component applies its own attribute, duration and removal rules.
            before = {name: getattr(hero.AttrComp, name) for name in self.buff_attrs}
            hero.BuffMgrComp.addBuff(hero.uid, self.buff_id, 1, self.const.INFINITE_BUFF_DURATION)
            if (not hero.BuffMgrComp.getFirstBuff(self.buff_id)
                    or any(not isclose(getattr(hero.AttrComp, name) - before[name], value)
                           for name, value in self.buff_attrs.items())):
                raise RuntimeError("The original Four Seasons buff did not apply its configured attributes")
            self.buffed_positions.append(hero.posIndex)

    def check_automatic(self, controllers):
        if not all(ctrl.isAuto for ctrl in controllers):
            raise RuntimeError("The original Four Seasons engine did not start every player in automatic mode")
        self.automatic = True

    def report(self):
        if not self.automatic or sorted(self.buffed_positions) != (list(range(1, 7)) if self.buff_id else []):
            raise RuntimeError("The original Four Seasons automatic mode or party buff was not verified")
        return {"positions": self.positions[0], "partyPositions": self.positions, "automatic": True,
                "buffId": self.buff_id, "buffRate": self.buff_rate, "buffedPositions": sorted(self.buffed_positions)}
