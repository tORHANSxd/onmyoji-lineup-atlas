"""Replay a configured Eight-Hundred Tanuki cell with the original score engine."""

from importlib import import_module

from fengmo_yanwu_stage import SoloActivityReplay

DOJO_AREA_MODE = 2182
DOJO_AREA_TEAM = 3182
DOJO_AREA_ENGINE = "battleengine.engine.DojoArea2025BattleEngine"
DOJO_AREA_ACTIVITY = {2025: 10433, 2026: 13010}
DOJO_AREA_SECONDS = {1: 60, 2: 120, 3: 120, 4: 180, 5: 60, 6: 60}
DOJO_AREA_SOURCES = {
    DOJO_AREA_ENGINE: "223488ec34289ba8c86d3ac114736c9c05a0d3b5179127535baadfcd2e5e9280",
    "module.team_types.team_type_dojo_area2025_battle": "68303746756b34340758e803fa105e3207a51551ab6e6f2bc382bb236d7fc796",
    "com.data.cdata.dojo2025_bbbl_block_play": "d82bddb693b8e42a66b436ed05da4cc8ef53bdb6126cc655f1d8b4475652c330",
    "com.data.cdata.dojo2026_bbbl_block_play": "93a19aa684ab028ad7063db2a945565b466efccbbe5635ff76f815f381957e19",
    "com.data.cdata.dojo2026_bbbl_const": "81ef6805894c589514667aa15f25bf1dbace5a64b6e84c4f18eaab0691b1c402",
}


def play_table(year):
    return f"com.data.cdata.dojo{year}_bbbl_block_play"


def is_dojo_area_stage(stage_id):
    return any(row["battle_ids"] == stage_id for year in DOJO_AREA_ACTIVITY
               for row in import_module(play_table(year)).data.values())


def dojo_area_stage(modules, stage_id, year, play_id, region):
    from battleengine.engine.DojoArea2025BattleEngine import DojoArea2025BattleEngine, AreaType, const
    from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

    table = play_table(year)
    sources = (DOJO_AREA_ENGINE, "module.team_types.team_type_dojo_area2025_battle",
               "com.data.cdata.dojo2026_bbbl_const", table)
    if any(modules.rows[name]["marshalSHA256"] != DOJO_AREA_SOURCES[name] for name in sources):
        raise ValueError("The original Eight-Hundred Tanuki engine or table has changed")
    play = import_module(table).data.get(play_id)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if not play or play["battle_ids"] != stage_id or not stage or stage["shishentotal"] != 5:
        raise ValueError("The selected Eight-Hundred Tanuki cell does not use this stage")
    kind = play["block_type"]
    deadline = DOJO_AREA_SECONDS.get(kind)
    group = BattleMonstersInfo.data[stage["groupid"]]
    if deadline is None or stage.get("battleTime") != deadline or len(group["MonstersInfos"]) != 1:
        raise RuntimeError("The original Eight-Hundred Tanuki formation or deadline changed")
    initial = {str(position): 0 for position, hero, *_ in group["MonstersInfos"][0] if hero}
    area_type = kind if kind <= AreaType.BOSS else AreaType.NORMAL
    engine = DojoArea2025BattleEngine({
        "pve_data_flag": str(stage_id), "act_id": DOJO_AREA_ACTIVITY[year], "teamUid": "offline-dojo-area",
        "dojo_area_type": area_type, "alive_monsters": initial, "is_dojo_protected_time": False,
        "act_params": {"region_state": region}, "develop_level": 0,
    })
    engine.battleMode = const.BattleMode.MODE_DOJO_AREA2025_BATTLE
    return engine, group, const, play, deadline


class DojoAreaReplay(SoloActivityReplay):
    def __init__(self, engine, group, const, play, year, region, deadline):
        super().__init__(engine, group, const)
        self.play, self.year, self.region, self.deadline = play, year, region, deadline

    def report(self, completed):
        engine = self.engine
        if (self.started is None or not self.opening or engine.dojo_region_state != self.region
                or engine.group_members or self.assists or engine.assist_hero_list
                or engine.is_use_borrow_help_hero() or abs(engine.haltBattleTime - self.started - self.deadline) > 1):
            raise RuntimeError("The Eight-Hundred Tanuki fight used different offline conditions")
        damage = engine.get_my_total_damage()
        by_enemy = engine.engineUserData.get("dojo_damage_dict") if completed else engine.get_damage_dict()
        positions = {str(unit["position"]) for unit in self.opening}
        if (type(damage) is not int or damage < 0 or not isinstance(by_enemy, dict)
                or any(pos not in positions or type(value) is not int or value < 0 for pos, value in by_enemy.items())):
            raise RuntimeError("The original Eight-Hundred Tanuki battle returned invalid damage")
        if completed:
            data = engine.engineUserData
            if data.get("my_total_damage") != damage or data.get("dojo_used_borrow_hero") is not False:
                raise RuntimeError("The original Eight-Hundred Tanuki settlement differs from the combat")
        return {"year": self.year, "playId": self.play["id"], "blockType": self.play["block_type"],
                "areaType": engine.dojo_area_type, "regionState": self.region, "damage": damage, "damageByEnemy": by_enemy,
                "combatSeconds": round(engine.now_time() - self.started, 6), "deadlineSeconds": self.deadline,
                "timedOut": engine.isHaltBattle, "opening": self.opening}
