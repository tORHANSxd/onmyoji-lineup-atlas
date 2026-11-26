"""Replay the original Laolao Fusion engine against a local shared-health scenario."""

from math import floor, isfinite

from devil_feast_stage import (LAOLAO_FUSION_MODE, LAOLAO_FUSION_STAGE, LAOLAO_SOURCES,
                              bind_ghost_king_constants, unlocked_guests, valid_factions)

FUSION_SECONDS = 1200
FUSION_WALL_SECONDS = 300
FUSION_BOSSES = (4899001, 4899002, 4899003, 4899004)
FUSION_GROUP_BOSSES = (4899001, 4899003, 4899002, 4899004)
FUSION_SCENE = 400200
FUSION_SOURCES = {
    **LAOLAO_SOURCES,
    "battleengine.BattleEngine": "5333880a15e43334b4c4f81597974a7bf9dd04bf001c8203e91656c8404b278b",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.engine.LaoLaoHuoEngine": "ac7f1be55eb7e980507b354d89ffd6a4d9999f4487615395bc603f4040a8fd28",
    "scenemembers.LaoLaoHuoBattleScene": "724f26dde92dd4eda9fd4a0f59fe1001d7d4db511f90995b610c4d3824d5df2d",
    "com.data.cdata.Constant": "41f1b29a54f6105bd47d75dcefaf9b5e4451fc6f54703c055d3c5a65c1e40b56",
}


def valid_fusion_settings(settings):
    if (type(settings) is not dict or set(settings) != {"group", "faith", "factions", "windowSeconds", "sharedHpPercent"}
            or type(settings["group"]) is not int or not 1 <= settings["group"] <= len(FUSION_BOSSES)
            or type(settings["faith"]) is not int or not 0 <= settings["faith"] < 2 ** 53
            or not valid_factions(settings["factions"])
            or type(settings["windowSeconds"]) is not int or not 1 <= settings["windowSeconds"] <= FUSION_SECONDS):
        return False
    hp = settings["sharedHpPercent"]
    chosen = FUSION_BOSSES.index(FUSION_GROUP_BOSSES[settings["group"] - 1])
    return (type(hp) is list and len(hp) == len(FUSION_BOSSES)
            and all(type(value) in (int, float) and 0 <= value <= 100 for value in hp)
            and any(hp) and (sum(hp) <= 100 or hp[chosen] > 0))


