"""Apply the client's animation rules to recorded engine timestamps."""

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import json
from math import isfinite
from pathlib import Path


PLAY, REMAP, REMOVE, FREEZE, STOP, UNREMAP, APPEND = 727, 734, 736, 737, 741, 743, 778
TRACKED_COMMANDS = {PLAY, REMAP, UNREMAP, APPEND}
# BattleMsgConst in resource 0.0.816.
ENTITY_ATTR, CREATE_MONSTER, SCENE_ATTR = 101, 712, 801
BATTLE_STATE, BATTLE_ENDED, BATTLE_STARTED = 201, 1102, 5
PLAYBACK_COMMANDS = TRACKED_COMMANDS | {STOP, REMOVE, FREEZE}
PLAY_DEFAULTS = (1.0, False, True, False, False)


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
            monster = {"id": info["id"], "position": info["Index"], "initialHp": None,
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

    peak, overlap = overlap_stats(windows)
    return {
        "scope": "renderer-action-sync-requests",
        "clientRenderingMeasured": False,
        "actionRequests": counts[PLAY], "queuedActions": counts[APPEND],
        "maxOverlappingEntities": peak, "overlapMs": overlap,
        "unresolved": unresolved, "windows": windows,
    }


def overlap_stats(windows):
    """Sweep by distinct entity so two requests for one model count once."""
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

    return peak, round(overlap, 3)


def project_playback(record, entity_models, models):
    """Project action occupancy without a device's model/render callbacks."""
    aliases = defaultdict(dict)
    actions, frozen = {}, set()
    windows, unresolved = [], []
    counts = Counter()
    combat_start = settlement = None
    latest = last_event = 0

    def missing(time, uid, reason, clip=None):
        unresolved.append({"atMs": time, "entity": uid, "reason": reason, "clip": clip})

    def start(uid, action, time, loop=False):
        name, queued = action["pending"].popleft()
        clip = aliases[uid].get(name, name)
        model = entity_models.get(uid)
        duration = models.get(model, {}).get(clip, {}).get("len")
        if type(duration) not in (int, float) or not isfinite(duration) or duration < 0:
            missing(time, uid, "missing-clip", clip)
            # An unobserved completion callback can prevent later clips from playing.
            action["window"] = None
            return
        end = None if loop else time + duration / action["rate"]
        if end is not None and not isfinite(end):
            missing(time, uid, "invalid-duration", clip)
            action["window"] = None
            return
        window = {"entity": uid, "model": model, "clip": clip, "startMs": time,
                  "endMs": end,
                  "rate": action["rate"], "queued": queued, "loop": loop}
        windows.append(window)
        action["window"] = window
        if loop and action["pending"]:
            missing(time, uid, "loop-completion", clip)

    def advance(uid, time):
        action = actions.get(uid)
        while action and action["window"] is not None:
            end = action["window"]["endMs"]
            if end is None or end > time:
                break
            if action["pending"]:
                # _playNextAnim resolves the alias when the previous clip ends.
                start(uid, action, end)
            elif action["autoStop"]:
                del actions[uid]
                break
            else:
                action["held"] = True
                break

    def finish(uid, time, reason):
        action = actions.pop(uid, None)
        window = action["window"] if action else None
        if window is not None and (window["endMs"] is None or window["endMs"] > time):
            if time > window["startMs"]:
                counts[reason] += 1
            window.update(endMs=time, endReason=reason)

    for stamp, command, params in replay_frames(record):
        latest = max(latest, stamp)
        if command == BATTLE_STATE and params and params[0] == BATTLE_STARTED and combat_start is None:
            combat_start = stamp
        if command == BATTLE_ENDED and settlement is None:
            settlement = stamp
            break
        if command not in PLAYBACK_COMMANDS:
            continue
        if stamp < last_event:
            raise ValueError("Replay animation timestamps must advance in order")
        last_event = stamp
        uid = str(params[0])
        advance(uid, stamp)
        if command in (STOP, REMOVE, FREEZE):
            finish(uid, stamp, {STOP: "stopped", REMOVE: "removed", FREEZE: "frozen"}[command])
            if command == REMOVE:
                frozen.discard(uid)
                aliases.pop(uid, None)
            if command == FREEZE:
                if params[1] > 0:
                    frozen.add(uid)
                    missing(stamp, uid, "frozen")
                else:
                    frozen.discard(uid)
            continue
        name = params[1]
        if command == REMAP:
            aliases[uid][name] = params[2]
        elif command == UNREMAP:
            aliases[uid].pop(name, None)
        elif command == APPEND:
            action = actions.get(uid)
            if action is None:
                counts["appendWithoutAction"] += 1
            elif action["window"] is None or action["window"]["loop"] or action["held"]:
                missing(stamp, uid, "unobserved-append", name)
            else:
                action["pending"].append((name, True))
        else:
            finish(uid, stamp, "replaced")
            supplied = params[2:]
            rate, loop, auto_stop, *_ = (*supplied, *PLAY_DEFAULTS[len(supplied):])
            if uid in frozen:
                missing(stamp, uid, "frozen-action")
                continue
            if type(rate) not in (int, float) or not isfinite(rate) or rate <= 0:
                missing(stamp, uid, "invalid-rate")
                continue
            names = name if isinstance(name, list) else [name]
            if not names or any(not isinstance(clip, str) for clip in names):
                missing(stamp, uid, "invalid-action")
                continue
            action = actions[uid] = {"pending": deque((clip, i > 0) for i, clip in enumerate(names)),
                                     "rate": rate, "autoStop": auto_stop, "held": False}
            start(uid, action, stamp, loop=bool(loop))

    end = settlement if settlement is not None else latest
    if end < last_event:
        raise ValueError("Replay settlement precedes an animation frame")
    for uid in list(actions):
        advance(uid, end)
        finish(uid, end, "replay-end")
    windows = [window for window in windows if window["endMs"] > window["startMs"]]
    for window in windows:
        window["startMs"] = round(window["startMs"], 3)
        window["endMs"] = round(window["endMs"], 3)
    windows.sort(key=lambda window: window["startMs"])
    peak, overlap = overlap_stats(windows)
    combat_elapsed = (settlement - combat_start
                      if combat_start is not None and settlement is not None and settlement >= combat_start else None)
    combat_overlap = None
    if combat_elapsed is not None:
        _, combat_overlap = overlap_stats([{**window, "startMs": max(window["startMs"], combat_start)} for window in windows])
    return {
        "scope": "model-playback-projection-on-engine-clock",
        "clientRenderingMeasured": False,
        "combatStartMs": combat_start, "settlementMs": settlement,
        "combatElapsedMs": combat_elapsed, "combatOverlapMs": combat_overlap,
        "maxOverlappingEntities": peak, "overlapMs": overlap,
        "queuedClipsPlayed": sum(window["queued"] for window in windows),
        "appendWithoutAction": counts["appendWithoutAction"],
        "interruptedClips": sum(counts[reason] for reason in ("stopped", "removed", "frozen", "replaced")),
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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--monster-health", action="store_true", help="Summarize wave and monster HP state")
    mode.add_argument("--animation-playback", action="store_true", help="Project individual clip starts, endings and interruptions")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    record = args.report.with_suffix(".replay.txt").read_bytes()
    if hashlib.sha256(record).hexdigest() != report["recordSHA256"]:
        raise ValueError("Replay digest differs")
    if args.monster_health:
        result = monster_waves(record)
    else:
        directory = args.report.parent / (args.report.stem + "-work") / "src/model_info"
        project = project_playback if args.animation_playback else sync_windows
        result = project(record, report["entityModels"], read_models(directory, report["modelSHA256"]))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
