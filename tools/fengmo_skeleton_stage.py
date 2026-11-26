"""Run Huangkulou encounters using the original battle and skill handlers."""
from collections import Counter
from math import isfinite

SKELETON_MODE, SKELETON_STAGE, SKELETON_SCENE = 3012, 25003, 40012
SKELETON_X_MODE, SKELETON_X_STAGE, BOSS_X = 4441, 25018, 9992001
SKELETON_WINDOW, SKELETON_WALL_SECONDS = 1200, 300
BOSS = 9991001
TRAITS = (63402, 63601, 63404, 63602, 63405, 63603, 63406)
PAPER_TIERS = ({3: 9992017, 4: 9992014, 5: 9992015, 6: 9992016},
               {4: 9992014, 5: 9992015, 8: 9992016},
               {4: 9992014, 5: 9992015}, {9: 9992015}, {9: 9992015})
ELITES = dict(zip(range(2, 8), range(9991008, 9991014)))
FORMATIONS = {
    "slimes": {2: 9991006, 3: 9991003, 6: 9991004, 7: 9991005, 8: 9991002},
    "elite": ELITES,
    "papers": {3: 9991017, 4: 9991014, 5: 9991015, 6: 9991016},
    "late": {3: 9991018, 4: 9991019, 5: 9991020, 6: 9991021, 8: 9991022},
}
STATES = {1: "normal", 2: "elite", 3: "gift"}
SOURCES = {
    "battleengine.engine.HuangKuLouEngine": "d680ad3efffd1cc59198eaa8e8d0e4868c7c7b897ad353e260430794bd992d92",
    "battleengine.engine.GroupBattleEngine": "792d09a5cf04f9fcda8b12fee784d8452639fc193be4da16403b7a31e079ff01",
    "battleengine.skill.SkillComp_480": "1d1d5305adb8d4f991df78774dbf996bd56d25f12b666e2c545bc83e145d7ff5",
    "battleengine.skill.SkillComp_483": "e4cca66d431e7e751befeb36b9a6961e29924f7eec7070b3d5d30ebbc786d2d8",
    "battleengine.skill.SkillComp_484": "2bd415cfbbafe4cf594fc9c0009af32b6aa9300ec202373198b1c2b53f003a92",
    "battleengine.skill.SkillComp_486": "793b6352a23e1da5297c49519dc794eee87be724a7f9da84df30ccf102457994",
    "battleengine.skill.SkillComp_487": "aabeaa978578b839c3f295104ce7e64f186dac180bedb9ca82f3cdc5b96d8f83",
    "scenemembers.HuangKuLouScene": "6658a3afccbd8a708b127b4ce2e22668c052bfa67a9fbba7bf62ed6da3fcf297",
}
EXTREME_SOURCES = {
    "battleengine.engine.HuangKuLouXEngine": "0b0e2d4b5c73eb1c76199213befa3ca7b61f694160d1d0c8627de56df1185b20",
    "scenemembers.HuangKuLouXScene": "433a9d31cd869389e23b1e93e51459ec2091c1a670ed53a9f59a5ab6f386002d",
}


def valid_skeleton_settings(settings):
    if type(settings) is not dict or set(settings) != {"windowSeconds", "truePositions"}:
        return False
    window, positions = settings["windowSeconds"], settings["truePositions"]
    return (type(window) is int and 1 <= window <= SKELETON_WINDOW
            and type(positions) is list and len(positions) == 2 and positions[0] != positions[1]
            and all(type(position) is int and position in ELITES for position in positions))


def valid_skeleton_x_settings(settings):
    return (type(settings) is dict and set(settings) == {"windowSeconds", "truePositions", "trait", "paperTier", "weeklySeconds"}
            and valid_skeleton_settings({key: settings[key] for key in ("windowSeconds", "truePositions")})
            and type(settings["trait"]) is int and settings["trait"] in TRAITS
            and type(settings["paperTier"]) is int and 1 <= settings["paperTier"] <= len(PAPER_TIERS)
            and type(settings["weeklySeconds"]) is int and 1 <= settings["weeklySeconds"] <= SKELETON_WINDOW)


