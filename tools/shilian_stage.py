"""Replay Six Realms battles with owned shikigami and optional run state."""

from importlib import import_module
from math import isclose, isfinite

from shilian_routes import MOON_SECOND_SCENE, SHILIAN_DAOS, SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE, shilian_event_dao


REPLAY_SECONDS = 145
TRIAL_DIFFICULTY = 1
MAX_RUN_SKILLS = 4
MAX_RUN_ARTIFACTS = 3
GUARD_MAX_LEVEL = 30


def shilian_stage(stage_id, fighters, slot, event=None, run_state=None):
    from com import const
    from com.data.cdata import shilian_event_battles, shilian_event_exam, shilian_liudao
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    if event is None:
        config = next((row for row in shilian_event_exam.data.values() if row["battle_id"] == stage_id), {})
        dao = config.get("dao")
        if dao not in SHILIAN_DAOS or config.get("battle_type") != 2:
            raise ValueError("This Six Realms trial is not available as a single offline replay")
    else:
        config = shilian_event_battles.data.get(event["id"], {})
        dao = shilian_event_dao(config)
        if dao is None or config["battle_id"] != stage_id or config["battle_type"] not in (0, 1, 2):
            raise ValueError("The Six Realms battle does not match the original route and encounter")
    realm = shilian_liudao.data[dao]
    alias = f"member-{slot}"
    if len(fighters) != 6 or alias not in fighters or fighters[alias]["heroId"] not in realm["hero"]:
        raise ValueError("Six Realms battles need six owned shikigami and one eligible trial position")

    stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != (2 if event is None and dao == 1 else 1):
        raise ValueError("The Six Realms battle does not have the expected enemy formations")
    engine_name = SHILIAN_DAOS[dao][2]
    engine_class = getattr(import_module("battleengine.engine." + engine_name), engine_name)
    life_caps, marks = run_state_inputs(run_state, fighters, fighters[alias]["heroId"])
    skills = run_skills(run_state, fighters[alias]["heroId"])
    artifacts = run_artifacts(run_state, dao, fighters[alias]["heroId"])
    engine = engine_class({
        "pve_data_flag": str(stage_id),
        "dao_id": dao,
        "is_exam": event is None,
        "trial_hero_uid": alias,
        "trial_hero_id": fighters[alias]["heroId"],
        "battle_heroes_uid": list(fighters),
        "hero_attr_info": life_caps,
        "yinji_info": marks,
        "select_skill": [(skill, level) for _, skill, level, _ in skills],
        "scroll_skill": [[artifact["skillId"], artifact["amount"]] for artifact in artifacts],
        "currencys": {"601001": (run_state or {}).get("coins", 0)},
        "difficulty": TRIAL_DIFFICULTY if event is None else event["difficulty"],
        "move_count": 0 if event is None else event["moves"],
        "battle_type": config["battle_type"],
    })
    effect_group = engine.check_skill_effect_only

    def effect_group_key(skill_id):
        group = effect_group(skill_id)
        # The headless table reader exposes arrays as lists. The original engine keys
        # unique team effects by the complete, ordered group of skill IDs.
        return tuple(group) if isinstance(group, list) else group

    engine.check_skill_effect_only = effect_group_key
    engine.battleMode = SHILIAN_EXAM_MODE if event is None else SHILIAN_EVENT_MODE
    return engine, group, dao, const


def run_state_inputs(state, roster, trial_id):
    if not state:
        return {uid: {"cur_hp_per": 1.0} for uid in roster}, {}
    from com.data.cdata import shilian_fight_skill, shilian_yinji

    life_caps, marks = {}, {}
    for uid, cap, mark_id in zip(roster, state["lifeCaps"], state["marks"], strict=True):
        life_caps[uid] = {"cur_hp_per": cap / 100}
        if mark_id:
            row = shilian_yinji.data.get(mark_id)
            skill = shilian_fight_skill.data.get(row["skill_id"]) if row else None
            if not skill or row["hero_id"] not in (0, roster[uid]["heroId"]) or skill["hero_id"] not in (0, trial_id):
                raise ValueError("A Six Realms mark is unavailable for the selected shikigami")
            marks[uid] = (row["skill_id"], 1)
    return life_caps, marks


