"""Run a 神罚 encounter using locally extracted client scripts."""

import argparse
import builtins
import faulthandler
import json
import math
import os
from pathlib import Path
from random import Random
import re
from runpy import run_path
import struct
import sys
import time
import types


def run(args):
    from game_resources import Bindict, decode_module, sha256, write_json
    from original_battle import RuntimeModules, no_transport
    from original_host import Host
    from rune_replay import monster_waves, project_playback, read_models, sync_windows
    from rune_random import RandomAudit
    from rune_team import battle_spirit, selected_team

    catalog = run_path(str(Path(__file__).with_name("extract-dungeon-catalog.py")))
    client = catalog["open_catalog_client"](args.snapshot.resolve())
    library, native_hash = catalog["verify_native_library"](client, args.opcode_proof)
    update = (client.snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    resource_version = re.search(r"^version\s*=\s*([\d.]+)\s*$", update, re.M)[1]
    if resource_version != "0.0.816":
        raise ValueError("This encounter fixture is pinned to resource 0.0.816")
    script_bytes = args.script_index.read_bytes()
    index = json.loads(script_bytes)
    if index.get("nativeSHA256", native_hash) != native_hash or index.get("resourceVersion", resource_version) != resource_version:
        raise ValueError("The script index belongs to another client")

    output = args.output.resolve()
    team_scope = "synthetic-qingming-zhoushen"
    team = None
    spirit = None
    team_bytes = b""
    suit_bytes = b""
    if args.team:
        if args.suit_index:
            suit_bytes = args.suit_index.read_bytes()
            suits = json.loads(suit_bytes)
        else:
            bundle_path = Path(__file__).resolve().parent.parent / "data/bundle.json"
            suits = json.loads(bundle_path.read_bytes())["suits"]
            suit_bytes = json.dumps(suits, sort_keys=True).encode()
        team_bytes = args.team.read_bytes()
        plan = json.loads(team_bytes)
        team = selected_team(plan, suits)
        spirit = plan.get("spirit")
        team_scope = "selected-inventory"
    random_reference = None
    if args.random_reference:
        random_reference = json.loads(args.random_reference.read_bytes())["randomAudit"]
        if not isinstance(random_reference, dict):
            raise ValueError("Invalid random audit reference")
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
    from unicorn.x86_const import UC_X86_REG_XMM0

    native_api = host.oracle.api

    def host_api(name, arguments):
        if name != "acosf":
            return native_api(name, arguments)
        # The imported SysV function takes and returns a float in XMM0.
        argument = host.oracle.uc.reg_read(UC_X86_REG_XMM0) & 0xffffffff
        value, = struct.unpack("<f", struct.pack("<I", argument))
        angle = math.acos(value) if -1 <= value <= 1 else math.nan
        bits, = struct.unpack("<I", struct.pack("<f", angle))
        host.oracle.uc.reg_write(UC_X86_REG_XMM0, bits)
        return 0

    host.oracle.api = host_api

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
    from battleengine.battle_tools.RandomRecord import RandomRecord
    from battleengine.engine.RuneFbEngine import RuneFbEngine, const

    def fixture_hero(hero_id, uid, level):
        return {"heroId": hero_id, "heroUid": uid, "level": level, "attr": [0] * 8, "suit": []}

    avatar = BattleAvatar()
    auto_skills = {}
    if team:
        from DynamicConfigData import DATA_HERO

        actor, fighters, equipment, auto_skills = team
        if any(hero["heroId"] not in DATA_HERO.data for hero in (actor, *fighters.values())):
            raise ValueError("Unknown hero in this client's resources")
        player = {"heroes": {**fighters, "selected-onmyoji": actor}, "yysid": actor["heroId"]}
        if spirit is not None:
            from AttrCalc import HunlingAttrCalc
            from DynamicConfigData import DATA_HUNLING_ATTR, DATA_HUNLING_BASE, DATA_HUNLING_MARK

            spirit = battle_spirit(spirit, HunlingAttrCalc)
            template = DATA_HUNLING_BASE.data.get(spirit["id"], {})
            if (actor["heroId"] not in template.get("heroIdList", ())
                    or (spirit["id"], spirit["star"]) not in DATA_HUNLING_ATTR.data
                    or any(mark not in DATA_HUNLING_MARK.data for mark in spirit["marks"])):
                raise ValueError("The spirit configuration does not match the battle resources")
            player["hunling_info"] = {spirit["uid"]: spirit}
            player["yys_hunling"] = {str(actor["heroId"]): spirit["uid"]}
        avatar.init_from_dict(player)
        avatar.inventory.update(equipment)
    else:
        fighters = {uid: fixture_hero(408, uid, 40) for uid in ("fixture-a", "fixture-a2")}
        actor = fixture_hero(10, "fixture-qingming", 60)
        avatar.init_from_dict({"heroes_gamble": {**fighters, "fixture-qingming": actor}, "yysid": 10})
    avatar.defaultHeros = list(fighters)
    engine = RuneFbEngine({"fbId": 102})
    variant_rng = engine.random
    random_audit = None
    if args.audit_random:
        if type(variant_rng) is not Random:
            raise ValueError("The random audit needs the verified standard Random generator")
        run_key = sha256(json.dumps([3, resource_version, native_hash, sha256(script_bytes),
                                      sha256(team_bytes), sha256(suit_bytes), args.seed,
                                      args.fixed_step_ms]).encode())
        random_audit = RandomAudit(variant_rng, run_key, random_reference, args.flip_random,
                                   lambda: (engine.battleState == const.BattleState.BS_STARTED,
                                            getattr(engine, "finishedWaveCount", 0) + 1))
    random_record = RandomRecord(random_audit or variant_rng)
    for method in ("seed", "getstate", "setstate"):
        setattr(random_record, method, getattr(variant_rng, method))
    engine._random = random_record
    winner = None
    battle_ended = engine.doBattleEnded

    def observe_end(win_camp):
        nonlocal winner
        battle_ended(win_camp)
        winner = win_camp

    engine.doBattleEnded = observe_end
    entity_models = {}
    create_entity = engine.onEntityCreated

    def observe_created(entity):
        create_entity(entity)
        model = getattr(entity, "modelName", None)
        if isinstance(model, str):
            filename = model.replace(chr(92), "/").replace("/", "_").replace(".gim", ".json")
            uid = str(entity.uid)
            if entity_models.setdefault(uid, filename) != filename:
                entity_models[uid] = None

    engine.onEntityCreated = observe_created
    engine.battleMode = const.BattleMode.MODE_RUNE_FB
    engine.engineLocation = const.BattleLocation.LOCAL_SERVER
    # Rune mode keeps the constructor's seed. Choose it directly for repeatable offline runs.
    engine.seed = args.seed
    controller = LocalBattleController(const.CampFlag.CAMP1, avatar)
    controller.battleEngine = engine
    controller.sceneLoaded = True
    engine.addBattlePlayer(avatar)
    engine.controllers.append(controller)
    engine.op_init_flag = True
    if args.fixed_step_ms is not None:
        init_engine_state = engine.init_engine_state

        def init_record_clock():
            init_engine_state()
            engine.engine_state = const.EngineState.RECORD_MODE

        engine.init_engine_state = init_record_clock
        engine._time = 1000.0
        engine.delta_time = args.fixed_step_ms / 1000
    engine.init()
    if engine.seed != args.seed or engine.random is not random_record:
        raise RuntimeError("The original engine changed the requested random seed or recorder")
    engine.op_init(controller, actor["heroId"], list(fighters), [])
    engine.battleState = const.BattleState.BS_LOADING
    engine.op_sceneLoaded(controller)

    deadline = time.monotonic() + args.timeout
    first_tick_time = engine.now_time()
    ticks = 0
    phases = [engine.battleState]
    selected_settings = []
    equipped_spirit = None
    while engine.battleState != const.BattleState.BS_OVER and time.monotonic() < deadline:
        engine.update()
        ticks += 1
        if host.oracle.unsupported:
            raise RuntimeError("Unsupported native calls: " + ", ".join(host.oracle.unsupported))
        if phases[-1] != engine.battleState:
            phases.append(engine.battleState)
        if engine.battleState == const.BattleState.BS_SELETING_HERO and not controller.selectHeroOk:
            pending = dict(auto_skills)
            for entity in engine.heroEntities.values():
                if entity.ownerController is not controller:
                    continue
                alias = entity.HeroComp.heroData.heroUid
                if alias not in pending:
                    continue
                setting = pending.pop(alias)
                if setting:
                    engine.op_setAutoSkill(controller, entity.uid, setting)
                    if controller.autoSkill.get(entity.uid) != setting:
                        raise RuntimeError("The original engine did not apply the selected automatic skill")
                active_skills = list(entity.SkillMgrComp.skillList)
                actual_equips = [uid for uid in entity.HeroComp.heroData.equips if uid]
                if sorted(actual_equips) != sorted(fighters.get(alias, actor)["equips"]):
                    raise RuntimeError("The original engine changed the selected soul equipment")
                selected_settings.append({"member": alias, "heroId": entity.protoid,
                                          "skills": active_skills, "aiSkill": setting,
                                          "equippedSoulCount": len(actual_equips)})
                if alias == "selected-onmyoji" and spirit:
                    attached = entity.get_hunlingData()
                    if not attached or attached.uuid != spirit["uid"]:
                        raise RuntimeError("The original engine did not equip the selected spirit")
                    equipped_spirit = {"id": attached.id, "star": attached.star, "level": attached.lv,
                                       "shiny": attached.shiny, "attributes": attached.attr,
                                       "skills": attached.skill_list,
                                       "ownerSkillIds": [sid for sid, _ in attached.skill_list if sid in active_skills]}
            if pending:
                raise RuntimeError("The original engine did not create every selected team member")
            engine.op_setAuto(controller, True)
            engine.op_selectHeroOk(controller)
        if args.fixed_step_ms is None:
            time.sleep(.02)

    completed = engine.battleState == const.BattleState.BS_OVER
    record = getattr(engine.battleRecorder, "data_list", ())
    replay = "".join(record).encode("utf-8")
    if replay:
        output.with_suffix(".replay.txt").write_bytes(replay)
    names = {value: key for key, value in vars(const.BattleState).items() if key.startswith("BS_")}
    report = {
        "resourceVersion": resource_version, "nativeSHA256": native_hash, "dungeonId": 102,
        "fixture": team_scope, "seed": engine.seed,
        "completed": completed, "phases": [names[state] for state in phases],
        "outcome": "win" if winner == const.CampFlag.CAMP1 else "loss" if winner == const.CampFlag.CAMP2 else "unknown",
        "selectedSettings": selected_settings,
        "equippedSpirit": equipped_spirit,
        "clock": {"mode": "client-record-step" if args.fixed_step_ms is not None else "host-wall",
                  "stepMs": args.fixed_step_ms, "ticks": ticks,
                  "elapsedEngineSeconds": round(engine.now_time() - first_tick_time, 6)},
        "wavesCleared": engine.finishedWaveCount, "bouts": engine._bout_counter,
        "remainingPlayers": len(engine.heroEntities), "remainingEnemies": len(engine.monsterEntities),
        "randomCalls": len(random_record.history), "engineRandomCounter": engine.random_count,
        "randomTrace": {"scope": "battle-engine-random-instance", "history": random_record.history},
        "recordLines": len(replay.splitlines()), "recordSHA256": sha256(replay),
        "clientRenderingMeasured": False, "allRandomBranchesVerified": False,
        "staticTableAdapter": "decoded-client-bindict", "modelSHA256": model_hashes,
        "entityModels": entity_models,
        "moduleSHA256": {row["module"]: row["marshalSHA256"] for row in modules.trace},
    }
    if random_audit is not None:
        report["randomAudit"] = random_audit.report()
    if replay:
        try:
            report["monsterHealth"] = monster_waves(replay)
        except (KeyError, IndexError, TypeError, ValueError) as error:
            report["monsterHealthError"] = str(error)
        try:
            animation_models = read_models(models, model_hashes)
        except (OSError, ValueError) as error:
            report["animationSyncError"] = report["animationPlaybackError"] = str(error)
        else:
            for name, project in (("animationSync", sync_windows), ("animationPlayback", project_playback)):
                try:
                    report[name] = project(replay, entity_models, animation_models)
                except (KeyError, IndexError, TypeError, ValueError) as error:
                    report[name + "Error"] = str(error)
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
    parser.add_argument("--team", type=Path, help="Explicit selected roster and soul rows (see DUNGEON_CATALOG.md)")
    parser.add_argument("--suit-index", type=Path, help="Override the repository's suit ID to name mapping")
    parser.add_argument("--seed", type=int, default=0, help="Explicit random seed for one offline replay")
    parser.add_argument("--fixed-step-ms", type=int, help="Use the original recording clock with a fixed time step")
    parser.add_argument("--audit-random", action="store_true", help="Record direct comparisons on engine random draws")
    parser.add_argument("--random-reference", type=Path, help="Report from the same seeded replay, including a prior alternate path")
    parser.add_argument("--flip-random", type=int, help="Flip one 1-based random draw after any earlier interventions")
    parser.add_argument("--timeout", type=int, default=75)
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    if not 0 <= args.seed < 2 ** 32:
        parser.error("--seed must be in the 32-bit unsigned range")
    if args.fixed_step_ms is not None and not 1 <= args.fixed_step_ms <= 80:
        parser.error("--fixed-step-ms must be between 1 and 80")
    if args.audit_random and args.fixed_step_ms is None:
        parser.error("--audit-random requires a fixed recording clock")
    if bool(args.random_reference) != (args.flip_random is not None) or args.random_reference and not args.audit_random:
        parser.error("--random-reference and --flip-random require --audit-random and each other")
    sys.path[:0] = [str(Path(__file__).resolve().parent), str(args.game_tools.resolve())]
    args.opcode_proof = args.opcode_proof.resolve()
    faulthandler.dump_traceback_later(args.timeout + 60, exit=True)
    status = run(args)
    sys.stdout.flush()
    sys.stderr.flush()
    # The local emulation bridge can block while releasing its native handles.
    os._exit(status)
