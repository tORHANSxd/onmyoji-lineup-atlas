"""Run a synthetic 神罚 encounter using locally extracted client scripts."""

import argparse
import builtins
import faulthandler
import json
import os
from pathlib import Path
import re
from runpy import run_path
import sys
import time
import types


def run(args):
    from game_resources import Bindict, decode_module, sha256, write_json
    from original_battle import RuntimeModules, no_transport
    from original_host import Host

    catalog = run_path(str(Path(__file__).with_name("extract-dungeon-catalog.py")))
    client = catalog["open_catalog_client"](args.snapshot.resolve())
    library, native_hash = catalog["verify_native_library"](client, args.opcode_proof)
    update = (client.snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    resource_version = re.search(r"^version\s*=\s*([\d.]+)\s*$", update, re.M)[1]
    if resource_version != "0.0.816":
        raise ValueError("This encounter fixture is pinned to resource 0.0.816")
    index = json.loads(args.script_index.read_text(encoding="utf-8"))
    if index.get("nativeSHA256", native_hash) != native_hash or index.get("resourceVersion", resource_version) != resource_version:
        raise ValueError("The script index belongs to another client")

    output = args.output.resolve()
    work = output.parent / (output.stem + "-work")
    models = work / "src/model_info"
    models.mkdir(parents=True, exist_ok=True)
    model_hashes = {}

    class ActiveModules(RuntimeModules):
        def __init__(self):
            super().__init__(args.opcode_proof, work)
            self.rows.clear()
            self.packages.clear()
            self.ambiguous.clear()
            for row in index["modules"]:
                raw_name = row["module"].replace(chr(92), "/").removesuffix(".py").removeprefix("lib3/")
                name = raw_name.removesuffix("/__init__").replace("/", ".")
                if name in self.rows:
                    self.ambiguous[name] = [self.rows[name], row]
                    self.packages.discard(name)
                    continue
                self.rows[name] = row
                if raw_name.endswith("/__init__"):
                    self.packages.add(name)

        def load(self, name):
            if name in self.ambiguous:
                raise ValueError("Ambiguous script name: " + name)
            row = self.rows[name]
            raw, _ = client.by_digest("script3", row["digest"])
            code, marshalled = decode_module(raw)
            if sha256(marshalled) != row["marshalSHA256"]:
                raise ValueError("Script differs from the indexed resource: " + name)
            return self.code(code)

    modules = ActiveModules()

    def open_model(file, *open_args, **kwargs):
        if isinstance(file, (str, Path)):
            path = Path(file).resolve()
            if path.parent == models and re.fullmatch(r"model_[\w]+\.json", path.name) and path.name not in model_hashes:
                payload, source = client.resource("model_info", path.name)
                path.write_bytes(payload)
                model_hashes[path.name] = source["decodedSHA256"]
        return builtins.open(file, *open_args, **kwargs)

    modules.game_builtins["open"] = open_model
    host = Host(library)
    host.install()

    def table_key(key):
        return tuple(table_key(value) for value in key) if isinstance(key, list) else key

    class DecodedClientTable(dict):
        def __getitem__(self, key):
            return super().__getitem__(table_key(key))

        def __contains__(self, key):
            return super().__contains__(table_key(key))

        def get(self, key, default=None):
            return super().get(table_key(key), default)

        def has_key(self, key):
            return key in self

    def client_table(blob):
        data = Bindict(blob).decode()
        if not isinstance(data, dict):
            raise ValueError("Expected a dictionary client table")
        return DecodedClientTable(data)

    # Use the exact resource bytes while adapting static table lookups on Windows.
    sys.modules["bindict"].bindict = client_table
    environment = types.ModuleType("Globals")
    environment.debugMode = False
    environment.component = "server"
    sys.modules["Globals"] = environment
    for name in ("distserver", "distserver.game"):
        package = types.ModuleType(name)
        package.__path__ = []
        sys.modules[name] = package
    repository = types.ModuleType("distserver.game.GameServerRepo")
    repository.game_service = None

    class ErrorObserver:
        def on_traceback(self, *unused, **kwargs):
            raise RuntimeError("The original engine reported an internal error")

    repository.game_event_callback = ErrorObserver()
    sys.modules[repository.__name__] = repository
    sys.modules["distserver.game"].GameServerRepo = repository
    sys.meta_path.insert(0, modules)
    sys.addaudithook(no_transport)
    os.chdir(work)

    from battleengine.BattleCommon import BattleAvatar
    from battleengine.BattleController import LocalBattleController
    from battleengine.engine.RuneFbEngine import RuneFbEngine, const

    def fixture_hero(hero_id, uid, level):
        return {"heroId": hero_id, "heroUid": uid, "level": level, "attr": [0] * 8, "suit": []}

    fighters = {uid: fixture_hero(408, uid, 40) for uid in ("fixture-a", "fixture-a2")}
    actor = fixture_hero(10, "fixture-qingming", 60)
    avatar = BattleAvatar()
    avatar.init_from_dict({"heroes_gamble": {**fighters, "fixture-qingming": actor}, "yysid": 10})
    avatar.defaultHeros = list(fighters)
    engine = RuneFbEngine({"fbId": 102, "seed": 0})
    engine.battleMode = const.BattleMode.MODE_RUNE_FB
    engine.engineLocation = const.BattleLocation.LOCAL_SERVER
    engine.seed = 0
    controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
    controller.battleEngine = engine
    controller.sceneLoaded = True
    engine.addBattlePlayer(avatar)
    engine.controllers.append(controller)
    engine.op_init_flag = True
    engine.init()
    engine.op_init(controller, 10, list(fighters), [])
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    deadline = time.monotonic() + args.timeout
    phases = [engine.battleState]
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if phases[-1] != engine.battleState:
            phases.append(engine.battleState)
        if engine.battleState == const.BattleState.BS_SELETING_HERO and not controller.selectHeroOk:
            engine.op_setAuto(controller, True)
            engine.op_selectHeroOk(controller)
        time.sleep(.02)

    completed = engine.battleState == const.BattleState.BS_OVER
    record = getattr(engine.battleRecorder, "data_list", ())
    replay = "".join(record).encode("utf-8")
    if replay:
        output.with_suffix(".replay.txt").write_bytes(replay)
    names = {value: key for key, value in vars(const.BattleState).items() if key.startswith("BS_")}
    report = {
        "resourceVersion": resource_version, "nativeSHA256": native_hash, "dungeonId": 102,
        "fixture": "synthetic-qingming-zhoushen", "seed": engine.seed,
        "completed": completed, "phases": [names[state] for state in phases],
        "wavesCleared": engine.finishedWaveCount, "bouts": engine._bout_counter,
        "remainingPlayers": len(engine.heroEntities), "remainingEnemies": len(engine.monsterEntities),
        "randomCalls": engine.random_count, "recordLines": len(replay.splitlines()), "recordSHA256": sha256(replay),
        "clientRenderingMeasured": False, "allRandomBranchesVerified": False,
        "staticTableAdapter": "decoded-client-bindict", "modelSHA256": model_hashes,
        "moduleSHA256": {row["module"]: row["marshalSHA256"] for row in modules.trace},
    }
    write_json(output, report)
    print(json.dumps({key: report[key] for key in ("completed", "phases", "wavesCleared", "bouts", "recordLines")}))
    return 0 if completed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--game-tools", type=Path, required=True)
    parser.add_argument("--opcode-proof", type=Path, required=True)
    parser.add_argument("--script-index", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=75)
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    sys.path.insert(0, str(args.game_tools.resolve()))
    args.opcode_proof = args.opcode_proof.resolve()
    faulthandler.dump_traceback_later(args.timeout + 60, exit=True)
    status = run(args)
    sys.stdout.flush()
    sys.stderr.flush()
    # The local emulation bridge can block while releasing its native handles.
    os._exit(status)
