"""Prepare the local offline host for the original versioned battle engine."""

import builtins
import json
from pathlib import Path
import re
from runpy import run_path
import sys
from types import ModuleType


def read_client_model(client, name):
    group = "model_info"
    try:
        payload, _ = client.resource(group, name)
        return payload
    except ValueError as error:
        if name != "model_s7_dasheshen_s7_dasheshen.json" or str(error) != "THX size mismatch: " + name:
            raise
        # 0.0.816's name table retains the old size for this cloud WPK entry.
        # Use the exact active digest only after checking the recovered bytes.
        ref = client.names[group].get(name)
        if ref["size"] != 874 or ref["digest"] != "e2cd9d746e642b1561b2480a04c075af":
            raise
        payload, evidence = client.by_digest(group, ref["digest"])
        if (evidence["size"] != 11819
                or evidence["rawSHA256"] != "4ebc387a9a10b4e644a709cffa5b4bbd62b3eebc42940d8e59b346b852eb5af5"
                or evidence["decodedSHA256"] != "f19a16d2c779fd60baf6668317216c41512429189278a8042bee4be6e43f3b89"):
            raise
        return payload


def prepare_runtime(runtime, work):
    from game_resources import Bindict, decode_module, sha256
    from original_battle import RuntimeModules, no_transport
    from original_host import Host

    catalog = run_path(str(Path(__file__).with_name("extract-dungeon-catalog.py")))
    client = catalog["open_catalog_client"](Path(runtime["snapshot"]))
    proof = Path(runtime["opcodeProof"])
    library, native_hash = catalog["verify_native_library"](client, proof)
    patch = (client.snapshot / "raw/extra/update.ini").read_text(encoding="utf-8-sig")
    version = re.search(r"^version\s*=\s*([\d.]+)\s*$", patch, re.M)[1]
    script_bytes = Path(runtime["scriptIndex"]).read_bytes()
    index = json.loads(script_bytes)
    if version != "0.0.816" or index.get("resourceVersion", version) != version or index.get("nativeSHA256", native_hash) != native_hash:
        raise ValueError("Battle verification requires matching 0.0.816 client resources")

    class ActiveModules(RuntimeModules):
        def __init__(self):
            super().__init__(proof, work)
            self.rows.clear()
            self.packages.clear()
            self.ambiguous.clear()
            for row in index["modules"]:
                raw = row["module"].replace("\\", "/").removesuffix(".py").removeprefix("lib3/")
                name = raw.removesuffix("/__init__").replace("/", ".")
                if name in self.rows:
                    self.ambiguous[name] = (self.rows[name], row)
                else:
                    self.rows[name] = row
                    if raw.endswith("/__init__"):
                        self.packages.add(name)

        def load(self, name):
            if name in self.ambiguous:
                raise ValueError("Ambiguous original module: " + name)
            row = self.rows[name]
            raw, _ = client.by_digest("script3", row["digest"])
            code, marshalled = decode_module(raw)
            if sha256(marshalled) != row["marshalSHA256"]:
                raise ValueError("Script differs from the indexed resource: " + name)
            return self.code(code)

    modules = ActiveModules()
    models = work / "src/model_info"
    models.mkdir(parents=True)

    def open_model(file, *args, **kwargs):
        if isinstance(file, (str, Path)):
            path = Path(file).resolve()
            if path.parent == models and re.fullmatch(r"model_[\w]+\.json", path.name) and not path.exists():
                path.write_bytes(read_client_model(client, path.name))
        return builtins.open(file, *args, **kwargs)

    modules.game_builtins["open"] = open_model
    host = Host(library)
    host.install()

    def table_key(key):
        return tuple(table_key(value) for value in key) if isinstance(key, list) else key

    class DecodedClientTable(dict):
        def has_key(self, key):
            return self.__contains__(key)

        def __getitem__(self, key):
            return super().__getitem__(table_key(key))

        def __contains__(self, key):
            return super().__contains__(table_key(key))

        def get(self, key, default=None):
            return super().get(table_key(key), default)

    def decode_table(blob):
        table = Bindict(blob).decode()
        if not isinstance(table, dict):
            raise ValueError("Expected a dictionary client table")
        return DecodedClientTable(table)

    sys.modules["bindict"].bindict = decode_table
    environment = ModuleType("Globals")
    environment.debugMode = False
    environment.component = "server"
    sys.modules["Globals"] = environment
    for name in ("distserver", "distserver.game"):
        package = ModuleType(name)
        package.__path__ = []
        sys.modules[name] = package
    repository = ModuleType("distserver.game.GameServerRepo")
    repository.game_service = None

    class ErrorObserver:
        def on_traceback(self, *unused, **kwargs):
            raise RuntimeError("The original engine reported an internal error")

    repository.game_event_callback = ErrorObserver()
    sys.modules[repository.__name__] = repository
    sys.meta_path.insert(0, modules)
    sys.addaudithook(no_transport)

    return modules, host, {"resourceVersion": version, "nativeSHA256": native_hash,
                          "scriptIndexSHA256": sha256(script_bytes)}
