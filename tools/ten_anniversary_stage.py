"""Inventory replay for Shichangji's 2026 tower and map encounters."""

from importlib import import_module

from fengmo_yanwu_stage import SoloActivityReplay


TEN_TOWER = 9591
TEN_MAP_ENCOUNTER = 9593
TEN_OWNED_MODES = (TEN_TOWER, TEN_MAP_ENCOUNTER)
TEN_TOWER_STAGES = {12130001: 70, 12130002: 71}
TEN_EXPLORATION_STAGES = range(12130016, 12130060)
TEN_ENCOUNTER_STAGES = range(12130069, 12130076)
TEN_BOSS_STAGES = range(12135001, 12135006)
TEN_ACTIVITY = 12130
TEN_ASSIST = 105
TEN_GROW_ACTIVITY = 12132
TEN_DEFAULT_BONUS = 810241
TEN_OPTIONAL_BONUSES = (810242, 810243, 810244, 810245)
TEN_BONUS_SLOTS = 2
TEN_REPLAY_SECONDS = 110
TEN_ENTRIES = {
    TEN_TOWER: ("TenAnniversaryTowerBattleEngine", "6fa68668f4c91f78be4d07ed3aec45cc190b27d16d650b373eab89c96429353a",
                "tower", "13d7fe12f9310b10dbaf7dc26a8e6cfd71355fad99985055a92184d19305debc"),
    TEN_MAP_ENCOUNTER: ("TenAnniversaryZYBattleEngine", "9b17f0bcf05221bc3a5f5f7ca7de2d69a0dbdac3905ac188d916c97cf562bbff",
                        "zy", "9ecf229aab10c45d304b23af2a083683239311b5d02fd75a0efc5483e554d66a"),
}
TEN_SOURCES = {
    "battleengine.engine.NormalActivityEngine": "41e39c61753cc3a8ab8b2594045700a1b6f9e0480a8570cb8d23a5f6d37ce4d1",
    "com.data.cdata.ten_anni_2026_const": "2050c002e95c694ffd912d0a298732e1f3349fd8e9b5ac7f8702da5b9689ab1c",
    "com.data.cdata.ten_anni_2026_dungeon_battle": "64548f1d2dcf6fcb58d97da7f3fa1b87a8950853627e7d0bc6ec607f53e7bd1c",
    "com.data.cdata.normal_battle_config": "51124450333f6b6859599013d31c8d70c90c57972d154bbb17f1d3aaa8a6db66",
    "com.data.cdata.normal_battle_assist_hero": "12a458cabd758009220dd8b7a3cf2b42be839f6e3997d9e74629ea628a711394",
    "com.data.cdata.normal_battle_develop_skill_new": "9c8f37291d3fc86f8f19b3ba530858621a65ad63ccff28f26eec42ac85818d9a",
    "com.data.cdata.asura_develop": "416ff9213f22c09526d4605f05c4191cb0d111c6d50a9b840daa50212f555699",
    "com.data.cdata.asura_load": "827aae396458361c14b03de5447dafda6d196f4692d54fcd52e08fbde3bf72cf",
}


def is_ten_anniversary_stage(stage_id):
    return any(stage_id in stages for stages in (
        TEN_TOWER_STAGES, TEN_EXPLORATION_STAGES, TEN_ENCOUNTER_STAGES, TEN_BOSS_STAGES))


def valid_ten_optional_bonuses(bonuses):
    return (isinstance(bonuses, list) and len(bonuses) <= TEN_BONUS_SLOTS
            and all(type(value) is int and value in TEN_OPTIONAL_BONUSES for value in bonuses)
            and bonuses == sorted(set(bonuses)))


