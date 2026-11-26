"""Read literal client mode and team registrations without importing game code."""

import dis
from types import CodeType


CONSTANTS = "com/const.py"
SCENES = "SceneManager.py"
TEAMS = "module/team_types/team_helper.py"
TEAM_BASE = "module/team_types/team_type_base.py"
SCENE_MODULE_PREFIX = "scenemembers/"


def is_route_script(module):
    return module in {CONSTANTS, SCENES, TEAMS} or module.startswith(
        ("module/team_types/team_type_", SCENE_MODULE_PREFIX)
    )


def child(code, name):
    return next((value for value in code.co_consts if isinstance(value, CodeType) and value.co_name == name), None)


def instructions(code):
    return [op for op in dis.get_instructions(code)
            if op.opname not in {"EXTENDED_ARG", "RESUME", "NOP", "PRECALL"}] if code else []


def literal_ids(code):
    ops = instructions(code)
    return {b.argval: a.argval for a, b in zip(ops, ops[1:])
            if a.opname == "LOAD_CONST" and type(a.argval) is int and b.opname == "STORE_NAME"}


def returns_literal(fn):
    ops = instructions(fn)
    if [op.opname for op in ops] == ["LOAD_CONST", "RETURN_VALUE"]:
        return ops[0].argval
    return None


def registered_team_symbols(code):
    ops = instructions(code)
    for index, op in enumerate(ops):
        if op.opname not in {"LOAD_ATTR", "LOAD_METHOD"} or op.argval != "team_type":
            continue
        symbols = []
        following = index + 1
        while [step.opname for step in ops[following:following + 3]] == ["LOAD_NAME", "LOAD_ATTR", "LOAD_ATTR"]:
            base, namespace, value = ops[following:following + 3]
            if (base.argval, namespace.argval) != ("const", "team_battle_type"):
                break
            symbols.append(value.argval)
            following += 3
        if symbols and following < len(ops) and ops[following].opname == "CALL" and ops[following].arg == len(symbols):
            yield from symbols


def initial_scene_routes(code, modes):
    ops = instructions(child(child(code, "SceneManager"), "_initMapSrc"))
    cut = next(i for i, op in enumerate(ops) if op.opname == "STORE_ATTR" and op.argval == "map_src")
    rows = {}
    for i, op in enumerate(ops[:cut]):
        if op.opname != "LOAD_GLOBAL" or op.argval != "const":
            continue
        entry = ops[i:i+7]
        if ([step.opname for step in entry] != ["LOAD_GLOBAL", "LOAD_ATTR", "LOAD_ATTR", "LOAD_CONST",
                                              "LOAD_CONST", "LOAD_CONST", "BUILD_CONST_KEY_MAP"]
                or entry[1].argval != "BattleMode" or entry[5].argval != ("mapPath", "sceneClass")
                or type(entry[3].argval) is not str or type(entry[4].argval) is not str):
            raise ValueError(f"Unexpected initial scene registration at {op.offset}")
        symbol = entry[2].argval
        if symbol not in modes:
            raise ValueError(f"Unresolved literal battle mode: {symbol}")
        mode = modes[symbol]
        # The original dictionary keeps the last entry for a repeated numeric key.
        rows[mode] = {"battleMode": mode, "mode_symbol": symbol,
                      "map_path": entry[3].argval, "scene_class": entry[4].argval}
    return rows


def bind_scene_engines(rows, modules, decoder):
    by_scene = {}
    for row in rows.values():
        scene = row["scene_class"]
        if scene not in by_scene:
            path = SCENE_MODULE_PREFIX + scene + ".py"
            by_scene[scene] = {}
            if path in modules:
                original, source = modules[path]
                cls = child(decoder.code(original), scene)
                ops = instructions(cls)
                declarations = [value for value, target in zip(ops, ops[1:])
                                if target.argval == "EngineClassName" and target.opname == "STORE_NAME"]
                if len(declarations) == 1:
                    value = declarations[0]
                    guarded = any(op.offset < value.offset < op.argval for op in ops
                                  if op.opcode in dis.hasjrel or op.opcode in dis.hasjabs)
                    if not guarded and value.opname == "LOAD_CONST" and isinstance(value.argval, str) and value.argval.isidentifier():
                        by_scene[scene] = {"scene_engine": value.argval, "scene_module": path,
                                           "scene_marshal_sha256": source["marshalSHA256"]}
        row.update(by_scene[scene])


def team_routes(modules, decoder, modes, team_ids, registry):
    rows = {}
    for op in instructions(registry):
        if op.opname != "IMPORT_FROM" or not op.argval.startswith("team_type_"):
            continue
        path = "module/team_types/" + op.argval + ".py"
        if path not in modules or path == TEAM_BASE:
            continue
        original, source = modules[path]
        code = decoder.code(original)
        cls = child(code, "TeamBattleType")
        mode_ops = instructions(child(cls, "get_battle_mode")) if cls else []
        if ([op.opname for op in mode_ops] != ["LOAD_GLOBAL", "LOAD_ATTR", "LOAD_ATTR", "RETURN_VALUE"]
                or [op.argval for op in mode_ops[:2]] != ["const", "BattleMode"]):
            continue
        symbol = mode_ops[2].argval
        if symbol not in modes:
            continue
        record = {"battleMode": modes[symbol], "mode_symbol": symbol,
                  "route_module": path, "route_sha256": source["marshalSHA256"]}
        scene_ops = instructions(child(cls, "get_sceneClass"))
        if ([op.opname for op in scene_ops] == ["LOAD_CONST", "LOAD_CONST", "LOAD_CONST", "BUILD_CONST_KEY_MAP", "RETURN_VALUE"]
                and scene_ops[2].argval == ("mapPath", "sceneClass") and all(type(op.argval) is str for op in scene_ops[:2])):
            record.update(map_path=scene_ops[0].argval, scene_class=scene_ops[1].argval)
        engine = returns_literal(child(cls, "get_battle_engine_class"))
        if type(engine) is str:
            record["engine_class"] = engine
        for field, method in (("can_single_fight", "can_single_fight"), ("show_left_time", "is_show_left_time"),
                              ("show_wave_count", "is_show_wave_count"), ("show_current_score", "is_show_current_score")):
            value = returns_literal(child(cls, method))
            if type(value) is bool:
                record[field] = value
        for team_symbol in registered_team_symbols(code):
            if team_symbol in team_ids:
                team_id = team_ids[team_symbol]
                rows[team_id] = {**record, "team_type": team_id, "team_symbol": team_symbol}
    return rows


def extract_routes(modules, decoder):
    if not {CONSTANTS, SCENES, TEAMS, TEAM_BASE}.issubset(modules):
        return
    const_code = decoder.code(modules[CONSTANTS][0])
    modes, teams = (literal_ids(child(const_code, name)) for name in ("BattleMode", "team_battle_type"))
    if not modes or not teams:
        raise ValueError("The client battle and team mode constants were not found")
    initial = initial_scene_routes(decoder.code(modules[SCENES][0]), modes)
    bind_scene_engines(initial, modules, decoder)
    registered = team_routes(modules, decoder, modes, teams, decoder.code(modules[TEAMS][0]))
    if not initial or not registered:
        raise ValueError("The client scene and team registries were not found")
    for name, rows, path, dependencies in (("battle_mode_routes", initial, SCENES, [CONSTANTS]),
                                           ("battle_team_routes", registered, TEAMS, [CONSTANTS, TEAM_BASE])):
        source = {**modules[path][1], "inputs": [modules[module][1] for module in dependencies]}
        yield name, rows, source
