"""Replay versioned map boss battles with the original player positions."""

MODE = 3000
SEAL_MODE = 855
LBS_MODE = 3001
MODES = (MODE, SEAL_MODE, LBS_MODE)
ENGINE = "battleengine.engine.WorldBossEngine"
LBS_ENGINE = "battleengine.engine.LBSBossEngine"
SOURCE_HASHES = {
    ENGINE: "d11c14d3eb97e361bee50a58ac8666a56f3332b484e851a8dde36a80c7fe53b4",
    LBS_ENGINE: "045487760b52efb8c5f3157471c4cc8d21a3a3cb020fc1e11310cd4f17386a7d",
    "com.data.cdata.map_boss": "d88b6c83b76e7daa399684185869702a2e4e94f179dc58f0c9cb8b718f8e2a2f",
}
KINDS = {
    69: ("stone", "is_Shi_Ju", 44, 23),
    73: ("angryStone", "is_Angry_Shi_Ju", 40055, 9991101),
    70: ("yearBeast", "is_Nian_Shou", 51, 30),
    74: ("yearBeast", "is_Nian_Shou", 51, 30),
    75: ("yearBeast", "is_Nian_Shou", 51, 30),
}
POSITIONS = {2: ((5, 6), (2, 3, 4)), 3: ((3,), (2, 5), (4, 6))}


def party_positions(mode, players):
    if mode == LBS_MODE and players == 1:
        return ((2, 3, 4),)
    return POSITIONS.get(players)


def is_fragment_entry(entry_id, row):
    return row.get("type") == 1 and str(entry_id) not in {"10", "11"}


def entry_for_stage(entries, stage_id, mode=None):
    if mode in (None, MODE):
        for entry_id, (kind, flag, scene, boss) in KINDS.items():
            for stage, level in entries.get(entry_id, {}).get("gk_list", ()):
                if stage == stage_id:
                    return kind, flag, scene, boss, level
    if mode in (None, SEAL_MODE, LBS_MODE):
        for entry_id, row in entries.items():
            kind = "seal" if mode != LBS_MODE and is_fragment_entry(entry_id, row) else (
                "lbs" if mode != SEAL_MODE and row.get("type") == 2 else None)
            if not kind:
                continue
            for stage, level in row.get("gk_list", ()):
                if stage == stage_id:
                    return kind, None, 39, None, level
    return None


