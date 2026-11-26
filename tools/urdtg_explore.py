"""Replay a recorded activity roster in 飞羽凌云's original exploration engine."""

from fengmo_yanwu_stage import SoloActivityReplay
from ten_anniversary_explore import exploration_uid


URDTG_ACTIVITY = 12231
URDTG_EXPLORE_MODE = 6089
URDTG_ACTOR = 80611
URDTG_LIMIT = 180
URDTG_MASK_SKILL = 61142
URDTG_MASK_BUFF = 59341
URDTG_STAGES = frozenset((*range(12140016, 12140034), 12140036, 12140037, 12140038))
URDTG_SOURCES = {
    "battleengine.engine.URDTGExploreBattleEngine": "84b2da8084f7f2ac0a8967276d6309d1322d813e84667af7367996a196aa4b8f",
    "battleengine.engine.NormalActivityEngine": "41e39c61753cc3a8ab8b2594045700a1b6f9e0480a8570cb8d23a5f6d37ce4d1",
    "scenemembers.URDTGExploreBattleScene": "b0493b5684ea42285ff86173d7beffc5d39547f50ebde7b128ac83c478835d8c",
    "com.data.cdata.urdtg_dungeon_battle": "c217c0378cb90674b6664f456b4d50be598ad901bd1d436417359367b06b79fe",
    "com.data.cdata.urdtg_hero": "2a54b003e8aa40c18da599080449fd8b7d18f9c5eb0e8ba6d757180e3070ac7c",
    "com.data.cdata.urdtg_hero_attr": "2cfaf40ecb3f5d18a14f6e0ef5cd64981d3d0a4759f9f3cb4891ac9ee8fc4e83",
    "com.data.cdata.urdtg_const": "eb7b817c48e4fbbe577a1c23f87dae84eeb250746ca6bd5df6f12a9ec65d13f7",
    "battleengine.skill.SkillComp_59341": "af97e17c06f5244e4ff4e7be4af68aba3b85cf50c6455b69f1ea254b64571bfd",
}


def urdtg_explore_stage(modules, stage_id, plan):
    from battleengine.engine.URDTGExploreBattleEngine import URDTGExploreBattleEngine, const
    from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_NORMAL_BATTLE_YYS_REPLACE,
                                   DATA_PVE_STAGE_DATA, DATA_URDTG_CONST, DATA_URDTG_DUNGEON_BATTLE, DATA_URDTG_HERO)

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in URDTG_SOURCES.items()):
        raise ValueError("The original flying tournament exploration engine or tables changed")
    profiles = DATA_URDTG_HERO.data
    actor_level, skill_level, members = plan.get("actorLevel"), plan.get("skillLevel"), plan.get("members")
    masks, maximum = plan.get("masks"), DATA_URDTG_CONST.data[308]["value"][0]
    if (type(actor_level) is not int or actor_level != profiles[URDTG_ACTOR]["init_lv"]
            or type(skill_level) is not int or not 1 <= skill_level <= 3
            or type(masks) is not int or not 0 <= masks <= maximum
            or not isinstance(members, list) or not 1 <= len(members) <= 5):
        raise ValueError("The tournament needs the event actor, skill level and one to five recruits")
    roster = {}
    for row in members:
        if not isinstance(row, list) or len(row) != 2 or any(type(value) is not int for value in row):
            raise ValueError("Each tournament recruit needs its event hero ID and level")
        hero, level = row
        if hero == URDTG_ACTOR or hero in roster or hero not in profiles or level != profiles[hero]["init_lv"]:
            raise ValueError("Unknown, duplicate or invalid tournament recruit")
        roster[hero] = level
    stage_key = str(stage_id)
    stage = DATA_PVE_STAGE_DATA.data.get(stage_key)
    config = DATA_NORMAL_BATTLE_CONFIG.data[URDTG_EXPLORE_MODE]
    if (stage_id not in URDTG_STAGES or not stage or stage["groupid"] != stage_id or stage["shishentotal"] != 5
            or stage.get("battleTime") != URDTG_LIMIT or config["halt_time"] != URDTG_LIMIT or config["group_battle"]
            or DATA_NORMAL_BATTLE_YYS_REPLACE.data[config["replace_yys_id"]]["yys_id"] != URDTG_ACTOR
            or not any(row["battle_id"] == stage_key for row in DATA_URDTG_DUNGEON_BATTLE.data.values())):
        raise ValueError("Unknown tournament exploration stage")
    group = BattleMonstersInfo.data[stage_id]
    if len(group["MonstersInfos"]) != 1:
        raise ValueError("The original tournament formation changed")
    engine = URDTGExploreBattleEngine({"pve_data_flag": stage_key, "teamUid": "offline-urdtg-explore",
                                       "act_id": URDTG_ACTIVITY, "act_heroes_info": roster,
                                       "replace_yys_level": actor_level, "replace_yys_skill_level": skill_level,
                                       "buff_num": masks, "skill_info": {URDTG_MASK_SKILL: 1} if masks else {}})
    engine.battleMode = URDTG_EXPLORE_MODE
    return engine, group, const, profiles


