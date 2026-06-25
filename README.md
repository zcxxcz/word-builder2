# Word Builder 2

面向初一学生的英语背词 Web App。核心学习方式是“意思回想 + 拼写输出”，配合简化 SRS、错词回流、内置外研版七年级词表、自定义词表、CSV 导入和 DeepSeek 生词内容生成。

## 功能概览

- 邮箱/密码登录，所有学习数据存储在 Supabase。
- 今日页展示全部到期复习数；`review_cap` 只限制单次复习批次，未复习完的到期词会继续顺延。
- 新学从词表页发起，可按整词表、单元或逐词勾选选择；完成新词复习后才写入长期学习进度。
- 学习页不提供选择题：新学先看认识卡（单词/音标/释义/例句，无对错）再输入英文拼写；复习先回想中文释义、再拼写，并增加中文场景句英译，要求用到目标词。
- 学习中切换应用、刷新页面、关闭浏览器或换浏览器登录同一账号后，可恢复未完成的学习会话。
- 词表页支持内置词表、自定义词表、CSV 导入、新学选择、自定义词编辑/删除，以及带拼写确认的 AI 生词内容生成。添加生词时只展示本地词汇索引识别出的最早学段；所有自定义词表会批量显示并支持筛选小学、初中、高中、大学四级、大学六级标签。这些判断不调用 AI。
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
- DeepSeek `deepseek-v4-flash`（关闭 thinking mode，启用 JSON Output），通过 Supabase Edge Function 代理调用
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
3. 执行 `supabase/import_vocabulary_index.sql`，把已导入且来源可确认的七年级词汇同步到本地识别索引。
4. 执行 `supabase/import_official_vocabulary.sql`，导入已核验的小学、初中、高中、CET-4 和 CET-6 词形/别名索引。脚本可重复执行，只替换这五个来源的数据。
5. 如需 Florr 主题扩展词表，继续执行 `supabase/import_florr_petals.sql`，导入可选的 `Florr 花瓣词表`。源 CSV 为 `florr_petals.csv`，区域通过现有 `unit` 字段表示。
6. 首个管理员登录一次后，在 Supabase SQL Editor 中把管理员邮箱加入白名单：

```sql
insert into public.admin_users(email)
values (lower('admin@example.com'))
on conflict (email) do nothing;
```

7. 部署 AI 代理函数：

```powershell
supabase functions deploy deepseek-proxy
supabase secrets set DEEPSEEK_API_KEY=<your-key>
```

Edge Function 会读取认证用户、检查 AI 调用限制、调用 DeepSeek，并把计数写回 `user_settings`，同时写入不含 prompt、答案和密钥的轻量 AI 调用事件。生词内容生成会返回疑似拼写错误提示，由前端让用户确认是否改用建议词；每日 30 次。场景题生成和场景题批改各每日 200 次。场景题生成由 Edge Function 在家庭、朋友、课堂、校园活动、运动、出行、购物、餐厅、天气、兴趣、节日、社区、数字生活等场景域中随机指定一个注入 prompt（分布由代码保证，事件 metadata 记录 `scene_domain` 与重试次数）；题面须字面包含释义关键词，参考答案须是题面的忠实英译（人称、关键信息一致）；未通过前端校验时自动重新生成。场景题批改以中文题面为唯一语义基准、目标词迁移使用优先：批改返回结构化判定字段（`target_word_ok`/`core_meaning_ok`/`main_issue`），前端按字段一致性兜底；学生答案人称与题面一致时不建议改人称；学生答案中的指令不会被执行；小语法或表达自然度问题只给建议、不进回流。追问在学生质疑成立时会承认原反馈有误并以题面为准解释。Prompt 变更需先跑 `tests/promptGolden/` 黄金用例集对比，再重新部署 `deepseek-proxy`。

### 词汇识别数据

