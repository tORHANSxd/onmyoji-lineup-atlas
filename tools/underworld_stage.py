"""Inputs and observations for the original solo GuildLieFengEngine."""

from rune_team import battle_spirit, selected_team

UNDERWORLD_MODE = 2001
UNDERWORLD_STAGES = (101, 102, 103)


def underworld_stage(stage_id):
    from battleengine.engine.GuildLieFengEngine import GuildLieFengEngine, GVE_BATTLE_INFO, GVE_MON_WAVE, const

    stage = GVE_BATTLE_INFO.data.get(stage_id)
    if stage_id not in UNDERWORLD_STAGES or not stage or stage["difficulty"] != 100 or stage["scene"] != 211:
        raise ValueError("Unknown personal Underworld Gate entry")
    engine = GuildLieFengEngine({"fbId": stage_id, "guildUid": "local", "send_flag": 1})
    engine.battleMode = const.BattleMode.MODE_GUILD_LIEFENG
    return engine, stage, len(GVE_MON_WAVE.data)


def underworld_teams(plan, suits):
    source = plan.get("rounds", [plan])
    if (not isinstance(source, list) or not 1 <= len(source) <= 4 or any(
            not isinstance(row, dict) or not isinstance(row.get("members"), list) or len(row["members"]) != 5
            for row in source)):
        raise ValueError("Select one to four complete Underworld Gate teams")
    members = [member for row in source for member in row["members"]]
    souls = [soul["id"] for member in members for soul in member["souls"]]
    if len({member["instanceId"] for member in members}) != len(members) or len(set(souls)) != len(souls):
        raise ValueError("Underworld Gate teams need distinct shikigami and simultaneous equipment")

    heroes, inventory, actors, rounds = {}, {}, {}, []
    for number, row in enumerate(source, 1):
        actor, fighters, equips, skills = selected_team(row, suits)
        prefix, actor_alias = f"r{number}-", f"onmyoji-{actor['heroId']}"
        spirit = row.get("spirit")
        if actors.setdefault(actor_alias, (actor, spirit)) != (actor, spirit):
            raise ValueError("Each onmyoji must have one consistent loadout across Underworld Gate teams")
        lineup = [prefix + alias for alias in fighters]
        for alias, hero in fighters.items():
            hero["equips"] = [prefix + equip for equip in hero["equips"]]
            heroes[prefix + alias] = hero
        inventory.update((prefix + alias, equip) for alias, equip in equips.items())
        choices = {prefix + alias: skills[alias] for alias in fighters} | {actor_alias: skills["selected-onmyoji"]}
        rounds.append({"onmyoji": actor_alias, "id": actor["heroId"], "members": lineup, "choices": choices})
    heroes.update((alias, actor) for alias, (actor, _) in actors.items())
    return heroes, inventory, actors, rounds


def underworld_player(heroes, actors, rounds):
    from AttrCalc import HunlingAttrCalc
    from DynamicConfigData import DATA_HUNLING_ATTR, DATA_HUNLING_BASE, DATA_HUNLING_MARK

    player = {"heroes": heroes, "yysid": rounds[0]["id"], "hunling_info": {}, "yys_hunling": {}}
    for alias, (actor, raw) in actors.items():
        if raw is None:
            continue
        spirit = battle_spirit(raw, HunlingAttrCalc)
        possible = DATA_HUNLING_BASE.data.get(spirit["id"], {})
        if (actor["heroId"] not in possible.get("heroIdList", ())
                or (spirit["id"], spirit["star"]) not in DATA_HUNLING_ATTR.data
                or any(mark not in DATA_HUNLING_MARK.data for mark in spirit["marks"])):
            raise ValueError("The selected spirit does not match this onmyoji")
        spirit["uid"] = alias + "-spirit"
        player["hunling_info"][spirit["uid"]] = spirit
        player["yys_hunling"][str(actor["heroId"])] = spirit["uid"]
    return player


