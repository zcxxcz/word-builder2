#!/usr/bin/env python3
"""Generate auditable CSV and idempotent Supabase SQL for official wordlists."""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "output" / "vocabulary-review"
IMPORT_DIR = ROOT / "output" / "vocabulary-import"
SQL_PATH = ROOT / "supabase" / "import_official_vocabulary.sql"

SOURCE_PRIMARY = "moe-primary-2022"
SOURCE_JUNIOR = "moe-junior-2022"
SOURCE_HIGH = "moe-high-school-2020"
SOURCE_CET4 = "cet-4"
SOURCE_CET6 = "cet-6"

SOURCE_ORDER = [
    SOURCE_PRIMARY,
    SOURCE_JUNIOR,
    SOURCE_HIGH,
    SOURCE_CET4,
    SOURCE_CET6,
]

SOURCE_METADATA = {
    SOURCE_PRIMARY: {
        "display_name": "义务教育英语课程标准二级词汇表",
        "source_type": "curriculum",
        "stage_code": "primary",
        "stage_rank": 10,
        "version_label": "2022年版",
        "volume_label": "小学二级词汇表（505词）",
        "published_on": "2022-04-21",
        "source_url": "https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582349487953.pdf",
        "attribution": "中华人民共和国教育部",
    },
    SOURCE_JUNIOR: {
        "display_name": "义务教育英语课程标准三级词汇表",
        "source_type": "curriculum",
        "stage_code": "junior",
        "stage_rank": 20,
        "version_label": "2022年版",
        "volume_label": "初中三级词汇表（累计1600词）",
        "published_on": "2022-04-21",
        "source_url": "https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582349487953.pdf",
        "attribution": "中华人民共和国教育部",
    },
    SOURCE_HIGH: {
        "display_name": "普通高中英语课程标准词汇表",
        "source_type": "curriculum",
        "stage_code": "senior",
        "stage_rank": 30,
        "version_label": "2017年版2020年修订",
        "volume_label": "附录2词汇表（3000词）",
        "published_on": "2020-06-03",
        "source_url": "https://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html",
        "attribution": "中华人民共和国教育部",
    },
    SOURCE_CET4: {
        "display_name": "全国大学英语四级考试词表",
        "source_type": "exam",
        "stage_code": "college",
        "stage_rank": 40,
        "version_label": "2016年修订版",
        "volume_label": "CET-4",
        "published_on": "",
        "source_url": "https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf",
        "attribution": "全国大学英语四、六级考试委员会",
    },
    SOURCE_CET6: {
        "display_name": "全国大学英语六级考试词表",
        "source_type": "exam",
        "stage_code": "college",
        "stage_rank": 50,
        "version_label": "2016年修订版",
        "volume_label": "CET-6",
        "published_on": "",
        "source_url": "https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf",
        "attribution": "全国大学英语四、六级考试委员会",
    },
}

ENTRY_FIXES = {
    "AI ( artificial intelligence)": "AI (artificial intelligence)",
    "crowded.": "crowded",
    "gentleman (p/. gentlemen)": "gentleman (pl. gentlemen)",
    "shelf (pi. shelves)": "shelf (pl. shelves)",
}

TITLE_PERIOD_ALIASES = {"mr", "mrs", "ms", "dr"}


def normalize_form(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace("’", "'")
        .replace("‘", "'")
        .replace("‐", "-")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("_", " ")
    )


