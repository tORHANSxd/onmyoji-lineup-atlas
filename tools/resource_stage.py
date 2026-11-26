"""Versioned experience and coin encounters in the original engine."""

from importlib import import_module
import math
from types import CodeType, FunctionType, SimpleNamespace


FIRST_EXP_STAGE = 2111
DAILY_EXP_STAGE = 2109
DAILY_COIN_STAGE = 2009
RESOURCE_MODE = 528
RESOURCE_STAGE_NAMES = {"经验副本", "金币副本"}
SOURCE_HASHES = {
    "battleengine.BattleEngine": "5333880a15e43334b4c4f81597974a7bf9dd04bf001c8203e91656c8404b278b",
    "battleengine.engine.NewExpEngine": "b28f2dd8720d52fad468846119c8108e2c6bbd7821dde4d3206dec6be3d5833a",
    "battleengine.engine.NewExpCoinBaseEngine": "dabec75d0bb51d44d4cfcbcdeea5c67d9be6bd00f2521d54203cfd4d08701a70",
    "battleengine.engine.SharedHpPveEngine": "7c4d1b29d0558aa281b137cf6bdec48e8de47f73cf33434f0f93b83421652fd3",
    "module.exp_gold.ResourceFightPanel": "991c81c9eaa2ac4f7e0e78f4bf26aa52ffec63358102980022d616a61c3b1b00",
}
DAILY_HASHES = {
    "module.team_types.team_type_new_exp_gold": "ce6a7399767a118ca87b7e03c81e4eeb32373fcdf42197522dae611b5ffef122",
    "battleengine.engine.NewCoinEngine": "f84893f2cac8f541556a6da6f1aceb7f0f867c441ad01968f0916977e56194a8",
    "scenemembers.GoldBattleScene": "4fdad6a3f45a5d7ebb66a947ce0d1293712e1c67e4b7f16caf4e4a754d3859ef",
}
ROUTES = {FIRST_EXP_STAGE: "resource-first-new-server-exp", DAILY_EXP_STAGE: "resource-daily-exp-solo",
          DAILY_COIN_STAGE: "resource-daily-coin-solo"}


def first_experience_stage(modules):
    from battleengine.engine.NewExpEngine import NewExpEngine, const
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCE_HASHES.items()):
        raise ValueError("The new-server experience entry requires its verified client scripts")
    # ResourceFightPanel.on_create_team sends this payload for the first exp run.
    stage = DATA_PVE_STAGE_DATA.data[str(FIRST_EXP_STAGE)]
    formation = BattleMonstersInfo.data[stage["groupid"]]
    engine = NewExpEngine({"pve_data_flag": str(FIRST_EXP_STAGE), "atk_flags": {}, "__is_spec": False,
                           "member_num": 1, "allRewards": {}, "mode": "exp", "teamUid": None,
                           "battle_config": {"spectatorHeroCount": 4}, "mon_hp_rate": 1,
                           "local_battle_limit_time": 180, "is_local_newbie_battle": True})
    engine.battleMode = const.BattleMode.MODE_NEW_EXP_COIN_FIGHT
    if engine.battleMode != RESOURCE_MODE or engine.combineSceneInfoId != formation["resindex"]:
        raise RuntimeError("The client experience entry resolved to a different battle")

    # This route stores its reinforcements on the client engine. The host
    # otherwise uses server defaults to keep UI and transport out of the replay.
    engine.isClientSide = lambda: True
    # The original compares an absolute clock for the deadline. Advance that
    # clock with the fixed-step battle so machine speed cannot affect a win.
    for name in ("NewExpCoinBaseEngine", "SharedHpPveEngine"):
        import_module("battleengine.engine." + name).time = SimpleNamespace(time=engine.now_time)
    return engine, stage, formation


class SoloResourceTeam:
    """Keep the original shared HP, spawn queue and settlement within one team."""
    def __init__(self):
        self.properties = {}
        self.battle_teams = {1: {"battle_extra_info": {}}}

    def group_get_property(self, team, name, default=None):
        return self.properties.get(name, default)

    def group_set_property(self, team, name, value):
        self.properties[name] = value

    def group_forward_msgs(self, *args, **kwargs):
        # A single simulated battle has no other teams to receive messages.
        pass


def coin_preview(modules, stage_id):
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA, DATA_REWARD
    from com.utils import helpers

    code = modules.load("scenemembers.GoldBattleScene")
    for name in ("GoldBattleScene", "calc_drop_coin"):
        code = next(child for child in code.co_consts if isinstance(child, CodeType) and child.co_name == name)
    calculate = FunctionType(code, {"BattleMonstersInfo": BattleMonstersInfo, "DATA_PVE_STAGE_DATA": DATA_PVE_STAGE_DATA,
                                   "DATA_REWARD": DATA_REWARD, "helpers": helpers, "math": math})
    reward_id = BattleMonstersInfo.data[DATA_PVE_STAGE_DATA.data[str(stage_id)]["groupid"]]["passReward"]
    if not DATA_REWARD.data.get(reward_id, {}).get("coin"):
        raise RuntimeError("The original coin preview has no reward configuration")

    def preview(hp, base):
        return calculate(SimpleNamespace(sceneUserData={"pve_data_flag": str(stage_id)}, base_coin=base), hp)

    return preview


