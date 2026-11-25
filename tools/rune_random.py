"""Observe original RNG draws and replay alternate comparison paths."""

import math
import operator
import sys


SCOPE = "engine-rng-observed-comparisons"
COMPARISONS = {"lt": operator.lt, "le": operator.le, "gt": operator.gt, "ge": operator.ge}
LOW, HIGH = 0.0, 1.0 - 2 ** -53


def alternative(draw):
    """Return a representative of the other side of a direct threshold."""
    checks = draw.get("comparisons", ())
    if draw.get("method") != "random" or len(checks) != 1:
        return None
    op, threshold, outcome = checks[0]
    compare = COMPARISONS.get(op)
    if compare is None or type(threshold) not in (int, float) or not 0 <= threshold <= 1 or type(outcome) is not bool:
        return None
    for candidate in (LOW, HIGH):
        if compare(candidate, threshold) != outcome:
            return candidate
    return None


class ObservedFloat(float):
    def __new__(cls, value, checks):
        observed = super().__new__(cls, value)
        observed.checks = checks
        return observed

    def compare(self, op, other):
        result = getattr(float, "__" + op + "__")(self, other)
        if type(other) in (int, float) and -2 <= other <= 2 and type(result) is bool:
            self.checks.append([op, other, result])
        else:
            self.checks.append([op, None, None])
        return result

    def __lt__(self, other):
        return self.compare("lt", other)

    def __le__(self, other):
        return self.compare("le", other)

    def __gt__(self, other):
        return self.compare("gt", other)

    def __ge__(self, other):
        return self.compare("ge", other)


class RandomAudit:
    def __init__(self, original, run_key, reference=None, flip=None, context=None):
        self.original = original
        self.run_key = run_key
        self.draws = []
        self.reference = reference
        self.flip = flip
        self.flipped = None
        self.context = context
        self.previous_flips = {}
        if flip is not None:
            if (not isinstance(reference, dict) or reference.get("scope") != SCOPE or reference.get("runKey") != run_key
                    or not isinstance(reference.get("draws"), list) or not 1 <= flip <= len(reference["draws"])):
                raise ValueError("The random audit reference does not match this replay")
            previous = reference.get("interventions", [reference["flipped"]] if reference.get("flipped") else [])
            if not isinstance(previous, list) or (previous[-1] if previous else None) != reference.get("flipped"):
                raise ValueError("The reference random comparison path is inconsistent")
            last = 0
            for step in previous:
                index = step.get("index") if isinstance(step, dict) else None
                if type(index) is not int or not last < index < flip:
                    raise ValueError("Select a random comparison after the last intervention")
                draw = reference["draws"][index - 1]
                if (not isinstance(draw, dict) or alternative(draw) is None or step.get("value") != draw.get("value")
                        or step.get("value") not in (LOW, HIGH)
                        or type(step.get("originalValue")) is not float
                        or not LOW <= step["originalValue"] <= HIGH or step["originalValue"] == step["value"]):
                    raise ValueError("The reference random comparison path is inconsistent")
                op, threshold, outcome = draw["comparisons"][0]
                compare = COMPARISONS[op]
                if compare(step["value"], threshold) != outcome or compare(step["originalValue"], threshold) == outcome:
                    raise ValueError("The reference random comparison path is inconsistent")
                self.previous_flips[index] = step
                last = index
            if alternative(reference["draws"][flip - 1]) is None:
                raise ValueError("The specified random draw has no observed alternate threshold outcome")

    def __getattr__(self, name):
        original = getattr(self.original, name)
        if not callable(original) or name in {"seed", "getstate", "setstate"}:
            return original

        def observe(*args, **kwargs):
            # RandomRecord's wrapper is the immediate caller. Its caller is the
            # actual game code. Keep the bytecode offset to distinguish same-line calls.
            frame = sys._getframe(2)
            site = [frame.f_code.co_filename.replace("\\", "/"), frame.f_code.co_qualname, frame.f_lineno, frame.f_lasti]
            result = original(*args, **kwargs)
            draw = {"method": name, "site": site}
            if self.context is not None:
                draw["inCombat"], draw["wave"] = self.context()
            if (type(result) in (bool, int, str) or result is None or
                    type(result) is float and math.isfinite(result)):
                draw["value"] = result
            if name in {"choice", "sample", "shuffle", "choices"} and args:
                draw["population"] = len(args[0])
            index = len(self.draws) + 1
            prior = self.previous_flips.get(index)
            if prior is not None:
                if name != "random" or type(result) is not float or result != prior["originalValue"]:
                    raise ValueError("The native random draw diverged along the reference path")
                result = prior["value"]
                draw["value"] = result
            if name == "random" and type(result) is float:
                draw["comparisons"] = []
                if index == self.flip:
                    baseline = self.reference["draws"][index - 1]
                    if self.draws != self.reference["draws"][:index - 1] or any(
                            draw.get(key) != baseline.get(key) for key in ("method", "site", "value", "inCombat", "wave")):
                        raise ValueError("The original random trace diverged before the selected draw")
                    result = alternative(baseline)
                    if result == draw["value"] or result is None:
                        raise ValueError("No alternate result for the selected draw")
                    self.flipped = {"index": index, "originalValue": draw["value"], "value": result}
                    draw["value"] = result
                result = ObservedFloat(result, draw["comparisons"])
            self.draws.append(draw)
            return result

        return observe

    def report(self):
        if self.flip is not None:
            if self.flipped is None:
                raise ValueError("The selected random comparison was not reached")
            op, threshold, outcome = self.reference["draws"][self.flip - 1]["comparisons"][0]
            actual = self.draws[self.flip - 1]["comparisons"]
            if actual != [[op, threshold, not outcome]]:
                raise ValueError("The selected comparison did not reverse as expected")
        reversible = [i for i, draw in enumerate(self.draws, 1) if alternative(draw) is not None]
        observed = sum(bool(draw.get("comparisons")) for draw in self.draws)
        interventions = [*self.previous_flips.values(), self.flipped] if self.flipped is not None else []
        return {"scope": SCOPE, "runKey": self.run_key, "draws": self.draws, "flipped": self.flipped,
                "interventions": interventions,
                "observedComparisonDraws": observed, "unclassifiedDraws": len(self.draws) - observed,
                "reversibleDraws": reversible}
