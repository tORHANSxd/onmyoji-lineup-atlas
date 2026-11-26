"""Ordinary and extreme Tsuchigumo practice from the original client tables."""

PRACTICE_MODES = (5550, 5551)
PRACTICE_REPLAY_SECONDS = 620


def practice_stage(entry_id, battle_mode):
    from battleengine.engine.TuzhizhuSingleEngine import TuzhizhuSingleEngine, const
    from battleengine.engine.TuzhizhuXSingleEngine import TuzhizhuXSingleEngine
    from DynamicConfigData import DATA_MZB_FENGMO, DATA_PVE_STAGE_DATA, BattleMonstersInfo

    entry = DATA_MZB_FENGMO.data.get(entry_id)
    if not entry:
        raise ValueError("Unknown Tsuchigumo practice entry")
    extreme = entry["skill_id"] > 0
    stage = DATA_PVE_STAGE_DATA.data[str(entry["battle_id"])]
    group = BattleMonstersInfo.data[stage["groupid"]]
    mode = const.BattleMode.MODE_TUZHIZHU_X_SINGLE if extreme else const.BattleMode.MODE_TUZHIZHU_SINGLE
    if (mode != battle_mode or stage["shishentotal"] != 5 or len(group["MonstersInfos"]) != 1
            or group["MonstersInfos"][0][0][1] != entry["boss_id"] or entry["mook_jong_id"] != entry_id):
        raise ValueError("Tsuchigumo practice entry does not match the solo battle")
    engine_class = TuzhizhuXSingleEngine if extreme else TuzhizhuSingleEngine
    engine = engine_class({"pve_data_flag": str(entry["battle_id"]), "battle_info": {"tag": entry["skill_id"]}})
    engine.battleMode = mode
    return engine, entry, group, const


class TsuchigumoPractice:
    def __init__(self, engine, entry, group, const):
        self.engine, self.entry, self.const = engine, entry, const
        self.expected = [(position, id_, level) for position, id_, level, *_ in group["MonstersInfos"][0]]
        self.opening, self.skill_recipients = [], []
        self.started = None
        self.cocoons_spawned = 0
        self.cocoon_ids = set(getattr(engine, "bai_jian_protoid", ()))
        create, spawn = engine.createMonsterEntity, engine._createNextRoundMons

        def observe_spawn():
            created = []

            def observe(camp, owner, placement):
                unit = create(camp, owner, placement)
                created.append(unit)
                return unit

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if not self.opening:
                units = sorted(created, key=lambda unit: unit.posIndex)
                if [(unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in units] != self.expected:
                    raise RuntimeError("Tsuchigumo practice created a different opening formation")
                self.opening = [{
                    "id": unit.protoid, "position": unit.posIndex, "level": unit.AttrComp.level,
                    "hp": unit.AttrComp.hp, "speed": unit.AttrComp.speed, "attack": unit.AttrComp.attack,
                    "defense": unit.AttrComp.defense, "critRate": unit.AttrComp.critRate,
                } for unit in units]
            return result

        engine._createNextRoundMons = observe_spawn

    def created(self, entity):
        if entity.camp == self.const.CampFlag.CAMP2 and entity.protoid in self.cocoon_ids:
            self.cocoons_spawned += 1

    def check_selected(self, entity):
        skill_id = self.entry["skill_id"]
        if skill_id:
            if self.engine.playerSkill != skill_id or not entity.SkillMgrComp.getSkillById(skill_id):
                raise RuntimeError("The original Tsuchigumo practice trait was not applied to the selected character")
            self.skill_recipients.append(entity.protoid)

    def update(self):
        if self.started is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = self.engine.now_time()

    def report(self, outcome):
        engine, const = self.engine, self.const
        alive = engine.getEntities(const.CampFlag.CAMP2, [const.EntityTypeFlag.MONSTER], const.CombatState.ALIVE)
        key_parts = sorted(engine.keyParts)
        remaining = sorted({unit.protoid for unit in alive if unit.protoid in key_parts})
        if (self.started is None or not self.opening or key_parts != sorted(unit["id"] for unit in self.opening)
                or bool(remaining) == engine.checkAllKeyPartDead() or outcome == "win" and remaining):
            raise RuntimeError("Tsuchigumo practice did not return the original key-part result")
        if self.entry["skill_id"] and len(self.skill_recipients) != 6:
            raise RuntimeError("Tsuchigumo practice did not confirm the trait on the six selected characters")
        return {"trait": self.entry["skill_id"], "traitRecipients": self.skill_recipients,
                "configuredSeconds": engine.battle_config["halt_time"], "timedOut": engine.isHaltBattle,
                "combatSeconds": round(engine.now_time() - self.started, 6), "damage": engine.get_my_total_damage(),
                "opening": self.opening, "partsRemaining": remaining,
                "cocoonsSpawned": self.cocoons_spawned, "cocoonsDefeated": getattr(engine, "baijianDieCnt", 0)}
