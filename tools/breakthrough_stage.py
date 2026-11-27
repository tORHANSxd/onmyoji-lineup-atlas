"""Prepare and verify known matchups in the original breakthrough engines."""

from rune_team import assign_local_party, selected_team, verify_local_party


BREAKTHROUGH_MODE = 4000
GUILD_BREAKTHROUGH_MODE = 4001
BREAKTHROUGH_STAGE = 10020201
BREAKTHROUGH_SCENE = 100
BREAKTHROUGH_POSITIONS = {
    1: ((2, 3, 4, 5, 6),),
    2: ((5, 6), (2, 3, 4)),
    3: ((3,), (2, 5), (4, 6)),
}


class BreakthroughMatch:
    def __init__(self, mode, stage, plan, suits, fighters, actor):
        from DynamicConfigData import DATA_HERO

        self.guild = mode == GUILD_BREAKTHROUGH_MODE
        count = plan.get("attackPartySize") if self.guild else 1
        if type(count) is not int or count not in BREAKTHROUGH_POSITIONS or not self.guild and "attackPartySize" in plan:
            raise ValueError("Only guild breakthrough supports configuring one to three attackers")
        self.positions = BREAKTHROUGH_POSITIONS[count]

        defense = plan.get("defender")
        if (stage != BREAKTHROUGH_STAGE or type(defense) is not dict
                or defense.keys() != {"onmyoji", "members"} or len(fighters) != 5):
            raise ValueError("Breakthrough requires two known teams of five and their onmyoji")
        defender, defenders, self.inventory, _ = selected_team(defense, suits)
        self.defense = {"selected-onmyoji": defender, **defenders}
        self.attack = {"selected-onmyoji": actor, **fighters}
        if len(defenders) != 5 or any(hero["heroId"] not in DATA_HERO.data for hero in self.defense.values()):
            raise ValueError("Breakthrough requires five known defending shikigami")

        snapshot = {uid: {**row, "equips": {}} for uid, row in self.defense.items()}
        snapshot["other_info"] = {"skin_info": {}, "guild_buffs": [], "attack_guild_buffs": []}
        userdata = {"defenderUid": "offline-defender", "defenderData": snapshot}
        if self.guild:
            from battleengine.engine.JiejieTuPoGuildEngine import JiejieTuPoGuildEngine, const

            self.engine = JiejieTuPoGuildEngine({**userdata, "guildUid": "offline-guild"})
            self.route = "guild-breakthrough-known-matchup"
        else:
            from battleengine.engine.JiejieTuPoSingleEngine import JiejieTuPoSingleEngine, const

            self.engine = JiejieTuPoSingleEngine(userdata)
            self.route = "personal-breakthrough-known-matchup"
        self.const = const
        self.engine.battleMode = mode
        self.opening = None
        self.referee = None

    def prepare_defender(self):
        engine = self.engine
        if (engine.combineSceneInfoId != BREAKTHROUGH_SCENE
                or (hasattr(engine, "refereeEntity") if self.guild else not engine.isLiyuqiOpen())):
            raise RuntimeError("The original breakthrough arena or referee differs from this client version")
        # The export has already been decoded. Attach the translated inventory before
        # the native engine calculates attributes and creates the defending units.
        engine.defenderPlayer.inventory.update(self.inventory)
        for uid, row in self.defense.items():
            engine.defenderPlayer.heroes[uid].equips = row["equips"]

    def assign_players(self, player, fighters):
        return assign_local_party(player, fighters, self.positions)

    def verify_players(self, controllers):
        verify_local_party(controllers, self.positions)

    def verify_selection(self, controllers):
        camps = self.const.CampFlag
        by_position = {1: controllers[0]}
        by_position.update((position, owner) for owner, slots in zip(controllers, self.positions) for position in slots)
        self.opening = {
            "attack": self._verify_side(camps.CAMP1, self.attack, by_position),
            "defense": self._verify_side(camps.CAMP2, self.defense),
        }

    def _verify_side(self, camp, roster, owners=None):
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
                    or sorted(value for value in hero.equips if value) != sorted(row["equips"])
                    or owners is not None and entity.ownerController is not owners[position]):
                raise RuntimeError("The original breakthrough character, position, equipment or owner differs")
            result.append({"position": position, "id": entity.protoid, "level": hero.level, "star": hero.star,
                           "awake": hero.awake, "souls": len(row["equips"]), "attack": attrs.attack,
                           "hp": attrs.maxHp, "speed": attrs.speed})
        return result

    def observe_referee(self):
        if not self.guild and self.referee is None and self.engine.refereeEntity is not None:
            self.referee = {"level": self.engine.getJiejieLevel(), "speed": self.engine.refereeSpeed}

    def report(self):
        if self.opening is None or not self.guild and self.referee is None:
            raise RuntimeError("The original breakthrough lineup or referee was never observed")
        if self.guild:
            return {**self.opening, "attackParty": self.positions}
        return {**self.opening, "referee": {**self.referee, "turns": self.engine.refereeBuffCount - 1}}
