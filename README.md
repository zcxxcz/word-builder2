# Word Builder 2

面向初一学生的英语背词 Web App。核心学习方式是“意思回想 + 拼写输出”，配合简化 SRS、错词回流、内置外研版七年级词表、自定义词表、CSV 导入和 DeepSeek 生词内容生成。

## 功能概览

- 邮箱/密码登录，所有学习数据存储在 Supabase。
- 今日任务由到期复习、新学单词、新词自动复习、错词回流组成；单次到期复习最多 10 个词。
- 学习页不提供选择题：先回想中文释义，再输入英文拼写；复习型阶段增加中文场景句英译，要求用到目标词。
- 学习中切换应用或刷新页面后，会恢复未完成的学习会话。
- 词表页支持内置词表、自定义词表、CSV 导入，以及 AI 生成释义/音标/例句。
- 进度页展示已学词数、L3 掌握词数、本周学习天数、等级分布和最近学习记录。
- 我的页支持学习设置、TTS 设置、JSON 导入导出和清空个人数据。

## 技术栈

- Vite 7 + React 19
- React Router 7，使用 `HashRouter`
- Zustand
- Vanilla CSS
- Supabase Auth、PostgreSQL、RLS、Edge Functions
- DeepSeek `deepseek-chat`，通过 Supabase Edge Function 代理调用
- Web Speech API TTS

## 快速开始

```powershell
npm install
npm run dev
```

开发服务器默认执行 `vite --host`，可供同一局域网内手机访问。

## 环境变量

前端只需要 Supabase 项目的公开连接信息：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

DeepSeek 密钥只放在 Supabase Edge Function 的服务端环境中：

```powershell
supabase secrets set DEEPSEEK_API_KEY=<your-key>
```

不要把真实 `.env` 值、Supabase anon key 以外的服务端密钥、DeepSeek key 写入文档、日志或提交记录。

## Supabase 初始化

1. 在 Supabase SQL Editor 中执行 `supabase/migration.sql`，创建表、索引和 RLS 策略。
2. 继续执行 `supabase/import_grade7a.sql` 和 `supabase/import_grade7b.sql`，导入七年级上/下册内置词表。
3. 部署 AI 代理函数：

```powershell
supabase functions deploy deepseek-proxy
supabase secrets set DEEPSEEK_API_KEY=<your-key>
```

Edge Function 会读取认证用户、检查 AI 调用限制、调用 DeepSeek，并把计数写回 `user_settings`。生词内容生成每日 30 次；场景题生成和场景题批改各每日 200 次。

## 常用命令

```powershell
npm run dev      # 本地开发
npm run build    # 生产构建
npm run preview  # 预览 dist
npm run lint     # ESLint 检查
npm run deploy   # 构建并发布到 gh-pages
```

`vite.config.js` 设置了 `base: '/word-builder2/'`，配合 GitHub Pages 路径使用。

## 路由

应用使用 `HashRouter`，部署后 URL 形如 `/word-builder2/#/wordlist`。

| 路由 | 页面 |
| --- | --- |
| `#/login` | 登录/注册 |
| `#/` | 今日任务 |
| `#/study` | 沉浸式学习 |
| `#/wordlist` | 内置/自定义词表 |
| `#/progress` | 学习进度 |
| `#/settings` | 我的/设置 |

除 `#/login` 外，所有页面都经过 `ProtectedRoute`，未登录会跳转登录页。

## 数据模型

主要表由 `supabase/migration.sql` 定义：

- `built_in_wordlists`、`built_in_words`：共享内置词表，认证用户只读。
- `custom_wordlists`、`custom_words`：用户自定义词表和词汇。
- `user_word_state`：按 `user_id + word` 唯一记录学习等级、复习时间和错误统计。
- `user_usage_exercises`：按用户缓存中文场景句和英文参考答案。
- `sessions`：学习记录和战报数据。
- `user_settings`：学习参数、TTS 参数、生词生成计数和场景题 AI 计数。

## 目录速查

```text
src/
  App.jsx                 # 路由入口
  components/Layout/      # 登录保护和底部 Tab
  components/Study/       # 回想卡、拼写卡
  lib/                    # Supabase、DeepSeek 代理调用、TTS
  pages/                  # Login、Today、Study、Wordlist、Progress、Settings
  stores/                 # auth/settings/study Zustand stores
  utils/                  # SRS、任务生成、常量
supabase/
  migration.sql
  import_grade7a.sql
  import_grade7b.sql
  functions/deepseek-proxy/index.ts
```

更完整的产品规则见 `requirementV1.md`。