def valid_run_state(state):
    if not isinstance(state, dict) or set(state) - {"skills", "artifacts", "coins", "guard"} != {"lifeCaps", "marks"}:
        return False
    caps, marks = state["lifeCaps"], state["marks"]
    return (isinstance(caps, list) and isinstance(marks, list) and len(caps) == len(marks) == 6
            and all(type(cap) in (int, float) and 0 <= cap <= 100 for cap in caps)
            and all(type(mark) is int and 0 <= mark < 2 ** 53 for mark in marks)
            and valid_run_skills(state.get("skills", [])) and valid_run_artifacts(state.get("artifacts", []))
            and ("guard" not in state or valid_guard(state["guard"]))
            and type(state.get("coins", 0)) is int and 0 <= state.get("coins", 0) < 2 ** 53)


def valid_guard(guard):
    return (isinstance(guard, dict) and set(guard) == {"id", "level", "breakthrough"}
            and type(guard["id"]) is int and 2000 <= guard["id"] <= 2005
            and type(guard["level"]) is int and 1 <= guard["level"] <= GUARD_MAX_LEVEL
            and type(guard["breakthrough"]) is bool
            and (not guard["breakthrough"] or guard["level"] == GUARD_MAX_LEVEL))


def guard_battle_input(guard):
    from DynamicConfigData import DATA_SHILIAN_GUARD_GHOST

    levels = DATA_SHILIAN_GUARD_GHOST.guard_ghost_data.get(guard["id"], {}).get("levels", {})
    if guard["level"] not in levels:
        raise ValueError("The selected Six Realms guard level is unavailable in the current runtime")
    return {"choose_guard": guard["id"],
            "trial_guard": {str(guard["id"]): {"level": guard["level"], "tupo": guard["breakthrough"]}}}


def verify_guard(engine, camp, guard):
    from com.data.cdata import shilian_guard_ghost

    spirit = engine.getCampData(camp).behindSpiritEntity
    if spirit is None or spirit.behind_spirit_id != guard["id"]:
        raise RuntimeError("The original Six Realms engine did not summon the selected guard")
    owner = engine.getEntity(spirit.behind_spirit_owner_uid)
    skill_id = spirit.behind_spirit_summon_skill_id
    skill = owner.SkillMgrComp.getSkillComp(skill_id) if owner else None
    if skill is None:
        raise RuntimeError("The original Six Realms engine did not install the guard summon skill")
    name = next(row["name"] for row in shilian_guard_ghost.data.values() if row["guard_id"] == guard["id"])
    return {**guard, "name": name, "stage": skill.behind_spirit_stage, "summonSkill": skill_id,
            "attributes": skill.behind_spirit_add_attr, "baseSkills": sorted(skill.behind_spirit_base_skills_id),
            "extraSkills": sorted(skill.behind_spirit_add_skills_id)}


def valid_run_skills(skills):
    return (isinstance(skills, list) and len(skills) <= MAX_RUN_SKILLS
            and all(isinstance(row, list) and len(row) == 2 and type(row[0]) is int and 0 < row[0] < 2 ** 53
                    and type(row[1]) is int and 1 <= row[1] <= 5 for row in skills)
            and len({row[0] for row in skills}) == len(skills))


def run_skills(state, trial_id):
    if not state or not state.get("skills"):
        return []
    from com.data.cdata import shilian_currency, shilian_fight_skill
    from DynamicConfigData import DATA_SKILL

    resolved = []
    for item, level in state["skills"]:
        row = shilian_currency.data.get(item)
        if not row or row["type"] != 3 or len(row["extra_params"]) != 1:
            raise ValueError("Unknown selectable Six Realms skill")
        skill = int(row["extra_params"][0])
        rule = shilian_fight_skill.data.get(skill)
        if not rule or rule["hero_id"] not in (0, trial_id) or (skill, level, -1) not in DATA_SKILL.data:
            raise ValueError("The Six Realms skill and level are unavailable for the selected trial shikigami")
        resolved.append((item, skill, level, row["name"]))
    return resolved


def valid_run_artifacts(artifacts):
    return (isinstance(artifacts, list) and len(artifacts) <= MAX_RUN_ARTIFACTS
            and all(isinstance(row, list) and len(row) == 3
                    and all(type(value) is int and 0 < value < 2 ** 53 for value in row[:2])
                    and isinstance(row[2], list)
                    and all(type(turn) is int and 0 <= turn < 2 ** 53 for turn in row[2])
                    for row in artifacts)
            and len({row[0] for row in artifacts}) == len(artifacts))


