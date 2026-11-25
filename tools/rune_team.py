"""Translate selected Pinganzhi inventory rows for the original battle engine."""

from math import isfinite
from types import SimpleNamespace


EQUIP_ATTRIBUTES = {
    "attack_flat": "attackAdditionVal", "attack_rate": "attackAdditionRate",
    "hp_flat": "maxHpAdditionVal", "hp_rate": "maxHpAdditionRate",
    "defense_flat": "defenseAdditionVal", "defense_rate": "defenseAdditionRate",
    "speed": "speedAdditionVal", "crit_rate": "critRateAdditionVal",
    "crit_damage": "critPowerAdditionVal", "effect_hit": "debuffEnhance", "effect_resist": "debuffResist",
}
ONMYOJI_IDS = {10, 11, 12, 13, 15, 16}


def integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def hero_data(row, *, onmyoji):
    hero_id = row.get("heroId")
    if isinstance(hero_id, str) and hero_id.isascii() and hero_id.isdecimal() and len(hero_id) <= 6:
        hero_id = int(hero_id)
    level, star, awake = (row.get(field) for field in ("level", "star", "awake"))
    skills = row.get("skinfo")
    if (not integer(hero_id, 1, 999999) or (hero_id in ONMYOJI_IDS) != onmyoji
            or not integer(level, 1, 60 if onmyoji else 40) or not integer(star, 1, 6)
            or not integer(awake, 0, 1) or not isinstance(skills, list) or not skills
            or any(not isinstance(skill, list) or len(skill) != 2 or not integer(skill[0], 1, 99999999)
                   or not integer(skill[1], 1, 10) for skill in skills)):
        raise ValueError("The battle selection needs the exact level, star, awakening and skill levels")
    skill_ids = [skill[0] for skill in skills]
    selected = row.get("selectSkills", skill_ids)
    if not isinstance(selected, list) or any(type(skill) is not int or skill not in skill_ids for skill in selected):
        raise ValueError("Selected skills must appear in the skill inventory")
    return {"heroId": hero_id, "equips": [], "level": level, "star": star, "awake": awake,
            "skinfo": skills, "selectSkills": selected}


def equip_data(row, suit_ids):
    slot, level = row.get("slot"), row.get("level")
    set_name, uid, substats = row.get("setId"), row.get("id"), row.get("subAttributes")
    if (not integer(slot, 1, 6) or not integer(level, 0, 15) or not integer(row.get("quality"), 1, 6)
            or not isinstance(uid, str) or not uid or not isinstance(substats, list)
            or not isinstance(set_name, str) or set_name not in suit_ids):
        raise ValueError("Unknown soul slot, level, quality, set or identity")
    base_name, base_value = row.get("mainAttrType"), row.get("mainAttrValue")
    attributes = {}
    for attr in [{"type": base_name, "value": base_value}, *substats]:
        name, value = attr.get("type"), attr.get("value")
        if not isinstance(name, str) or name not in EQUIP_ATTRIBUTES or type(value) not in (int, float) or not isfinite(value):
            raise ValueError("Unknown soul attribute or value")
        native = EQUIP_ATTRIBUTES[name]
        attributes[native] = attributes.get(native, 0) + value
    # Exported substats already include boss soul fixed attributes.
    # Applying single_attr again would add them a second time in EquipAttrCalc.
    return SimpleNamespace(
        itemId=0, suitId=suit_ids[set_name], single_attr=0, attrDict=attributes,
        strongLevel=level, baseAttrName=EQUIP_ATTRIBUTES[base_name],
        baseAttrDict={EQUIP_ATTRIBUTES[base_name]: base_value}, getPos=lambda: slot - 1,
    )


def selected_team(plan, suits):
    suit_ids = {value: int(key) for key, value in suits.items()}
    if "涅槃火" in suit_ids:
        suit_ids["涅槃之火"] = suit_ids["涅槃火"]
    actor = hero_data(plan["onmyoji"], onmyoji=True)
    members = plan["members"]
    if not isinstance(members, list) or not 1 <= len(members) <= 5:
        raise ValueError("Select one to five shikigami")
    fighters, equips, auto_skills = {}, {}, {}
    auto_skills["selected-onmyoji"] = auto_setting(plan["onmyoji"])
    seen_heroes, seen_souls = set(), set()
    for member_index, member in enumerate(members, 1):
        instance_id = member["instanceId"]
        if not isinstance(instance_id, str) or not instance_id or instance_id in seen_heroes:
            raise ValueError("Shikigami instances must be distinct")
        seen_heroes.add(instance_id)
        hero = hero_data(member["hero"], onmyoji=False)
        slots = set()
        for row in member["souls"]:
            equip = equip_data(row, suit_ids)
            slot = equip.getPos() + 1
            if slot in slots or row["id"] in seen_souls:
                raise ValueError("Soul slots and instances must be distinct")
            slots.add(slot)
            seen_souls.add(row["id"])
            alias = f"member-{member_index}-soul-{slot}"
            equips[alias] = equip
            hero["equips"].append(alias)
        alias = f"member-{member_index}"
        fighters[alias] = hero
        auto_skills[alias] = auto_setting(member)
    return actor, fighters, equips, auto_skills


def auto_setting(row):
    setting = row.get("aiSkill", 0)
    if not integer(setting, 0, 11) and not integer(setting, 33831, 33844):
        raise ValueError("Unknown automatic skill selection")
    return setting
