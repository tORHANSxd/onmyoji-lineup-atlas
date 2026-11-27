"""The original phase-one shared-health battle on a 天魔归来 map tile."""

from math import ceil
from asura_boss_stage import asura_spirit_settings

ASURA_DEPTH_MODE = 3341
ASURA_DEPTH_TEAM = 186
ASURA_DEPTH_STAGES = range(602007, 602483)
ASURA_DEPTH_TABLES = ("asura_play_type1", "asura_play_type2")
ASURA_DEPTH_LAYERS = {7080: "八火狱", 7081: "十寒狱", 7040: "无间狱"}


def asura_depth_battle(stage_id, settings):
    from battleengine.engine.AsuraGodEngine import AsuraGodEngine, const
    from DynamicConfigData import BattleMonstersInfo, DATA_ASURA_CONST, DATA_PVE_STAGE_DATA
    from com.data.cdata import asura_map, asura_play_type1, asura_play_type2

    config = next((row for table in (asura_play_type2, asura_play_type1) for row in table.data.values()
                   if row["battle_id"] == stage_id), None)
    stage = DATA_PVE_STAGE_DATA.data.get(str(stage_id), {})
    formation = BattleMonstersInfo.data.get(stage.get("groupid"), {})
    waves = formation.get("MonstersInfos", ())
    if (stage_id not in ASURA_DEPTH_STAGES or not config or stage.get("shishentotal") != 5
            or formation.get("resindex") != 42117 or len(waves) != 1):
        raise ValueError("Unknown Asura depths battle")
    spirit, slots, used_slots = asura_spirit_settings(settings, {"level", "skills", "specialKeys", "cellId", "enemies"})
    cell_id, enemies = settings["cellId"], settings["enemies"]
    if cell_id is not None:
        cell = asura_map.data.get(cell_id, {}) if type(cell_id) is int else {}
        if cell.get("work") != config["id"] or cell.get("activity_id") not in ASURA_DEPTH_LAYERS:
            raise ValueError("The Asura map tile does not select this battle")
    expected = {position: (proto, level) for position, proto, level, *_ in waves[0]}
    maxima = AsuraGodEngine._calcSharedMonMaxHp(stage_id)
    if set(expected) != set(maxima):
        raise RuntimeError("The Asura map battle has different HP positions from its formation")
    prior = {}
    if type(enemies) is not list or not 1 <= len(enemies) <= len(expected):
        raise ValueError("At least one enemy must remain in the Asura map battle")
    for slot in enemies:
        if type(slot) is not list or len(slot) != 2:
            raise ValueError("Invalid prior damage placement")
        position, damage = slot
        if (type(position) is not int or position not in expected or position in prior
                or not isinstance(damage, str) or not 1 <= len(damage) <= 18 or not damage.isascii()
                or not damage.isdecimal() or int(damage) > maxima[position]):
            raise ValueError("Invalid Asura prior damage or enemy position")
        prior[position] = int(damage)
    data = {"battle_info": {**spirit, "pve_data_flag": str(stage_id), "monsters_info": list(prior.items())},
            "cell_id": cell_id}
    engine = AsuraGodEngine(data)
    engine.battleMode = const.BattleMode.MODE_ASURA_CELL
    deadline = DATA_ASURA_CONST.data[13]["value"][0]
    replay = AsuraDepthSettlement(engine, const, config["id"], expected, prior, settings, slots, used_slots, deadline)
    return engine, formation, const, replay


class AsuraDepthSettlement:
    def __init__(self, engine, const, config_id, expected, prior, settings, slots, used_slots, deadline):
        self.engine, self.const = engine, const
        self.config_id, self.settings = config_id, settings
        self.slots, self.used_slots, self.deadline = slots, used_slots, deadline
        self.expected, self.prior = expected, prior
        self.units, self.initial_hp = {}, {}
        self.started, self.settlement = None, None
        spawn, create = engine._createNextRoundMons, engine.createMonsterEntity

        def observe_spawn():
            def observe(camp, owner, placement):
                entity = create(camp, owner, placement)
                position = entity.posIndex
                if position in self.units or self.expected.get(position) != (entity.protoid, placement.level):
                    raise RuntimeError("The original Asura map battle spawned a different enemy")
                self.units[position] = entity
                return entity

            engine.createMonsterEntity = observe
            try:
                result = spawn()
            finally:
                engine.createMonsterEntity = create
            if self.units.keys() != self.prior.keys():
                raise RuntimeError("The original Asura map battle selected different positions")
            for position, unit in self.units.items():
                hp = engine.cur_hp[position]
                if hp <= 0 or hp != unit.AttrComp.maxHp - self.prior[position]:
                    raise ValueError("Invalid starting HP for the Asura map battle")
                self.initial_hp[position] = hp
            return result

        engine._createNextRoundMons = observe_spawn

    def update(self):
        if self.started is None and self.engine.battleState == self.const.BattleState.BS_STARTED:
            self.started = self.engine.now_time()
            if abs(self.engine.timeout_stamp - self.started - self.deadline) > 1:
                raise RuntimeError("The Asura map battle initialized a different duration")

    def sample(self):
        return (self.engine.get_damage(),
                {position: max(0, unit.AttrComp.hp) for position, unit in self.units.items()})

    def on_end(self):
        self.settlement = self.sample()

    def report(self, completed, roster):
        engine = self.engine
        if self.started is None or not self.units:
            raise RuntimeError("The Asura map battle did not start")
        damage, hp = self.settlement if self.settlement is not None else self.sample()
        if completed:
            if self.settlement is None or dict(engine.engineUserData.get("boss_damage", ())) != damage:
                raise RuntimeError("The original Asura map battle did not return the observed damage by position")
            selected = engine.engineUserData.get("SelectedHeroes", {}).get("1", ())
            if sorted(row["heroId"] for row in selected) != sorted(roster):
                raise RuntimeError("The original Asura map battle selected a different lineup")
        enemies = []
        for position in sorted(self.prior):
            proto, level = self.expected[position]
            if position not in damage and hp[position] > 0:
                raise RuntimeError("The original Asura map battle omitted a live enemy from damage scoring")
            enemies.append({"position": position, "id": proto, "level": level, "priorDamage": str(self.prior[position]),
                            "startingHp": str(ceil(self.initial_hp[position])), "remainingHp": str(ceil(hp[position])),
                            "damage": damage.get(position, 0)})
        return {"configId": self.config_id, "cellId": self.settings["cellId"], "deadlineSeconds": self.deadline,
                "combatSeconds": round(engine.now_time() - self.started, 6), "timedOut": bool(engine.is_timeout),
                "cleared": all(value == 0 for value in hp.values()), "damage": sum(damage.values()), "enemies": enemies,
                "omittedPositions": sorted(self.expected.keys() - self.prior.keys()), "usedHeroIds": list(roster),
                "level": self.settings["level"], "skills": self.settings["skills"], "specialKeys": self.settings["specialKeys"],
                "slots": self.slots, "usedSlots": self.used_slots}
