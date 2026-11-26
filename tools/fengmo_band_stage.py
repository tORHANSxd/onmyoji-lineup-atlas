"""Run the original Fengmo Band personal-boss roster."""

FENGMO_BAND_MODE = 5002
FENGMO_BAND_TEAM = 633
FENGMO_BAND_ACTIVITY = 8191
FENGMO_BAND_STAGE_BASE = 501029
FENGMO_BAND_STAGES = range(FENGMO_BAND_STAGE_BASE + 1, FENGMO_BAND_STAGE_BASE + 61)
FENGMO_BAND_DEADLINE = 180
FENGMO_BAND_SCENE = 43006
SOURCES = {
    "module.team_types.team_type_long_che_music_personal": "d0a63b106cb5bbf7f0e284bdccdabc3383ee0693d539a2d0800c4f61db3575a1",
    "battleengine.engine.LongCheMusicBossSingleEngine": "d64c043ec24f0c1d221b1d46c5039e3241a4a839e2153cbc3226cd4f8b88f05d",
    "battleengine.engine.LongCheMusicBossEngine": "043e0453477e1b4e975ec679e4022ef99fe89b4f5bfd504ad2515a01e5344c4c",
    "com.data.cdata.fengmo_band_personal_boss": "797b09eee8a0286d911fb73f953c3d21400d300853b19ff24b914e9fba5571e2",
    "com.data.cdata.fengmo_band_bandskill": "788bbbf73b4f09644ca24f1f1fffb3d5773d0080735567607b6bc9b9cd58cf8a",
    "com.data.cdata.fengmo_band_constant": "a4772187ba0345e0f7a2280bc2e41c68fa78dbc7be21acefbe7b4f3e348e8ef8",
}


class FengmoBandReplay:
    def __init__(self, modules, stage_id):
        from battleengine.engine.LongCheMusicBossSingleEngine import LongCheMusicBossSingleEngine, ONLY_ONE_BUFF, const
        from com.data.cdata import fengmo_band_personal_boss
        from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

        if stage_id not in FENGMO_BAND_STAGES:
            raise ValueError("Unknown Fengmo Band personal boss")
        if any(modules.rows[name]["marshalSHA256"] != digest for name, digest in SOURCES.items()):
            raise ValueError("The original Fengmo Band personal route or tables changed")
        self.boss = fengmo_band_personal_boss.data[stage_id - FENGMO_BAND_STAGE_BASE]
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group = BattleMonstersInfo.data[stage["groupid"]]
        wave, = self.group["MonstersInfos"]
        self.formation = sorted((pos, proto, level) for pos, proto, level, *_ in wave if proto)
        if (self.boss["battleid"] != stage_id or self.group["ID"] != stage_id or stage["shishentotal"] != 5
                or stage["battleTime"] != FENGMO_BAND_DEADLINE or self.group["resindex"] != FENGMO_BAND_SCENE
                or len(self.formation) != 6 or self.formation[0][:2] != (1, self.boss["monster_id"])):
            raise RuntimeError("Unexpected Fengmo Band personal boss formation or time limit")
        self.const = const
        self.started = None
        self.deadline = None
        self.opening = []
        self.enemies = []
        self.actor_only_buff = ONLY_ONE_BUFF
        self.buff_recipients = {}
        self.engine = engine = LongCheMusicBossSingleEngine({
            "pve_data_flag": str(stage_id), "fbUid": "offline-fengmo-band", "teamUid": "local-fengmo-band",
        })
        engine.battleMode = const.BattleMode.MODE_SINGLE_MUSIC_BATTLE
        self.spawn = engine._createNextRoundMons
        engine._createNextRoundMons = self.observe_spawn

    def observe_spawn(self):
        engine, create = self.engine, self.engine.createMonsterEntity
        enemies = []

        def observe(camp, owner, placement):
            unit = create(camp, owner, placement)
            enemies.append(unit)
            return unit

        engine.createMonsterEntity = observe
        try:
            self.spawn()
        finally:
            engine.createMonsterEntity = create
        enemies.sort(key=lambda unit: unit.posIndex)
        if self.opening or [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in enemies] != self.formation:
            raise RuntimeError("The original Fengmo Band personal boss created a different formation")
        self.enemies = enemies
        self.opening = [{"id": unit.protoid, "position": unit.posIndex,
                         "level": unit.AttrComp.level, "hp": unit.AttrComp.hp} for unit in enemies]

    def update(self):
        engine, const = self.engine, self.const
        if self.started is not None or engine.battleState != const.BattleState.BS_STARTED:
            return
        from com.utils import helpers

        self.started, self.deadline = engine.now_time(), engine.haltBattleTime
        allies = [unit for unit in engine.getEntities(camp=const.CampFlag.CAMP1) if unit.ownerController is not None
                  and (helpers.isYYSEntity(unit) or helpers.isSSEntity(unit))]
        if sorted(unit.posIndex for unit in allies) != list(range(1, 7)):
            raise RuntimeError("The original Fengmo Band field had a different roster")
        for camp, units, buffs in (("ally", allies, self.boss["camp1_buff"]), ("enemy", self.enemies, self.boss["camp2_buff"])):
            for buff in buffs:
                expected = [unit.posIndex for unit in units if
                            (camp == "ally" and (buff != self.actor_only_buff or helpers.isYYSEntity(unit)))
                            or (camp == "enemy" and unit.posIndex == 1)]
                positions = sorted(unit.posIndex for unit in units if unit.BuffMgrComp.getBuffCount(buff) > 0)
                if not positions or positions != sorted(expected):
                    raise RuntimeError(f"The original Fengmo Band buff {buff} had different recipients")
                self.buff_recipients[str(buff)] = positions

    def report(self):
        engine = self.engine
        if (self.started is None or not self.opening or not engine.boss_entity
                or engine.boss_entity.protoid not in engine.boss_id_lists
                or tuple(engine.camp1Buff) != tuple(self.boss["camp1_buff"])
                or tuple(engine.camp2Buff) != tuple(self.boss["camp2_buff"])
                or engine.res_time != FENGMO_BAND_DEADLINE
                or abs(self.deadline - self.started - FENGMO_BAND_DEADLINE) > 1
                or type(engine.myTotalDmg) is not int or engine.myTotalDmg != -sum(engine.hpChangedCache.values())
                or engine.myTotalDmg < 0):
            raise RuntimeError("The original Fengmo Band personal battle used different conditions")
        return {"bossId": self.boss["id"], "monsterId": self.opening[0]["id"],
                "deadlineSeconds": FENGMO_BAND_DEADLINE, "damage": engine.myTotalDmg,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": bool(engine.isHaltBattle),
                "allyBuffs": list(engine.camp1Buff), "enemyBuffs": list(engine.camp2Buff),
                "buffRecipients": self.buff_recipients, "opening": self.opening,
                "enemiesRemaining": sum(unit.AttrComp.hp > 0 for unit in self.enemies)}
