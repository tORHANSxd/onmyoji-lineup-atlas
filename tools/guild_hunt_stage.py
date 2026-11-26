"""Ordinary personal Guild Hunting battle without borrowed shikigami."""

from importlib import import_module
from random import Random
from guild_retreat_stage import RETREAT_MODE
from fengmo_yanwu_stage import FENGMO_YANWU_MODE
from general_soul_stage import SOLO_SCORE_MODES
from qiling_group_stage import QILING_GROUP_MODE

GUILD_HUNT_MODE = 2000
PHASE_SKILL = "battleengine.SkillComp_GuildHuntingBoss"


def guild_hunt_stage(stage_id):
    from battleengine.engine.GuildHuntingBattleEngine import GVE_BATTLE_INFO, GuildHuntingBattleEngine, const

    config = GVE_BATTLE_INFO.data.get(stage_id)
    if not config or config["week_day"] not in range(4) or not 1 <= config["difficulty"] <= 6:
        raise ValueError(f"Guild Hunting stage {stage_id} is not a verified elemental hunt")
    if len(config["monsters"]) != 1 or len(config["monsters"][0]) != 2:
        raise ValueError(f"Guild Hunting stage {stage_id} has an unexpected opening formation")
    engine = GuildHuntingBattleEngine({"fbId": stage_id, "allRewards": {}})
    engine.battleMode = const.BattleMode.MODE_GUILD_GVE
    if engine.battleMode != GUILD_HUNT_MODE or engine.combineSceneInfoId != config["scene"]:
        raise RuntimeError("The elemental hunt resolved to a different battle")
    return engine, config


def seed_hunt_phases(modules, seed):
    if modules.rows[PHASE_SKILL]["marshalSHA256"] != "f684b6e59c8c6f24a0b9da9c744381b4b8cc3979ab0f7b4fc19a4ee61b97bd10":
        raise RuntimeError("The elemental hunt uses a different phase skill implementation")
    # This skill uses the module's RNG for its random mini-boss effects,
    # separate from the original engine's seeded combat RNG.
    import_module(PHASE_SKILL).random = Random(seed)


def observe_guild_hunt_opening(engine, config):
    original_spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
    expected_id, expected_level = config["monsters"][0]
    opening = {}

    def verify_spawn():
        created = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            created.append((placement.Index, placement.level, unit))
            return unit

        engine.createMonsterEntity = observe
        try:
            result = original_spawn()
        finally:
            engine.createMonsterEntity = create
        if opening or [(pos, level, unit.protoid) for pos, level, unit in created] != [(1, expected_level, expected_id)]:
            raise RuntimeError("The original elemental hunt created a different opening formation")
        attr = created[0][2].AttrComp
        opening.update(id=expected_id, position=1, level=expected_level, hp=attr.hp, speed=attr.speed,
                       attack=attr.attack, defense=attr.defense, critRate=attr.critRate)
        return result

    engine._createNextRoundMons = verify_spawn
    return opening


def hunt_tactics(plan, mode):
    if "tactics" not in plan:
        return {}
    tactics = plan["tactics"]
    if (mode not in (GUILD_HUNT_MODE, RETREAT_MODE, FENGMO_YANWU_MODE, QILING_GROUP_MODE, *SOLO_SCORE_MODES)
            or type(tactics) is not dict or not tactics
            or tactics.keys() - {"redBoss", "greenSlot", "manualOpening", "autoMode"}):
        raise ValueError("Unsupported Guild Hunting tactics")
    if "redBoss" in tactics and tactics["redBoss"] is not True:
        raise ValueError("Invalid Guild Hunting enemy mark")
    opening = tactics.get("manualOpening", True)
    if opening is not True:
        if (type(opening) is not dict or opening.keys() != {"actorSlot", "skillId", "target"}
                or type(opening["actorSlot"]) is not int or not 1 <= opening["actorSlot"] <= len(plan["members"])
                or type(opening["skillId"]) is not int or opening["skillId"] <= 0
                or not (opening["target"] in ("simple", "boss", "self") or
                        type(opening["target"]) is int and 1 <= opening["target"] <= len(plan["members"]))):
            raise ValueError("Invalid Guild Hunting manual skill instruction")
        hero = plan["members"][opening["actorSlot"] - 1]["hero"]
        if not any(skill_id == opening["skillId"] for skill_id, _ in hero["skinfo"]):
            raise ValueError("The manual opening skill is not in the selected Shikigami's loadout")
    if "greenSlot" in tactics and (type(tactics["greenSlot"]) is not int or not 1 <= tactics["greenSlot"] <= len(plan["members"])):
        raise ValueError("Invalid Guild Hunting ally mark slot")
    if "autoMode" in tactics:
        setting = tactics["autoMode"]
        if (type(setting) is not dict or setting.keys() != {"slot", "mode"}
                or type(setting["slot"]) is not int or not 1 <= setting["slot"] <= len(plan["members"])
                or setting["mode"] not in ("basic", "spell")
                or plan["members"][setting["slot"] - 1].get("aiSkill") != 0):
            raise ValueError("The automatic mode needs a valid slot without a conflicting skill lock")
    return tactics