class ResourceReplay:
    def __init__(self, modules, stage_id):
        from battleengine.engine.NewExpEngine import NewExpEngine, const
        from com.utils import helpers
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        self.const, self.stage_id, self.route = const, stage_id, ROUTES[stage_id]
        self.reinforcements = []
        self.team = None
        if stage_id == FIRST_EXP_STAGE:
            self.engine, self.stage, self.formation = first_experience_stage(modules)
        else:
            if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in (SOURCE_HASHES | DAILY_HASHES).items()):
                raise ValueError("The daily resource route requires its verified client scripts")
            from battleengine.engine.NewCoinEngine import NewCoinEngine

            self.stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
            self.formation = BattleMonstersInfo.data[self.stage["groupid"]]
            self.team = SoloResourceTeam()
            coin = stage_id == DAILY_COIN_STAGE
            engine_class = NewCoinEngine if coin else NewExpEngine
            self.engine = engine_class({"pve_data_flag": str(stage_id), "atk_flags": {}, "__is_spec": False,
                                        "member_num": 1, "allRewards": {}, "mode": "coin" if coin else "exp",
                                        "teamUid": 1, "team": self.team, "is_leader": True, "mon_hp_rate": 1,
                                        "battle_config": {"spectatorHeroCount": 4}})
            self.engine.battleMode = const.BattleMode.MODE_NEW_EXP_COIN_FIGHT
            for name in ("NewExpCoinBaseEngine", "SharedHpPveEngine"):
                import_module("battleengine.engine." + name).time = SimpleNamespace(time=self.engine.now_time)
            if coin:
                self.preview = coin_preview(modules, stage_id)
                import_module(NewCoinEngine.__module__).random = SimpleNamespace(randint=lambda a, b: self.engine.random.randint(a, b))
            else:
                self.spawn_pool = helpers.global_get_const_value(9824, ())
                import_module(NewExpEngine.__module__).random = SimpleNamespace(choice=lambda values: self.engine.random.choice(values))
        self.opening = observe_experience_opening(self.engine, const, self.formation)

    def matches(self):
        engine = self.engine
        return (engine.pve_data_flag == str(self.stage_id) and engine.monstergroup == self.stage["groupid"]
                and engine.combineSceneInfoId == self.formation["resindex"] and engine.get_timeout_seconds() == 150
                and engine.spectatorHeroCount == 4
                and (self.stage_id != FIRST_EXP_STAGE or engine.is_local_newbie_battle))

    def created(self, entity):
        from com.utils import helpers

        if (self.stage_id == DAILY_EXP_STAGE and self.opening and entity.camp == self.const.CampFlag.CAMP2
                and helpers.isMonsterEntity(entity)):
            if entity.protoid not in self.spawn_pool:
                raise RuntimeError("The original experience encounter used an unexpected reinforcement")
            self.reinforcements.append(entity.protoid)

    def report(self, outcome):
        from com.utils import helpers

        if not self.opening:
            raise RuntimeError("The resource encounter never created its opening formation")
        engine = self.engine
        result = {"timedOut": engine.is_timeout, "deadlineSeconds": engine.get_timeout_seconds(), "opening": self.opening}
        if self.stage_id != DAILY_COIN_STAGE:
            result.update(kills=engine.get_kill_monster_count(), requiredKills=30)
            if self.team:
                result["reinforcements"] = self.reinforcements
            return "experience", result

        ends = self.team.properties.get("battle_end_info", {})
        hp = ends.get("boss_hp_per", engine.get_boss_hp_per())
        base = self.team.properties.get("base_coin")
        minimum = int(helpers.global_get_const_value(9831, 0))
        maximum = int(helpers.global_get_const_value(9841, 0))
        if (not isinstance(base, int) or not minimum <= base <= maximum or not 0 <= hp <= 1
                or ((outcome == "win" or engine.is_timeout) and "boss_hp_per" not in ends)):
            raise RuntimeError("The original coin encounter did not return valid shared settlement")
        result.update(bossHpFraction=hp, damage=engine.my_total_damage, baseCoins=base, previewCoins=self.preview(hp, base),
                      minimumPreviewCoins=self.preview(hp, minimum))
        return "coins", result


def observe_experience_opening(engine, const, formation):
    spawn = engine._createNextRoundMons
    expected = sorted((position, monster_id, level) for position, monster_id, level, *_ in formation["MonstersInfos"][0])
    opening = []

    def verify_spawn():
        result = spawn()
        enemies = sorted(engine.getEntities(const.CampFlag.CAMP2, [const.EntityTypeFlag.MONSTER]),
                         key=lambda unit: unit.posIndex)
        if opening or [(unit.posIndex, unit.protoid) for unit in enemies] != [(p, mid) for p, mid, _ in expected]:
            raise RuntimeError("The client created a different resource formation")
        for (position, monster_id, level), unit in zip(expected, enemies):
            attr = unit.AttrComp
            opening.append({"id": monster_id, "position": position, "level": level, "hp": attr.hp,
                            "speed": attr.speed, "attack": attr.attack, "defense": attr.defense, "critRate": attr.critRate})
        return result

    engine._createNextRoundMons = verify_spawn
    return opening
