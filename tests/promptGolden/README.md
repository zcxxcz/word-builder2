# Prompt 黄金用例集

`deepseek-proxy` 三类 prompt（场景题生成 / 批改 / 追问）的回归基线。任何 prompt 改动都应先跑旧版基线、改后再跑一遍对比，而不是凭感觉判断。

## 用例设计

每个用例定义**期望性质**而非期望原文（AI 输出不可复现，原文断言无意义）：

- 出题：通过前端校验（`isValidUsageExercise`）；人称配套（启发式标记，需人工确认）。
- 批改：`passed` 判定符合预期；分数下限；feedback 不得命中禁止模式（如 call 案例不得建议改人称）。
- 追问：回答非空；可选禁止模式；部分用例标记人工检查项。

`grade-call-person-faithful` 与 `explain-call-person-question` 是本专项立项的翻车案例，重构前预期 FAIL/需人工复核，重构后应 PASS——它们就是这次改造的验收标准。

## 运行

```bash
# 列出用例，不发起调用
node scripts/promptGolden.mjs --dry

# 全量跑（约 28 次 AI 调用，消耗该账号当日配额，建议用专用测试账号）
GOLDEN_EMAIL=test@example.com GOLDEN_PASSWORD=... node scripts/promptGolden.mjs --yes

# 只跑批改类 / 单个用例
... --action grade_usage_answer --yes
... --id grade-call-person-faithful --yes
```

Supabase 连接信息从环境变量或 `.env.local` 读取（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）。

## 结果解读

- `PASS`：全部自动检查通过。
- `REVIEW`：自动检查通过，但有需人工确认的项（人称启发式、场景差异化、追问语气）。
- `FAIL`：硬性检查未通过。批改类模型输出有随机性，单个 FAIL 先重跑该用例确认稳定性再下结论。
- `ERROR`：调用失败（额度、网络、认证）。

每次运行的完整输出存档在 `reports/`（已 gitignore），对比新旧 prompt 时拿两份报告并排看。

## 注意

- 出题类用例每次运行都会真实生成并 upsert 到该账号的 `user_usage_exercises` 缓存——这是预期行为，也是用测试账号的原因。
- 新增翻车案例时：把真实的题面/答案/反馈原样录入 `cases.json`，期望性质写「不应该发生什么」。
