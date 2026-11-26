"""Run extreme Tsuchigumo on its original shared-health encounter."""
from math import isfinite

SPIDER_LIVE_MODE, SPIDER_LIVE_STAGE, SPIDER_LIVE_SCENE = 4440, 25017, 40005
SPIDER_LIVE_WINDOW, SPIDER_LIVE_WALL_SECONDS = 3600, 620
PARTS = {1: 250171, 2: 250172, 3: 250173, 4: 250174}
COCOONS = {6: 250180, 7: 250179, 8: 250180}
TRAITS = (63402, 63601, 63404, 63602, 63405, 63603, 63406)
SOURCES = {
    "battleengine.engine.TuzhizhuXEngine": "af0d2b39ff63f6b8e5a36e9e1fe396435069f50c318b3b4a74d0060f924442ee",
    "battleengine.engine.TuzhizhuXSingleEngine": "c5235b2d3f13df8000dbf2be832fbb4748f4d16b0050e3076b1d23f89d26c91b",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_63408": "3af2aa3fae59793f431f956f2947875a838aad695c185c6222a48774b4907e29",
    "battleengine.skill.SkillComp_63409": "ca5c2497ccbfb5048d55ecd8e81dfd973db295b7c68b3f198dc7a026c3b871d2",
    "battleengine.skill.SkillComp_63410": "a579c56dbc5932e75b1369958bac6061dde8294d4f7749f6bad4f1fefdba51f4",
    "battleengine.skill.SkillComp_63411": "af18dda3a8b49ab26ad1836108f1d069bc0cbc6f9f2da474e81332d101af1cf2",
    "scenemembers.TuzhizhuXScene": "924a235f0d3c7bf08755b891e762d761617b75680c77a8f8e44c47f17d817dd5",
}


def valid_spider_live_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "trait"}
            and type(settings["windowSeconds"]) is int and 1 <= settings["windowSeconds"] <= SPIDER_LIVE_WINDOW
            and type(settings["trait"]) is int and settings["trait"] in TRAITS)


