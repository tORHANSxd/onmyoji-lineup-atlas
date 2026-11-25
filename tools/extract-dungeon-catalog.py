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


def read_client_tip_table(code):
    """Recover the shipped literal string map without executing the module."""
    stack = []
    for op in dis.get_instructions(code):
        kind = op.opname
        if kind in {"RESUME", "EXTENDED_ARG"}:
            continue
        if kind == "LOAD_CONST" and isinstance(op.argval, str):
            stack.append(op.argval)
        elif kind == "BUILD_MAP":
            count = op.arg * 2
            values = stack[-count:] if count else []
            if len(values) != count or any(type(value) is not str for value in values):
                raise ValueError("Invalid literal tip map")
            if count:
                del stack[-count:]
            stack.append(dict(zip(values[::2], values[1::2])))
        elif kind == "MAP_ADD" and op.arg == 1:
            value, key = stack.pop(), stack.pop()
            if type(key) is not str or type(value) is not str or type(stack[-1]) is not dict:
                raise ValueError("Invalid literal tip entry")
            stack[-1][key] = value
        elif kind == "DICT_UPDATE" and op.arg == 1:
            values = stack.pop()
            if type(values) is not dict or type(stack[-1]) is not dict:
                raise ValueError("Invalid literal tip map update")
            stack[-1].update(values)
        elif kind == "STORE_NAME" and op.argval == "data" and len(stack) == 1 and type(stack[0]) is dict:
            return stack[0]
        else:
            raise ValueError(f"Unexpected tip-table opcode {kind} at {op.offset}")
    raise ValueError("The tip module has no literal data assignment")


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

    client = open_catalog_client(snapshot)
    _, elf_hash = verify_native_library(client, proof)
    patch = (snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    resource_version = re.search(r"^version\s*=\s*([\d.]+)\s*$", patch, re.M)[1]
    decoder = OriginalModules(proof)
    client.prepare("script3")
    index = client.names["script3"]
    digests = sorted({row[8:24].hex() for row in index.rows.values()})
    tables = {}
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
        if not module.startswith("com/data/cdata/") and module != CLIENT_TIP_MODULE:
            continue
        name = module.split("/")[-1].removesuffix(".py")
        if not re.fullmatch(r"[A-Za-z0-9_]+", name) or name in tables:
            raise ValueError(f"Unexpected or duplicate configuration module: {module}")
        origin = evidence["origin"]
        if evidence["source"].startswith("raw/external/cloud_resources/"):
            origin = "cloud"
        source = {key: evidence[key] for key in ("digest", "rawSHA256", "decodedSHA256")}
        source.update(module=module, origin=origin, marshalSHA256=resources.sha256(marshalled))
        entry = tables[name] = {"name": name, "source": source}

        rows = None
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
                read_table = read_client_tip_table if module == CLIENT_TIP_MODULE else read_literal_table
                rows = read_table(decoder.code(code))
            except Exception as error:
                reasons.append(f"{type(error).__name__}: {error}")
        if rows is None:
            entry.update(status="unresolved", reasons=reasons)
            continue
        fields = sorted({key for row in rows.values() if isinstance(row, dict)
                         for key in row if isinstance(key, str)})
        entry.update(status="decoded", storage=storage, rowCount=len(rows), fields=fields)
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
