"""Extract static client tables using the local game-resource analysis tools."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

def extract(snapshot, proof, apk_version, output):
    import game_resources as resources
    from literal_tables import read_literal_table
    from original_modules import OriginalModules

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
    library = client.assets.parent / "lib/x86_64/libclient.so"
    with library.open("rb") as stream:
        elf_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    native_evidence = json.loads((proof / "native-evidence.json").read_text(encoding="utf-8"))
    if elf_hash != native_evidence["elfSHA256"]:
        raise ValueError("The opcode proof belongs to a different native library")
    patch = (snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    resource_version = re.search(r"^version\s*=\s*([\d.]+)\s*$", patch, re.M)[1]
    decoder = OriginalModules(proof)
    client.prepare("script3")
    index = client.names["script3"]
    digests = sorted({row[8:24].hex() for row in index.rows.values()})
    tables = {}
    failures = []
    battle_modules = 0
    output.mkdir(parents=True, exist_ok=True)
    for digest in digests:
        try:
            payload, evidence = client.by_digest("script3", digest)
            code, marshalled = resources.decode_module(payload)
        except Exception as error:
            failures.append({"digest": digest, "error": str(error)})
            continue
        module = code.co_filename.replace(chr(92), "/")
        if module.startswith("battleengine/"):
            battle_modules += 1
        if not module.startswith("com/data/cdata/"):
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
                rows = read_literal_table(decoder.code(code))
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
    print(f"{counts}, {battle_modules} battle modules, {len(failures)} unreadable script resources")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--game-tools", type=Path, required=True)
    parser.add_argument("--opcode-proof", type=Path, required=True)
    parser.add_argument("--apk-version", required=True)
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_dungeon_catalog import build

    sys.path.insert(0, str(args.game_tools.resolve()))
    extract(args.snapshot.resolve(), args.opcode_proof.resolve(), args.apk_version, args.tables.resolve())
    build(args.tables, args.output)