def clean_spacing(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    value = re.sub(r"\s*/\s*", "/", value)
    return value


def safe_aliases(value: str) -> set[str]:
    """Return punctuation variants that preserve the same lexical form."""
    value = normalize_form(value)
    aliases = {value}
    ascii_alias = "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )
    if ascii_alias != value:
        aliases.add(ascii_alias)

    if "-" in value:
        aliases.add(re.sub(r"-+", " ", value))
    if " " in value and len(value.split()) == 2:
        aliases.add(value.replace(" ", "-"))
    if value.rstrip(".") in TITLE_PERIOD_ALIASES:
        aliases.add(value.rstrip("."))
        aliases.add(value.rstrip(".") + ".")

    return {clean_spacing(alias) for alias in aliases if alias.strip()}


def split_parenthetical_aliases(entry: str) -> tuple[str, list[str]]:
    """Expand approved school-list notation into a canonical form and aliases."""
    entry = clean_spacing(ENTRY_FIXES.get(entry, entry))

    if "/" in entry and not re.search(r"\([^)]*/[^)]*\)", entry):
        alternatives = [part.strip() for part in entry.split("/") if part.strip()]
        canonical = alternatives[0]
        return canonical, alternatives

    match = re.fullmatch(r"(.+?)\s*\((.+)\)", entry)
    if not match:
        return entry, [entry]

    head = match.group(1).strip()
    note = match.group(2).strip()
    head_alternatives = [part.strip() for part in head.split("/") if part.strip()]
    head = head_alternatives[0]

    if note.lower() == "to":
        phrase = f"{head} to"
        return phrase, [phrase, head]

    note = re.sub(r"^(?:pl\.|p/\.|pi\.)\s*", "", note, flags=re.I)
    note = re.sub(r"^ame\s+", "", note, flags=re.I)
    note = note.lstrip("=")
    note = re.sub(r"\bAmE\b", ",", note, flags=re.I)
    note = clean_spacing(note)

    aliases = head_alternatives
    for part in re.split(r"\s*,\s*", note):
        part = part.strip()
        if not part:
            continue
        # "mum AmE mom" has already become "mum , mom"; other notes are
        # single approved aliases or a short expansion phrase.
        aliases.append(part)

    return head, aliases


def merge_broken_junior_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    index = 0
    while index < len(rows):
        row = dict(rows[index])
        if row["entry"] == "policeman / policewoman (pl." and index + 1 < len(rows):
            next_row = rows[index + 1]
            row["entry"] = "policeman / policewoman (pl. policemen / policewomen)"
            row["raw_entry"] = f"{row['raw_entry']} {next_row['raw_entry']}"
            index += 2
            merged.append(row)
            continue
        merged.append(row)
        index += 1
    return merged


def merge_broken_high_school_rows(
    rows: list[dict[str, str]]
) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    index = 0
    while index < len(rows):
        row = dict(rows[index])
        if row["entry"] == "kilo (kilogramme," and index + 1 < len(rows):
            next_row = rows[index + 1]
            row["entry"] = "kilo (kilogramme, kilogram)"
            row["raw_entry"] = f"{row['raw_entry']} {next_row['raw_entry']}"
            index += 2
            merged.append(row)
            continue
        merged.append(row)
        index += 1
    return merged


def add_membership(
    output: dict[tuple[str, str, str], dict[str, str]],
    source_key: str,
    canonical_word: str,
    word_form: str,
    coverage_label: str,
    provenance: str,
) -> None:
    canonical_word = normalize_form(canonical_word)
    word_form = normalize_form(word_form)
    if not canonical_word or not word_form:
        return

    key = (source_key, canonical_word, word_form)
    existing = output.get(key)
    if existing:
        labels = list(
            dict.fromkeys(
                part
                for value in (existing["coverage_label"], coverage_label)
                for part in value.split(" · ")
                if part
            )
        )
        existing["coverage_label"] = " · ".join(labels)
        return

    output[key] = {
        "source_key": source_key,
        "canonical_word": canonical_word,
        "word_form": word_form,
        "coverage_label": coverage_label,
        "provenance": provenance,
    }


def add_school_entry(
    output: dict[tuple[str, str, str], dict[str, str]],
    source_key: str,
    entry: str,
    coverage_label: str,
    provenance: str,
) -> None:
    canonical, aliases = split_parenthetical_aliases(entry)

    # Slash alternatives inside plural notes need a second pass.
    expanded_aliases: list[str] = []
    for alias in aliases:
        if "/" in alias:
            expanded_aliases.extend(
                part.strip() for part in alias.split("/") if part.strip()
            )
        else:
            expanded_aliases.append(alias)

    for alias in expanded_aliases:
        for safe_alias in safe_aliases(alias):
            add_membership(
                output,
                source_key,
                canonical,
                safe_alias,
                coverage_label,
                provenance,
            )


def load_school_memberships(
    output: dict[tuple[str, str, str], dict[str, str]]
) -> None:
    primary_rows = list(
        csv.DictReader(
            (REVIEW_DIR / "moe-2022-primary-level2.csv").open(
                encoding="utf-8-sig"
            )
        )
    )
    for row in primary_rows:
        add_school_entry(
            output,
            SOURCE_PRIMARY,
            row["entry"],
            "小学二级词汇",
            f"PDF第{row['pdf_page']}页",
        )

    junior_rows = merge_broken_junior_rows(
        list(
            csv.DictReader(
                (REVIEW_DIR / "moe-2022-junior-level3.csv").open(
                    encoding="utf-8-sig"
                )
            )
        )
    )
    for row in junior_rows:
        coverage = (
            "小学二级词汇（三级表继承）"
            if row["stage_bucket"] == "primary_inherited"
            else "初中新增词汇"
        )
        add_school_entry(
            output,
            SOURCE_JUNIOR,
            row["entry"],
            coverage,
            f"PDF第{row['pdf_page']}页",
        )

    high_rows = merge_broken_high_school_rows(
        list(
            csv.DictReader(
                (REVIEW_DIR / "moe-2020-highschool-3000.csv").open(
                    encoding="utf-8-sig"
                )
            )
        )
    )
    high_labels = {
        "compulsory_baseline": "义务教育基础词汇",
        "required_new": "高中必修新增词汇",
        "selective_required_new": "高中选择性必修新增词汇",
    }
    for row in high_rows:
        add_school_entry(
            output,
            SOURCE_HIGH,
            row["entry"],
            high_labels[row["stage_bucket"]],
            f"PDF第{row['pdf_page']}页",
        )


def load_cet_memberships(
    output: dict[tuple[str, str, str], dict[str, str]]
) -> None:
    rows = list(
        csv.DictReader(
            (REVIEW_DIR / "cet-2016-cleaned.csv").open(encoding="utf-8-sig")
        )
    )
    for row in rows:
        source_key = SOURCE_CET4 if row["cet_level"] == "CET-4" else SOURCE_CET6
        coverage = row["member_kind"]
        if row["sense_number"]:
            coverage += f" · 同形异义{row['sense_number']}"

        forms = safe_aliases(row["word_form"])
        for word_form in forms:
            add_membership(
                output,
                source_key,
                row["canonical_word"],
                word_form,
                coverage,
                f"PDF第{row['pdf_page']}页 · {row['source_family']}",
            )


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def source_metadata_sql() -> str:
    rows = []
    for key in SOURCE_ORDER:
        meta = SOURCE_METADATA[key]
        published = (
            sql_literal(meta["published_on"]) + "::date"
            if meta["published_on"]
            else "NULL"
        )
        rows.append(
            "  ("
            + ", ".join(
                [
                    sql_literal(key),
                    sql_literal(meta["display_name"]),
                    sql_literal(meta["source_type"]),
                    sql_literal(meta["stage_code"]),
                    str(meta["stage_rank"]),
                    sql_literal(meta["version_label"]),
                    sql_literal(meta["volume_label"]),
                    published,
                    sql_literal(meta["source_url"]),
                    sql_literal(meta["attribution"]),
                    "false",
                ]
            )
            + ")"
        )
    return ",\n".join(rows)


def membership_sql(
    rows: list[dict[str, str]], chunk_size: int = 500
) -> list[str]:
    chunks = []
    for start in range(0, len(rows), chunk_size):
        values = []
        for row in rows[start : start + chunk_size]:
            values.append(
                "  ("
                + ", ".join(
                    sql_literal(row[field])
                    for field in (
                        "source_key",
                        "canonical_word",
                        "word_form",
                        "coverage_label",
                    )
                )
                + ")"
            )
        chunks.append(
            """INSERT INTO vocabulary_memberships
  (source_key, canonical_word, word_form, coverage_label)
VALUES
"""
            + ",\n".join(values)
            + """
ON CONFLICT (source_key, canonical_word, word_form) DO UPDATE SET
  coverage_label = EXCLUDED.coverage_label;
"""
        )
    return chunks


def main() -> None:
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    memberships: dict[tuple[str, str, str], dict[str, str]] = {}
    load_school_memberships(memberships)
    load_cet_memberships(memberships)

    rows = sorted(
        memberships.values(),
        key=lambda row: (
            SOURCE_ORDER.index(row["source_key"]),
            row["word_form"],
            row["canonical_word"],
        ),
    )

    csv_path = IMPORT_DIR / "official_vocabulary_memberships.csv"
    fields = [
        "source_key",
        "canonical_word",
        "word_form",
        "coverage_label",
        "provenance",
    ]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    counts = Counter(row["source_key"] for row in rows)
    sql = [
        """-- ============================================================
-- Official vocabulary reference import
-- Generated by scripts/generate_official_vocabulary_import.py
-- Re-runnable: replaces only the five official sources below.
-- Run AFTER supabase/migration.sql.
-- ============================================================

BEGIN;

INSERT INTO vocabulary_sources (
  source_key, display_name, source_type, stage_code, stage_rank,
  version_label, volume_label, published_on, source_url, attribution, is_complete
) VALUES
""",
        source_metadata_sql(),
        """
ON CONFLICT (source_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  source_type = EXCLUDED.source_type,
  stage_code = EXCLUDED.stage_code,
  stage_rank = EXCLUDED.stage_rank,
  version_label = EXCLUDED.version_label,
  volume_label = EXCLUDED.volume_label,
  published_on = EXCLUDED.published_on,
  source_url = EXCLUDED.source_url,
  attribution = EXCLUDED.attribution,
  is_complete = false,
  updated_at = now();

DELETE FROM vocabulary_memberships
WHERE source_key IN (
  'moe-primary-2022',
  'moe-junior-2022',
  'moe-high-school-2020',
  'cet-4',
  'cet-6'
);

""",
    ]
    sql.extend(membership_sql(rows))
    sql.append(
        """
UPDATE vocabulary_sources
SET is_complete = true, updated_at = now()
WHERE source_key IN (
  'moe-primary-2022',
  'moe-junior-2022',
  'moe-high-school-2020',
  'cet-4',
  'cet-6'
);

-- Remove the obsolete combined source created by early development migrations.
DELETE FROM vocabulary_sources
WHERE source_key = 'moe-compulsory-2022';

COMMIT;
"""
    )
    SQL_PATH.write_text("".join(sql), encoding="utf-8")

    summary = IMPORT_DIR / "README.md"
    summary.write_text(
        """# 官方词汇导入产物

- `official_vocabulary_memberships.csv`：规范化、可审计的导入明细。
- `../../supabase/import_official_vocabulary.sql`：可直接在 Supabase SQL Editor 执行的幂等导入脚本。

## 导入行数

"""
        + "\n".join(
            f"- `{source_key}`：{counts[source_key]} 条词形/别名"
            for source_key in SOURCE_ORDER
        )
        + f"\n- 合计：{len(rows)} 条\n\n"
        + """同一个官方词条可以产生多个安全别名，例如官方列出的复数/派生形式、英美拼写、缩写、重音符号、连字符与空格形式。查询以精确别名优先，只有无精确命中时才进行保守词形回退。
""",
        encoding="utf-8",
    )

    print(dict(counts))
    print(f"total={len(rows)} sql={SQL_PATH.stat().st_size} bytes")


if __name__ == "__main__":
    main()