class SpiderLiveReplay:
    def __init__(self, modules, settings):
        from battleengine.engine.TuzhizhuXEngine import TuzhizhuXEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_CONSTANT, DATA_PVE_STAGE_DATA

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise RuntimeError("The original extreme Tsuchigumo engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(SPIDER_LIVE_STAGE)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != SPIDER_LIVE_STAGE or self.group["resindex"] != SPIDER_LIVE_SCENE
                or stage["shishentotal"] != 5 or self.group["MonstersInfos"] != [
                    [[pos, unit, 40, 1, 0] for pos, unit in PARTS.items()]]):
            raise RuntimeError("The live extreme Tsuchigumo formation changed")
        self.cocoon_seconds, = DATA_CONSTANT.data[10639]["value"]
        rotation = tuple(DATA_CONSTANT.data[10631]["value"])
        cocoon_ids = tuple(DATA_CONSTANT.data[10641]["value"])
        if self.cocoon_seconds != 60 or rotation != TRAITS or cocoon_ids != tuple(COCOONS.values()):
            raise RuntimeError(f"The live extreme Tsuchigumo constants changed: {self.cocoon_seconds}, {rotation}, {cocoon_ids}")
        self.settings, self.const = settings, const
        self.started = self.expiry = self.victory = None
        self.parts, self.trait_recipients, self.cocoons, self.cocoon_units = {}, [], None, []
        self.maximum = {str(pos): TuzhizhuXEngine.calcSingleSharedMonMaxHp(unit, 2500, 5)
                        for pos, unit in PARTS.items()}
        if any(not isfinite(hp) or hp <= 1 for hp in self.maximum.values()):
            raise RuntimeError("The original extreme Tsuchigumo shared health changed")
        self.hp = self.maximum.copy()
        self.engine = engine = TuzhizhuXEngine({
            "pve_data_flag": str(SPIDER_LIVE_STAGE), "fbUid": "local-spider-x", "teamUid": 1, "team": self,
            "hp": self.hp.copy(), "maxhp": self.maximum.copy(), "atk_set": 2500, "cal_num": 5,
            "status_info": {}, "event4_skill_buff": [0, settings["trait"]],
        })
        engine.battleMode = const.BattleMode.MODE_TUZHIZHU_X
        if engine.battleMode != SPIDER_LIVE_MODE:
            raise RuntimeError("The original extreme Tsuchigumo battle mode changed")
        self.spawn = engine._createNextRoundMons
        self.summon = engine.summon_all_baijian
        engine._createNextRoundMons = self.observe_spawn
        engine.summon_all_baijian = self.observe_cocoons

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def sync_hp(self):
        self.engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})

    def flush(self):
        engine = self.engine
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()

    def observe_spawn(self):
        result = self.spawn()
        engine = self.engine
        for pos, protoid in PARTS.items():
            unit = engine.getEnemyByPosIndex(pos)
            if (not unit or unit.protoid != protoid or unit.AttrComp.level != 40
                    or unit.uid not in engine.sharedEntityUids):
                raise RuntimeError("The original extreme Tsuchigumo spawned a different part")
            self.parts[pos] = unit
            self.hp[str(pos)] = unit.AttrComp.hp
            self.maximum[str(pos)] = unit.AttrComp.maxHp
        self.sync_hp()
        return result

    def observe_cocoons(self):
        engine = self.engine
        if self.cocoons is not None or self.started is None:
            raise RuntimeError("The original extreme Tsuchigumo spawned cocoons outside the encounter")
        self.flush()
        pending = {str(pos): engine.calcBaijianMaxHp(pos) for pos in COCOONS}
        if any(not isfinite(hp) or hp <= 1 for hp in pending.values()):
            raise RuntimeError("The original extreme Tsuchigumo cocoon health changed")
        engine.hp_dict.update(pending)
        engine.maxHp_dict.update(pending)
        result = self.summon()
        units = sorted(engine.baijianList, key=lambda unit: unit.posIndex)
        if ({unit.posIndex: unit.protoid for unit in units} != COCOONS or len(units) != len(COCOONS)
                or any(unit.AttrComp.level != 40 or unit.uid not in engine.sharedEntityUids for unit in units)):
            raise RuntimeError("The original extreme Tsuchigumo spawned a different cocoon formation")
        for unit in units:
            self.hp[str(unit.posIndex)] = unit.AttrComp.hp
            self.maximum[str(unit.posIndex)] = unit.AttrComp.maxHp
        self.cocoon_units = units
        self.sync_hp()
        self.cocoons = {"startedAt": self.seconds(), "announcedResult": None, "resolvedAt": None,
                        "resolved": False, "defeated": None, "remainingForRecovery": None, "recovery": [],
                        "opening": [self.unit_state(unit, opening=True) for unit in units]}
        return result

    def unit_state(self, unit, *, opening=False):
        key = str(unit.posIndex)
        return {"id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                "hp": self.maximum[key] if opening else max(0, unit.AttrComp.hp), "maximumHp": self.maximum[key]}

    def observe_recovery(self, *args, **kwargs):
        self.flush()
        before = {pos: unit.AttrComp.hp for pos, unit in self.parts.items()}
        result = self.recover(*args, **kwargs)
        if self.cocoons and self.cocoons["announcedResult"] and not self.cocoons["resolved"]:
            gains = [{"position": pos, "amount": unit.AttrComp.hp - before[pos]}
                     for pos, unit in self.parts.items() if unit.AttrComp.hp > before[pos]]
            for row in gains:
                pos = row["position"]
                self.hp[str(pos)] = self.parts[pos].AttrComp.hp
            if gains and (self.cocoons["announcedResult"] != "expired"
                          or any(row["position"] == 1 for row in gains)):
                raise RuntimeError("The original extreme Tsuchigumo recovered unexpected parts")
            self.sync_hp()
            self.cocoons["recovery"] = gains
            self.cocoons["resolved"] = True
            self.cocoons["resolvedAt"] = self.seconds()
        return result

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The original engine sent a message for another extreme Tsuchigumo room")
        if message["op"] == "hp_change":
            for key, delta in message["data"].items():
                if key not in self.hp:
                    raise RuntimeError("Extreme Tsuchigumo room received a hit for an unknown slot")
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            self.sync_hp()
        elif message["op"] == "battle_win":
            if engine.boss_entity.AttrComp.hp > 0 or not engine.checkAllPartDead():
                raise RuntimeError("Extreme Tsuchigumo settled before all original parts were defeated")
            self.victory = self.snapshot()

    def finish_window(self):
        if self.expiry is None and self.victory is None and not self.engine.waiting_battle_end:
            self.flush()
            self.expiry = self.snapshot()
            self.engine.forceBattleEnd("time_out", {})

    def resolve_cocoons(self):
        engine, const = self.engine, self.const
        alive = [unit for unit in self.cocoon_units if unit.lifeState != const.CombatState.DEAD and not unit.isRemoved]
        timed_out = self.seconds() - self.cocoons["startedAt"] >= self.cocoon_seconds
        if not timed_out and alive:
            return
        self.cocoons["announcedResult"] = "expired" if alive else "broken"
        self.cocoons["defeated"] = len(self.cocoon_units) - len(alive)
        total = sum(unit.AttrComp.hp for unit in alive)
        self.cocoons["remainingForRecovery"] = total
        positions = [pos for pos, unit in self.parts.items() if pos != 1
                     and unit.lifeState == const.CombatState.ALIVE and unit.AttrComp.hp > 1]
        if not alive or engine.checkAllPartDead():
            # Broken cocoons and a field with no surviving legs require no healing cast.
            self.cocoons["resolved"] = True
            self.cocoons["resolvedAt"] = self.seconds()
            engine.onRecvOtherTeamMsg({"op": "event4_baijian_end"})
        elif total and positions:
            amounts = {str(pos): total / len(positions) for pos in positions}
            engine.onRecvOtherTeamMsg({"op": "recoverhp", "data": amounts})
        else:
            engine.onRecvOtherTeamMsg({"op": "event4_baijian_end"})

    def check_selected(self, entity):
        trait = self.settings["trait"]
        if self.engine.playerSkill != trait or not entity.SkillMgrComp.getSkillById(trait):
            raise RuntimeError("The original extreme Tsuchigumo trait was absent on a selected character")
        self.trait_recipients.append(entity.protoid)

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        if self.started is None:
            self.started = engine.now_time()
            if engine.boss_entity is not self.parts[1]:
                raise RuntimeError("The original extreme Tsuchigumo selected a different body")
            cocoon_skill = engine.boss_entity.SkillMgrComp.getSkillById(63411)
            self.recover = cocoon_skill.removeBaijianAndRecover
            cocoon_skill.removeBaijianAndRecover = self.observe_recovery
            engine.delayExec(self.settings["windowSeconds"] * 1000, self.finish_window)
        if self.cocoons and not self.cocoons["announcedResult"]:
            self.resolve_cocoons()

    def snapshot(self):
        engine = self.engine
        cocoons = self.cocoons.copy() if self.cocoons else None
        if cocoons and cocoons["defeated"] is None:
            cocoons["defeated"] = engine.baijianDieCnt
        return {"settings": self.settings, "combatSeconds": self.seconds(), "damage": engine.myTotalDmg,
                "parts": [self.unit_state(unit) for unit in self.parts.values()], "traitRecipients": self.trait_recipients,
                "cocoonSeconds": self.cocoon_seconds, "cocoons": cocoons, "papersDefeated": engine.killZhiRenCount,
                "goldDefeated": engine.killGoldSpiderCount}

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        if len(data["parts"]) != len(PARTS) or len(self.trait_recipients) != 6 or outcome == "win" and not self.victory:
            raise RuntimeError("The original extreme Tsuchigumo did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
