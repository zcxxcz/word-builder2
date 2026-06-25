# 官方词汇导入产物

- `official_vocabulary_memberships.csv`：规范化、可审计的导入明细。
- `../../supabase/import_official_vocabulary.sql`：可直接在 Supabase SQL Editor 执行的幂等导入脚本。

## 导入行数

- `moe-primary-2022`：535 条词形/别名
- `moe-junior-2022`：1682 条词形/别名
- `moe-high-school-2020`：3072 条词形/别名
- `cet-4`：6267 条词形/别名
- `cet-6`：1728 条词形/别名
- 合计：13284 条

同一个官方词条可以产生多个安全别名，例如官方列出的复数/派生形式、英美拼写、缩写、重音符号、连字符与空格形式。查询以精确别名优先，只有无精确命中时才进行保守词形回退。