class UrDtgExploreReplay(SoloActivityReplay):
    def __init__(self, engine, group, const, profiles, plan, controller):
        super().__init__(engine, group, const)
        self.profiles, self.plan, self.controller = profiles, plan, controller
        self.party = []
        self.mask_recipients = set()

    def verify_selection(self):
        from DynamicConfigData import DATA_CARD_INIT, DATA_EQUIP_SUIT

        engine, owner = self.engine, self.controller
        expected = [(URDTG_ACTOR, self.plan["actorLevel"]), *self.plan["members"]]
        units = sorted((unit for unit in engine.heroEntities.values() if unit.ownerController is owner),
                       key=lambda unit: unit.posIndex)
        if len(units) != len(expected):
            raise RuntimeError("The original tournament engine selected a different team size")
        for position, (unit, (hero, level)) in enumerate(zip(units, expected), 1):
            attr = unit.AttrComp
            skills = sorted([item.skillId, item.skillLevel] for item in unit.SkillMgrComp.skillCompList)
            if (unit.protoid, attr.level, unit.posIndex) != (hero, level, position):
                raise RuntimeError("The original tournament engine selected a different recruit or position")
            if position != 1 and unit.HeroComp.heroData.heroUid != exploration_uid(owner.ctrlPlayer, hero):
                raise RuntimeError("The original tournament engine did not select the requested activity recruit")
            if position == 1 and [engine.REPLACE_YYS_ULT_SKILL_ID, self.plan["skillLevel"]] not in skills:
                raise RuntimeError("The original tournament actor used a different ultimate skill level")
            suit = self.profiles[hero]["suit_id"]
            components = unit.SkillMgrComp.skillCompList
            cards = {card: skill for card in DATA_EQUIP_SUIT.data[suit]["suit_card_list"]
                     if (skill := DATA_CARD_INIT.data.get(card, {}).get("cardSkillId"))}
            if any(not any(item.skillId == skill and item.skillLevel == 1 and item.fromCardId == card
                           for item in components) for card, skill in cards.items()):
                raise RuntimeError("The original tournament engine applied a different recruit suit")
            self.party.append({"id": hero, "position": position, "level": level, "skills": skills,
                               "suitId": suit, "suitSkills": list(cards.values()), "hp": attr.maxHp,
                               "speed": attr.speed, "attack": attr.attack, "defense": attr.defense, "critRate": attr.critRate})

    def update(self):
        super().update()
        if self.started is None or not self.plan["masks"] or self.mask_recipients == self.expected_mask_recipients:
            return
        units = (unit for unit in self.engine.heroEntities.values() if unit.ownerController is self.controller)
        for unit in units:
            if unit.BuffMgrComp.getBuffs(URDTG_MASK_BUFF):
                self.mask_recipients.add(unit.protoid)

    @property
    def expected_mask_recipients(self):
        from DynamicConfigData import DATA_URDTG_CONST

        eligible = DATA_URDTG_CONST.data[312]["value"] + DATA_URDTG_CONST.data[113]["value"]
        return {row["id"] for row in self.party if row["id"] in eligible} if self.plan["masks"] else set()

    def report(self):
        engine = self.engine
        if (not self.party or self.started is None or not self.opening or self.assists or engine.group_members
                or engine.yys_hero_id != URDTG_ACTOR or not engine.replace_yys_flag
                or abs(engine.haltBattleTime - self.started - URDTG_LIMIT) > 1):
            raise RuntimeError("The original tournament ran with different activity conditions")
        if self.mask_recipients != self.expected_mask_recipients:
            raise RuntimeError(f"The original tournament mask recipients were {self.mask_recipients}, "
                               f"expected {self.expected_mask_recipients}")
        return {"actorLevel": self.plan["actorLevel"], "skillLevel": self.plan["skillLevel"],
                "masks": self.plan["masks"], "maskRecipients": sorted(self.mask_recipients),
                "party": self.party, "opening": self.opening, "deadlineSeconds": URDTG_LIMIT,
                "timedOut": bool(engine.isHaltBattle), "combatSeconds": round(engine.now_time() - self.started, 6)}