class MapBossReplay:
    def __init__(self, modules, stage_id, players, mode):
        from com import const
        from com.data.cdata import map_boss
        from DynamicConfigData import DATA_PVE_STAGE_DATA, BattleMonstersInfo

        sources = (LBS_ENGINE if mode == LBS_MODE else ENGINE, "com.data.cdata.map_boss")
        if any(modules.rows[name]["marshalSHA256"] != SOURCE_HASHES[name] for name in sources):
            raise ValueError("The map boss engine or stage table has changed")
        entry = entry_for_stage(map_boss.data, stage_id, mode)
        self.positions = party_positions(mode, players)
        if entry is None or not self.positions:
            raise ValueError("Map boss replay requires a verified stage and player count")
        self.kind, flag, scene, self.boss_id, self.level = entry
        stage = DATA_PVE_STAGE_DATA.data[str(stage_id)]
        self.group_id = stage["groupid"]
        formation = BattleMonstersInfo.data[self.group_id]
        if self.group_id != stage_id or stage.get("shishentotal") != 5 or formation["resindex"] != scene:
            raise RuntimeError("Original map boss stage and formation disagree")
        waves = formation["MonstersInfos"]
        self.wave_count = len(waves)
        if flag is None:
            if [len(wave) for wave in waves] != [4, 4, 6]:
                raise RuntimeError("Original map boss has an unexpected set of waves")
        elif len(waves) != 1 or waves[0][0][:2] != [1, self.boss_id]:
            raise RuntimeError("Original map boss has an unexpected starting enemy")
        self.expected = [[(pos, proto, level) for pos, proto, level, *_ in wave] for wave in waves]
        self.const = const
        params = {"pve_data_flag": str(stage_id)}
        if flag:
            params[flag] = True
        if mode == LBS_MODE:
            from battleengine.engine.LBSBossEngine import LBSBossEngine

            self.engine = LBSBossEngine(params)
            self.engine.battleMode = const.BattleMode.MODE_LBS_BOSS
        else:
            from battleengine.engine.WorldBossEngine import WorldBossEngine

            self.engine = WorldBossEngine(params)
            self.engine.battleMode = (const.BattleMode.MODE_YAOQI_FB_BATTLE if mode == SEAL_MODE
                                      else const.BattleMode.MODE_WORLD_BOSS)
        if self.engine.battleMode != mode or self.engine.combineSceneInfoId != scene:
            raise RuntimeError("The original map boss initialized another scene")
        if flag:
            self.engine.onCalcRewards = self.observe_rewards
        self.reward_inputs = {}
        self.waves = []
        self.observe_waves()

    def assign_players(self, player, fighters):
        members = list(fighters)
        teams = [{members[pos - 2]: fighters[members[pos - 2]] for pos in slots} for slots in self.positions]
        return [{**player, "id": 1, "heroes": {**teams[0], "selected-onmyoji": player["heroes"]["selected-onmyoji"]}},
                *({"id": i, "yysid": 0, "heroes": team} for i, team in enumerate(teams[1:], 2))]

    def verify_players(self, controllers):
        actual = [(ctrl.ctrlPlayer.hasYYS, tuple(ctrl.ctrlPlayer.ssPosIndexList)) for ctrl in controllers]
        if actual != [(i == 0, positions) for i, positions in enumerate(self.positions)]:
            raise RuntimeError("The original map boss selected different team positions")

    def verify_selection(self, controllers):
        selected = {"selected-onmyoji": (controllers[0], 1)}
        for controller, positions in zip(controllers, self.positions):
            selected.update((uid, (controller, position))
                            for uid, position in zip(controller.ctrlPlayer.defaultHeros, positions))
        actual = {}
        for entity in self.engine.heroEntities.values():
            uid = entity.HeroComp.heroData.heroUid
            if uid in selected:
                actual[uid] = entity.ownerController, entity.posIndex
        if actual != selected:
            raise RuntimeError("The original map boss placed the selected lineup differently")

    def observe_waves(self):
        spawn, create = self.engine._createNextRoundMons, self.engine.createMonsterEntity

        def start_wave():
            wave = self.engine.finishedWaveCount
            if wave >= self.wave_count:
                return spawn()
            if wave != len(self.waves):
                raise RuntimeError("The original map boss wave order changed")
            observed = []

            def create_enemy(camp, owner, placement):
                entity = create(camp, owner, placement)
                observed.append((entity.posIndex, entity.protoid, entity.AttrComp.level))
                return entity

            self.engine.createMonsterEntity = create_enemy
            try:
                result = spawn()
            finally:
                self.engine.createMonsterEntity = create
            if observed != self.expected[wave]:
                raise RuntimeError("The original map boss generated a different formation")
            self.waves.append(observed)
            return result

        self.engine._createNextRoundMons = start_wave

    def observe_rewards(self, ratio, *args):
        if self.kind == "angryStone":
            count, player_id = args
        elif self.kind == "yearBeast":
            player_id, count = args
        else:
            player_id, = args
            count = 0
        self.reward_inputs[player_id] = (ratio, count)
        return {}

    def report(self, outcome):
        if not self.waves or outcome == "win" and len(self.waves) != self.wave_count:
            raise RuntimeError("The original map boss did not create enemies")
        if self.wave_count > 1:
            return {"kind": self.kind, "level": self.level, "players": len(self.positions),
                    "positions": self.positions, "waves": self.waves}
        rewards = None
        if outcome == "win":
            if set(self.reward_inputs) != set(range(1, len(self.positions) + 1)) or len(set(self.reward_inputs.values())) != 1:
                raise RuntimeError("The original map boss did not settle identical reward inputs for every teammate")
            ratio, paper_men = next(iter(self.reward_inputs.values()))
            rewards = {"phaseDamageRatio": ratio, "paperManCount": paper_men}
        return {"kind": self.kind, "level": self.level, "bossId": self.boss_id, "players": len(self.positions),
                "positions": self.positions, "opening": self.waves[0], "rewardInputs": rewards}
