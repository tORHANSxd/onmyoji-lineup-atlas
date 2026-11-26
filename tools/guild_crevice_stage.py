"""Verified single-team exercises for the original guild crevice engine."""

from math import isfinite

CREVICE_MODE = 1121
CREVICE_TIME = 180
CREVICE_SCENE = 468211
CREVICE_WALL_SECONDS = 120
KIND_BY_CONFIG = {3: 2, 4: 3, 5: 4}
STAGE_SUFFIXES = {51: 1, **dict.fromkeys(range(31, 43), 2), **dict.fromkeys(range(21, 29), 3),
                  **dict.fromkeys(range(11, 15), 4)}
CREVICE_STAGES = {6140000 + page * 100 + suffix for page in range(4) for suffix in STAGE_SUFFIXES}


def crevice_route(stage_id, row, group, monsters):
    if stage_id not in CREVICE_STAGES or not row or not group:
        raise ValueError(f"Unknown Guild Crevice stage {stage_id}")
    suffix = stage_id % 100
    kind = STAGE_SUFFIXES[suffix]
    (wave,) = group["MonstersInfos"]
    formation = sorted((pos, proto, level) for pos, proto, level, *_ in wave if proto)
    if (row["id"] != str(stage_id) or row["battleTime"] != CREVICE_TIME or row["shishentotal"] != 5
            or row["groupid"] != 6140000 + suffix or group["ID"] != row["groupid"]
            or group["resindex"] != CREVICE_SCENE or not formation or formation[0][0] != 1):
        raise ValueError("Unexpected Guild Crevice stage or monster formation")
    (_, first, _) = formation[0]
    matched = [boss_id for boss_id, target in monsters.items()
               if str(target.get("normal_main_monster")) == str(first)
               and KIND_BY_CONFIG.get(target["monster_type"]) == kind]
    if kind == 1:
        if first != 5901012 or matched:
            raise ValueError("Unexpected ordinary Guild Crevice enemy")
        boss_id = None
    else:
        (boss_id,) = matched
    return {"groupId": group["ID"], "bossId": boss_id, "kind": kind, "area": boss_id // 100 if boss_id else None,
            "formation": formation}


class CreviceReplay:
    def __init__(self, stage_id, window):
        from battleengine.engine.GuildLiefeng2022Engine import GuildLiefeng2022Engine, const
        from com.data.cdata import guild_crevice_battle
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        stage_key = str(stage_id)
        row = DATA_PVE_STAGE_DATA.data.get(stage_key)
        group = BattleMonstersInfo.data.get(row["groupid"]) if row else None
        self.route = crevice_route(stage_id, row, group, guild_crevice_battle.data)
        self.const, self.window = const, window
        self.started = None
        self.reason, self.outcome = None, "unknown"
        self.enemies = []
        self.hp_messages, self.sent_damage = 0, 0
        self.max_hp = {}
        if self.route["kind"] != 1:
            self.max_hp = {str(pos): hp for pos, hp in GuildLiefeng2022Engine.pre_calc_mons_max_hp(stage_key, None).items()}
            if self.max_hp.keys() != {str(pos) for pos, _, _ in self.route["formation"]} or min(self.max_hp.values()) <= 0:
                raise RuntimeError("The original engine returned a different Guild Crevice HP pool")
        self.engine = GuildLiefeng2022Engine({"pve_data_flag": stage_key, "boss_type": self.route["kind"],
                                              "boss_base_info": {"boss_id": self.route["bossId"] or 0, "buff_add": 0},
                                              "teamUid": "offline-crevice", "max_hp": self.max_hp})
        self.engine.battleMode = const.BattleMode.MODE_GUILD_LIEFENG_2022
        self.create = self.engine._create_this_round_alive_monsters
        self.engine._create_this_round_alive_monsters = self.observe_spawn
        self.engine.guildOnNotifyTeamHpChangedCb = self.observe_shared_hp

    def observe_spawn(self, monsters):
        units = self.create(monsters)
        ordered = sorted(units, key=lambda unit: unit.posIndex)
        actual = [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in ordered]
        if self.enemies or actual != self.route["formation"]:
            raise RuntimeError("The original Guild Crevice engine created a different formation")
        self.enemies = [(unit, unit.AttrComp.hp) for unit in ordered]
        return units

    def observe_shared_hp(self, payload, *, is_crevice_win=False):
        if (payload.keys() - self.max_hp.keys() or any(type(delta) is not int for delta in payload.values())
                or type(is_crevice_win) is not bool):
            raise RuntimeError("The original Guild Crevice engine sent invalid HP changes")
        if payload:
            self.hp_messages += 1
            self.sent_damage += sum(payload.values())

    def update(self, native_winner):
        engine, const = self.engine, self.const
        if self.started is None and engine.battleState == const.BattleState.BS_STARTED:
            self.started = engine.now_time()
        if self.started is None:
            return
        if engine.battleState == const.BattleState.BS_OVER:
            winner = engine.true_win_camp if self.max_hp else native_winner
            self.outcome = "win" if winner == const.CampFlag.CAMP1 else "loss"
            self.reason = "cleared" if self.outcome == "win" else "native-timeout" if engine.isHaltBattle else "team-defeated"
        elif self.window < CREVICE_TIME and round((engine.now_time() - self.started) * 1000) >= self.window * 1000:
            self.outcome, self.reason = "loss", "window-expired"

    def report(self):
        engine = self.engine
        if not self.enemies or self.started is None or engine.guild_share_hp_flag != bool(self.max_hp):
            raise RuntimeError("The original Guild Crevice did not start under the selected conditions")
        elapsed = round(engine.now_time() - self.started, 6)
        damage = engine.get_my_total_damage()
        if type(damage) is not int or damage < 0 or engine.halt_battle_time != CREVICE_TIME:
            raise RuntimeError("Invalid native Guild Crevice time or personal score")
        if self.reason in ("cleared", "native-timeout", "team-defeated"):
            settled = engine.engineUserData.get("my_total_damage")
            if not isinstance(settled, (int, float)) or not isfinite(settled) or abs(damage - settled) >= 1.01:
                raise RuntimeError("Invalid original Guild Crevice settlement")
        return {"kind": self.route["kind"], "bossId": self.route["bossId"], "damage": damage,
                "windowSeconds": self.window, "combatSeconds": elapsed, "reason": self.reason,
                "sharedHp": bool(self.max_hp), "hpMessages": self.hp_messages, "reportedHpChange": self.sent_damage,
                "enemies": [{"position": unit.posIndex, "id": unit.protoid, "level": unit.AttrComp.level,
                             "startingHp": hp, "remainingHp": max(0, unit.AttrComp.hp)} for unit, hp in self.enemies]}