class HuntOpening:
    def __init__(self, engine, controller, const, tactics, boss_id):
        self.engine = engine
        self.controller = controller
        self.const = const
        self.tactics = tactics
        self.boss_id = boss_id
        self.entities = {}
        self.applied = {}
        self.manual_action = None
        self.manual_choices = None

    def select(self, alias, entity):
        self.entities[alias] = entity
        setting = self.tactics.get("autoMode")
        if not setting or alias != f"member-{setting['slot']}":
            return
        modes = self.const.UseSkillMode
        mode = modes.PUGONG if setting["mode"] == "basic" else modes.YAOSHU
        self.engine.op_setUseSkillMode(self.controller, entity.uid, mode)
        if self.controller.useSkillModes.get(entity.uid) != mode:
            raise RuntimeError("The original engine did not apply the requested automatic mode")
        self.applied["autoMode"] = setting

    def update(self):
        if self.applied == self.tactics or self.engine.battleState != self.const.BattleState.BS_STARTED:
            return
        engine, controller, const = self.engine, self.controller, self.const
        boss = next((unit for unit in engine.monsterEntities.values() if unit.protoid == self.boss_id
                     and unit.lifeState == const.CombatState.ALIVE), None)
        if not boss:
            return
        if opening := self.tactics.get("manualOpening"):
            turn = engine.turnMgr
            entity = turn.GetCurrEntity()
            if entity is None or entity.ownerController is not controller or not turn.isInLockState(const.LockSubState.SelectingSkill):
                return
            self.cast_opening(opening, turn, entity, boss)
        if self.tactics.get("redBoss"):
            self.mark(const.EnemyFlag, boss)
            self.applied["redBoss"] = True
        if "greenSlot" in self.tactics:
            slot = self.tactics["greenSlot"]
            self.mark(const.FriendFlag, self.entities[f"member-{slot}"])
            self.applied["greenSlot"] = slot

    def member_slot(self, entity):
        return next((slot for slot in range(1, 7) if self.entities.get(f"member-{slot}") is entity), None)

    def opening_targets(self, skill):
        range_ = skill.selectRange
        ranges = self.const.SkillSelectRange
        if range_ in self.const.SIMPLE_SELECT_TYPE:
            return ["simple"]
        if range_ == ranges.RANGE_SELF:
            return ["self"]
        if range_ in (ranges.RANGE_ENEMY_SOLO, ranges.RANGE_ENEMY_COL, ranges.RANGE_ENEMY_EXPANDS,
                      ranges.RANGE_ENEMY_FORWARD_ROW, ranges.RANGE_ENEMY_BACK_ROW):
            return ["boss"]
        if range_ in (ranges.RANGE_FRIEND_SOLO, ranges.RANGE_FRIEND_SOLO_OR_ONLY_SELF):
            return ["ally"]
        if range_ in (ranges.RANGE_FRIEND_SELF_SOLO, ranges.RANGE_FRIEND_SELF_SOLO_EXCLUDE_YYS):
            return ["ally", "self"]
        if range_ == ranges.RANGE_ALL_SOLO:
            return ["boss", "ally"]
        if range_ == ranges.RANGE_ALL_SELF_SOLO:
            return ["boss", "ally", "self"]
        return []

    def cast_opening(self, opening, turn, entity, boss):
        engine, controller, const = self.engine, self.controller, self.const
        mgr = entity.SkillMgrComp
        slot = self.member_slot(entity)
        normal = mgr.findNormalSkill()
        available = mgr.getDisplaySkills(True, True)
        if controller.isAuto:
            raise RuntimeError("The original engine did not enter manual play")
        if opening is True:
            if normal is None:
                raise RuntimeError("The original engine did not offer a manual opening basic attack")
            skill_id, target = normal.skillId, boss
            if slot is not None:
                self.manual_choices = {
                    "actorSlot": slot,
                    "skills": [{"skillId": id_, "targets": self.opening_targets(mgr.getSkillById(id_))}
                               for id_ in available if id_ != skill_id],
                }
        else:
            skill_id, requested = opening["skillId"], opening["target"]
            if opening["actorSlot"] != slot or skill_id not in available:
                raise RuntimeError("The requested Shikigami and skill were not available on the first manual turn")
            if requested == "simple":
                target = None
            elif requested == "boss":
                target = boss
            elif requested == "self":
                target = entity
            else:
                target = self.entities[f"member-{requested}"]

        # Observe the target after the original UI action validates and resolves it.
        cast = mgr.castSkill
        accepted = []

        def observe(id_, *args, **kwargs):
            if id_ == skill_id and kwargs.get("fromID") == entity.uid:
                accepted.append(engine.getEntity(kwargs["targetID"]))
            return cast(id_, *args, **kwargs)

        mgr.castSkill = observe
        try:
            if target is None:
                engine.op_simpleUseSkill(controller, skill_id)
            else:
                engine.op_setSelectSkillId(controller, skill_id)
                engine.op_useSkill(controller, target.uid, skill_id)
        finally:
            mgr.castSkill = cast
        if (turn.lockSkillId != skill_id or turn.isInLockState(const.LockSubState.SelectingSkill)
                or len(accepted) != 1 or accepted[0] is None
                or (target is not None and accepted[0] is not target)):
            raise RuntimeError("The original engine did not accept the manual opening skill and target")
        engine.op_setAuto(controller, True)
        if not controller.isAuto:
            raise RuntimeError("The original engine did not return the controller to automatic play")
        self.applied["manualOpening"] = opening
        self.manual_action = {"heroId": entity.protoid, "skillId": skill_id, "targetId": accepted[0].protoid}
        if opening is not True:
            self.manual_action.update(actorSlot=slot, targetSlot=self.member_slot(accepted[0]))

    def mark(self, flag, entity):
        self.engine.op_setPriorityTarget(self.controller, flag, entity.uid)
        if self.engine.getCampData(self.controller.ctrlCamp).priorityTargetUid.get(flag) != entity.uid:
            raise RuntimeError("The original engine did not accept the requested target mark")

    def report(self):
        result = {"tactics": self.applied}
        if self.manual_action:
            result["manualAction"] = self.manual_action
        if self.manual_choices:
            result["manualChoices"] = self.manual_choices
        return result
