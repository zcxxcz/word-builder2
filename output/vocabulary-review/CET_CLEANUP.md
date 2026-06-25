# CET 官方词表清理结果

## 输出

- `cet-2016-cleaned.csv`：一行一个可查询词形，共 8046 行。
- `cet-2016-review-needed.csv`：按官方词族合并的抽查表，共 350 行。
- `cet-2016-review-required.csv`：必须确认的 11 个官方词族。
- `cet-2016-review-spot-check.csv`：机械展开规则抽查，共 339 个词族。
- 原始 `cet-2016-word-families.csv` 保留不变，便于回看官方排版。

## 数量

- CET-4 词形行：6321
- CET-6 词形行：1725
- 无需抽查：7404
- 机械规则抽查：630 行，合并为 339 个词族
- 必须确认：12 行，合并为 11 个词族

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
