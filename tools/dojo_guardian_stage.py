"""Replay the four original shared-HP dojo guardian battles locally."""

from math import isfinite


DOJO_GUARDIAN_MODE = 4004
DOJO_DEFENDER_MODE = 4003
DOJO_CODE_STAGE = 10020203
DOJO_GUARDIAN_STAGES = {40051: 1400001, 40052: 1400002, 40053: 1400003, 40054: 1400004}
DOJO_GUARDIAN_WINDOW_LIMIT = 300
DOJO_GUARDIAN_WALL_SECONDS = 155


class DojoGuardianReplay:
    def __init__(self, stage_id, settings):
        from DynamicConfigData import BattleMonstersInfo, DATA_DG_GUARDIAN, DATA_PVE_STAGE_DATA
        from battleengine.engine.JiejieTuPoGym2BossEngine import JiejieTuPoGym2BossEngine, const

        if stage_id not in DOJO_GUARDIAN_STAGES or type(settings) is not dict or settings.keys() != {"hp", "windowSeconds"}:
            raise ValueError("Choose a known dojo guardian and a local replay window")
        self.window = settings["windowSeconds"]
        if type(self.window) is not int or not 1 <= self.window <= DOJO_GUARDIAN_WINDOW_LIMIT:
            raise ValueError("Invalid dojo guardian replay window")
        self.proto = DOJO_GUARDIAN_STAGES[stage_id]
        self.stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[self.stage["groupid"]]
        waves = self.group["MonstersInfos"]
        if (self.stage["groupid"] != stage_id or self.group["resindex"] != stage_id
                or len(waves) != 1 or len(waves[0]) != 1 or tuple(waves[0][0][:3]) != (1, self.proto, 40)):
            raise RuntimeError("The original dojo guardian formation differs from this version")
        offsets = {row["monster_hp_delta"][stage_id - 40051] for row in DATA_DG_GUARDIAN.data.values()}
        if len(offsets) != 1:
            raise RuntimeError("The original dojo guardian HP adjustment varies by tier")
        self.offset, = offsets
        maxima = JiejieTuPoGym2BossEngine.calcSharedMonMaxHp(str(stage_id), True, {"hp_delta": self.offset})
        if set(maxima) != {1} or not isfinite(maxima[1]) or maxima[1] < 1 or not float(maxima[1]).is_integer():
            raise RuntimeError("The original dojo guardian has no usable shared HP")
        self.shared_max = int(maxima[1])
        self.initial_hp = self.shared_max if settings["hp"] is None else settings["hp"]
        if type(self.initial_hp) is not int or not 1 <= self.initial_hp <= self.shared_max:
            raise ValueError("Remaining dojo guardian HP must be within the original shared maximum")

        self.const = const
        room = "offline-dojo-guardian"
        self.engine = JiejieTuPoGym2BossEngine({"team": self, "teamUid": room, "fbUid": room,
            "raid_header": {"attacker": room}, "pve_data_flag": str(stage_id), "hp": {"1": self.initial_hp},
            "boss_hp_delta": self.offset})
        self.engine.battleMode = DOJO_GUARDIAN_MODE
        self.start = None
        self.cutoff = None
        self.guardian = None
        self.killed_at = None
        self.observe_opening()

    def raid_send_msgs(self, header, messages):
        # The native engine handles the local victory delay itself. Retain the
        # original shared result event without sending it to a game server.
        if any(message.get("op") == "battle_win" for message in messages):
            self.killed_at = self.engine.now_time()

    def raid_send_property(self, header, name, data, joiner):
        if name != "boss_battle_hp":
            raise RuntimeError("Unexpected original dojo guardian property")

    def observe_opening(self):
        spawn, create = self.engine._createNextRoundMons, self.engine.createMonsterEntity

        def created(camp, owner, placement):
            entity = create(camp, owner, placement)
            if self.guardian is not None or (entity.protoid, entity.posIndex, placement.level) != (self.proto, 1, 40):
                raise RuntimeError("The original dojo guardian spawned a different unit")
            self.guardian = entity
            return entity

        def spawn_guardian():
            self.engine.createMonsterEntity = created
            try:
                result = spawn()
            finally:
                self.engine.createMonsterEntity = create
            unit = self.guardian
            if unit is None or unit.AttrComp.hp != self.initial_hp or unit.AttrComp.hpDelta != self.offset:
                raise RuntimeError("The original dojo guardian started with different shared HP")
            return result

        self.engine._createNextRoundMons = spawn_guardian

    def update(self):
        engine = self.engine
        if engine.battleState != self.const.BattleState.BS_STARTED:
            return
        now = engine.now_time()
        if self.start is None:
            self.start = now
        if self.cutoff is None and self.killed_at is None and now - self.start >= self.window:
            # Freeze the measured HP and score at the local window. The original
            # engine still handles the interrupted battle and its settlement.
            self.cutoff = (now, self.guardian.AttrComp.hp, engine.myTotalDmg)
            engine.forceBattleEnd("timeout")

    def report(self, completed, outcome):
        if self.guardian is None or self.start is None:
            raise RuntimeError("The original dojo guardian did not start fighting")
        engine = self.engine
        settled = engine.now_time()
        now, hp, damage = self.cutoff or (self.killed_at or settled, self.guardian.AttrComp.hp, engine.myTotalDmg)
        if completed and outcome == "win" and (self.killed_at is None or hp > 0):
            raise RuntimeError("The original dojo guardian did not confirm a shared kill")
        return {"guardianId": self.proto, "hpAdjustment": self.offset, "sharedMaxHp": self.shared_max,
                "startHp": self.initial_hp, "remainingHp": max(0, hp), "damage": damage,
                "windowSeconds": self.window, "timedOut": self.cutoff is not None,
                "combatSeconds": round(now - self.start, 6),
                "settlementWaitSeconds": round(settled - self.killed_at, 6) if self.killed_at is not None else 0,
                "defeated": completed and outcome == "win"}
