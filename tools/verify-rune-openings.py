"""Extract opening panels for the original 八岐大蛇 encounter configurations."""

import argparse
import builtins
import faulthandler
import json
from math import isfinite
import os
from pathlib import Path
import re
from runpy import run_path
import sys
from tempfile import TemporaryDirectory
from types import ModuleType


def extract(runtime, work):
    from game_resources import Bindict, decode_module, sha256
    from original_battle import RuntimeModules, no_transport
    from original_host import Host

    catalog = run_path(str(Path(__file__).with_name("extract-dungeon-catalog.py")))
    client = catalog["open_catalog_client"](Path(runtime["snapshot"]))
    proof = Path(runtime["opcodeProof"])
    library, native_hash = catalog["verify_native_library"](client, proof)
    patch = (client.snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    version = re.search(r"^version\s*=\s*([\d.]+)\s*$", patch, re.M)[1]
    script_bytes = Path(runtime["scriptIndex"]).read_bytes()
    index = json.loads(script_bytes)
    if version != "0.0.816" or index.get("resourceVersion", version) != version or index.get("nativeSHA256", native_hash) != native_hash:
        raise ValueError("Opening verification requires matching 0.0.816 client resources")

    class ActiveModules(RuntimeModules):
        def __init__(self):
            super().__init__(proof, work)
            self.rows.clear()
            self.packages.clear()
            self.ambiguous.clear()
            for row in index["modules"]:
                raw = row["module"].replace("\\", "/").removesuffix(".py").removeprefix("lib3/")
                name = raw.removesuffix("/__init__").replace("/", ".")
                if name in self.rows:
                    self.ambiguous[name] = (self.rows[name], row)
                else:
                    self.rows[name] = row
                    if raw.endswith("/__init__"):
                        self.packages.add(name)

        def load(self, name):
            if name in self.ambiguous:
                raise ValueError("Ambiguous original module: " + name)
            row = self.rows[name]
            raw, _ = client.by_digest("script3", row["digest"])
            code, marshalled = decode_module(raw)
            if sha256(marshalled) != row["marshalSHA256"]:
                raise ValueError("Script differs from the indexed resource: " + name)
            return self.code(code)

    modules = ActiveModules()
    models = work / "src/model_info"
    models.mkdir(parents=True)

    def open_model(file, *args, **kwargs):
        if isinstance(file, (str, Path)):
            path = Path(file).resolve()
            if path.parent == models and re.fullmatch(r"model_[\w]+\.json", path.name) and not path.exists():
                payload, _ = client.resource("model_info", path.name)
                path.write_bytes(payload)
        return builtins.open(file, *args, **kwargs)

    modules.game_builtins["open"] = open_model
    host = Host(library)
    host.install()

    def table_key(key):
        return tuple(table_key(value) for value in key) if isinstance(key, list) else key

    class DecodedClientTable(dict):
        def has_key(self, key):
            return self.__contains__(key)

        def __getitem__(self, key):
            return super().__getitem__(table_key(key))

        def __contains__(self, key):
            return super().__contains__(table_key(key))

        def get(self, key, default=None):
            return super().get(table_key(key), default)

    def decode_table(blob):
        table = Bindict(blob).decode()
        if not isinstance(table, dict):
            raise ValueError("Expected a dictionary client table")
        return DecodedClientTable(table)

    sys.modules["bindict"].bindict = decode_table
    environment = ModuleType("Globals")
    environment.debugMode = False
    environment.component = "server"
    sys.modules["Globals"] = environment
    for name in ("distserver", "distserver.game"):
        package = ModuleType(name)
        package.__path__ = []
        sys.modules[name] = package
    repository = ModuleType("distserver.game.GameServerRepo")
    repository.game_service = None

    class ErrorObserver:
        def on_traceback(self, *unused, **kwargs):
            raise RuntimeError("The original engine reported an internal error")

    repository.game_event_callback = ErrorObserver()
    sys.modules[repository.__name__] = repository
    sys.meta_path.insert(0, modules)
    sys.addaudithook(no_transport)

    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.Hun13Engine import Hun13Engine
    from battleengine.engine.RuneFbEngine import DATA_RUNE_FB, RuneFbEngine, const

    def read_floor(floor, config):
        if floor == 103:
            engine = Hun13Engine({"dungeon_id": floor, "mode": "normal", "is_solo": True})
            engine.battleMode = const.BattleMode.MODE_HUN_13
        else:
            engine = RuneFbEngine({"fbId": floor})
            engine.battleMode = const.BattleMode.MODE_RUNE_FB
        engine.engineLocation = const.BattleLocation.LOCAL_SERVER
        engine.seed = 0
        avatar = BattleAvatar()
        actor = {"heroId": 10, "heroUid": "opening-qingming", "level": 60, "attr": [0] * 8, "suit": []}
        avatar.init_from_dict({"heroes_gamble": {actor["heroUid"]: actor}, "yysid": actor["heroId"]})
        controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
        controller.battleEngine = engine
        engine.controllers.append(controller)
        engine.addBattlePlayer(avatar)
        engine.init()
        configured = config["monsterWaves"]
        if engine.monsterWaveCount != (2 if floor == 103 else len(configured)):
            raise ValueError(f"Unexpected wave count for dungeon {floor}")

        create = engine.createMonsterEntity
        created, waves = [], []

        def observe(camp, owner, placement):
            entity = create(camp, owner, placement)
            created.append((placement.Index, placement.level, entity))
            return entity

        engine.createMonsterEntity = observe
        for index_in_floor, wave in enumerate(configured[:engine.monsterWaveCount]):
            created.clear()
            engine._finishedWaveCount = index_in_floor
            engine._createNextRoundMons()
            expected = [(pos, monster[1], monster[0]) for pos, monster in enumerate(wave, 1) if monster]
            if [(pos, level, entity.protoid) for pos, level, entity in created] != expected:
                raise ValueError(f"Unexpected native placements for dungeon {floor}, wave {index_in_floor + 1}")
            panels = []
            for pos, level, entity in created:
                stats = entity.AttrComp
                values = (stats.hp, stats.speed, stats.attack, stats.defense)
                if not all(type(value) in (int, float) and isfinite(value) and value >= 0 for value in values):
                    raise ValueError(f"Invalid panel for dungeon {floor}, wave {index_in_floor + 1}")
                panels.append({"id": entity.protoid, "position": pos, "level": level,
                               **dict(zip(("hp", "speed", "attack", "defense"), values))})
            waves.append(panels)
        result = {"scene": engine.combineSceneInfoId, "engine": type(engine).__name__, "battleMode": engine.battleMode,
                  "allyOrbs": engine.campData1.shareGuiHuo, "enemyOrbs": engine.campData2.initGuihuo, "waves": waves}
        if isinstance(engine, Hun13Engine):
            result["baseRoundSeconds"] = engine.get_totaltime()
        return result

    configs = DATA_RUNE_FB.data
    floors = {floor: read_floor(floor, configs[floor]) for floor in sorted(configs) if configs[floor]["type"] == 1}
    if not floors or host.oracle.unsupported:
        raise RuntimeError(f"Native opening verification incomplete: {host.oracle.unsupported}")
    engines = {name: modules.rows[f"battleengine.engine.{name}"]["marshalSHA256"] for name in ("RuneFbEngine", "Hun13Engine")}
    return {"resourceVersion": version, "nativeSHA256": native_hash, "scriptIndexSHA256": sha256(script_bytes),
            "engineSHA256": engines,
            "dungeonTableSHA256": modules.rows["com.data.cdata.dungeon_rune"]["marshalSHA256"], "floors": floors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime.read_text(encoding="utf-8-sig"))
    output = args.output.resolve()
    sys.path.insert(0, str(Path(runtime["gameTools"]).resolve()))
    faulthandler.dump_traceback_later(100, exit=True)
    with TemporaryDirectory(prefix="yuqi-rune-openings-") as directory:
        previous = Path.cwd()
        work = Path(directory).resolve()
        try:
            os.chdir(work)
            data = extract(runtime, work)
        finally:
            os.chdir(previous)
    js = '(function(root){\n const data = ' + json.dumps(data, indent=2, allow_nan=False) + ';\n'
    js += ' if(typeof module===\'object\'&&module.exports)module.exports=data;else root.AtlasRuneOpenings=data;\n})(globalThis);\n'
    output.write_text(js, encoding="utf-8", newline="\n")
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
