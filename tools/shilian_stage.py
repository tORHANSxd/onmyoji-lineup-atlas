"""Replay Six Realms battles with owned shikigami and optional run state."""

from importlib import import_module
from math import isclose, isfinite

from shilian_routes import MOON_SECOND_SCENE, SHILIAN_DAOS, SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE, shilian_event_dao


REPLAY_SECONDS = 145
TRIAL_DIFFICULTY = 1
MAX_RUN_SKILLS = 4


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
    if not isinstance(state, dict) or set(state) - {"skills"} != {"lifeCaps", "marks"}:
        return False
    caps, marks = state["lifeCaps"], state["marks"]
    return (isinstance(caps, list) and isinstance(marks, list) and len(caps) == len(marks) == 6
            and all(type(cap) in (int, float) and 0 <= cap <= 100 for cap in caps)
            and all(type(mark) is int and 0 <= mark < 2 ** 53 for mark in marks)
            and valid_run_skills(state.get("skills", [])))


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
