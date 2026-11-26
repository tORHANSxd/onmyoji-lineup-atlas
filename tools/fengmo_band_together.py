"""Headless adapter for the client's Fengmo Band co-op practice."""

from math import isfinite


BAND_TOGETHER_MODE = 5001
BAND_TOGETHER_TEAM = 634
BAND_TOGETHER_STAGES = (510003, 510004)
BAND_ONLINE_STAGES = (510001, 510002)
BAND_TOGETHER_WALL_SECONDS = 180
BAND_TOGETHER_SCENES = (43004, 43005)
BAND_TOGETHER_MONSTERS = (5100014, 5100015)
SOURCES = {
    "battleengine.engine.LongCheMusicBossEngine": "043e0453477e1b4e975ec679e4022ef99fe89b4f5bfd504ad2515a01e5344c4c",
    "module.team_types.team_type_long_che_music": "032489bcde87c8cfebb08afb85f27bf8114dcb3d343d2169a3b83b4d3ed541bd",
    "module.fengmo_band.FMBLogic": "17978f70c6b23fa50566b766d5fda04b3ba06ce379e508749b426a95e4155fd9",
    "scenemembers.LongCheMusicBossScene": "1946cc3f925f53e78cfde2b9e22ce32d116d8482f833b3ed819e91ea8a7920d2",
    "com.data.cdata.fengmo_band_together_battle": "ce4b3bc2f7441378ca87feb594f88c7b623a06e042e975bf8a486dc435f437ea",
    "com.data.cdata.fengmo_band_constant": "a4772187ba0345e0f7a2280bc2e41c68fa78dbc7be21acefbe7b4f3e348e8ef8",
}


class BandTogetherReplay:
    def __init__(self, modules, stage_id, rhythm_score, prior_damage, prior_buff):
        from battleengine.engine.LongCheMusicBossEngine import BattleStage, LongCheMusicBossEngine, const
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise ValueError("The original Fengmo Band practice route changed")
        match = BAND_TOGETHER_STAGES.index(stage_id)
        self.first = match == 0
        self.const, self.stages = const, BattleStage
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        wave, = self.group["MonstersInfos"]
        boss, = wave
        self.monster_id = BAND_TOGETHER_MONSTERS[match]
        if (self.group["ID"] != stage_id or self.group["resindex"] != BAND_TOGETHER_SCENES[match]
                or tuple(boss[:3]) != (1, self.monster_id, 40) or stage["shishentotal"] != 5):
            raise ValueError("Unexpected original Fengmo Band practice formation")
        self.rhythm_score, self.prior_damage, self.prior_buff = rhythm_score, prior_damage, prior_buff
        self.opening_hp = self.started = self.music_start = self.music_end = None
        self.clock_start = None
        self.past_window = False
        self.engine = LongCheMusicBossEngine({
            "local": True, "stage": BattleStage.Stage1 if self.first else BattleStage.Stage3,
            "fbUid": "25001", "fbId": 1, "guildUid": "1", "teamUid": "1", "pve_data_flag": str(stage_id),
            "player_skill": 1, "pre_damage": prior_damage, "buff_level": prior_buff,
        })
        self.engine.battleMode = const.BattleMode.MODE_LONGCHE_MUSIC_BATTLE

    def bind_clock(self):
        engine = self.engine
        self.clock_start = engine.now_time()
        # The client constructor takes its timestamps before record mode switches the clock.
        engine.stage_begin_time = engine.battleStartTime = self.clock_start
        engine.musicGameMsg["battleStartTime"] = self.clock_start
        engine.res_time = engine._getResTime()

    def update(self, controller):
        engine, stages = self.engine, self.stages
        now = engine.now_time()
        if self.started is None and engine.battleState == self.const.BattleState.BS_STARTED:
            boss = engine.boss_entity
            if (not boss or (boss.posIndex, boss.protoid, boss.AttrComp.level) != (1, self.monster_id, 40)
                    or engine.team is not None or engine.myTotalDmg != self.prior_damage
                    or engine.buff_level != self.prior_buff):
                raise RuntimeError("The original Fengmo Band practice started under different conditions")
            self.started, self.opening_hp = now, boss.AttrComp.hp
        if engine.isInMusicGame and self.music_start is None:
            if engine.stage != (stages.Stage2 if self.first else stages.Stage4):
                raise RuntimeError("Unexpected original practice rhythm phase")
            self.music_start = engine.musicGameMsg["musicGameStartTime"]
            engine.op_uploadMusicGameScore(controller, self.rhythm_score)
        if self.music_start is not None and self.music_end is None:
            if engine.isInMusicGame and now + 1e-6 >= self.music_start + engine.musicGameTime:
                engine.halt_music_game(engine)
            if not engine.isInMusicGame:
                self.music_end = now
                if self.first:
                    return True
                engine.handle_init_battle_info_msg({"data": {"boss_stage": stages.Stage5, "local": True, "time": now}})
        if not self.first and self.music_end is not None and now > self.music_end + engine.secondStageFinalTime:
            if not self.past_window:
                self.past_window = True
                engine.handle_battle_end_msg({"data": {"result": "run"}})
        return False

    def report(self, completed):
        engine = self.engine
        damage = engine.myTotalDmg
        if self.started is None or not engine.boss_entity:
            raise RuntimeError("The original Fengmo Band practice did not start")
        boss_hp, now = engine.boss_entity.AttrComp.hp, engine.now_time()
        if (type(damage) is not int or damage < self.prior_damage
                or not isfinite(boss_hp) or not 0 <= boss_hp <= self.opening_hp
                or not 0 <= engine.buff_level <= 6
                or self.music_start is not None and engine.score != self.rhythm_score
                or not self.first and self.music_end is not None and not engine.isInitStage):
            raise RuntimeError("The original Fengmo Band practice did not produce a verifiable phase report")
        rhythm_seconds = 0 if self.music_start is None else (self.music_end or now) - self.music_start
        before_rhythm = (self.music_start or now) - self.started
        after_rhythm = 0 if self.first or self.music_end is None else now - self.music_end
        return {"monsterId": self.monster_id, "openingHp": self.opening_hp, "remainingHp": boss_hp,
                "priorDamage": self.prior_damage, "damage": damage, "priorBuffLevel": self.prior_buff,
                "buffLevel": engine.buff_level, "rhythmScore": self.rhythm_score if self.music_start is not None else None,
                "rhythmSeconds": round(rhythm_seconds, 6), "beforeRhythmSeconds": round(before_rhythm, 6),
                "afterRhythmSeconds": round(after_rhythm, 6),
                "timedOut": bool(completed and self.past_window)}
