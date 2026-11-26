"""Extract static client tables using the local game-resource analysis tools."""

import argparse
from collections import Counter
import dis
import hashlib
import json
from pathlib import Path
import re
import sys

CLIENT_TIP_MODULE = "com/data/pdata/tipsInfoData_cn.py"
CLIENT_APPEARANCE_MODULE = "com/data/cdata/deco_skin_index.py"
CLIENT_BACKGROUND_MODULE = "com/data/cdata/skin_bg_index.py"
SUPPORT_MODULES = {
    "com/data/cdata/__init__.py": "01d801c0b683c70d3a09baeea0df3e420429dcb6aeeb6cf8ea68d7a5a33a6b5c",
    "com/data/cdata/bindict_proxy.py": "0049904a596b9b8a1e50dbd3b1043f66a162fe6297ff40f0f3a7f2ccb9f1f9a9",
}


def read_plain_tables(code, names):
    """Recover named literal dictionaries without executing client code."""
    stack, tables = [], {}

    def take(count):
        if count > len(stack):
            raise ValueError("Invalid literal table stack")
        if not count:
            return []
        values = stack[-count:]
        del stack[-count:]
        return values

    for op in dis.get_instructions(code):
        kind = op.opname
        if kind in {"RESUME", "EXTENDED_ARG"}:
            continue
        if kind == "LOAD_CONST" and type(op.argval) in {str, int, bool, float, tuple, type(None)}:
            stack.append(op.argval)
        elif kind == "BUILD_MAP":
            values = take(op.arg * 2)
            stack.append(dict(zip(values[::2], values[1::2])))
        elif kind == "BUILD_CONST_KEY_MAP":
            keys, = take(1)
            if type(keys) is not tuple or len(keys) != op.arg:
                raise ValueError("Invalid literal table keys")
            stack.append(dict(zip(keys, take(op.arg))))
        elif kind == "MAP_ADD" and op.arg == 1:
            target, key, value = take(3)
            if type(target) is not dict:
                raise ValueError("Invalid literal table entry")
            target[key] = value
            stack.append(target)
        elif kind == "DICT_UPDATE" and op.arg == 1:
            target, values = take(2)
            if type(target) is not dict or type(values) is not dict:
                raise ValueError("Invalid literal table update")
            target.update(values)
            stack.append(target)
        elif kind == "LOAD_NAME" and op.argval in tables:
            stack.append(tables[op.argval])
        elif kind == "STORE_NAME" and op.argval in names and op.argval not in tables and len(stack) == 1 and type(stack[0]) is dict:
            tables[op.argval] = stack.pop()
        elif kind == "RETURN_VALUE" and stack == [None] and tables.keys() == names:
            return tables
        else:
            raise ValueError(f"Unexpected literal table opcode {kind} at {op.offset}")
    raise ValueError("The module is missing a literal table assignment")


def store_table(resources, output, entry, rows, storage):
    fields = sorted({key for row in rows.values() if isinstance(row, dict)
                     for key in row if isinstance(key, str)})
    entry.update(status="decoded", storage=storage, rowCount=len(rows), fields=fields)
    resources.write_json(output / f"{entry['name']}.json", {**entry, "rows": resources.portable(rows)})


def open_catalog_client(snapshot):
    import game_resources as resources

    class CatalogClient(resources.Client):
        def prepare(self, group):
            if group in self.indices:
                return
            folders = (self.assets / "res", self.cloud / "res", self.cloud)
            self.indices[group] = {row["digest"]: row for folder in folders
                                   if (folder / f"{group}.idx").is_file()
                                   for row in resources.entries(folder, group)}
            extra = self.snapshot / "raw/extra"
            self.names[group] = resources.ResourceNames(extra / "thd" / f"{group}.thx")
            archive = extra / f"{group}.zip"
            self.archives[group] = resources.zipfile.ZipFile(archive) if archive.is_file() else None

    client = CatalogClient(snapshot)
    client.cloud = snapshot / "raw/external/cloud_resources"
    return client


def verify_native_library(client, proof):
    library = client.assets.parent / "lib/x86_64/libclient.so"
    with library.open("rb") as stream:
        elf_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    native_evidence = json.loads((proof / "native-evidence.json").read_text(encoding="utf-8"))
    if elf_hash != native_evidence["elfSHA256"]:
        raise ValueError("The opcode proof belongs to a different native library")
    return library, elf_hash


