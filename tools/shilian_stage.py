"""Replay Six Realms battles with full-health owned shikigami."""

from importlib import import_module

from shilian_routes import MOON_SECOND_SCENE, SHILIAN_DAOS, SHILIAN_EVENT_MODE, SHILIAN_EXAM_MODE, shilian_event_dao


REPLAY_SECONDS = 145
TRIAL_DIFFICULTY = 1


def shilian_stage(stage_id, fighters, slot, event=None):
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
    engine = engine_class({
        "pve_data_flag": str(stage_id),
        "dao_id": dao,
        "is_exam": event is None,
        "trial_hero_uid": alias,
        "trial_hero_id": fighters[alias]["heroId"],
        "battle_heroes_uid": list(fighters),
        "hero_attr_info": {uid: {"cur_hp_per": 1.0} for uid in fighters},
        "difficulty": TRIAL_DIFFICULTY if event is None else event["difficulty"],
        "move_count": 0 if event is None else event["moves"],
        "battle_type": config["battle_type"],
    })
    engine.battleMode = SHILIAN_EXAM_MODE if event is None else SHILIAN_EVENT_MODE
    return engine, group, dao, const


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
