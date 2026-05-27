# Word Builder 2

面向初一学生的英语背词 Web App。核心学习方式是“意思回想 + 拼写输出”，配合简化 SRS、错词回流、内置外研版七年级词表、自定义词表、CSV 导入和 DeepSeek 生词内容生成。

## 功能概览

- 邮箱/密码登录，所有学习数据存储在 Supabase。
- 今日页展示全部到期复习数；`review_cap` 只限制单次复习批次，未复习完的到期词会继续顺延。
- 新学从词表页发起，可按整词表、单元或逐词勾选选择；完成新词复习后才写入长期学习进度。
- 学习页不提供选择题：先回想中文释义，再输入英文拼写；复习型阶段增加中文场景句英译，要求用到目标词。
- 学习中切换应用、刷新页面、关闭浏览器或换浏览器登录同一账号后，可恢复未完成的学习会话。
- 词表页支持内置词表、自定义词表、CSV 导入、新学选择，以及 AI 生成释义/音标/例句。
- 支持经典主题和 Florr 前端主题；Florr 主题只改变展示，不改变学习流程、SRS 或数据结构。
- 进度页展示已学词数、L3 掌握词数、本周学习天数、等级分布和最近学习记录。
- 我的页支持主题切换、学习设置、TTS 设置、使用手册、JSON 导入导出和清空个人数据。
- 管理员可通过隐藏路由 `#/admin` 查看只读后台，包括全站概览、用户钻取、错词 Top、AI 调用和未完成会话。

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
3. 如需 Florr 主题扩展词表，继续执行 `supabase/import_florr_petals.sql`，导入可选的 `Florr 花瓣词表`。源 CSV 为 `florr_petals.csv`，区域通过现有 `unit` 字段表示。
4. 首个管理员登录一次后，在 Supabase SQL Editor 中把管理员邮箱加入白名单：

```sql
insert into public.admin_users(email)
values (lower('admin@example.com'))
on conflict (email) do nothing;
```

5. 部署 AI 代理函数：

```powershell
supabase functions deploy deepseek-proxy
supabase secrets set DEEPSEEK_API_KEY=<your-key>
```

Edge Function 会读取认证用户、检查 AI 调用限制、调用 DeepSeek，并把计数写回 `user_settings`，同时写入不含 prompt、答案和密钥的轻量 AI 调用事件。生词内容生成每日 30 次；场景题生成和场景题批改各每日 200 次。

轻量事件日志建议保留 90 天，可定期在 SQL Editor 执行：

```sql
delete from public.analytics_events
where created_at < now() - interval '90 days';
```

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
| `#/study?mode=review` | 沉浸式复习 |
| `#/study?mode=new...` | 沉浸式新学，由词表页选择后进入 |
| `#/wordlist` | 内置/自定义词表与新学选择 |
| `#/progress` | 学习进度 |
| `#/settings` | 我的/设置 |
| `#/admin` | 只读后台管理，仅管理员白名单可访问 |
| `/word-builder2/user-manual.html` | 静态使用手册 |

除 `#/login` 外，所有页面都经过 `ProtectedRoute`，未登录会跳转登录页。

## 数据模型

主要表由 `supabase/migration.sql` 定义：

- `built_in_wordlists`、`built_in_words`：共享内置词表，认证用户只读。
- `custom_wordlists`、`custom_words`：用户自定义词表和词汇。
- `user_word_state`：按 `user_id + word` 唯一记录学习等级、复习时间和错误统计。
- `user_usage_exercises`：按用户缓存中文场景句和英文参考答案。
- `sessions`：学习记录和战报数据。
- `user_settings`：学习参数、TTS 参数、生词生成计数和场景题 AI 计数。
- `active_study_sessions`：用户级临时学习恢复点；完成、主动退出或清空数据时删除，不纳入 JSON 导出。
- `admin_users`：后台管理员邮箱白名单，需手动写入小写邮箱。
- `analytics_events`：轻量使用事件，普通用户只能插入自己的事件，后台跨用户读取只走 `SECURITY DEFINER` RPC。

## 目录速查

```text
src/
  App.jsx                 # 路由入口
  components/Layout/      # 登录保护和底部 Tab
  components/Study/       # 回想卡、拼写卡
  lib/                    # Supabase、DeepSeek 代理调用、TTS、轻量 analytics
  pages/                  # Login、Today、Study、Wordlist、Progress、Settings、Admin
  stores/                 # auth/settings/study Zustand stores
  utils/                  # SRS、任务生成、常量、Florr 主题映射
supabase/
  migration.sql
  import_grade7a.sql
  import_grade7b.sql
  import_florr_petals.sql
  functions/deepseek-proxy/index.ts
```

更完整的产品规则见 `requirementV1.md`。
