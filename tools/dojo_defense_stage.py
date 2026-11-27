"""Replay an ordered list of known defenses in the original dojo engine."""

from collections import deque

from breakthrough_stage import BREAKTHROUGH_POSITIONS, BREAKTHROUGH_SCENE
from dojo_guardian_stage import DOJO_CODE_STAGE, DOJO_DEFENDER_MODE
from rune_team import assign_local_party, selected_team, verify_local_party


def dojo_defense_wall_seconds(waves):
    return 70 + 30 * waves


class DojoDefenseReplay:
    def __init__(self, stage, plan, suits, actor, fighters):
        from DynamicConfigData import DATA_HERO
        from battleengine.engine.JiejieTuPoGym2S1Engine import JiejieTuPoGym2S1Engine, const

        settings = plan.get("dojoDefense")
        if (stage != DOJO_CODE_STAGE or len(fighters) != 5 or type(settings) is not dict
                or settings.keys() != {"leader", "partySize", "waves"}):
            raise ValueError("Choose an original dojo route, five attackers, and known defense lineups")
        self.leader = settings["leader"]
        party_size, waves = settings["partySize"], settings["waves"]
        if (type(self.leader) is not bool or type(party_size) is not int or party_size not in BREAKTHROUGH_POSITIONS
                or type(waves) is not list or not waves):
            raise ValueError("Invalid dojo attack party or defenses")
        self.positions = BREAKTHROUGH_POSITIONS[party_size]
        self.wave_count = len(waves)
        self.attack = {"selected-onmyoji": actor, **fighters}
        self.defenses = {}
        for index, wave in enumerate(waves, 1):
            if type(wave) is not dict or wave.keys() != {"onmyoji", "members", "omittedSlots"}:
                raise ValueError("Every dojo defense needs a known lineup")
            omitted = wave["omittedSlots"]
            if (type(omitted) is not list or len(omitted) > 4 or any(type(slot) is not int or slot not in range(2, 7) for slot in omitted)
                    or len(set(omitted)) != len(omitted) or not self.leader and omitted):
                raise ValueError("Only the leader can have already-defeated shikigami")
            defender, defenders, gear, _ = selected_team(wave, suits)
            if len(defenders) != 5 - len(omitted) or any(row["heroId"] not in DATA_HERO.data
                                                       for row in [defender, *defenders.values()]):
                raise ValueError("The dojo defense needs the onmyoji and profiles for all remaining shikigami")
            roster = {"selected-onmyoji": defender, **defenders}
            snapshot = {"uid": self.defender_id(index), "level": defender["level"],
                        "heroes_info": {uid: {**row, "equips": {}} for uid, row in roster.items()},
                        "other_info": {"guild_buffs": []}}
            if self.leader:
                snapshot["gym_round"] = index
            self.defenses[snapshot["uid"]] = (snapshot, roster, gear, sorted(omitted))

        self.const = const
        self.active_wave = 1
        self.waves = []
        self.confirmed = 0
        self.pending = deque()
        self.engine = JiejieTuPoGym2S1Engine({
            "team": self, "battle_id": "offline-dojo-defense", "raid_header": {"attacker": "offline-attacker"},
            "defender_gid": "offline-defender-guild", "defenderData": self.defenses[self.defender_id(1)][0],
            "is_leader": self.leader,
        })
        self.engine.battleMode = DOJO_DEFENDER_MODE
        load = self.engine.init_defender_avatar

        def load_defender(snapshot):
            uid = self.defender_id(self.active_wave)
            if snapshot["uid"] != uid:
                raise RuntimeError("The dojo engine received a different defending team")
            load(snapshot)
            _, roster, gear, _ = self.defenses[uid]
            avatar = self.engine.defenderPlayer
            avatar.inventory.update(gear)
            for alias, row in roster.items():
                avatar.heroes[alias].equips = row["equips"]

        self.engine.init_defender_avatar = load_defender

    @staticmethod
    def defender_id(index):
        return f"offline-dojo-defender-{index}"

    def raid_send_msgs(self, header, messages, iscache=False):
        for message in messages:
            if message.get("op") in ("wave_win", "wave_lose"):
                self.pending.append(message)

    def assign_players(self, player, fighters):
        return assign_local_party(player, fighters, self.positions)

    def verify_players(self, controllers):
        verify_local_party(controllers, self.positions)
        if self.engine.combineSceneInfoId != BREAKTHROUGH_SCENE or self.engine.defenderLd != self.leader:
            raise RuntimeError("The original dojo initialized a different entrance")
        self.owners = {1: controllers[0]}
        self.owners.update((slot, owner) for owner, slots in zip(controllers, self.positions) for slot in slots)

    def attack_hp(self):
        units = {entity.HeroComp.heroData.heroUid: entity for entity in self.engine.heroEntities.values()
                 if entity.camp == self.const.CampFlag.CAMP1 and entity.HeroComp.heroData.heroUid in self.attack}
        result = []
        for position, (uid, row) in enumerate(self.attack.items(), 1):
            entity = units.get(uid)
            if entity is None:
                if self.active_wave == 1 and not self.pending and not self.waves:
                    raise RuntimeError("The original dojo did not field the full attack lineup")
                result.append(0)
                continue
            hero = entity.HeroComp.heroData
            if (entity.posIndex != position or entity.ownerController is not self.owners[position]
                    or entity.protoid != row["heroId"]
                    or sorted(value for value in hero.equips if value) != sorted(row["equips"])):
                raise RuntimeError("The original dojo assigned a different attacker or equipment")
            result.append(max(0, entity.AttrComp.hp))
        return result

    def verify_selection(self, controllers):
        if len(self.waves) == self.active_wave:
            return
        uid = self.defender_id(self.active_wave)
        if self.engine.defenderUid != uid:
            raise RuntimeError("The original dojo did not load the requested defense")
        _, roster, _, omitted = self.defenses[uid]
        units = {entity.HeroComp.heroData.heroUid: entity for entity in self.engine.heroEntities.values()
                 if entity.camp == self.const.CampFlag.CAMP2 and entity.HeroComp.heroData.heroUid in roster}
        if units.keys() != roster.keys():
            raise RuntimeError("The original dojo spawned a different defending team")
        defense = []
        for position, (alias, row) in enumerate(roster.items(), 1):
            entity = units[alias]
            hero = entity.HeroComp.heroData
            if ((entity.posIndex, entity.protoid, hero.level, hero.star, hero.awake)
                    != (position, row["heroId"], row["level"], row["star"], row["awake"])
                    or sorted(value for value in hero.equips if value) != sorted(row["equips"])):
                raise RuntimeError("The original dojo defense changed a character, position or equipment")
            defense.append({"id": entity.protoid, "position": position, "souls": len(row["equips"]), "hp": entity.AttrComp.hp})
        self.waves.append({"wave": self.active_wave, "attackHp": self.attack_hp(), "defense": defense,
                           "omittedSlots": omitted, "attackOrbs": self.engine.campData1.shareGuiHuo,
                           "defenseOrbs": self.engine.campData2.shareGuiHuo, "outcome": "unknown"})

    def update(self, controllers):
        engine = self.engine
        while self.pending:
            message = self.pending.popleft()
            wave = self.waves[-1]
            winning = message["op"] == "wave_win"
            if (wave["wave"] != self.active_wave or wave["outcome"] != "unknown"
                    or message["defender"] != self.defender_id(self.active_wave)
                    or engine.finishedWaveCount != self.active_wave - int(not winning)):
                raise RuntimeError("The original dojo returned a different wave settlement")
            wave["outcome"] = "win" if winning else "loss"
            wave["endAttackHp"] = self.attack_hp()
            wave["refereeTurns"] = engine.refereeBuffCount - 1
            if winning:
                reply = {"cb_uid": message["cb_uid"], "cb_params": {}}
                if self.active_wave == self.wave_count:
                    reply.update(op="battle_win", defeater="offline-attacker")
                else:
                    self.active_wave += 1
                    reply.update(op="next_wave", defender=self.defenses[self.defender_id(self.active_wave)][0],
                                 gym_atker_buffs={})
                engine.onRecvOtherTeamMsg(reply)

        if engine.battleState == self.const.BattleState.BS_SELETING_HERO and self.active_wave > max(1, self.confirmed):
            self.verify_selection(controllers)
            for controller in controllers:
                engine.op_setAuto(controller, True)
                if not controller.selectHeroOk:
                    engine.op_selectHeroOk(controller)
            if not all(controller.selectHeroOk for controller in controllers):
                raise RuntimeError("The native dojo did not accept the retained attack lineup")
            self.confirmed = self.active_wave

        if engine.battleState == self.const.BattleState.BS_STARTED and len(self.waves) == self.active_wave:
            self.waves[-1].setdefault("refereeSpeed", engine.refereeSpeed)

    def report(self, completed, outcome):
        cleared = sum(wave["outcome"] == "win" for wave in self.waves)
        if not self.waves or cleared != self.engine.finishedWaveCount or (
                completed and self.waves[-1]["outcome"] != outcome) or (outcome == "win" and cleared != self.wave_count):
            raise RuntimeError("The dojo did not settle the requested sequence of defenses")
        return {"leader": self.leader, "attackParty": self.positions, "waves": self.waves}
