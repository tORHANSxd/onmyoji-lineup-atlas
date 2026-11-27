"""Prepare and verify a local matchup in the original personal breakthrough engine."""

from rune_team import selected_team


BREAKTHROUGH_MODE = 4000
BREAKTHROUGH_STAGE = 10020201
BREAKTHROUGH_SCENE = 100
BREAKTHROUGH_ROUTE = "personal-breakthrough-known-matchup"


class BreakthroughMatch:
    def __init__(self, stage, plan, suits, fighters, actor):
        from DynamicConfigData import DATA_HERO
        from battleengine.engine.JiejieTuPoSingleEngine import JiejieTuPoSingleEngine, const

        defense = plan.get("defender")
        if (stage != BREAKTHROUGH_STAGE or type(defense) is not dict
                or defense.keys() != {"onmyoji", "members"} or len(fighters) != 5):
            raise ValueError("Personal breakthrough requires two known teams of five and their onmyoji")
        defender, defenders, self.inventory, _ = selected_team(defense, suits)
        self.defense = {"selected-onmyoji": defender, **defenders}
        self.attack = {"selected-onmyoji": actor, **fighters}
        if len(defenders) != 5 or any(hero["heroId"] not in DATA_HERO.data for hero in self.defense.values()):
            raise ValueError("Personal breakthrough requires five known defending shikigami")

        self.const = const
        snapshot = {uid: {**row, "equips": {}} for uid, row in self.defense.items()}
        snapshot["other_info"] = {"skin_info": {}, "guild_buffs": [], "attack_guild_buffs": []}
        self.engine = JiejieTuPoSingleEngine({"defenderUid": "offline-defender", "defenderData": snapshot})
        self.engine.battleMode = BREAKTHROUGH_MODE
        self.opening = None
        self.referee = None

    def prepare_defender(self):
        engine = self.engine
        if engine.combineSceneInfoId != BREAKTHROUGH_SCENE or not engine.isLiyuqiOpen():
            raise RuntimeError("The original breakthrough arena or referee differs from this client version")
        # The export has already been decoded. Attach the translated inventory before
        # the native engine calculates attributes and creates the defending units.
        engine.defenderPlayer.inventory.update(self.inventory)
        for uid, row in self.defense.items():
            engine.defenderPlayer.heroes[uid].equips = row["equips"]

    def verify_opening(self):
        camps = self.const.CampFlag
        self.opening = {
            "attack": self._verify_side(camps.CAMP1, self.attack),
            "defense": self._verify_side(camps.CAMP2, self.defense),
        }

    def _verify_side(self, camp, roster):
        units = {entity.HeroComp.heroData.heroUid: entity for entity in self.engine.heroEntities.values()
                 if entity.camp == camp and entity.HeroComp.heroData.heroUid in roster}
        result = []
        for position, (uid, row) in enumerate(roster.items(), 1):
            entity = units.get(uid)
            if entity is None:
                raise RuntimeError("The original engine did not field the known breakthrough lineup")
            hero = entity.HeroComp.heroData
            attrs = entity.AttrComp
            if ((entity.posIndex, entity.protoid, hero.level, hero.star, hero.awake)
                    != (position, row["heroId"], row["level"], row["star"], row["awake"])
                    or sorted(value for value in hero.equips if value) != sorted(row["equips"])):
                raise RuntimeError("The original breakthrough character, position or equipment differs")
            result.append({"position": position, "id": entity.protoid, "level": hero.level, "star": hero.star,
                           "awake": hero.awake, "souls": len(row["equips"]), "attack": attrs.attack,
                           "hp": attrs.maxHp, "speed": attrs.speed})
        return result

    def observe_referee(self):
        if self.referee is None and self.engine.refereeEntity is not None:
            self.referee = {"level": self.engine.getJiejieLevel(), "speed": self.engine.refereeSpeed}

    def report(self):
        if self.opening is None or self.referee is None:
            raise RuntimeError("The original breakthrough lineup or referee was never observed")
        return {**self.opening, "referee": {**self.referee, "turns": self.engine.refereeBuffCount - 1}}
