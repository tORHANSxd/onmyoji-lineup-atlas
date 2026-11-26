"""Apply the original damage roll's lower endpoint to player-side attacks."""

from functools import wraps
import math
import sys


FORMULA_HASH = "47ef3bdf82fbea4243053e466afd2eccb4e502ba41b8f83b67a9fc70ecc3a9e1"


def install_minimum_damage(modules):
    if modules.rows["com.utils.formula"]["marshalSHA256"] != FORMULA_HASH:
        raise ValueError("The original damage roll site has not been verified in this version")
    from com import const
    from com.utils import formula

    original = formula.calcRawAttackDmg
    player_camp = const.CampFlag.CAMP1
    evidence = {"side": "player", "rolls": 0}

    class DamageRandom:
        def __init__(self, recorder):
            self.recorder = recorder

        def __getattr__(self, name):
            return getattr(self.recorder, name)

        def uniform(self, low, high):
            rolled = self.recorder.uniform(low, high)
            frame = sys._getframe(1)
            if (frame.f_code is original.__code__ and frame.f_lineno == 1267
                    and frame.f_locals["fromEntity"].camp == player_camp):
                if not (math.isfinite(low) and math.isfinite(high) and low == -high):
                    raise ValueError("Unexpected damage fluctuation bounds from the original formula")
                evidence["rolls"] += 1
                return min(low, high)
            return rolled

    @wraps(original)
    def minimum(fromEntity, *args, **kwargs):
        if fromEntity.camp != player_camp:
            return original(fromEntity, *args, **kwargs)
        engine = fromEntity.battleEngine
        recorder = engine._random
        if isinstance(recorder, DamageRandom):
            return original(fromEntity, *args, **kwargs)
        engine._random = DamageRandom(recorder)
        try:
            return original(fromEntity, *args, **kwargs)
        finally:
            engine._random = recorder

    formula.calcRawAttackDmg = minimum
    return evidence