def ten_anniversary_stage(modules, mode, stage_id, bonuses):
    from com import const
    from com.data.cdata import asura_develop, asura_load, ten_anni_2026_const, ten_anni_2026_dungeon_battle
    from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

    engine_name, digest, route, route_digest = TEN_ENTRIES[mode]
    engine_module = f"battleengine.engine.{engine_name}"
    route_module = f"module.team_types.team_type_ten_anniversary_{route}_battle"
    sources = {**TEN_SOURCES, engine_module: digest, route_module: route_digest}
    if any(modules.rows[name]["marshalSHA256"] != hash_ for name, hash_ in sources.items()):
        raise ValueError("The original Shichangji activity engine or tables changed")
    if not bonuses or bonuses[0] != TEN_DEFAULT_BONUS or not valid_ten_optional_bonuses(bonuses[1:]):
        raise ValueError("Shichangji requires the default bonus and up to two selected bonuses")
    if (asura_load.data[TEN_GROW_ACTIVITY]["load_max"] != TEN_BONUS_SLOTS
            or ten_anni_2026_const.data[54]["value"] != list(TEN_OPTIONAL_BONUSES)
            or ten_anni_2026_const.data[55]["value"] != [TEN_DEFAULT_BONUS]):
        raise RuntimeError("The original Shichangji bonus configuration changed")
    for skill_id in bonuses:
        row = asura_develop.data[skill_id]
        if (row["activity_id"] != TEN_GROW_ACTIVITY or row["max_lv"] != 1 or row["default_unlock"] != 1
                or row["default_equiped"] != int(skill_id == TEN_DEFAULT_BONUS)):
            raise RuntimeError(f"The original Shichangji bonus {skill_id} changed")
    options = {}
    if mode == TEN_TOWER and stage_id in TEN_TOWER_STAGES:
        const_id = TEN_TOWER_STAGES[stage_id]
        if ten_anni_2026_const.data[const_id]["value"] != [stage_id]:
            raise RuntimeError("The original tower difficulty mapping changed")
        options["is_hard"] = const_id == 71
    elif mode == TEN_MAP_ENCOUNTER and stage_id in TEN_ENCOUNTER_STAGES:
        encounter = ten_anni_2026_dungeon_battle.data[201 + stage_id - TEN_ENCOUNTER_STAGES.start]
        if encounter["type"] != 4 or int(encounter["battle_id"]) != stage_id:
            raise RuntimeError("The original encounter mapping changed")
    else:
        raise ValueError("Unknown Shichangji inventory battle")
    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    if stage["shishentotal"] != 5 or len(group["MonstersInfos"]) != 1 or stage["battleTime"] not in (180, 300):
        raise RuntimeError("The original Shichangji formation or time limit changed")
    engine = getattr(import_module(engine_module), engine_name)({
        "pve_data_flag": str(stage_id), "act_id": TEN_ACTIVITY, "teamUid": "offline-ten-anniversary",
        "skill_info": dict.fromkeys(bonuses, 1), **options,
    })
    engine.battleMode = mode
    return engine, group, const, stage["battleTime"]


class TenAnniversaryReplay(SoloActivityReplay):
    def __init__(self, engine, group, const, deadline, bonuses):
        super().__init__(engine, group, const)
        self.deadline, self.bonuses = deadline, bonuses

    def report(self):
        engine = self.engine
        bonus_ids = [row[0] for row in engine.battle_skill_info]
        if (not self.opening or self.started is None or engine.replace_yys_flag or engine.group_members
                or engine.develop_level or engine.assist_hero_list != [TEN_ASSIST]
                or self.assists != [{"configId": TEN_ASSIST, "heroId": 10608, "position": 101}]
                or bonus_ids != self.bonuses or abs(engine.haltBattleTime - self.started - self.deadline) > 1):
            raise RuntimeError("The original Shichangji activity replay used different conditions")
        return {"actId": TEN_ACTIVITY, "hard": getattr(engine, "is_hard", False), "opening": self.opening,
                "assists": self.assists, "bonuses": bonus_ids, "deadlineSeconds": self.deadline,
                "timedOut": bool(engine.isHaltBattle), "combatSeconds": round(engine.now_time() - self.started, 6)}
