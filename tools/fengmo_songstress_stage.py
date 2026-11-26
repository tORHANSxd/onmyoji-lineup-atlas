"""Replay the original Songstress encounter for one known team."""
from math import isfinite

SONG_MODE, SONG_STAGE, SONG_SCENE = 3015, 25016, 40065
SONG_WINDOW, SONG_WALL_SECONDS = 1200, 300
SINGER, UMBRELLA, PAPER = 9991300, 9991301, 9991311
WHITES = (9991303, 9991304, 9991305)
BLACKS = (9991308, 9991309, 9991310)
MAID_POSITIONS = (3, 4, 5)
SONG_SOURCES = {
    "battleengine.engine.HuaKuiEngine": "075c83107e6ad447a3901baf7710fa7292e2dea5431d1f15f50e6fdaa4007d00",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_779": "03ddec3d3f0de9e9432ff638dd78883b2cdf58de96253289962f77bda6b0c928",
    "battleengine.skill.SkillComp_774": "bb915eb739581b2b711e4091ce2183e5e2ebb462d757a2e8c865321fee90847c",
    "scenemembers.HuaKuiScene": "ea54818863e6aec5f0fb186acd482a2ba4b2f4610f5495b6e4f0e0f8bb645222",
}


class SongstressReplay:
    def __init__(self, modules, window):
        from battleengine.engine.HuaKuiEngine import HuaKuiEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SONG_SOURCES.items()):
            raise RuntimeError("The original Songstress engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(SONG_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        protoids = (SINGER, UMBRELLA, *WHITES, *([PAPER] * 6))
        if (self.group["ID"] != SONG_STAGE or self.group["resindex"] != SONG_SCENE or stage["shishentotal"] != 6
                or self.group["MonstersInfos"] != [[[i, unit_id, 40, 1, 0] for i, unit_id in enumerate(protoids, 1)]]
                or (HuaKuiEngine.HUAKUI_BOSS, HuaKuiEngine.SAN_MONSTER, HuaKuiEngine.PAPER_MAN) != ([SINGER], [UMBRELLA], [PAPER])
                or tuple(HuaKuiEngine.TU_MONSTER) != WHITES or tuple(HuaKuiEngine.YOU_MONSTER) != BLACKS):
            raise RuntimeError("Unexpected original Songstress configuration")

        self.window, self.const = window, const
        self.started, self.expiry, self.victory = None, None, None
        self.phases, self.hp, self.maximum, self.units = [], {}, {}, {}
        self.transition, self.punishments, self.remaining_maids = 1, 0, None
        self.engine = engine = HuaKuiEngine({
            "pve_data_flag": str(SONG_STAGE), "fbUid": "local-songstress", "teamUid": 1, "team": self,
            "status_info": {"status": 1}, "atk_set": 2500, "cal_num": 5,
        })
        engine.battleMode = const.BattleMode.MODE_HUAKUI
        if engine.battleMode != SONG_MODE:
            raise RuntimeError("The original Songstress battle mode changed")
        self.states = (engine.STEP_1, engine.STEP_2, engine.STEP_3)
        self.summon = engine.summon_monster
        engine.summon_monster = self.observe_summon

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def observe_summon(self, ids, shared=False):
        engine, create = self.engine, self.engine.createMonsterEntity
        created = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            created.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            self.summon(ids, shared)
        finally:
            engine.createMonsterEntity = create
        for unit in created:
            pos = unit.posIndex
            if shared:
                key = str(pos)
                hp, maximum = unit.AttrComp.hp, unit.AttrComp.maxHp
                if key in self.hp or not isfinite(maximum) or maximum < 1 or hp != maximum:
                    raise RuntimeError("The original Songstress generated an invalid shared pool")
                self.hp[key], self.maximum[key] = hp, maximum
            self.units[pos] = unit

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Songstress room")
        if message["op"] == "battle_win":
            self.victory = self.snapshot()
        elif message["op"] == "hp_change":
            for key, delta in message["data"].items():
                hp = min(self.maximum[key], self.hp[key] + delta)
                # Shared actors can finish a lethal hit at the engine's
                # one-point sync floor. The room pool is depleted in that case.
                self.hp[key] = 0 if hp <= 1 else hp
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def record_phase(self, phase):
        engine = self.engine
        positions = (1, 2, *range(6, 12)) if phase == 3 else (1, 2, *MAID_POSITIONS)
        expected = ((SINGER, UMBRELLA, *WHITES), (SINGER, UMBRELLA, *BLACKS),
                    (SINGER, UMBRELLA, *([PAPER] * 6)))[phase - 1]
        opening = [{"id": self.units[pos].protoid, "position": pos, "level": self.units[pos].AttrComp.level}
                   for pos in positions]
        const = self.const
        if (tuple(unit["id"] for unit in opening) != expected
                or engine.san_entity.camp != const.CampFlag.CAMP2
                or engine.boss_entity.camp != (const.CampFlag.CAMP1 if phase == 3 else const.CampFlag.CAMP2)
                or phase == 3 and engine.san_entity.BuffMgrComp.getBuffCount(7851) != self.remaining_maids):
            raise RuntimeError("The original Songstress started an unexpected phase")
        self.phases.append({"phase": phase, "seconds": self.seconds(), "damage": engine.myTotalDmg,
                            "singerHp": self.hp["1"], "opening": opening})

    def change_phase(self, next_phase, remaining=0):
        self.transition = next_phase
        self.engine.onRecvOtherTeamMsg({"op": "ch_st", "status": next_phase,
                                       "param": {"remain_you": remaining}})

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        if self.started is None:
            self.started = engine.now_time()
        if engine.state not in self.states:
            raise RuntimeError("The original Songstress did not enter its opening phase")
        phase = self.states.index(engine.state) + 1
        if phase > len(self.phases) and (phase != 2 or all(str(pos) in self.hp for pos in MAID_POSITIONS)):
            self.record_phase(phase)
        if self.expiry is not None:
            return
        if self.seconds() >= self.window:
            if engine.hpChangedCache:
                engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
                engine.hpChangedCache.clear()
            self.expiry = self.snapshot()
            engine.forceBattleEnd("time_out", {})
            return
        if phase != self.transition:
            return
        if phase == 1 and self.hp["1"] <= self.maximum["1"] * .70:
            self.change_phase(2)
        if phase != 2 or len(self.phases) < 2:
            return
        keys = tuple(str(pos) for pos in MAID_POSITIONS)
        hp = [self.hp[key] for key in keys]
        ready = [self.units[pos].lifeState == const.CombatState.ALIVE and health > 0
                 for pos, health in zip(MAID_POSITIONS, hp)]
        if self.hp["1"] == 0 or not any(ready):
            self.remaining_maids = sum(ready)
            self.change_phase(3, self.remaining_maids)
        elif all(ready) and max(hp) - min(hp) >= self.maximum[keys[0]] * .05:
            self.punishments += 1
            mean = sum(hp) / len(keys)
            health = dict.fromkeys(keys, mean)
            self.hp.update(health)
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
            engine.onRecvOtherTeamMsg({"op": "reassign_hp", "realhp": health})
            engine.onRecvOtherTeamMsg({"op": "tu_cast_skill"})

    def snapshot(self):
        engine = self.engine
        phase = len(self.phases)
        singer = self.units[1]
        return {"combatSeconds": self.seconds(), "damage": engine.myTotalDmg,
                "phases": self.phases.copy(), "whiteMaidsDefeated": engine.statistics.achieve_dict.get("kill_tu_count", 0),
                "punishments": self.punishments, "remainingMaidsAtRescue": self.remaining_maids if phase == 3 else None,
                "singerHp": max(0, singer.AttrComp.hp if phase == 3 else self.hp["1"]),
                "umbrellaHp": max(0, self.hp["2"]), "singerMaximum": self.maximum["1"],
                "umbrellaMaximum": self.maximum["2"]}

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if not data["phases"] or outcome == "win" and (not self.victory or len(data["phases"]) != 3
                                                        or data["umbrellaHp"] > 0 or data["singerHp"] <= 0):
            raise RuntimeError("The original Songstress did not produce a verified battle report")
        reason = ("singer-rescued" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "singer-defeated" if completed and len(data["phases"]) == 3 and data["singerHp"] == 0
                  else "team-defeated" if completed else "incomplete")
        return {"windowSeconds": self.window, "reason": reason, **data}
