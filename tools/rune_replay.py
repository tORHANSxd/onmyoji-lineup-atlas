"""Project recorded action requests onto the client model's nominal durations."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from math import isfinite
from pathlib import Path


PLAY, REMAP, UNREMAP, APPEND = 727, 734, 743, 778
TRACKED_COMMANDS = {PLAY, REMAP, UNREMAP, APPEND}
# BattleMsgConst in resource 0.0.816.
ENTITY_ATTR, CREATE_MONSTER, SCENE_ATTR = 101, 712, 801


def replay_frames(record):
    lines = record.decode("utf-8").splitlines()
    header = json.loads(lines[0]) if lines else None
    if not isinstance(header, list) or len(header) != 2 or header[0] != "head":
        raise ValueError("Missing original replay header")
    for line in lines[1:]:
        if not line:
            continue
        timestamp, command, params, *_ = json.loads("[" + line + "]")
        if type(timestamp) is not int or timestamp < 0:
            raise ValueError("Invalid replay timestamp")
        yield timestamp, command, params


def monster_waves(record):
    """Use the original monster creation, HP changes and wave counters."""
    current, total, end_ms = 1, None, 0
    monsters, waves = {}, {}
    for timestamp, command, params in replay_frames(record):
        end_ms = max(end_ms, timestamp)
        if command == SCENE_ATTR:
            if params[0] == "monsterWaveCount":
                total = params[1]
            if params[0] == "finishedWaveCount":
                finished = params[1]
                if type(finished) is not int or not 0 <= finished <= current:
                    raise ValueError("Invalid original wave counter")
                if finished == current:
                    if current not in waves:
                        raise ValueError("Missing recorded monsters for a cleared wave")
                    waves[current]["cleared"] = True
                    waves[current]["endMs"] = timestamp
                    current += 1
        elif command == CREATE_MONSTER and params[1] == 2:
            uid, _, _, info, *_ = params
            if uid in monsters:
                raise ValueError("The replay reused a recorded monster identity")
            wave = waves.setdefault(current, {"wave": current, "cleared": False, "startMs": timestamp,
                                              "endMs": None, "monsters": []})
            monster = {"id": info["id"], "position": info["IndexCamp"], "initialHp": None,
                       "lowestHp": None, "lastHp": None, "regainedHp": 0, "zeroToAlive": 0}
            monsters[uid] = monster
            wave["monsters"].append(monster)
        elif command == ENTITY_ATTR and params[1] == "hp" and params[0] in monsters:
            uid, _, hp = params
            if type(hp) not in (int, float) or not isfinite(hp) or hp < 0:
                raise ValueError("Unknown original monster life value")
            monster = monsters[uid]
            previous = monster["lastHp"]
            if previous is None:
                monster["initialHp"] = hp
                monster["lowestHp"] = hp
            else:
                monster["lowestHp"] = min(monster["lowestHp"], hp)
                if previous < hp:
                    monster["regainedHp"] += hp - previous
                    monster["zeroToAlive"] += int(previous == 0)
            monster["lastHp"] = hp
    if type(total) is not int or total <= 0 or len(waves) > total:
        raise ValueError("Unknown original wave count")
    for wave in waves.values():
        if wave["endMs"] is None:
            wave["endMs"] = end_ms
    return {"scope": "original-monster-hp-updates", "total": total, "waves": list(waves.values())}


def sync_windows(record, entity_models, models):
    aliases = defaultdict(dict)
    windows, unresolved = [], []
    counts = Counter()
    last_action_timestamp = 0
    for timestamp, command, params in replay_frames(record):
        if command not in TRACKED_COMMANDS:
            continue
        # The client can append other event types with an earlier timestamp.
        # Remaps and playback requests must still stay in their recorded order.
        if timestamp < last_action_timestamp:
            raise ValueError("Replay animation timestamps must advance in order")
        last_action_timestamp = timestamp
        counts[command] += 1
        if command == APPEND:
            continue
        uid, name, *extra = params
        uid = str(uid)
        if command == REMAP:
            aliases[uid][name] = extra[0]
            continue
        if command == UNREMAP:
            aliases[uid].pop(name, None)
            continue

        clips = name if isinstance(name, list) else [name]
        resolved = [aliases[uid].get(clip, clip) for clip in clips]
        model = entity_models.get(uid)
        metadata = models.get(model, {})
        durations = [metadata.get(clip, {}).get("len") for clip in resolved]
        if not durations or any(type(value) not in (int, float) or not isfinite(value) or value < 0
                                for value in durations):
            unresolved.append({"atMs": timestamp, "entity": uid, "model": model, "clips": resolved})
            continue
        windows.append({
            "entity": uid, "model": model, "clips": resolved, "startMs": timestamp,
            "endMs": round(timestamp + sum(durations), 3),
        })

    # Sweep by distinct entity. Two overlapping requests for the same entity
    # cannot count as overlap between combatants.
    events = defaultdict(Counter)
    for window in windows:
        if window["endMs"] > window["startMs"]:
            events[window["startMs"]][window["entity"]] += 1
            events[window["endMs"]][window["entity"]] -= 1
    active = Counter()
    peak, overlap, previous = 0, 0, 0
    for timestamp, changes in sorted(events.items()):
        if len(active) > 1:
            overlap += timestamp - previous
        active.update(changes)
        active = +active
        peak = max(peak, len(active))
        previous = timestamp

    return {
        "scope": "renderer-action-sync-requests",
        "clientRenderingMeasured": False,
        "actionRequests": counts[PLAY], "queuedActions": counts[APPEND],
        "maxOverlappingEntities": peak, "overlapMs": round(overlap, 3),
        "unresolved": unresolved, "windows": windows,
    }


def read_models(root, expected_hashes):
    result = {}
    for name, digest in expected_hashes.items():
        if not name.startswith("model_") or Path(name).name != name or not name.endswith(".json"):
            raise ValueError("Invalid model resource name")
        raw = (root / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError("Model resource digest differs: " + name)
        result[name] = json.loads(raw)["anim"]
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--monster-health", action="store_true", help="Summarize wave and monster HP state")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    record = args.report.with_suffix(".replay.txt").read_bytes()
    if hashlib.sha256(record).hexdigest() != report["recordSHA256"]:
        raise ValueError("Replay digest differs")
    if args.monster_health:
        result = monster_waves(record)
    else:
        directory = args.report.parent / (args.report.stem + "-work") / "src/model_info"
        result = sync_windows(record, report["entityModels"], read_models(directory, report["modelSHA256"]))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
