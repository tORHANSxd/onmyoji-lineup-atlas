"""Replay the original Juelie courtyard battle at its supplied shared HP."""

from math import isfinite

from pve_clock import NativePveClock


GTW_BOSS_MODE = 934
GTW_BOSS_SCENE = 44135
GTW_BOSS_STAGES = {813000: 46102, 813001: 46103}
GTW_BOSS_ACTIVITY = 8881
GTW_BOSS_ENTRY = 2
GTW_BOSS_PROGRESS = 7
GTW_SHARED_MAX_HP = 1005053940000000
GTW_BOSS_SECONDS = 180
GTW_BOSS_WALL_SECONDS = 145
GTW_REWARD_MINIMUM = 4000000


def valid_gtw_settings(stage, settings):
    if stage not in GTW_BOSS_STAGES or type(settings) is not dict or settings.keys() != {"hp", "windowSeconds"}:
        return False
    hp, window = settings["hp"], settings["windowSeconds"]
    if type(window) is not int or not 1 <= window <= GTW_BOSS_SECONDS:
        return False
    return hp is None or type(hp) is int and 1 <= hp <= GTW_SHARED_MAX_HP and (hp * 2 < GTW_SHARED_MAX_HP) == (stage == 813001)


class GtwBossReplay:
    def __init__(self, stage_id, settings):
        from battleengine.engine.SpGtwBossEngine import SpGtwBossEngine, const
        from com.data.cdata import global_progress, stake_boss
        from DynamicConfigData import BattleMonstersInfo, DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA

        if not valid_gtw_settings(stage_id, settings):
            raise ValueError("Choose a Juelie courtyard formation and matching shared HP")
        stake = stake_boss.data[GTW_BOSS_ENTRY]
        progress = global_progress.data[GTW_BOSS_PROGRESS]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[GTW_BOSS_MODE]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        self.proto = GTW_BOSS_STAGES[stage_id]
        self.phase = 1 if stage_id == stake["battle_id"] else 2
        self.window = settings["windowSeconds"]
        self.initial_hp = settings["hp"]
        if self.initial_hp is None:
            self.initial_hp = GTW_SHARED_MAX_HP if self.phase == 1 else GTW_SHARED_MAX_HP // 2 - 1
        if (stake["battle_id"] != 813000 or stake["progress_id"] != GTW_BOSS_PROGRESS
                or stake["team_battle_type"] != GTW_BOSS_MODE or progress["a_id"] != GTW_BOSS_ACTIVITY
                or progress["unlock_num"] != GTW_SHARED_MAX_HP or SpGtwBossEngine.getConstantValue(40) != 50
                or SpGtwBossEngine.getConstantValue(41) != 813001 or stage["battleTime"] != GTW_BOSS_SECONDS
                or stage["shishentotal"] != 5 or rules["group_battle"] or rules["halt_time"] != GTW_BOSS_SECONDS
                or self.group["ID"] != stage_id or self.group["resindex"] != GTW_BOSS_SCENE
                or [tuple(unit[:3]) for wave in self.group["MonstersInfos"] for unit in wave] != [(1, self.proto, 40)]
                or len(self.group["MonstersInfos"]) != 1):
            raise RuntimeError("The original Juelie courtyard formation or shared HP differs")

        self.const = const
        self.engine = SpGtwBossEngine({
            "pve_data_flag": str(stage_id),
            "extra_info": {"boss_info": {"request_num": GTW_SHARED_MAX_HP,
                                        "progress_num": GTW_SHARED_MAX_HP - self.initial_hp}},
        })
        self.engine.battleMode = GTW_BOSS_MODE
        self.clock = NativePveClock(self.engine, GTW_BOSS_SECONDS)
        self.boss = self.cutoff = self.settlement = None
        self.observe_boss()

    def observe_boss(self):
        engine = self.engine
        change_hp, settle = engine.special_change_monster_attr, engine.doBattleEnded

        def verify_spawn(attr):
            result = change_hp(attr)
            unit = attr.entity
            if unit.camp == self.const.CampFlag.CAMP2 and unit.posIndex == 1:
                if (self.boss is not None or unit.protoid != self.proto or attr.level != 40
                        or attr.maxHp != GTW_SHARED_MAX_HP or attr.hp != self.initial_hp):
                    raise RuntimeError("The original Juelie courtyard opened with a different boss")
                self.boss = unit
            return result

        def record_settlement(winner):
            self.settlement = self.snapshot()
            return settle(winner)

        engine.special_change_monster_attr = verify_spawn
        engine.doBattleEnded = record_settlement

    def snapshot(self):
        if self.boss is None or self.clock.started is None:
            raise RuntimeError("The original Juelie courtyard battle did not start")
        return (round(self.engine.now_time() - self.clock.started, 6),
                self.engine.get_my_total_damage(), self.boss.AttrComp.hp,
                self.engine.is_all_dead(self.const.CampFlag.CAMP2))

    def update(self):
        engine = self.engine
        if (self.window == GTW_BOSS_SECONDS or self.cutoff is not None or self.clock.started is None
                or engine.battleState != self.const.BattleState.BS_STARTED):
            return
        if round(engine.now_time() - self.clock.started, 6) >= self.window:
            self.cutoff = self.snapshot()
            engine.forceBattleEnd("timeout")

    def report(self, completed):
        seconds, damage, hp, enemy_gone = self.cutoff or self.settlement or self.snapshot()
        if (type(damage) is not int or damage < 0 or not isfinite(hp) or not 0 <= hp <= GTW_SHARED_MAX_HP
                or completed and self.settlement is None):
            raise RuntimeError("The original Juelie courtyard settlement is invalid")
        defeated = completed and hp == 0
        return {"phase": self.phase, "bossId": self.proto, "sharedMaxHp": GTW_SHARED_MAX_HP, "startHp": self.initial_hp,
                "remainingHp": hp, "damage": damage, "meetsRewardMinimum": damage >= GTW_REWARD_MINIMUM,
                "windowSeconds": self.window, "nativeLimitSeconds": GTW_BOSS_SECONDS, "combatSeconds": seconds,
                "windowExpired": self.cutoff is not None, "nativeTimedOut": self.engine.isHaltBattle,
                "defeated": defeated, "cleared": defeated and enemy_gone}