class LaolaoFusionReplay:
    def __init__(self, modules, settings):
        from battleengine.engine.LaoLaoHuoEngine import LaoLaoHuoEngine, const
        from com.data.cdata import feast_for_devils_const, feast_for_devils_dawnexpedition
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA, FEAST_FOR_EVENT7

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in FUSION_SOURCES.items()):
            raise ValueError("The original Laolao Fusion engine or tables changed")
        stage = DATA_PVE_STAGE_DATA.data[str(LAOLAO_FUSION_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        wave, = self.group["MonstersInfos"]
        if (FEAST_FOR_EVENT7.data[5]["fightId1"] != LAOLAO_FUSION_STAGE or self.group["ID"] != LAOLAO_FUSION_STAGE
                or stage["shishentotal"] != 5 or self.group["resindex"] != FUSION_SCENE
                or tuple(row[1] for row in wave) != FUSION_BOSSES or tuple(LaoLaoHuoEngine.ALL_BOSS) != FUSION_BOSSES
                or tuple(LaoLaoHuoEngine.group_to_mon[i] for i in range(1, 5)) != FUSION_GROUP_BOSSES):
            raise RuntimeError("Unexpected original Laolao Fusion configuration")
        self.settings, self.const = settings, const
        self.party = settings["group"]
        self.keys = [LaoLaoHuoEngine.mon_to_maxhpid[boss] for boss in FUSION_BOSSES]
        # These are the original defaults used by summon_monster when no
        # matchmaking parameters are available.
        attack, count = 2500, 5
        self.maximum = {key: LaoLaoHuoEngine.calcSingleSharedMonMaxHp(boss, attack, count)
                        for key, boss in zip(self.keys, FUSION_BOSSES)}
        if len(set(self.maximum.values())) != 1 or not all(isfinite(hp) and hp >= 1 for hp in self.maximum.values()):
            raise RuntimeError("Unequal or invalid original Laolao Fusion health pools")
        self.hp = {key: max(1, floor(self.maximum[key] * rate / 100)) if rate else 0
                   for key, rate in zip(self.keys, settings["sharedHpPercent"])}
        self.opening_hp = self.ordered_health(self.hp)
        self.threshold = sum(self.maximum.values()) / 4
        self.first = 1 if sum(self.hp.values()) > self.threshold else 2
        self.transition = None
        self.started, self.ending, self.roster, self.selected_equipment = None, None, None, None
        self.phases = []
        self.native_won = False
        self.engine = engine = LaoLaoHuoEngine({
            "pve_data_flag": str(LAOLAO_FUSION_STAGE), "fbUid": "local-laolao-fusion", "teamUid": 1, "team": self,
            "hp": self.hp.copy(), "atk_set": attack, "cal_num": count,
            "status_info": {"status": self.first, "maxhp": self.maximum.copy(), "group_idx": self.party,
                            "xinyang_buff_level": settings["faith"], "sa_heroes":
                                unlocked_guests(settings["factions"], feast_for_devils_dawnexpedition.data)},
        })
        engine.battleMode = const.BattleMode.MODE_LAOLAOHUO
        if engine.battleMode != LAOLAO_FUSION_MODE:
            raise RuntimeError("The original Laolao Fusion battle mode changed")
        bind_ghost_king_constants(engine, feast_for_devils_const.data)
        self.summon = engine.summon_monster
        engine.summon_monster = self.observe_spawn
        self.new_round = engine._myNewRound
        engine._myNewRound = self.reselect_lineup

    def ordered_health(self, health):
        return [health[key] for key in self.keys]

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        if (fb_uid, team_uid) != (self.engine.fbUid, self.engine.teamUid):
            raise RuntimeError("The original engine sent a message for another Laolao Fusion room")
        if message["op"] == "battle_win":
            self.native_won = True
            return
        if message["op"] != "hp_change":
            return
        for key, delta in message["data"].items():
            self.hp[key] = max(0, min(self.maximum[key], self.hp[key] + delta))
        engine = self.engine
        engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
        if self.transition is None and engine.state == engine.STEP_1 and sum(self.hp.values()) <= self.threshold:
            self.transition = {"seconds": round(engine.now_time() - self.started, 6) if self.started is not None else 0,
                               "sharedHp": self.ordered_health(self.hp), "damage": engine.myTotalDmg}
            # Apply the documented shared-health trigger using the original
            # incoming state message and native phase-switch handlers.
            engine.onRecvOtherTeamMsg({"op": "ch_st", "status": 2, "param": {}})

    def observe_spawn(self, ids):
        engine, create = self.engine, self.engine.createMonsterEntity
        phase = 2 if engine.state == engine.STEP_2 else 1
        expected = FUSION_BOSSES if phase == 2 else (FUSION_GROUP_BOSSES[self.party - 1],)
        if tuple(ids) != expected or phase != self.first + len(self.phases):
            raise RuntimeError("The original Laolao Fusion engine opened an unexpected phase")
        units = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            units.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            self.summon(ids)
        finally:
            engine.createMonsterEntity = create
        opening = [{"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                    "hp": unit.AttrComp.hp} for unit in units]
        expected_opening = [(boss, i if phase == 1 else i + 9) for i, boss in enumerate(expected, 1)
                            if self.hp[engine.mon_to_maxhpid[boss]] > 0]
        if [(unit["id"], unit["position"]) for unit in opening] != expected_opening:
            raise RuntimeError("The original Laolao Fusion engine opened with a different formation")
        if any(abs(unit["hp"] - self.hp[engine.mon_to_maxhpid[unit["id"]]]) > 0.001 for unit in opening):
            raise RuntimeError("The original Laolao Fusion engine applied different shared health")
        self.phases.append({"phase": phase, "seconds": round(engine.now_time() - self.started, 6) if self.started is not None else 0,
                            "sharedHp": self.ordered_health(self.hp), "opening": opening, "rosterVerified": False})

    def reselect_lineup(self):
        if self.roster is None or len(self.engine.controllers) != 1:
            raise RuntimeError("The previous selection is missing for Laolao Fusion")
        controller, actor, fighters = self.roster
        # The stock preset store belongs to the game UI. Supply the same
        # already selected roster through the native selection operation.
        super(type(self.engine), self.engine).op_init(controller, actor, list(fighters), [])
        self.new_round()

    def update(self, controller):
        engine = self.engine
        if engine.battleState == self.const.BattleState.BS_STARTED and self.phases and not self.phases[-1]["rosterVerified"]:
            selected = {}
            for unit in engine.heroEntities.values():
                if unit.ownerController is controller and hasattr(unit, "HeroComp"):
                    hero = unit.HeroComp.heroData
                    selected[hero.heroUid] = (tuple(uid for uid in hero.equips if uid), controller.autoSkill.get(unit.uid, 0))
            if self.started is None:
                self.started = engine.now_time()
                player = controller.ctrlPlayer
                self.roster = controller, player.defaultYYSId, tuple(player.defaultHeros)
                if set(selected) != {"selected-onmyoji", *self.roster[2]}:
                    raise RuntimeError("The original engine selected a different Laolao Fusion roster")
                self.selected_equipment = selected
            elif selected != self.selected_equipment:
                raise RuntimeError("Laolao Fusion did not carry the known roster, equipment and automatic skills into the second phase")
            self.phases[-1]["rosterVerified"] = True
        if (self.started is None or self.ending is not None or self.native_won or engine.waiting_battle_end
                or engine.battleState == self.const.BattleState.BS_OVER):
            return
        target = self.keys[FUSION_BOSSES.index(FUSION_GROUP_BOSSES[self.party - 1])]
        if engine.state == engine.STEP_1 and not self.transition and self.hp[target] <= 1:
            self.ending = "assigned-health-floor"
        elif engine.now_time() - self.started >= self.settings["windowSeconds"]:
            self.ending = "window-expired"
        if self.ending:
            engine.forceBattleEnd("time_out", {})

    def report(self, completed, outcome):
        if (self.started is None or not self.phases or outcome == "win" and (
                not self.native_won or any(self.hp.values()) or not self.phases[-1]["rosterVerified"])):
            raise RuntimeError("The original Laolao Fusion did not produce a verified battle report")
        reason = "bosses-defeated" if outcome == "win" else self.ending or ("team-defeated" if completed else "incomplete")
        return {"settings": self.settings, "reason": reason, "damage": self.engine.myTotalDmg,
                "combatSeconds": round(self.engine.now_time() - self.started, 6), "phases": self.phases,
                "transition": self.transition, "initialHp": self.opening_hp, "maximumHp": self.ordered_health(self.maximum),
                "sharedHp": self.ordered_health(self.hp), "thresholdHp": self.threshold}
