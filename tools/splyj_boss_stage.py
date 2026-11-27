"""Run the original Cold Mountain boss practice with a known lineup."""

from pve_clock import NativePveClock
from splyj_tower_stage import SPLYJ_ASSIST, SPLYJ_ASSIST_HERO, activity_skills, skills_match


SPLYJ_BOSS_ACTIVITY = 11443
SPLYJ_BOSS_MODE = 6059
SPLYJ_BOSS_STAGES = range(40129, 40133)
SPLYJ_BOSS_SECONDS = 180
SPLYJ_BOSS_SCENE = 50031
SPLYJ_BOSS_MARK = 20
SPLYJ_MIRROR_SKILL = 68653


class SplyjBossReplay:
    def __init__(self, stage_id, extra_skill):
        from battleengine.engine.SPlyjBossBattleEngine import SPlyjBossBattleEngine
        from com import const
        from DynamicConfigData import (BattleMonstersInfo, DATA_NORMAL_BATTLE_ASSIST_HERO,
                                       DATA_NORMAL_BATTLE_CONFIG, DATA_PVE_STAGE_DATA,
                                       DATA_SPLYJ_BOSS, DATA_STAKE_BOSS)

        if stage_id not in SPLYJ_BOSS_STAGES:
            raise ValueError("Choose an original Cold Mountain boss difficulty")
        self.difficulty = stage_id - SPLYJ_BOSS_STAGES.start + 1
        profile = DATA_SPLYJ_BOSS.data[self.difficulty]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        rules = DATA_NORMAL_BATTLE_CONFIG.data[SPLYJ_BOSS_MODE]
        assist = DATA_NORMAL_BATTLE_ASSIST_HERO.data[SPLYJ_ASSIST]
        entry = DATA_STAKE_BOSS.data[SPLYJ_BOSS_MARK]
        self.boss = 1103210 + self.difficulty
        waves = self.group["MonstersInfos"]
        if (profile["pve_battle_flag"] != str(stage_id) or profile["lv"] != self.difficulty
                or profile["boss_skill"] != [SPLYJ_MIRROR_SKILL] or entry["team_battle_type"] != SPLYJ_BOSS_MODE
                or self.group["ID"] != stage_id or self.group["resindex"] != SPLYJ_BOSS_SCENE
                or len(waves) != 1 or len(waves[0]) != 1 or tuple(waves[0][0][:3]) != (1, self.boss, 40)
                or stage["shishentotal"] != 5 or stage.get("battleTime") or rules["halt_time"] != SPLYJ_BOSS_SECONDS
                or rules["group_battle"] or rules["save_round_hp"] or rules["replace_yys_id"]
                or not rules["show_total_damage"] or not rules["real_time_sync_dmg"]
                or rules["assist_hero_list"] != [SPLYJ_ASSIST]
                or (assist["hero_id"], assist["pos_index"], assist["can_control"], assist["is_god_mode"])
                != (SPLYJ_ASSIST_HERO, 101, 0, 1)):
            raise RuntimeError("The original Cold Mountain boss route differs")
        self.skills = activity_skills(extra_skill)
        data = {"pve_data_flag": str(stage_id), "is_practice": True,
                "sub_boss_id": self.difficulty, "skill_info": self.skills}
        self.const = const
        self.engine = SPlyjBossBattleEngine(data)
        self.engine.battleMode = SPLYJ_BOSS_MODE
        self.clock = NativePveClock(self.engine, SPLYJ_BOSS_SECONDS)
        self.verified = False
        create = self.engine.createMonsterEntity

        def verify(*args, **kwargs):
            entity = create(*args, **kwargs)
            if entity and entity.protoid == self.boss:
                if self.verified or (entity.posIndex, entity.AttrComp.level, entity.camp) != (1, 40, const.CampFlag.CAMP2):
                    raise RuntimeError("The original Cold Mountain boss formation differs")
                self.verified = True
            return entity

        # This boss's create_one_monster_entity discards the return value of the base method.
        self.engine.createMonsterEntity = verify

    def matches(self, avatar):
        engine = self.engine
        return (engine.monstergroup == self.group["ID"] and engine.combineSceneInfoId == SPLYJ_BOSS_SCENE
                and avatar.hasYYS and avatar.ssPosIndexList == [2, 3, 4, 5, 6] and not engine.replace_yys_flag
                and engine.campData1.shareGuiHuo == 4 and engine.campData2.initGuihuo == 1
                and skills_match(engine, self.skills))

    def report(self, completed):
        engine = self.engine
        settlement = engine.engineUserData
        selected = settlement.get("SelectedHeroes", {})
        damage = settlement.get("damage")
        cleared = settlement.get("is_finish")
        used_time = settlement.get("used_time")
        if (not self.verified or completed and (not any(hero["heroId"] == SPLYJ_ASSIST_HERO
                                                       for team in selected.values() for hero in team)
                or type(damage) is not int or damage < 0 or type(cleared) is not bool
                or type(used_time) is not int or not 0 <= used_time <= SPLYJ_BOSS_SECONDS)):
            raise RuntimeError("The original Cold Mountain settlement differs")
        return {"activityId": SPLYJ_BOSS_ACTIVITY, "difficulty": self.difficulty, "enemyId": self.boss,
                "assistId": SPLYJ_ASSIST_HERO, "buffIds": list(self.skills), "damage": damage,
                "cleared": cleared, "usedSeconds": used_time, "bossMaxHp": engine.boss_max_hp,
                **self.clock.report("loss")}
