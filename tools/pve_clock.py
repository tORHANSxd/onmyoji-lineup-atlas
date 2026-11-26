"""Use the client's PvE deadline with the local fixed-step clock."""

from types import FunctionType, MethodType, SimpleNamespace


def pve_wall_seconds(deadline):
    return 75 + (deadline or 0) // 10


class NativePveClock:
    def __init__(self, engine, deadline):
        self.engine = engine
        self.deadline = deadline
        self.started = None
        if deadline is not None:
            native_deadline = engine.getHaltBattleTime.__func__
            # Only this original method uses wall time to schedule the deadline.
            bindings = dict(native_deadline.__globals__, time=SimpleNamespace(time=engine.now_time))
            engine.getHaltBattleTime = MethodType(FunctionType(native_deadline.__code__, bindings), engine)
        set_deadline = engine.set_haltBattleTime

        def record_deadline(value):
            now = engine.now_time()
            expected = None if deadline is None else int(now) + deadline
            if value != expected:
                raise RuntimeError("The original PvE engine set a different deadline")
            if self.started is None:
                self.started = now
            return set_deadline(value)

        engine.set_haltBattleTime = record_deadline

    def report(self, outcome):
        if self.started is None:
            raise RuntimeError("The original PvE engine did not start combat")
        timed_out = outcome != "win" and bool(self.engine.isHaltBattle)
        if timed_out and self.deadline is None:
            raise RuntimeError("The original PvE engine returned an invalid timeout")
        return {"deadlineSeconds": self.deadline, "timedOut": timed_out,
                "combatSeconds": round(self.engine.now_time() - self.started, 6)}
