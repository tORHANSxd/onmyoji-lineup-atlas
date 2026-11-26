from pathlib import Path
from runpy import run_path
import unittest


read_plain_tables = run_path(str(Path(__file__).resolve().parents[1] / "tools" / "extract-dungeon-catalog.py"))["read_plain_tables"]


class ClientLiteralTablesTests(unittest.TestCase):
    def test_recovers_chunked_dict_and_named_appearance_exports(self):
        heroes = {skin: {"skin_id": skin, "diancang": False} for skin in range(40)}
        costumes = {100: {"skin_id": 100, "diancang": True}}
        source = f"hero_skin = {heroes!r}\ngoren_skin = {costumes!r}\ndata = hero_skin"

        exports = read_plain_tables(compile(source, "<appearance table>", "exec"), {"hero_skin", "goren_skin", "data"})

        self.assertEqual(exports["hero_skin"], heroes)
        self.assertEqual(exports["goren_skin"], costumes)
        self.assertIs(exports["data"], exports["hero_skin"])

    def test_rejects_calls_after_the_data_assignment(self):
        code = compile("data = {'hello': 'world'}\nrun()", "<client table>", "exec")

        with self.assertRaises(ValueError):
            read_plain_tables(code, {"data"})
