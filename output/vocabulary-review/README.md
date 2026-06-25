# 官方英语词表核验预览

本目录用于人工确认，尚未生成任何 Supabase 导入 SQL。

## 口径结论

| 学段 | 官方文件 | 官方口径 | 本次预览 |
| --- | --- | --- | --- |
| 小学 | 义务教育英语课程标准（2022年版）二级词汇表 | 505 个单词 | 505 个排版行，与官方 505 个单词一致 |
| 初中 | 同文件三级词汇表 | 共 1600 个单词，含小学 505，初中新增 1095 | 1601 个排版行；大小写同形词、斜杠组合和括号变体使行数不等于官方计数 |
| 高中 | 普通高中英语课程标准（2017年版2020年修订）附录2 | 共 3000：义务教育 1500、必修新增 500、选择性必修新增 1000 | 精确抽取 3000 行；行级标记统计 {'compulsory_baseline': 1500, 'selective_required_new': 1001, 'required_new': 499} |
| 大学 | 全国大学英语四、六级考试大纲（2016年修订版） | 5418 个词目，★ 为六级词 | 精确抽取 5377 个词族排版行；同一行可能含多个派生词或拼写变体，行级统计 {'CET-4': 4114, 'CET-6': 1263} |

## 必须注意的版本差异

- 最新义务教育课标是 2022 年版，初中累计为 1600 词。
- 高中课标文件发布于 2020 年，仍写“含义务教育阶段 1500 词”。两份官方标准相差 100 词，导入时必须保留来源和版本，不能强行视作同一套无版本词表。
- CET 官网当前公开的官方词表文件是 2016 年修订版。CSV 保留词族原行，生成 SQL 前再拆分成员并继承同一 CET 等级。
- 小学、初中 PDF 是扫描版；预览采用 OCR，并对 `AI`、`rush`、`try`、`turn`、`us` 等明显问题做了逐页视觉恢复。`needs_visual_review=yes` 的 9 行请重点抽查。高中和 CET 使用 PDF 自带文本层。

## CET 清理版

- `cet-2016-cleaned.csv` 已整理为一行一个可查询词形，并保留官方词族、页码、四/六级、同形异义编号和清理规则。
- `cet-2016-review-required.csv` 只包含必须确认的 11 个官方词族。
- `cet-2016-review-spot-check.csv` 包含英美拼写、括号可选字母等机械规则抽查项。
- 详细数量和字段说明见 `CET_CLEANUP.md`。

## 开头样例

### 小学二级
a/an, about, after, afternoon, again, age, ago, air, all, also, always, and, angry, animal, answer, any, apple, arm, art, ask, astronaut, at, aunt, autumn, baby, back, bad, bag, ball, banana, basketball, be (am, is, are), beach, bear, beautiful, because, bed, bee, before, begin

### 初中三级
a/an, ability, able, about, above, abroad, absent, accept, accident, according (to), account, ache, achieve, across, act, action, active, activity, actor / actress, actually, ad (=advertisement), add, address, admire, adult, advantage, advice, advise, afford, afraid, after, afternoon, again, against, age, ago, agree, ahead, AI (= artificial intelligence), aid

### 高中
a (an), abandon**, ability, able, abnormal**, aboard**, about, above, abroad, absence**, absent, absolutely*, absorb**, abstract**, abuse**, academic**, accent**, accept, access**, accident*, accommodation**, accompany**, according to, account*, accurate**, accuse**, ache*, achieve, achievement*, acid**, acknowledge**, acquire*, across, act, action, active, activity, actor, actress, actually*

### CET
a/an, abandon, abbreviation, abide, able ability, abnormal, aboard, abolish abolition, abort abortion, about, above, abreast, abroad, abrupt, absent absence, absolute, absorb absorption, abstract, absurd absurdity, abundant abundance, abuse abusive, academy academic academician, accelerate acceleration, accent, accept acceptance acceptable, access accessible, accessory, accident accidental, acclaim, accommodate accommodation

## 官方来源

- [义务教育英语课程标准（2022年版）](https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582349487953.pdf)
- [普通高中课程标准官方通知及附件](https://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html)
- [全国大学英语四、六级考试大纲（2016年修订版）](https://cet.neea.edu.cn/res/Home/1704/55b02330ac17274664f06d9d3db8249d.pdf)
