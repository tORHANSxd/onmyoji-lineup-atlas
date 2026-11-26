"""Local entry context supplied by the original Guild Boss raid controller."""

from collections import deque

RETREAT_MODE = 306
RETREAT_BOSSES = (101, 102, 103)
CODE_TARGETS = {101: 10020206, 102: 10020204, 103: 10020205}


class LocalRaidRoom:
    """Deliver raid messages locally between one original battle engine and raid controller."""

    player_id = "0"

    def __init__(self, room_id):
        self.id = room_id
        self.attackers = {self.player_id: {"state": 1}}
        self.players_in_battle = [self.player_id]
        self.to_battle, self.to_raid = deque(), deque()
        self.phases = []
        self.settlements = []

    def forward_msgs_to_team(self, messages, attackers=None, team_mbs=None):
        if attackers is None or self.player_id in attackers:
            self.to_battle.extend(messages)

    def send_msg_to_guild(self, message, is_final=False):
        self.settlements.append((is_final, message))

    def raid_send_msgs(self, header, messages, iscache):
        if header.get("attacker") != self.player_id:
            raise RuntimeError("Unexpected local raid attacker")
        self.to_raid.extend((header, message) for message in messages)

    def pump(self):
        if self.to_raid:
            while self.to_raid:
                header, message = self.to_raid.popleft()
                self.raid.on_receive_msg(self, header, message)
            self.raid.raid_sync_message()
        while self.to_battle:
            message = self.to_battle.popleft()
            if message.get("op") == "ch_st":
                self.phases.append(message["status"])
            self.engine.onRecvOtherTeamMsg(message)

    def opening_panel(self, unit):
        attr = unit.AttrComp
        shared = self.raid.get_cur_boss_ctrl()
        position = self.boss["posIndex"]
        level = self.boss["level"]
        if ((unit.protoid, unit.posIndex, attr.level) != (self.boss["protoId"], position, level)
                or attr.hp != shared.get_boss_cur_hp() or attr.maxHp != shared.get_boss_max_hp()):
            raise RuntimeError("The original raid and battle engine disagreed on the opening boss")
        return {"id": unit.protoid, "position": position, "level": level, "hp": attr.hp, "speed": attr.speed,
                "attack": attr.attack, "defense": attr.defense, "critRate": attr.critRate}


class GuildRetreatRaid(LocalRaidRoom):
    def __init__(self, difficulty, boss_id, round_number, member_count):
        from battleengine.engine.GuildBossEngine import GuildBossEngine, const
        from battleengine.raid.raid_controllers.RaidController import RaidController
        from DynamicConfigData import DATA_BOSS_INFO, DATA_RAID_INFO

        config = DATA_RAID_INFO.data.get((1, difficulty))
        if (not config or tuple(config["bossInfo"]) != RETREAT_BOSSES or config["boss_num"] != 3
                or boss_id not in config["bossInfo"] or not 1 <= round_number <= 3):
            raise ValueError("Unknown Guild Boss difficulty, boss or round")
        super().__init__(f"offline-retreat-{difficulty}-{boss_id}-{round_number}")
        order = [boss for boss in config["bossInfo"] if boss != boss_id]
        order.insert(round_number - 1, boss_id)
        self.raid = RaidController.create_raid_controller(self, 1, difficulty, order)
        for _ in range(1, round_number):
            self.raid.enter_next_round()
        self.to_battle.clear()
        self.boss = DATA_BOSS_INFO.data[boss_id]
        self.round = round_number
        self.userdata = self.raid.get_user_data(self.player_id)
        if (self.userdata["bossWaveList"] != order or self.userdata["round_count"] != round_number
                or self.userdata["boss_proto_id"] != self.boss["protoId"]):
            raise RuntimeError("The original raid controller initialized a different round")
        self.userdata.update(teamUid=self.id, raid_header={"attacker": self.player_id}, buff_member_num=member_count)
        self.engine = GuildBossEngine(self.userdata)
        self.engine.battleMode = const.BattleMode.MODE_GUILD_BOSS
        self.engine.team = self
        self.settlements.clear()


class RaidDamageWindow:
    def __init__(self, raid, const, limit):
        self.raid, self.engine, self.const = raid, raid.engine, const
        self.limit, self.started, self.reason, self.opening = limit, None, None, None
        initial_spawn = self.engine._createNextRoundMons

        def observe():
            result = initial_spawn()
            if self.opening is None:
                units = list(self.engine.monsterEntities.values())
                if len(units) != 1:
                    raise RuntimeError("The local raid did not create one opening boss")
                self.opening = raid.opening_panel(units[0])
            return result

        self.engine._createNextRoundMons = observe

    @property
    def combat_seconds(self):
        return 0 if self.started is None else round(min(self.limit, self.engine.now_time() - self.started), 6)

    def update(self):
        engine, const = self.engine, self.const
        if self.started is None and engine.battleState == const.BattleState.BS_STARTED:
            self.started = engine.now_time()
        self.raid.pump()
        boss = self.raid.raid.boss_ctrl_dict[self.raid.round]
        if boss.is_passed:
            self.reason = "boss-defeated"
        elif engine.battleState == const.BattleState.BS_OVER:
            self.reason = "team-defeated"
        elif self.combat_seconds >= self.limit:
            self.reason = "window-expired"
        if self.reason and engine.hpChangedCache:
            # Close the local measurement by flushing the original five-second damage batch.
            engine.lastUpdateHpChangeTime = engine.now_time() - 6
            engine.sync_my_total_dmg()
            self.raid.pump()
            if boss.is_passed:
                self.reason = "boss-defeated"

    def report(self):
        damage = self.raid.raid.player_total_dmg.get(self.raid.player_id, 0)
        if self.opening is None or self.started is None or type(damage) is not int or damage < 0:
            raise RuntimeError("The local raid returned no trustworthy damage report")
        return {"opening": self.opening, "damage": damage, "localDamage": self.engine.myTotalDmg,
                "round": self.raid.round, "windowSeconds": self.limit, "combatSeconds": self.combat_seconds,
                "reason": self.reason, "phases": self.raid.phases}