def run_artifacts(state, dao, trial_id):
    if not state or not state.get("artifacts"):
        return []
    from com.data.cdata import shilian_currency, shilian_fight_skill
    from DynamicConfigData import DATA_SKILL

    resolved = []
    for item, amount, rounds in state["artifacts"]:
        row = shilian_currency.data.get(item)
        if not row or row["type"] != 2 or len(row["extra_params"]) != 1:
            raise ValueError("Unknown Six Realms artifact")
        skill = int(row["extra_params"][0])
        rule = shilian_fight_skill.data.get(skill, {})
        level, uses = (amount, 1) if dao == 4 else (1, amount)
        if (rule.get("hero_id", 0) not in (0, trial_id) or (skill, level, -1) not in DATA_SKILL.data
                or (dao != 4 and len(rounds) > uses)):
            raise ValueError("The Six Realms artifact does not match the route, level or available uses")
        resolved.append({"itemId": item, "skillId": skill, "name": row["name"], "amount": amount,
                         "level": level, "uses": uses, "rounds": rounds})
    return resolved


def verify_run_state(engine, controller, run_state):
    from com.data.cdata import shilian_yinji

    members = {unit.HeroComp.heroData.heroUid: unit for unit in engine.heroEntities.values()
               if unit.ownerController is controller}
    opening = []
    for index, (cap, mark_id) in enumerate(zip(run_state["lifeCaps"], run_state["marks"], strict=True), 1):
        uid = f"member-{index}"
        unit = members[uid]
        hp, limit = unit.AttrComp.hp, unit.AttrComp.maxHp
        base = limit + unit.AttrComp.maxHpDec
        if (not all(isfinite(value) for value in (hp, limit, base)) or base <= 0
                or (not isclose(limit / base, cap / 100) if cap else hp != 0)):
            raise RuntimeError("The original Six Realms engine did not apply the requested life cap")
        mark_skill = shilian_yinji.data[mark_id]["skill_id"] if mark_id else 0
        if mark_skill and ((mark_skill, 1) not in engine.hero_bead_skill.get(uid, ())
                           or (cap and not engine.bead_skill_num_on_stage.get(mark_skill))):
            raise RuntimeError("The original Six Realms engine did not equip the requested mark")
        opening.append({"slot": index, "lifeCap": cap, "hp": hp, "maxHp": limit if cap else 0, "baseHp": base,
                        "markId": mark_id, "markSkill": mark_skill})
    report = {"opening": opening}
    if run_state.get("skills"):
        trial = engine.get_trial_hero()
        resolved = run_skills(run_state, trial.protoid)
        observed = []
        for item, skill, level, name in resolved:
            component = trial.SkillMgrComp.getSkillComp(skill)
            if component is None or component._skillLevel != level:
                raise RuntimeError("The original Six Realms engine did not install the selected skill")
            observed.append({"itemId": item, "skillId": skill, "level": level, "name": name})
        report["skills"] = observed
    if run_state.get("guard"):
        report["guard"] = verify_guard(engine, members["member-1"].camp, run_state["guard"])
    return report


def verify_opening(engine, group, slot):
    trial = engine.get_trial_hero()
    if trial is None or trial.HeroComp.heroData.heroUid != f"member-{slot}":
        raise RuntimeError("The original engine selected a different trial shikigami")
    expected = sorted((row[0], row[1]) for row in group["MonstersInfos"][0])
    actual = sorted((unit.posIndex, unit.protoid) for unit in engine.monsterEntities.values())
    if actual != expected:
        raise RuntimeError("The original engine created a different Six Realms formation")
    return trial.protoid


