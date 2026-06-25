#!/usr/bin/env python3
"""Normalize the official 2016 CET vocabulary PDF extraction for review.

Input keeps the official word-family layout. Output expands it to one queryable
word form per row while preserving page, level, family, and transformation
provenance. No SQL is generated here.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "output" / "vocabulary-review"
SOURCE_PATH = REVIEW_DIR / "cet-2016-word-families.csv"
CLEAN_PATH = REVIEW_DIR / "cet-2016-cleaned.csv"
REVIEW_PATH = REVIEW_DIR / "cet-2016-review-needed.csv"
REQUIRED_REVIEW_PATH = REVIEW_DIR / "cet-2016-review-required.csv"
SPOT_CHECK_PATH = REVIEW_DIR / "cet-2016-review-spot-check.csv"
SUMMARY_PATH = REVIEW_DIR / "CET_CLEANUP.md"

FULLWIDTH_DIGITS = str.maketrans("１２３４５６７８９０", "1234567890")

# Repairs are limited to extraction artifacts confirmed against the official PDF.
FAMILY_REPAIRS = {
    "accordingto": "according_to",
    "coup(d􀆳état)": "coup(d'état)",
    "o􀆳clock": "o'clock",
}

REQUIRED_REVIEW_FAMILIES = {
    "coup(d􀆳état)": "法语短语及撇号由 PDF 私有字形恢复",
}

ABBREVIATIONS = {
    "ad",
    "apt.",
    "bbq",
    "demo",
    "dorm",
    "flu",
    "homo",
    "kilo",
    "lab",
    "memo",
}


def normalize_pdf_text(value: str) -> str:
    value = FAMILY_REPAIRS.get(value, value)
    return (
        value.translate(FULLWIDTH_DIGITS)
        .replace("．", ".")
        .replace("􀆳", "'")
        .strip()
    )


def expand_optional_parentheses(token: str) -> list[tuple[str, str]]:
    """Expand spelling forms such as colour, colo(u)r, and afterward(s)."""
    match = re.search(r"\(([^()]*)\)", token)
    if not match:
        return [(token, "literal")]

    before = token[: match.start()]
    optional = match.group(1)
    after = token[match.end() :]
    without = before + after
    separator = " " if optional.startswith(("d'", "D'")) else ""
    with_optional = before + separator + optional + after

    expanded: list[tuple[str, str]] = []
    for value, prefix in (
        (without, "optional_omitted"),
        (with_optional, "optional_included"),
    ):
        for nested, nested_rule in expand_optional_parentheses(value):
            rule = prefix if nested_rule == "literal" else f"{prefix}+{nested_rule}"
            expanded.append((nested, rule))
    return expanded


def pop_sense_number(token: str) -> tuple[str, str]:
    match = re.search(r"([123])$", token)
    if not match:
        return token, ""
    return token[:-1], match.group(1)


def expand_slash_token(token: str) -> list[tuple[str, str, str]]:
    """Expand full alternatives and CET's shared-suffix notation.

    The PDF prints forms such as advisor/-er and analyze/-yse. The suffix after
    "/-" replaces the same number of trailing characters in the first form.
    """
    parts = token.split("/")
    first_part, first_sense = pop_sense_number(parts[0])
    first_forms = expand_optional_parentheses(first_part)
    expanded = [(value, rule, first_sense) for value, rule in first_forms]
    base = first_forms[0][0]

    for raw_alternative in parts[1:]:
        alternative, alternative_sense = pop_sense_number(raw_alternative)
        if alternative.startswith("Ｇ"):
            alternative = "-" + alternative[1:]

        if alternative.startswith("-"):
            replacement = alternative[1:]
            if replacement and len(base) > len(replacement):
                value = base[: -len(replacement)] + replacement
                expanded.append(
                    (
                        value,
                        f"shared_suffix:{alternative}",
                        alternative_sense or first_sense,
                    )
                )
            else:
                expanded.append(
                    (
                        alternative,
                        "unresolved_shared_suffix",
                        alternative_sense or first_sense,
                    )
                )
            continue

        for value, rule in expand_optional_parentheses(alternative):
            expanded.append(
                (value, f"slash_alternative:{rule}", alternative_sense)
            )

    return expanded


def split_family(raw_family: str) -> list[dict[str, str]]:
    normalized = normalize_pdf_text(raw_family)
    normalized = normalized.replace("Ｇ", "-")

    # Protect the one official multiword headword repaired above.
    normalized = normalized.replace("according_to", "according§to")
    tokens = normalized.split()

    members: list[dict[str, str]] = []
    for token_index, token in enumerate(tokens):
        token = token.replace("according§to", "according to")
        for variant_index, (display_form, rule, sense_number) in enumerate(
            expand_slash_token(token)
        ):
            display_form = display_form.strip()
            if not display_form:
                continue
            members.append(
                {
                    "display_form": display_form,
                    "token_index": str(token_index),
                    "variant_index": str(variant_index),
                    "sense_number": sense_number,
                    "normalization_rule": rule,
                }
            )

    return members


def normalize_word_form(display_form: str) -> str:
    return re.sub(r"\s+", " ", display_form.strip().lower())


def member_kind(token_index: int, variant_index: int) -> str:
    if token_index == 0 and variant_index == 0:
        return "canonical"
    if token_index == 0:
        return "canonical_variant"
    if variant_index == 0:
        return "derived"
    return "derived_variant"


def mechanical_review_reason(raw_family: str, member: dict[str, str]) -> str:
    reasons: list[str] = []
    rule = member["normalization_rule"]
    if "shared_suffix" in rule:
        reasons.append("共享词尾替换")
    if "optional_" in rule:
        reasons.append("括号可选拼写")
    if "slash_alternative" in rule:
        reasons.append("斜杠并列形式")
    if member["sense_number"]:
        reasons.append("同形异义编号已移至 sense_number")
    if member["display_form"].lower() in ABBREVIATIONS:
        reasons.append("缩写形式")
    if "Ｇ" in raw_family:
        reasons.append("PDF 连字符/共享词尾字形已恢复")
    return "；".join(dict.fromkeys(reasons))


def required_review_reason(raw_family: str, member: dict[str, str]) -> str:
    reasons: list[str] = []
    if raw_family in REQUIRED_REVIEW_FAMILIES:
        reasons.append(REQUIRED_REVIEW_FAMILIES[raw_family])
    if member["normalization_rule"] == "unresolved_shared_suffix":
        reasons.append("共享词尾无法自动展开")
    if not re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿ.' -]+", member["display_form"]):
        reasons.append("清理后仍含异常字符")
    return "；".join(reasons)


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    source_rows = list(csv.DictReader(SOURCE_PATH.open(encoding="utf-8-sig")))
    cleaned_rows: list[dict[str, str]] = []

    for family_index, source in enumerate(source_rows, start=1):
        members = split_family(source["raw_family"])
        if not members:
            continue

        canonical_word = normalize_word_form(members[0]["display_form"])
        seen_in_family: set[tuple[str, str]] = set()
        for member_index, member in enumerate(members, start=1):
            word_form = normalize_word_form(member["display_form"])
            unique_key = (word_form, member["sense_number"])
            if unique_key in seen_in_family:
                continue
            seen_in_family.add(unique_key)

            required_reason = required_review_reason(source["raw_family"], member)
            spot_check_reason = mechanical_review_reason(source["raw_family"], member)
            cleaned_rows.append(
                {
                    "entry_id": f"{family_index:04d}-{member_index:02d}",
                    "pdf_page": source["pdf_page"],
                    "cet_level": source["cet_level"],
                    "canonical_word": canonical_word,
                    "word_form": word_form,
                    "display_form": member["display_form"],
                    "member_kind": member_kind(
                        int(member["token_index"]), int(member["variant_index"])
                    ),
                    "sense_number": member["sense_number"],
                    "source_family": source["raw_family"],
                    "normalization_rule": member["normalization_rule"],
                    "review_status": "required" if required_reason else (
                        "spot_check" if spot_check_reason else "clean"
                    ),
                    "review_reason": required_reason or spot_check_reason,
                }
            )

    forms_by_level: dict[str, set[str]] = defaultdict(set)
    for row in cleaned_rows:
        forms_by_level[row["word_form"]].add(row["cet_level"])

    for row in cleaned_rows:
        if len(forms_by_level[row["word_form"]]) > 1:
            conflict_reason = "同一拼写同时出现在 CET-4 与 CET-6 词族中"
            row["review_status"] = "required"
            row["review_reason"] = "；".join(
                part for part in (row["review_reason"], conflict_reason) if part
            )

    # Family-level review sheet is shorter and easier to inspect than repeated
    # member rows. Required items come first, then one sample per mechanical rule.
    family_reviews: dict[tuple[str, str, str], dict[str, str]] = {}
    for row in cleaned_rows:
        if row["review_status"] == "clean":
            continue
        key = (row["pdf_page"], row["cet_level"], row["source_family"])
        review = family_reviews.setdefault(
            key,
            {
                "pdf_page": row["pdf_page"],
                "cet_level": row["cet_level"],
                "source_family": row["source_family"],
                "proposed_forms": "",
                "review_status": row["review_status"],
                "review_reason": "",
            },
        )
        if row["review_status"] == "required":
            review["review_status"] = "required"
        forms = [
            item["display_form"]
            for item in cleaned_rows
            if (
                item["pdf_page"],
                item["cet_level"],
                item["source_family"],
            )
            == key
        ]
        review["proposed_forms"] = " | ".join(dict.fromkeys(forms))
        reasons = [
            item["review_reason"]
            for item in cleaned_rows
            if (
                item["pdf_page"],
                item["cet_level"],
                item["source_family"],
            )
            == key
            and item["review_reason"]
        ]
        review["review_reason"] = "；".join(
            dict.fromkeys(reason for value in reasons for reason in value.split("；"))
        )

    review_rows = sorted(
        family_reviews.values(),
        key=lambda row: (
            0 if row["review_status"] == "required" else 1,
            int(row["pdf_page"]),
            row["source_family"].lower(),
        ),
    )

    cleaned_fields = [
        "entry_id",
        "pdf_page",
        "cet_level",
        "canonical_word",
        "word_form",
        "display_form",
        "member_kind",
        "sense_number",
        "source_family",
        "normalization_rule",
        "review_status",
        "review_reason",
    ]
    review_fields = [
        "pdf_page",
        "cet_level",
        "source_family",
        "proposed_forms",
        "review_status",
        "review_reason",
    ]
    write_csv(CLEAN_PATH, cleaned_rows, cleaned_fields)
    write_csv(REVIEW_PATH, review_rows, review_fields)
    required_review_rows = [
        row for row in review_rows if row["review_status"] == "required"
    ]
    spot_check_rows = [
        row for row in review_rows if row["review_status"] == "spot_check"
    ]
    write_csv(REQUIRED_REVIEW_PATH, required_review_rows, review_fields)
    write_csv(SPOT_CHECK_PATH, spot_check_rows, review_fields)

    clean_count = sum(row["review_status"] == "clean" for row in cleaned_rows)
    spot_count = sum(row["review_status"] == "spot_check" for row in cleaned_rows)
    required_count = sum(row["review_status"] == "required" for row in cleaned_rows)
    required_families = sum(
        row["review_status"] == "required" for row in review_rows
    )
    spot_families = sum(
        row["review_status"] == "spot_check" for row in review_rows
    )
    level_counts = defaultdict(int)
    for row in cleaned_rows:
        level_counts[row["cet_level"]] += 1

    SUMMARY_PATH.write_text(
        f"""# CET 官方词表清理结果