class UnderworldReplay:
    def __init__(self, engine, controller, const, rounds, heroes, spirits):
        self.engine, self.controller, self.const = engine, controller, const
        self.rounds, self.heroes, self.spirits = rounds, heroes, spirits
        self.formations, self.confirmed = [], []
        self.left = False
        engine._createNextRoundMons = self.observe_spawn(engine._createNextRoundMons)
        engine.createYYSEntity = self.choose_team(engine.createYYSEntity)

    def observe_spawn(self, native):
        from battleengine.engine.GuildLieFengEngine import GVE_MON_RAND, GVE_MON_WAVE

        def spawn():
            engine = self.engine
            wave = engine.finishedWaveCount + 1
            if wave != len(self.formations) + 1:
                raise RuntimeError("The original Underworld Gate generated waves out of sequence")
            config = GVE_MON_WAVE.data[wave]
            group_id = config["mon_rand_group"]
            groups = GVE_MON_RAND.data[group_id]
            created, create = [], engine.createMonsterEntity

            def observe(camp, owner, position, *args, **kwargs):
                unit = create(camp, owner, position, *args, **kwargs)
                created.append((position.Index, unit.protoid, position.level))
                return unit

            engine.createMonsterEntity = observe
            try:
                result = native()
            finally:
                engine.createMonsterEntity = create
            if not any(created == [(i, monster, config["level"]) for i, monster in enumerate(row["mon_list"], 1)
                                   if monster] for row in groups if row["weight"] > 0):
                raise RuntimeError("The original Underworld Gate created a formation outside its weighted pool")
            self.formations.append({"wave": wave, "group": group_id, "units": created})
            return result

        return spawn

    def choose_team(self, native):
        def summon(controller, *args, **kwargs):
            number = self.engine.myRoundCount
            if controller is not self.controller or not 1 <= number <= 4:
                raise RuntimeError("Unexpected original Underworld Gate team selection")
            if number > len(self.rounds):
                # The local player leaves the next preparation phase without summoning another team.
                return True
            avatar = controller.ctrlPlayer
            row = self.rounds[number - 1]
            if set(controller.bannedHeroes).intersection([row["onmyoji"], *row["members"]]):
                raise ValueError("The original Underworld Gate disallows a selected character in this team")
            avatar.defaultYYSId, avatar.defaultHeros = row["id"], row["members"][:]
            return native(controller, *args, **kwargs)

        return summon

    def select(self):
        engine, controller = self.engine, self.controller
        number = engine.myRoundCount
        if number != len(self.confirmed) + 1 or number > len(self.rounds):
            raise RuntimeError("Unexpected repeat of the original Underworld Gate selection")
        row = self.rounds[number - 1]
        pending = dict(row["choices"])
        for entity in engine.heroEntities.values():
            if entity.ownerController is not controller:
                continue
            hero = entity.HeroComp.heroData
            alias = hero.heroUid
            if alias not in pending or sorted(uid for uid in hero.equips if uid) != sorted(self.heroes[alias]["equips"]):
                raise RuntimeError("The original Underworld Gate selected a different team or equipment")
            setting = pending.pop(alias)
            if setting:
                engine.op_setAutoSkill(controller, entity.uid, setting)
                if controller.autoSkill.get(entity.uid) != setting:
                    raise RuntimeError("The original Underworld Gate rejected a selected skill")
            if alias == row["onmyoji"] and getattr(entity.get_hunlingData(), "uuid", None) != self.spirits.get(str(row["id"])):
                raise RuntimeError("The original Underworld Gate rejected the selected spirit")
        if pending:
            raise RuntimeError("The original Underworld Gate did not summon every selected character")
        engine.op_setAuto(controller, True)
        engine.op_selectHeroOk(controller)
        if not controller.selectHeroOk:
            raise RuntimeError("The original Underworld Gate rejected team confirmation")
        self.confirmed.append({"team": number, "startWave": engine.finishedWaveCount + 1, "onmyojiId": row["id"]})

    def leave_if_out_of_teams(self):
        engine = self.engine
        if engine.myRoundCount > len(self.rounds) and engine.battleState == self.const.BattleState.BS_FIGHT_PRE:
            self.left = True
            engine.op_exitBattle(self.controller)
            engine.checkBattleEnd()

    def report(self):
        expected = {alias for row in self.rounds[:len(self.confirmed)] for alias in row["members"]}
        banned = self.controller.bannedHeroes
        if not expected.issubset(banned) or len(self.formations) not in (self.engine.finishedWaveCount, self.engine.finishedWaveCount + 1):
            raise RuntimeError("The original Underworld Gate did not apply the relay restrictions")
        return {"teams": self.confirmed, "formations": self.formations, "leftAfterLastTeam": self.left,
                "usedShikigamiBanned": len(expected)}