class MoonTrial:
    """Observe the original Moon trial's boss and party changes."""

    def __init__(self, engine, controller, group, choices):
        from battleengine.engine.ShiLianYueDuEngine import YueDuBossStage

        self.engine = engine
        self.controller = controller
        self.group = group
        self.choices = choices
        self.phase_enum = YueDuBossStage
        self.phase = engine.boss_battle_stage
        self.phase_since = engine.now_time()
        self.waiting_ms = 0
        self.openings = []
        self.scene_attr = engine.turn_setSceneAttr
        engine.turn_setSceneAttr = self.set_scene_attr

    def set_scene_attr(self, key, value, *args, **kwargs):
        result = self.scene_attr(key, value, *args, **kwargs)
        if key == "change_boss_stage_battle_uid_map":
            for uid in value.values():
                entity = self.engine.getEntity(uid)
                if not entity or entity.ownerController is not self.controller:
                    continue
                setting = self.choices.get(entity.HeroComp.heroData.heroUid)
                if setting:
                    self.engine.op_setAutoSkill(self.controller, uid, setting)
                    if self.controller.autoSkill.get(uid) != setting:
                        raise RuntimeError("The Moon trial did not retain the requested auto skill after changing scenes")
        return result

    def wait_since_last_phase(self):
        montage = self.phase_enum
        if self.phase in (montage.FIRST_MONTAGE, montage.SECOND_MONTAGE, montage.THIRD_MONTAGE, montage.LAST_MONTAGE):
            return round((self.engine.now_time() - self.phase_since) * 1000)
        return 0

    def update(self):
        phase = self.engine.boss_battle_stage
        if phase == self.phase:
            return
        self.waiting_ms += self.wait_since_last_phase()
        self.phase = phase
        self.phase_since = self.engine.now_time()
        if phase in (self.phase_enum.HIT_MAN, self.phase_enum.HIT_WOMEN):
            index = len(self.openings)
            if index != int(phase == self.phase_enum.HIT_WOMEN):
                raise RuntimeError("The Moon trial started an unexpected boss phase")
            scene = self.group["resindex"] if index == 0 else MOON_SECOND_SCENE
            pos, proto = self.group["MonstersInfos"][index][0][:2]
            boss = self.engine.getEntity(self.engine.created_boss_uid[index])
            if self.engine.combineSceneInfoId != scene or boss is None or (boss.posIndex, boss.protoid) != (pos, proto):
                raise RuntimeError("The Moon trial did not create the expected boss and scene")
            self.openings.append({"sceneId": scene, "bossId": proto, "position": pos})

    def report(self, outcome):
        cleared = self.engine.hit_boss_num
        if not 0 <= cleared <= len(self.openings) or (outcome == "win" and cleared != 2):
            raise RuntimeError("The Moon trial settled with inconsistent boss phases")
        return {"phases": self.openings, "phasesCleared": cleared,
                "montageWaitMs": self.waiting_ms + self.wait_since_last_phase()}


class ArtifactReplay:
    """Submit configured artifact requests and observe the native cast callback."""

    def __init__(self, engine, controller, const, state, dao, start):
        self.engine, self.controller, self.const = engine, controller, const
        self.artifacts = run_artifacts(state, dao, engine.trial_hero_id)
        self.coins, self.start = state.get("coins", 0), start
        self.requests = [{"index": index, "notBeforeRound": turn, "requestedRound": None, "castRound": None,
                          "castMs": None}
                         for index, artifact in enumerate(self.artifacts) for turn in artifact["rounds"]]
        self.requests.sort(key=lambda request: request["notBeforeRound"])
        self.pending = None
        self.pending_hero = None
        self.used_skill = engine.used_skill
        engine.used_skill = self.record_cast

    def verify_opening(self):
        expected = [[artifact["skillId"], artifact["uses"]] for artifact in self.artifacts]
        trial = self.engine.get_trial_hero()
        if self.engine.scroll_skill_usage != expected or self.engine.coin_num != self.coins:
            raise RuntimeError("The original engine did not load the requested artifacts and currency")
        for artifact in self.artifacts:
            component = trial.SkillMgrComp.getSkillComp(artifact["skillId"])
            if component is None or component._skillLevel != artifact["level"]:
                raise RuntimeError("The original engine did not install the expected artifact skill")

    def update(self, fighting):
        if not fighting:
            return
        trial = self.engine.get_trial_hero()
        if not trial or trial.lifeState != self.const.CombatState.ALIVE:
            self.pending = None
            self.pending_hero = None
            return
        if self.pending and self.pending_hero == trial.uid:
            return
        self.pending = None
        for request in self.requests:
            if (request["requestedRound"] is None and self.engine.lbs_bout_counter >= request["notBeforeRound"]
                    and self.engine.check_scroll_skill_available(request["index"])):
                request["requestedRound"] = self.engine.lbs_bout_counter
                self.pending = request
                self.pending_hero = trial.uid
                self.engine.op_useScrollSkill(self.controller, request["index"])
                break

    def record_cast(self, skill_id, index):
        self.used_skill(skill_id, index)
        if self.pending and index == self.pending["index"] and self.artifacts[index]["skillId"] == skill_id:
            self.pending["castRound"] = self.engine.lbs_bout_counter
            self.pending["castMs"] = round((self.engine.now_time() - self.start) * 1000)
            self.pending = None
            self.pending_hero = None

    def report(self):
        return {
            "artifacts": [{**{key: artifact[key] for key in ("itemId", "skillId", "name", "amount", "level")},
                           "remainingUses": self.engine.scroll_skill_usage[index][1],
                           "requests": [{key: request[key] for key in ("notBeforeRound", "requestedRound", "castRound", "castMs")}
                                        for request in self.requests if request["index"] == index]}
                          for index, artifact in enumerate(self.artifacts)],
            "coins": self.coins, "coinCost": self.engine.coin_cost_num,
        }