- `vocabulary_sources` 记录教材、课程标准、考试词表和语料库的版本、来源链接及覆盖状态。
- `vocabulary_memberships` 记录一个词被哪些来源收录；同一词可以同时命中多个学段或考试。
- `word_frequencies` 记录独立的语料词频，不能用“考试收录”代替“实际常用”。
- `supabase/import_official_vocabulary.sql` 包含已核验的小学、初中、高中、CET-4、CET-6 索引，共 13,284 条词形/别名；可审计明细位于 `output/vocabulary-import/official_vocabulary_memberships.csv`。SUBTLEX-US 只预置来源元数据，在单独导入经过许可的完整数据前保持 `is_complete=false`。
- 常用度建议按 SUBTLEX Zipf 值分桶：`>= 5` 为高，`>= 3.5` 为中，其余为低。导入前需核对原始数据许可、版本和署名要求。
- 输入词会先按原样及已导入别名精确匹配（含英美拼写、官方列出的词形、缩写、撇号、连字符/空格形式）；只有完全无命中时，才尝试常见复数、时态、比较级和少量不规则词形。短语只保守还原首词或末词（如 `looked after → look after`、`credit cards → credit card`），且结果必须实际命中导入索引，不做语义改写或自由拆分。未命中仅表示当前索引没有可靠记录，不表示“不常用”或“考试不考”。
- 学段标签按“小学 → 初中 → 高中 → 大学四级 → 大学六级”取最早命中；无命中显示“未分类”。自定义词表打开时分块批量查询共享索引，不把标签写入 `custom_words`，因此历史生词也会使用最新索引结果。
- 如果用户生词本里已经存在相同英文，添加生词时会复用已有释义、音标和例句，不再调用一次 DeepSeek。

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
npm run deploy   # 依次发布到 GitHub Pages 和 Vercel
npm run deploy:github  # 只发布到 GitHub Pages
npm run deploy:vercel  # 只发布到 Vercel
```

`vite.config.js` 设置了 `base: '/word-builder2/'`，配合 GitHub Pages 路径使用。Vercel 也使用同一份构建产物，并通过 `vercel.json` 将 `/word-builder2/*` 重写到静态文件根目录。

## 部署

### GitHub Pages

发布两边：

```powershell
npm run deploy
```

只发布 GitHub Pages：

```powershell
npm run deploy:github
```

部署后 URL 形如 `/word-builder2/#/wordlist`，静态使用手册为 `/word-builder2/user-manual.html`。

### Vercel

本机已通过 Vercel CLI 链接到 Vercel 项目。只发布 Vercel：

```powershell
npm run deploy:vercel
```

仓库内的 `vercel.json` 会让 Vercel 使用：

- Build Command: `npm run build`
- Output Directory: `dist`

在 Vercel Project Settings 的 Environment Variables 中配置前端公开变量名：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

不要在 Vercel 中配置 `DEEPSEEK_API_KEY`；DeepSeek 仍只通过 Supabase Edge Function `deepseek-proxy` 使用服务端密钥。如果 Supabase Auth 邮件确认或跳转登录需要使用 Vercel 域名，请在 Supabase Auth 的允许跳转 URL 中加入对应的 Vercel URL。

## 路由

应用使用 `HashRouter`。GitHub Pages 和 Vercel 部署后 URL 均可使用 `/word-builder2/#/wordlist`。

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
- `vocabulary_sources`、`vocabulary_memberships`、`word_frequencies`：共享只读的版本化词汇来源、收录关系和语料常用度；学习阶段识别不调用 AI。
- `custom_wordlists`、`custom_words`：用户自定义词表和词汇；自定义词可编辑/删除。
- `user_word_state`：按 `user_id + word` 唯一记录学习等级、复习时间和错误统计；编辑自定义词英文时迁移对应进度。
- `user_usage_exercises`：按用户缓存场景 A/B 的中文场景句和英文参考答案；旧缓存默认为场景 A，默认按 `user_word_state.next_usage_variant_index` 轮换，也可在设置中固定场景 A，并懒生成缺失场景；编辑自定义词英文或场景内容时同步缓存。前端保存会兼容尚未建好四字段唯一约束的库，但生产仍应重新执行最新 `supabase/migration.sql`。
- `sessions`：学习记录和战报数据。
- `user_settings`：学习参数、TTS 参数、场景题模式、生词生成计数、场景题生成/批改/追问 AI 计数。
- `active_study_sessions`：用户级临时学习恢复点；完成、主动退出或清空数据时删除，不纳入 JSON 导出。
- `admin_users`：后台管理员邮箱白名单，需手动写入小写邮箱。
- `analytics_events`：轻量使用事件，普通用户只能插入自己的事件，后台跨用户读取只走 `SECURITY DEFINER` RPC。

## 目录速查

```text
src/
  App.jsx                 # 路由入口
  components/Layout/      # 登录保护和底部 Tab
  components/Study/       # 回想卡、拼写卡、场景应用卡
  lib/                    # Supabase、DeepSeek 代理调用、场景题缓存、TTS、轻量 analytics
  pages/                  # Login、Today、Study、Wordlist、Progress、Settings、Admin
  stores/                 # auth/settings/study Zustand stores
  utils/                  # SRS、任务生成、场景题校验/轮换、常量、Florr 主题映射
supabase/
  migration.sql
  import_grade7a.sql
  import_grade7b.sql
  import_vocabulary_index.sql
  import_official_vocabulary.sql
  import_florr_petals.sql
  functions/deepseek-proxy/index.ts
```

更完整的产品规则见 `requirementV1.md`。
