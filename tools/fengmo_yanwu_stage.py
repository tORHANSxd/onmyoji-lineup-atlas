"""Single-player replay of the original Fengmo Yanwu activity engine."""

FENGMO_YANWU_MODE = 8238
FENGMO_YANWU_TEAM = 8237
SOLO_ASSIST = 70


def fengmo_yanwu_stage(stage_id):
    from battleengine.engine.FengMoEquipBattleEngine import FengMoEquipBattleEngine, FengMoType, const
    from com.data.cdata import act_team_battle
    from DynamicConfigData import BattleMonstersInfo, DATA_PVE_STAGE_DATA

    entry = next((row for row in act_team_battle.data.values()
                  if row["team_battle_type"] == FENGMO_YANWU_TEAM and row["battle_id"] == stage_id), None)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id))
    if not entry or not stage:
        raise ValueError("Unknown Fengmo Yanwu activity encounter")
    group = BattleMonstersInfo.data[stage["groupid"]]
    if len(group["MonstersInfos"]) != 1:
        raise ValueError("Expected one configured Fengmo Yanwu opening wave")
    engine = FengMoEquipBattleEngine({"pve_data_flag": str(stage_id), "act_id": entry["act_id"],
                                     "teamUid": "offline-fengmo-yanwu"})
    engine.battleMode = const.BattleMode.MODE_FENGMO_YANWU_BATTLE
    roster = 6 if engine.fengmoType == FengMoType.GUILINGGEJI else stage["shishentotal"]
    return engine, group, roster


class FengmoYanwuReplay:
    """Relay the sole participant's messages through the original group handlers."""

    def __init__(self, engine, group, const):
        self.engine, self.const = engine, const
        self.group_properties = {}
        self.opening, self.assists = [], []
        self.started = None
        engine.team = self
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity
        create_assist = engine._create_one_assist_hero
        expected = [(position, id_, level) for position, id_, level, *_ in group["MonstersInfos"][0] if id_]

        def observe_spawn():
            spawned = []

            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                spawned.append(entity)
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if not self.opening:
                if sorted((unit.posIndex, unit.protoid, unit.AttrComp.level) for unit in spawned) != sorted(expected):
                    raise RuntimeError("Fengmo Yanwu opened with a different enemy formation")
                self.opening = [{
                    "id": entity.protoid, "position": entity.posIndex, "level": entity.AttrComp.level,
                    "hp": entity.AttrComp.hp, "speed": entity.AttrComp.speed, "attack": entity.AttrComp.attack,
                    "defense": entity.AttrComp.defense, "critRate": entity.AttrComp.critRate,
                } for entity in sorted(spawned, key=lambda unit: unit.posIndex)]
            return result

        def observe_assist(assist_id):
            entity = create_assist(assist_id)
            if entity:
                self.assists.append({"configId": assist_id, "heroId": entity.protoid, "position": entity.posIndex})
            return entity

        engine._createNextRoundMons = observe_spawn
        engine._create_one_assist_hero = observe_assist

    def group_get_property(self, _, name, default):
        return self.group_properties.get(name, default)

    def group_set_property(self, _, name, value):
        self.group_properties[name] = value
        if name == "shared_hp":
            self.engine.on_hp_property_changed(value)
        elif hasattr(self.engine, "on_property_changed"):
            self.engine.on_property_changed(name, value)

    def group_forward_msgs(self, _, messages):
        for message in messages:
            self.engine.on_receive_group_messages(message)

    def update(self):
        if self.started is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = self.engine.now_time()

    def report(self, completed):
        engine = self.engine
        if self.started is None or not self.opening:
            raise RuntimeError("Fengmo Yanwu did not start combat")
        damage = engine.get_my_total_damage()
        if type(damage) is not int or damage < 0 or completed and engine.engineUserData.get("my_total_damage") != damage:
            raise RuntimeError("Fengmo Yanwu did not return the original personal settlement")
        duration = engine.haltBattleTime - self.started
        if not 299 <= duration <= 301 or engine.member_num or engine.group_members or engine.assist_hero_list != [SOLO_ASSIST]:
            raise RuntimeError("Fengmo Yanwu ran under different single-player conditions")
        return {"actId": engine.act_id, "deadlineSeconds": 300,
                "combatSeconds": round(engine.now_time() - self.started, 6), "damage": damage,
                "timedOut": engine.isHaltBattle, "opening": self.opening, "assists": self.assists}