def extract(snapshot, proof, apk_version, output, battle_index=None, script_index=None):
    import game_resources as resources
    from literal_tables import read_literal_table
    from original_modules import OriginalModules
    from dungeon_battle_routes import extract_routes, is_route_script

    client = open_catalog_client(snapshot)
    _, elf_hash = verify_native_library(client, proof)
    patch = (snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    resource_version = re.search(r"^version\s*=\s*([\d.]+)\s*$", patch, re.M)[1]
    decoder = OriginalModules(proof)
    client.prepare("script3")
    index = client.names["script3"]
    digests = sorted({row[8:24].hex() for row in index.rows.values()})
    tables = {}
    route_modules = {}
    failures = []
    battle_modules = 0
    battle_evidence = []
    script_evidence = []
    output.mkdir(parents=True, exist_ok=True)
    for digest in digests:
        try:
            payload, evidence = client.by_digest("script3", digest)
            code, marshalled = resources.decode_module(payload)
        except Exception as error:
            failures.append({"digest": digest, "error": str(error)})
            continue
        module = code.co_filename.replace(chr(92), "/")
        if script_index is not None:
            script_evidence.append({"module": module, "digest": digest, "marshalSHA256": resources.sha256(marshalled)})
        if module.startswith("battleengine/"):
            battle_modules += 1
            if battle_index is not None:
                battle_evidence.append({
                    **{key: evidence[key] for key in ("digest", "origin", "source", "offset", "rawSHA256", "decodedSHA256")},
                    "module": module, "marshalSHA256": resources.sha256(marshalled),
                })
        routing = is_route_script(module)
        if not routing and not module.startswith("com/data/cdata/") and module != CLIENT_TIP_MODULE:
            continue
        origin = evidence["origin"]
        if evidence["source"].startswith("raw/external/cloud_resources/"):
            origin = "cloud"
        source = {key: evidence[key] for key in ("digest", "rawSHA256", "decodedSHA256")}
        source.update(module=module, origin=origin, marshalSHA256=resources.sha256(marshalled))
        if routing:
            route_modules[module] = (code, source)
            continue
        name = module.split("/")[-1].removesuffix(".py")
        if not re.fullmatch(r"[A-Za-z0-9_]+", name) or name in tables:
            raise ValueError(f"Unexpected or duplicate configuration module: {module}")
        entry = tables[name] = {"name": name, "source": source}
        if SUPPORT_MODULES.get(module) == source["marshalSHA256"]:
            entry.update(status="support")
            continue

        rows = None
        extra_rows = None
        reasons = []
        storage = "bindict"
        for blob in sorted((v for v in code.co_consts if isinstance(v, bytes)), key=len, reverse=True):
            try:
                candidate = resources.Bindict(blob).decode()
                if isinstance(candidate, dict):
                    rows = candidate
                    break
            except Exception as error:
                reasons.append(str(error))
        if rows is None:
            storage = "literal"
            try:
                original = decoder.code(code)
                if module in (CLIENT_TIP_MODULE, CLIENT_BACKGROUND_MODULE, CLIENT_APPEARANCE_MODULE):
                    names = {"data", "hero_skin", "goren_skin"} if module == CLIENT_APPEARANCE_MODULE else {"data"}
                    exports = read_plain_tables(original, names)
                    if module == CLIENT_TIP_MODULE and any(type(key) is not str or type(value) is not str
                                                            for key, value in exports["data"].items()):
                        raise ValueError("Invalid literal tip map")
                    if module == CLIENT_APPEARANCE_MODULE:
                        if exports["data"] is not exports["hero_skin"]:
                            raise ValueError("Unexpected default appearance table")
                        extra_rows = exports["goren_skin"]
                    rows = exports["data"]
                else:
                    rows = read_literal_table(original)
            except Exception as error:
                reasons.append(f"{type(error).__name__}: {error}")
        if rows is None:
            entry.update(status="unresolved", reasons=reasons)
            continue
        store_table(resources, output, entry, rows, storage)
        if extra_rows is not None:
            extra_name = name + "_goren_skin"
            if extra_name in tables:
                raise ValueError(f"Duplicate client table: {extra_name}")
            extra = tables[extra_name] = {"name": extra_name, "source": {**source, "export": "goren_skin"}}
            store_table(resources, output, extra, extra_rows, storage)

    for name, rows, source in extract_routes(route_modules, decoder):
        entry = tables[name] = {"name": name, "source": source, "status": "decoded", "storage": "literal-routes",
                                "rowCount": len(rows), "fields": sorted({field for row in rows.values() for field in row})}
        resources.write_json(output / f"{name}.json", {**entry, "rows": resources.portable(rows)})

    counts = dict(Counter(row["status"] for row in tables.values()))
    resources.write_json(output / "index.json", {
        "apkVersion": apk_version, "resourceVersion": resource_version, "nativeSHA256": elf_hash,
        "counts": counts, "tables": [tables[name] for name in sorted(tables)],
        "scriptModules": len(digests) - len(failures), "battleModules": battle_modules,
        "unresolvedScripts": failures,
    })
    if battle_index is not None:
        resources.write_json(battle_index, {
            "apkVersion": apk_version, "resourceVersion": resource_version, "nativeSHA256": elf_hash,
            "battleModules": battle_modules, "scriptModules": len(digests) - len(failures),
            "unresolvedScripts": failures,
            "modules": sorted(battle_evidence, key=lambda row: (row["module"], row["digest"])),
        })
    if script_index is not None:
        resources.write_json(script_index, {
            "resourceVersion": resource_version, "nativeSHA256": elf_hash,
            "modules": script_evidence, "failures": failures,
        })
    print(f"{counts}, {battle_modules} battle modules, {len(failures)} unreadable script resources")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--game-tools", type=Path, required=True)
    parser.add_argument("--opcode-proof", type=Path, required=True)
    parser.add_argument("--apk-version", required=True)
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--battle-index", type=Path)
    parser.add_argument("--script-index", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_dungeon_catalog import build

    sys.path.insert(0, str(args.game_tools.resolve()))
    extract(args.snapshot.resolve(), args.opcode_proof.resolve(), args.apk_version, args.tables.resolve(),
            args.battle_index, args.script_index)
    build(args.tables, args.output)
