"""Replay a known recruited party in the original Shichangji map engine."""

from math import isfinite

from fengmo_yanwu_stage import SoloActivityReplay
from ten_anniversary_stage import TEN_ACTIVITY, TEN_EXPLORATION_STAGES, TEN_SOURCES


TEN_EXPLORE_MODE = 9590
TEN_EXPLORE_TEAM = 2319
TEN_EXPLORE_ACTOR = 20608
TEN_EXPLORE_LIMIT = 180
TEN_EXPLORE_ENGINE = "battleengine.engine.TenAnniversaryExploreBattleEngine"
TEN_EXPLORE_SOURCES = {
    TEN_EXPLORE_ENGINE: "6aeb50221eabb93a29d8f8e91de279f23d56bcaa3172ec7fe1f1ad5e33a420af",
    "module.team_types.team_type_ten_anniversary_explore_battle": "ae62817484f3ebbb8851b3dd94f6ed827fe9104dff875b51e0093202fd98fd1f",
    "com.data.cdata.ten_anni_2026_hero": "af4fda15c4033e2189f4474dfecd4446edbd736709f9eb89c8bfda340f771e59",
    "com.data.cdata.ten_anni_2026_hero_attr": "9cdf3cd3acf82479800bf10696024b2ff7c175b298196e8fed541c1d570f61a7",
    **{key: TEN_SOURCES[key] for key in (
        "battleengine.engine.NormalActivityEngine", "com.data.cdata.normal_battle_config",
        "com.data.cdata.ten_anni_2026_dungeon_battle")},
}


def ten_explore_stage(modules, stage_id, plan):
    from battleengine.engine.TenAnniversaryExploreBattleEngine import TenAnniversaryExploreBattleEngine, const
    from com.data.cdata import ten_anni_2026_dungeon_battle, ten_anni_2026_hero
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in TEN_EXPLORE_SOURCES.items()):
        raise ValueError("The original Shichangji exploration engine or table changed")
    if not isinstance(plan, dict):
        raise ValueError("Shichangji exploration needs an activity roster")
    actor_level, members = plan.get("actorLevel"), plan.get("members")
    if (type(actor_level) is not int or not 1 <= actor_level <= 40 or not isinstance(members, list)
            or not 1 <= len(members) <= 5):
        raise ValueError("Shichangji exploration needs an actor level and one to five recruits")
    profiles = ten_anni_2026_hero.data
    roster = {}
    for row in members:
        if not isinstance(row, list) or len(row) != 2 or any(type(value) is not int for value in row):
            raise ValueError("Each recruit needs an activity hero ID and level")
        hero, level = row
        if (hero == TEN_EXPLORE_ACTOR or hero not in profiles or hero in roster
                or not profiles[hero]["init_lv"] <= level <= 40):
            raise ValueError("Unknown, duplicate, or out-of-range activity recruit")
        roster[hero] = level
    config_id = stage_id - TEN_EXPLORATION_STAGES.start + 101
    battle = ten_anni_2026_dungeon_battle.data.get(config_id)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if (stage_id not in TEN_EXPLORATION_STAGES or not battle or battle["battle_id"] != str(stage_id)
            or not stage or stage["shishentotal"] != 5 or stage["battleTime"] != TEN_EXPLORE_LIMIT):
        raise ValueError("Unknown Shichangji exploration stage")
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != 1:
        raise RuntimeError("The original exploration formation changed")
    engine = TenAnniversaryExploreBattleEngine({
        "pve_data_flag": str(stage_id), "act_id": TEN_ACTIVITY, "teamUid": "offline-ten-exploration",
        "replace_yys_level": actor_level, "act_heroes_info": roster,
    })
    engine.battleMode = TEN_EXPLORE_MODE
    return engine, group, const, profiles


def exploration_uid(avatar, hero):
    return f"act_temp_hero_{str(avatar.id)[-5:]}{hero}"


class TenExploreReplay(SoloActivityReplay):
    def __init__(self, engine, group, const, profiles, plan, controller):
        super().__init__(engine, group, const)
        self.profiles, self.plan, self.controller = profiles, plan, controller
        self.party = []

    def verify_selection(self):
        from DynamicConfigData import DATA_CARD_INIT, DATA_EQUIP_SUIT

        engine, owner = self.engine, self.controller
        actor_level = self.plan["actorLevel"]
        native_actor_level = 10 if actor_level == 1 else actor_level
        expected = [(TEN_EXPLORE_ACTOR, native_actor_level), *self.plan["members"]]
        units = sorted((unit for unit in engine.heroEntities.values() if unit.ownerController is owner),
                       key=lambda unit: unit.posIndex)
        if len(units) != len(expected) or engine.yys_hero_lv != actor_level:
            raise RuntimeError("The original exploration engine selected a different activity roster")
        for position, (unit, (hero, level)) in enumerate(zip(units, expected), 1):
            profile = self.profiles[hero]
            attr = unit.AttrComp
            hero_data = unit.HeroComp.heroData
            components = unit.SkillMgrComp.skillCompList
            skills = sorted([item.skillId, item.skillLevel] for item in components)
            suit = profile["suit_id"]
            cards = {card: skill for card in DATA_EQUIP_SUIT.data[suit]["suit_card_list"]
                     if (skill := DATA_CARD_INIT.data.get(card, {}).get("cardSkillId"))}
            if ((unit.protoid, attr.level, unit.posIndex) != (hero, level, position)
                    or hero_data.heroUid != exploration_uid(owner.ctrlPlayer, hero) or any(hero_data.equips)
                    or any(not any(item.skillId == skill and item.skillLevel == 1 and item.fromCardId == card
                                   for item in components) for card, skill in cards.items())):
                raise RuntimeError("The original exploration engine applied a different recruit or suit")
            if position == 1 and not all([skill, engine.getYysSkillLevel(actor_level)] in skills
                                         for skill in profile["skills"]):
                raise RuntimeError("The original exploration actor used different growth skills")
            attributes = {"hp": attr.maxHp, "speed": attr.speed, "attack": attr.attack,
                          "defense": attr.defense, "critRate": attr.critRate}
            if any(not isfinite(value) for value in attributes.values()):
                raise RuntimeError("The original exploration engine returned invalid recruit attributes")
            self.party.append({"id": hero, "level": level, "position": position, "suitId": suit,
                               "suitSkills": list(cards.values()), "skills": skills, **attributes})

    def report(self, completed):
        engine = self.engine
        if (not self.party or self.started is None or not self.opening or self.assists or engine.group_members
                or engine.yys_hero_id != TEN_EXPLORE_ACTOR or not engine.replace_yys_flag
                or abs(engine.haltBattleTime - self.started - TEN_EXPLORE_LIMIT) > 1):
            raise RuntimeError("The original exploration run used different activity conditions")
        used = engine.engineUserData.get("using_hero")
        if completed and used != [hero for hero, _ in self.plan["members"]]:
            raise RuntimeError("The original exploration settlement recorded a different roster")
        return {"actId": TEN_ACTIVITY, "actorLevel": self.plan["actorLevel"], "party": self.party,
                "opening": self.opening, "deadlineSeconds": TEN_EXPLORE_LIMIT,
                "timedOut": bool(engine.isHaltBattle), "combatSeconds": round(engine.now_time() - self.started, 6)}