class SkeletonReplay:
    def __init__(self, modules, settings, *, extreme=False):
        from battleengine.engine.HuangKuLouEngine import HuangKuLouEngine, const
        from com.data.cdata import huangkulou_stage, monstertalk
        from DynamicConfigData import BattleMonstersInfo, DATA_CONSTANT, DATA_PVE_STAGE_DATA

        self.extreme, self.poison_retaliation = extreme, False
        self.trait_recipients, self.poison_retaliations = [], []
        self.boss_id, self.formations, self.paper_tier = BOSS, FORMATIONS, 1
        engine_class, stage_id, mode = HuangKuLouEngine, SKELETON_STAGE, SKELETON_MODE
        source, troops, weekly, room = SOURCES, huangkulou_stage.data, (), {}
        if extreme:
            from battleengine.engine.HuangKuLouXEngine import HuangKuLouXEngine
            from com.data.cdata import huangkuloux_stage

            engine_class, stage_id, mode = HuangKuLouXEngine, SKELETON_X_STAGE, SKELETON_X_MODE
            self.boss_id, self.paper_tier = BOSS_X, settings["paperTier"]
            self.formations = {phase: {pos: unit + 1000 for pos, unit in units.items()}
                               for phase, units in FORMATIONS.items()}
            self.formations["papers"] = PAPER_TIERS[self.paper_tier - 1]
            source, troops, weekly = {**SOURCES, **EXTREME_SOURCES}, huangkuloux_stage.data, (settings["weeklySeconds"],)
            if tuple(DATA_CONSTANT.data[10631]["value"]) != TRAITS or DATA_CONSTANT.data[10900]["value"] != [480]:
                raise RuntimeError("The original extreme Huangkulou constants changed")
            maximum = engine_class.calcSingleSharedMonMaxHp(self.boss_id, 2500, 5, *weekly)
            if not isfinite(maximum) or maximum <= 1:
                raise RuntimeError("The original extreme Huangkulou body health changed")
            room = {"event4_avg_time": weekly[0], "event4_skill_buff": [0, settings["trait"]], "hp": {"1": maximum}}
        self.weekly = weekly
        self.phase_by_unit = {unit: phase for phase, units in self.formations.items() for unit in units.values()}
        if any(modules.rows[name]["marshalSHA256"] != value for name, value in source.items()):
            raise RuntimeError("The original Huangkulou engine changed")
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        if (self.group["ID"] != stage_id or self.group["resindex"] != SKELETON_SCENE
                or stage["shishentotal"] != 5 or self.group["MonstersInfos"] != [[[1, self.boss_id, 40, 1, 0]]]):
            raise RuntimeError("The original Huangkulou opening changed")
        for phase, keys in (("slimes", [(100, i) for i in range(1, 6)]), ("elite", [(200, 1)]),
                            ("papers", [(300, self.paper_tier)]), ("late", [(400, 1)])):
            if any({position: row[0] for position, row in enumerate(troops[key]["monsterWaves"], 2)
                    if row is not None} != self.formations[phase] for key in keys):
                raise RuntimeError(f"The original Huangkulou formation changed: {phase}")
        self.thresholds = tuple(DATA_CONSTANT.data[index]["value"][0] for index in (3801, 3802, 3803))
        if self.thresholds != (.8, .5, .3):
            raise RuntimeError("The original Huangkulou phase thresholds changed")
        self.clues = monstertalk.data
        self.clue_ids = [key for key, row in self.clues.items()
                         if type(key) is int and row.get("true_desc") and row.get("false_desc")][:6]
        if len(self.clue_ids) != 6:
            raise RuntimeError("The original Huangkulou clue table changed")
        self.const, self.settings = const, settings
        self.started = self.expiry = self.victory = None
        self.hp, self.maximum, self.clue_by_unit = {}, {}, {}
        self.slots = {phase: {} for phase in self.formations}
        self.phases, self.votes, self.notices, self.punishments = [], [], [], []
        self.punishment_casting = False
        self.queued = "normal"
        self.engine = engine = engine_class({
            "pve_data_flag": str(stage_id), "fbUid": "local-skeleton", "teamUid": 1, "team": self,
            "status_info": {"status": 1}, "atk_set": 2500, "cal_num": 5,
            **room,
        })
        engine.battleMode = const.BattleMode.MODE_HUANGKULOU_X if extreme else const.BattleMode.MODE_HUANGKULOU
        if engine.battleMode != mode or engine.state_dict != STATES:
            raise RuntimeError("The original Huangkulou battle mode changed")
        self.on_death, self.on_clue, self.on_notice = engine.onMonsterDie, engine.send_elite_msg, engine.send_notice
        engine.onMonsterDie, engine.send_elite_msg, engine.send_notice = self.observe_death, self.observe_clue, self.observe_notice

    def seconds(self):
        return round(self.engine.now_time() - self.started, 6) if self.started is not None else 0

    def flush(self):
        engine = self.engine
        if engine.hpChangedCache:
            engine.onSendOtherTeamMsg({"op": "hp_change", "data": engine.hpChangedCache.copy()})
            engine.hpChangedCache.clear()

    def sync_team_info_to_other(self, fb_uid, team_uid, message):
        engine = self.engine
        if (fb_uid, team_uid) != (engine.fbUid, engine.teamUid):
            raise RuntimeError("The engine sent a message for another Huangkulou room")
        op = message["op"]
        if op == "hp_change":
            for key, delta in message["data"].items():
                if key not in self.hp:
                    raise RuntimeError("Huangkulou room received a hit for a different phase")
                hp = min(self.maximum[key], self.hp[key] + delta)
                self.hp[key] = 0 if hp <= 1 else hp
            engine.onRecvOtherTeamMsg({"op": "hp_change", "realhp": self.hp.copy()})
        elif op == "battle_win":
            boss = engine.boss_entity
            if boss.AttrComp.hp > 0 or boss.lifeState != self.const.CombatState.DEAD:
                raise RuntimeError("Huangkulou settled before the original boss died")
            self.hp["1"] = 0
            self.victory = self.snapshot()

    def observe_summon(self, unit_id, position, *args, **kwargs):
        unit = self.summon(unit_id, position, *args, **kwargs)
        phase = self.phase_by_unit.get(unit_id)
        if phase is None or self.formations[phase].get(position) != unit_id or position in self.slots[phase]:
            raise RuntimeError(f"The original Huangkulou spawned an unexpected monster: {unit_id}@{position}")
        self.slots[phase][position] = unit
        return unit

    def observe_death(self, unit):
        self.on_death(unit)
        if getattr(unit, "elite_mon", False) and not getattr(unit, "boss_kill", False):
            self.votes.append({"position": unit.posIndex, "wrong": getattr(unit, "is_fake", False), "seconds": self.seconds()})

    def observe_clue(self, unit_id, is_fake, clue_id):
        self.on_clue(unit_id, is_fake, clue_id)
        self.clue_by_unit[unit_id] = self.clues[clue_id]["false_desc" if is_fake else "true_desc"]

    def observe_notice(self, notice):
        self.on_notice(notice)
        if notice in ("kill_wrong", "kill_right"):
            self.notices.append(notice)

    def observe_punishment(self, index):
        self.impact(index)
        if self.punishment_casting and index == 0:
            self.punishments.append(self.seconds())
            if self.poison_retaliation:
                self.poison_retaliations.append(self.seconds())
            self.punishment_casting = False

    def observe_punishment_start(self, *args, **kwargs):
        result = self.punishment_start(*args, **kwargs)
        self.poison_retaliation = (self.extreme and self.engine.state == "elite" and "kill_wrong" in self.notices
                                   and kwargs.get("skip_check_disable") is True and kwargs.get("noConsumeGuiHuo") is True)
        self.punishment_casting = self.punishment.is_punish or self.poison_retaliation
        return result

    def send_elite(self):
        engine = self.engine
        self.flush()
        pending = {str(pos): engine.calcSingleSharedMonMaxHp(unit, 2500, 5, *self.weekly)
                   for pos, unit in self.formations["elite"].items()}
        if any(not isfinite(hp) or hp <= 1 for hp in pending.values()):
            raise RuntimeError("The original Huangkulou shared health formula changed")
        self.hp.update(pending)
        self.maximum.update(pending)
        self.queued = "elite"
        engine.onRecvOtherTeamMsg({"op": "ch_st", "status": 2, "param": {
            "hp": pending, "bingo_elites": self.settings["truePositions"],
            "elite_key": [200, 1], "talk_id_list": self.clue_ids}})

    def send_gift(self):
        self.queued = "gift"
        self.engine.onRecvOtherTeamMsg({"op": "ch_st", "status": 3,
                                       "param": {"gift_key": [300, self.paper_tier], "reason": "paper"}})

    def check_selected(self, entity):
        trait = self.settings["trait"]
        if self.engine.playerSkill != trait or not entity.SkillMgrComp.getSkillById(trait):
            raise RuntimeError("The original extreme Huangkulou trait was absent on a selected character")
        self.trait_recipients.append(entity.protoid)

    def finish_window(self):
        if self.expiry is None and self.victory is None and not self.engine.waiting_battle_end:
            self.flush()
            self.expiry = self.snapshot()
            self.engine.forceBattleEnd("time_out", {})

    def record_phase(self, phase):
        engine = self.engine
        opening = [{"id": unit.protoid, "position": pos, "level": unit.AttrComp.level}
                   for pos, unit in sorted(self.slots.get(phase, {}).items())]
        if phase == "elite":
            true_positions = []
            for row in opening:
                unit = self.slots[phase][row["position"]]
                if unit.uid not in engine.sharedEntityUids:
                    raise RuntimeError("Huangkulou did not register shared retainer health")
                row["trueRetainer"] = not getattr(unit, "is_fake", False)
                row["clue"] = self.clue_by_unit.get(unit.protoid)
                if row["trueRetainer"]:
                    true_positions.append(unit.posIndex)
                key = str(unit.posIndex)
                self.maximum[key] = unit.AttrComp.maxHp
                self.hp[key] = min(unit.AttrComp.maxHp, self.hp[key])
            if true_positions != sorted(self.settings["truePositions"]) or len(self.clue_by_unit) != 1:
                raise RuntimeError("Huangkulou generated different true retainers")
        self.phases.append({"phase": phase, "seconds": self.seconds(), "damage": engine.myTotalDmg,
                            "bossHp": engine.boss_entity.AttrComp.hp, "opening": opening})

    def update(self):
        engine, const = self.engine, self.const
        if engine.battleState != const.BattleState.BS_STARTED or engine.waiting_battle_end:
            return
        boss = engine.boss_entity
        if self.started is None:
            if boss.protoid != self.boss_id or boss.posIndex != 1:
                raise RuntimeError(f"The original Huangkulou generated a different opening: {boss.protoid}@{boss.posIndex}")
            self.started = engine.now_time()
            self.hp["1"] = self.maximum["1"] = boss.AttrComp.maxHp
            summon_skill = boss.SkillMgrComp.getSkillById(483)
            self.summon = summon_skill.summon_mon
            summon_skill.summon_mon = self.observe_summon
            self.punishment = boss.SkillMgrComp.getSkillById(480)
            self.impact = self.punishment.Impact
            self.punishment.Impact = self.observe_punishment
            self.punishment_start = self.punishment.OnSkillStart
            self.punishment.OnSkillStart = self.observe_punishment_start
            self.record_phase("normal")
            engine.delayExec(self.settings["windowSeconds"] * 1000, self.finish_window)
        for phase, expected in self.formations.items():
            if len(self.slots[phase]) == len(expected) and not any(row["phase"] == phase for row in self.phases):
                self.record_phase(phase)
        phase = self.phases[-1]["phase"]
        if (self.queued == "normal" and phase == "slimes"
                and self.hp["1"] < self.maximum["1"] * self.thresholds[1]):
            self.send_elite()
        elif self.queued == "elite" and phase == "elite":
            choices = {vote["position"] for vote in self.votes if not vote["wrong"]}
            # The native queue can combine several wrong kills into one retaliation.
            pending = any(item.uid == boss.uid and item.fromSkillId == 480 for _, item in engine.turnMgr.queue)
            if choices == set(self.settings["truePositions"]) and not (pending or self.punishment_casting):
                self.send_gift()

    def snapshot(self):
        data = {"settings": self.settings, "combatSeconds": self.seconds(), "damage": self.engine.myTotalDmg,
                "phases": self.phases.copy(), "bossHp": self.hp["1"], "maximumHp": self.maximum["1"],
                "votes": self.votes.copy(), "punishments": self.punishments.copy(),
                "papersDefeated": self.engine.kill_gift_paper_man}
        if self.extreme:
            data.update(traitRecipients=self.trait_recipients.copy(), poisonRetaliations=self.poison_retaliations.copy())
        return data

    def report(self, completed, outcome):
        data = self.expiry or self.victory or self.snapshot()
        expected = Counter("kill_wrong" if vote["wrong"] else "kill_right" for vote in data["votes"])
        if (not data["phases"] or expected != Counter(self.notices)
                or self.extreme and len(data["traitRecipients"]) != 6
                or outcome == "win" and (not self.victory or data["bossHp"] != 0)):
            raise RuntimeError("The original Huangkulou did not produce a verified battle report")
        reason = ("boss-defeated" if outcome == "win" else "window-expired" if self.expiry is not None
                  else "team-defeated" if completed else "incomplete")
        return {"reason": reason, **data}