## 输出

- `cet-2016-cleaned.csv`：一行一个可查询词形，共 {len(cleaned_rows)} 行。
- `cet-2016-review-needed.csv`：按官方词族合并的抽查表，共 {len(review_rows)} 行。
- `cet-2016-review-required.csv`：必须确认的 {required_families} 个官方词族。
- `cet-2016-review-spot-check.csv`：机械展开规则抽查，共 {spot_families} 个词族。
- 原始 `cet-2016-word-families.csv` 保留不变，便于回看官方排版。

## 数量

- CET-4 词形行：{level_counts['CET-4']}
- CET-6 词形行：{level_counts['CET-6']}
- 无需抽查：{clean_count}
- 机械规则抽查：{spot_count} 行，合并为 {spot_families} 个词族
- 必须确认：{required_count} 行，合并为 {required_families} 个词族

## 字段

- `canonical_word`：该官方词族的首个标准形式。
- `word_form`：用于索引匹配的小写词形。
- `display_form`：保留大小写、句点和重音符号的展示形式。
- `member_kind`：词族主词、主词变体、派生词或派生词变体。
- `sense_number`：官方同形异义上标编号，已从词形中移出。
- `review_status`：`clean`、`spot_check` 或 `required`。

## 清理规则

- `advisor/-er`、`analyze/-yse`：展开为完整英美拼写。
- `colo(u)r`、`afterward(s)`：展开括号中的可选字母。
- `air-conditioning`：恢复 PDF 文本层中的连字符。
- 同形异义数字不进入 `word_form`，单独放入 `sense_number`。
- 同一拼写若跨 CET-4/CET-6，标记为 `required`，由人工决定导入优先级。
""",
        encoding="utf-8",
    )

    print(
        f"cleaned={len(cleaned_rows)} review_families={len(review_rows)} "
        f"required_families={required_families} spot_families={spot_families}"
    )


if __name__ == "__main__":
    main()
