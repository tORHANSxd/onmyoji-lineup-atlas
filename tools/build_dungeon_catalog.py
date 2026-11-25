"""Package versioned client tables for the offline dungeon catalog."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dungeon_encounters import encounter_index


# Names used by the client configuration modules.
FAMILIES = (
    ("daily", r"dungeon|explore|chapter|daily|encounter|secret|challenge|boss|shilian|pve|mitama|fengmo|^hunling"),
    ("guild", r"guild|crevice|kekkai|kirin"),
    ("event", r"^act_|activity|event|festival|anniversary|super_?ghost"),
    ("battle", r"battle|monster|^skill$|buff|^hero$|^rune|loot|^team_assist_|^combinesceneinfo$"),
)


def family(name):
    if name.startswith(("shilian_", "hunling_")):
        return "daily"
    if name.startswith(("journey_", "circle_journey_")):
        return "event"
    matches = {key for key, pattern in FAMILIES if re.search(pattern, name, re.I)}
    return next((key for key in ("guild", "event", "daily", "battle") if key in matches), "other")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()


def table_pairs(rows):
    return rows["$mapping"] if set(rows) == {"$mapping"} else list(rows.items())


def store_encounters(catalog, output, load_rows):
    encounters = encounter_index(catalog, load_rows)
    payload = gzip.compress(encode(encounters), compresslevel=6, mtime=0)
    (output / "encounters.json.gz").write_bytes(payload)
    catalog["encounters"] = {"rowCount": len(encounters["entries"]), "bytes": len(payload),
                             "sha256": hashlib.sha256(payload).hexdigest(), "counts": encounters["counts"],
                             "unresolvedReferences": encounters["unresolvedReferences"]}


def build(tables, output):
    source = read(tables / "index.json")
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for record in source["tables"]:
        name = record["name"]
        if not re.fullmatch(r"[A-Za-z0-9_]+", name):
            raise ValueError(f"Invalid client table name: {name}")
        entry = {**record, "family": family(name)}
        if record["status"] == "decoded":
            table = read(tables / f"{name}.json")
            rows = table_pairs(table["rows"])
            if len(rows) != record["rowCount"] or table["source"] != record["source"]:
                raise ValueError(f"Catalog and table disagree: {name}")
            payload = gzip.compress(encode(rows), compresslevel=6, mtime=0)
            entry.update(bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest())
            (output / f"{name}.json.gz").write_bytes(payload)
        entries.append(entry)

    catalog = {key: source[key] for key in ("apkVersion", "resourceVersion", "nativeSHA256", "counts")}
    for key in ("scriptModules", "battleModules", "unresolvedScripts"):
        if key in source:
            catalog[key] = source[key]
    catalog.update(schema=1, tables=entries)
    store_encounters(catalog, output, lambda name: table_pairs(read(tables / f"{name}.json")["rows"]))
    (output / "index.json").write_bytes(encode(catalog))
    print(f'{len(entries)} client tables, {sum(row.get("bytes", 0) for row in entries):,} compressed bytes')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tables", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.tables, args.output)
