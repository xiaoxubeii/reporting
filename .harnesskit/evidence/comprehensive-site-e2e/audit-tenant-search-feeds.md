# 租户、Search 与 Feeds E2E 只读审计

> 状态：修复前审计快照。以下结论描述审计当时的代码；最终修复和验证结果以 `verification.md` 与 `results.json` 为准。

日期：2026-07-27
工作树：`/home/ubuntu/workspace/reporting.worktrees/comprehensive-site-e2e`
OpenSpec change：`add-comprehensive-site-e2e`
审计范围：未完成任务 2.4、3.1–3.4、4.1–4.4

## 审计边界与结论

本报告仅依据当前工作树中的 OpenSpec、产品代码、API、单元/集成测试和 `tests/e2e` 做静态审计。未启动或停止服务，未创建/删除用户、Fund、Miniflux 订阅或 Deal，未运行会写共享数据库/外部服务的 E2E 命令。

当前实现有一套可运行的 Playwright 骨架、两个 disposable Fund 夹具、浏览器失败观察器和能力报告；但 2.4、3.1–3.4、4.1–4.4 仍不应勾选。现有浏览器覆盖实质上是：预建 Fund 后登录、把 A 的 cookie 拷贝到 B Host 后做一个页面和一个 GET API 的 404 检查、一次硬编码五源 Search happy path、一次“新建文件夹关注→Following→取消关注→只打开 Explore 三个页签”的 happy path。它没有满足独立双上下文隔离、动态适配器矩阵、Search 无结果/部分失败/不安全输出、Feeds 阅读/保存状态、个人 Miniflux 隔离、后台发现到 Deal、依赖故障恢复等验收合同。

## 当前真实入口与架构路径

| 能力 | 真实界面路径 | 关键 API / 后台路径 | 当前 E2E |
|---|---|---|---|
| 注册/登录/Fund 创建 | `/auth/signup`、`/auth`、平台 Host `/onboarding`、创建后 `${slug}.localhost:<port>/funds/setup` | `POST /api/auth/signup`、`GET/POST /api/onboarding/fund`、`POST /api/auth/logout` | `tenancy-auth.spec.ts` 只覆盖预建 Fund 的 `/auth` 登录 |
| Fund 品牌和导航 | tenant Host `/dashboard`、`/settings`（Fund branding）及主导航 | `GET/PATCH /api/settings` | 只断言 Fund 名出现和 `main` 可见 |
| Search | tenant Host `/search` | `POST /api/search`；运行时由 Fund category config、source policy、个人 Feeds 连接和 SearXNG 可用性组装 adapter registry | `search.spec.ts` 一次 live 查询，硬编码五个 source id |
| 关注来源/Following | `/feeds/sources`、`/feeds/sources?view=following` | `/api/feeds/connection`、`/api/feeds/sources`、`/api/feeds/explore/*`、`/api/feeds/subscriptions/*` | 新文件夹关注、展示 Following、取消关注 |
| 个人阅读器 | `/feeds`，详情通过 `?entry=<Miniflux entry id>` | `/api/feeds/entries`、`/api/feeds/entries/:id`、`PATCH /api/feeds/entries/:id/state` | 未覆盖 |
| Explore Latest | `/feeds?view=explore`，详情通过 `exploreEntry=` | `/api/feeds/explore/categories|entries|following|sources` | 仅断言入口和页签存在 |
| Trending / Deal Signals | `/feeds?view=explore&exploreView=trending|deal_signal` | `GET /api/feeds/explore/discovery`；`GET /api/cron/feeds-discovery` 调度真实后台作业 | 仅点击两个页签 |

## 2.4 依赖能力检查

### 当前实现

- `scripts/e2e/run-comprehensive.mjs` 在 `devctl.sh start` 后调用 `scripts/e2e/capabilities.mjs`，并把结果写入 `.harnesskit/evidence/comprehensive-site-e2e/capabilities.json`。
- 当前硬性门禁：Web 进程、Cron 进程、Supabase、Miniflux、SearXNG、Supabase service role、Miniflux provisioner token file、browser。
- 当前仅报告但不验证：AI key、平台 mail key、Fund mail encryption key。
- 当前保留的 capability 报告显示 Web/Cron/Supabase/Miniflux/SearXNG/browser 为 running，AI unconfigured，platform mail configured，Fund mail encryption unconfigured。

### 所需夹具/依赖

- 运行时：真实 Web 与 Cron readiness URL，而非仅 PID 身份。
- Supabase：本地 URL、已应用全部 migration、service-role 可执行最小只读 probe；fixture create/cleanup 另需本地 DB container。
- Miniflux：health、collector 用户 `reporting_explore` 的 token/user-id 一致性、provisioner token 的实际认证、每个 E2E 用户的独立账号。
- SearXNG：health 之外还应做一次受限 JSON search probe。
- Search 直连适配器：PubMed EUtils、ClinicalTrials.gov、openFDA；它们目前不在 capability inventory 中。
- Browser：必须实际 `chromium.launch()`/打开空页，或验证明确的 Chromium executable；Playwright CLI 本身不是浏览器 runtime。
- AI/mail：不能只看环境变量是否非空；至少区分 `unconfigured`、`configured-unverified`、`running`、`degraded`。不同场景应声明 required/degraded/skipped，而不是全套一刀切。

### 可复现成功/失败场景

- 成功：每项 probe 返回结构化状态、耗时和安全的非秘密来源；能力报告权限为 0600；真正需要的能力均满足后才进入对应项目。
- 失败：逐个移除 URL/token、返回 401/404/500、超时或 malformed JSON，断言失败信息只含 capability 名称和状态，不泄漏 key/token/响应体。
- 降级：只运行 tenancy 时 Miniflux/SearXNG/AI/mail 不应阻断；Search/Feeds/Discovery 项目按自己的 capability 选择 fail、skip 或 degraded assertion，并把原因写入 machine-readable report。

### 当前缺口与可能暴露的 bug

1. `browserCapability()` 把 `node_modules/.bin/playwright` 可执行视为 browser running；未安装 Playwright browser 且没有系统 Chromium 时会假阳性。
2. Web/Cron 只通过 runtime state + PID identity 判断，能力采集阶段没有再次请求 `/` 和 `/readyz`。
3. Supabase health 以任意 `<500` 为 running，401/404 也会通过；Miniflux provisioner 只检查 token file 可读，不验证 token 可用。
4. AI/mail 仅检查环境变量非空，错误 key 仍为 `configured`。
5. PubMed、ClinicalTrials.gov、openFDA 是默认 live adapter，却完全不在依赖检查中；一次网络抖动会被误判成产品/E2E 失败。
6. 所有 focused E2E 都被全局 Miniflux/SearXNG 硬门禁，违背设计中的“按场景 required/degraded/skipped”。

### 建议测试文件

- 修改 `tests/e2e-capabilities.test.ts`：补 browser launch/CLI 假阳性、Web/Cron readiness、Supabase 401/404、Miniflux provisioner auth、AI/mail configured-unverified、直连 adapter probes、按项目 capability policy。
- 新增 `tests/e2e/dependency-capabilities.spec.ts`：只读展示/附加 capability report，并验证 targeted project 的 skip/fail/degraded 语义。
- 修改 `scripts/e2e/capabilities.mjs` 与 `scripts/e2e/run-comprehensive.mjs` 时保留现有脱敏与 0600 写入约束。

## 3.1 注册、Fund 创建、canonical continuation、品牌、登录退出和导航

### 所需夹具/依赖

- 一个“已激活但无 Fund membership”的本地用户；这与当前直接预建 Fund 的 `investment-e2e-fixture.ts create` 必须分开。
- 若走注册页，需要 disposable allowlist/invitation 和可读取本地 Supabase OTP；更稳定的“supported local activation”是 admin 创建 email-confirmed user，但必须从真实 `/auth` 登录后走 `/onboarding` UI 创建 Fund。
- 唯一 Fund name/slug、可上传的小型 PNG/WebP 品牌夹具、可安全清理的身份标记。

### 可复现成功场景

1. 平台 Host `/auth` 登录 activation-only user，进入 `/onboarding`。
2. 填 Fund name/slug，提交真实 `POST /api/onboarding/fund`；断言跳到 `${slug}.localhost:<port>/funds/setup`，而非平台 Host 或旧 Host。
3. 完成/进入 setup 后访问 `/dashboard` 和若干已启用主导航。
4. 在 `/settings` 修改 Fund name/logo，重新打开 `/auth` 或 dashboard，验证 request-scoped tenant branding。
5. 用真实 logout control/`POST /api/auth/logout` 退出；受保护页回到 tenant `/auth`；再次登录后回到正确 tenant。

### 可复现失败场景

- slug 冲突时保留表单并显示 `fund_identity_conflict` 对应信息，不创建半成品 Fund。
- tenant Host 上直接访问 `/onboarding` 或 `POST /api/onboarding/fund` 返回 fail-closed 404。
- 未登录访问 onboarding/API 为 401/跳转 auth；错误密码留在 tenant auth 并显示安全错误。

### 当前缺口/可能 bug

- 当前 fixture 已经通过 service role 创建 user、Fund、membership、settings，浏览器完全绕过注册/activation 和 Fund creation。
- `tenancy-auth.spec.ts` 没有品牌修改、logout、重新登录或导航验证。
- 若现有 fixture 直接用于 3.1，`GET /api/onboarding/fund` 会直接返回 `created` 并跳 setup，无法证明创建流程。

### 建议测试文件

- 新增 `tests/e2e/onboarding-auth.spec.ts`，专门使用 activation-only fixture。
- 扩展 `tests/e2e/support/fixture-state.ts` 和 fixture CLI，增加 `create-user`/`create-fund` 分阶段状态，避免 3.1 与后续预建数据场景耦合。
- 保留并扩展 `tests/auth-fund-host.test.ts`、`tests/tenant-auth-branding.test.tsx` 作为失败后的回归层。

## 3.2 第二 Fund 的 Host/session/URL/token/branding/read/mutation 隔离

### 所需夹具/依赖

- 两个独立 browser context，各自登录 primary/secondary user；不能只在同一 context 中复制 cookie。
- 每个 Fund 唯一 name、logo、settings marker、Deal/content marker、submission token；每个用户独立 Miniflux marker。
- 记录 A/B 的 tenant origin、resource IDs 与提交 token，cleanup 需同时证明两个 Fund 无残留。

### 可复现成功与失败场景

- 成功基线：A、B 各自在自己的 Host 看见自己的 branding/settings/data，且同一路径正常读写。
- Host/session：把 A session 注入 B Host、把 B session 注入 A Host，页面和 API 都 404/deny，响应不含任一 Fund marker。
- URL/read：在 B context 直接打开 A 的 `/deals/:id`、相关 GET API、Feed/设置资源 ID，fail closed。
- mutation：B context 用 A resource ID 尝试 PATCH/DELETE；断言响应拒绝，并从 A context 重读确认 A 未变、从 B context确认 B 也未被误改。
- token：A 的 public submission token 只解析到 A 的 public intake；B 的登录 session/Host 不能把内容写入 B，也不能借 B Host 暴露 A 私有数据。无效/交叉 Host token返回安全 404。
- branding：错误 Host/session 时既不显示 A，也不显示 B branding，避免存在性侧信道。

### 当前缺口/可能 bug

- 当前 `a copied Fund A session...` 使用同一个 `page/context`，B 用户从未登录，不满足 independent browser contexts。
- 只测 `/dashboard` 和 `GET /api/settings`；没有反向 B→A、资源 ID、token、真实 mutation 或 mutation 后双边重读。
- 当前断言只能证明“无 B session 时 B Host 拒绝 A cookie”，不能证明“两个有效 session/data plane 相互隔离”。
- Feeds 多数 mutation route 依赖 JSON/CORS 与 access gate，但不像 Search 和 Explore follow 那样统一调用显式 same-origin guard；建议在隔离测试中加入 cross-origin Origin/Host 组合，以判断是否存在 CSRF/Host contract 不一致。

### 建议测试文件

- 重写/扩展 `tests/e2e/tenancy-auth.spec.ts`：使用 `browser.newContext()` 创建 A/B context，并加入双向 page/API/read/mutation/token matrix。
- 新增 `tests/e2e/support/tenant-matrix.ts`：只保存 marker/route matrix，不保存 secrets。
- 针对发现的边界缺陷扩展 `tests/onboarding-tenant-scope.test.tsx`、`tests/auth-fund-host.test.ts`、相应 API route test。

## 3.3 动态 Search adapter inventory 与代表性/无结果/部分失败查询

### 当前产品合同

- 代码合同 `SEARCH_ADAPTER_IDS` 共 7 个：`feeds`、`pubmed`、`clinical_trials`、`fda`、`tctmd`、`massdevice`、`web`。
- `tctmd`/`massdevice` 当前 descriptor 的 `liveTransportAvailable=false`；默认运行时通常是已连接的 `feeds` + Fund policy 开启的 PubMed/ClinicalTrials/FDA + 可用 SearXNG web，即五个 live adapter。
- 实际 runnable set 还受 Fund `search_source_config`、`search_category_config`、个人 Miniflux 连接和 SearXNG health 影响，因此测试不能维护第二份硬编码列表。

### 所需夹具/依赖

- 从产品合同/运行时可观察接口取得 enabled/runnable inventory；若不新增安全的只读 contract endpoint，可在测试辅助层导入 code-owned descriptors，再与页面 category/API source statuses 双向校验。
- 每个 runnable adapter 的确定性 query：Feed 需要 seeded personal entry；Web/Specialized 最好使用受控本地 adapter fixture/proxy，或把外部实时结果明确标为 external non-deterministic。
- 三类 query：每源至少一个代表性结果、全源无结果、单源 timeout/429/malformed 而其他源成功。

### 可复现成功/失败场景

- 对 inventory 中每个 enabled adapter，从 `/search` 的真实 category control 发起查询，断言响应 `sources` 恰好覆盖动态集合，无遗漏/额外源。
- 无结果：HTTP 200、每源 `empty`、Results 显示 no-results，不显示全局 error。
- 部分失败：HTTP 200、`partial=true`，失败源有安全 status/retryable/message，其他源结果仍渲染；页面出现 partial summary。
- unavailable category：disabled checkbox；伪造/旧 category ID 的 API 请求 400，不能由客户端直接传 adapter IDs。

### 当前缺口/可能 bug

- `search.spec.ts` 硬编码五个 category label 和五个 expected source id，直接违背“derive inventory from application contract”。
- 只有查询 `cardiovascular stent`；没有每-adapter 代表性断言、无结果、部分失败、timeout/rate-limit/invalid-response。
- 测试只断言 response source IDs 和 Results heading，不证明各 adapter 真有结果；source 可以是 `empty` 或失败而仍出现在数组中。
- Public medical adapters 未纳入能力检查，实时互联网波动会导致 flakiness。

### 建议测试文件

- 重写 `tests/e2e/search.spec.ts` 为动态 matrix，并把 happy/no-result/partial-failure 分成独立场景。
- 新增 `tests/e2e/support/search-inventory.ts`，只从 canonical descriptors/category contract 派生期望值。
- 继续使用 `lib/search/adapter-registry.test.ts`、`adapter-executor.test.ts`、各 adapter test 做精确错误/normalize 回归；浏览器层验证最终组合和 UI。

## 3.4 Search provenance、授权、安全 URL/action、normalize、不安全结果与降级

### 真实断言面与所需夹具

- API：`results[].primaryOrigin/origins/sources/identifiers/feedEntryId`、`sources[].status/resultCount/retryable/message`、`partial`。
- UI：source badges、外链 `target=_blank` + `rel=noopener noreferrer`、Feed reader action、partial banner、no-results、stale marker。
- 受控结果夹具：同一 DOI/PMID/URL 的跨源重复项、HTML/script title/snippet、`javascript:`/loopback/private URL、超长/坏日期/坏 identifier、Feed entry。
- 授权夹具：A/B 不同 category/source policy；B 请求 A 的 category ID 或复制 A 页面状态时只能按 B 的 server config 执行。

### 可复现成功/失败场景

- Provenance/normalize：重复结果合并且保留多 source badges、canonical URL 与合法 identifiers；主来源优先级符合合同。
- 安全 URL/action：不安全 URL 不产生可点击链接，Feed action 只对当前用户真实 entry 工作；跨用户 entry ID 拒绝。
- 授权：无 session 401、无 Search grant 403、未知/disabled category 400、cross-origin JSON 403、错误 Fund policy 不被客户端覆盖。
- 降级：单源失败仍展示其他结果和 partial banner；全部可用源无结果是 empty，不是失败；category config 不可用显示显式 alert。

### 当前缺口与可能产品 bug

- 现有 E2E 没有检查任何 result、badge、link、identifier、Feed reader、partial/no-result/error UI，也没有 Search API 授权失败场景。
- `AdapterExecutor` 会把 normalization 拒绝的候选静默丢弃；如果上游只返回不安全候选，source 被报告为 `empty`，而不是 `invalid_response/partial`。安全性上结果被阻止，但运营/UI 无法区分“真实无结果”和“上游全被安全策略拒绝”；需由产品决定是否提升为可观察的 degraded 状态。
- 当前 Search E2E 先直接 `POST /api/feeds/connection`，但没有验证 Feed result/action 是否真正属于该用户。

### 建议测试文件

- 扩展 `tests/e2e/search.spec.ts`，加入 provenance/action/authorization/degraded 断言。
- 新增受控安全边界 E2E（建议 `tests/e2e/search-safety.spec.ts`），配合本地 SearXNG fixture/proxy；不要用 Playwright route mock 绕过真实 `/api/search`。
- 若修正“unsafe-only 被记为 empty”，在 `lib/search/adapter-executor.test.ts`、`lib/search/merge.test.ts` 加 focused regression。

## 4.1 curated discovery、分类关注、重复关注、reader state、取消关注恢复

### 所需夹具/依赖

- collector 中至少一个稳定 category、source 和 entry；个人 Miniflux 初始为空。
- 一个已有 personal category 和一个本次新建的 unique category。
- 可触发个人 Miniflux 拉取的本地稳定 RSS；关注后需显式 refresh/poll，不能假设远端立即产生 entry。

### 可复现成功/失败场景

1. `/feeds/sources` 打开 curated category/source，分别关注到已有 category 和新 category。
2. 对同一 source 再次发起 follow，断言幂等地返回同一个订阅且不重复计数/分类；UI 显示 Following。
3. `/feeds` 打开 entry，切换 read/unread、save/remove saved，并在刷新及 `Unread/All/Saved` filter 间验证持久化。
4. `/feeds/sources?view=following` 取消关注；回 curated catalog 验证 Follow 恢复；重复 DELETE/已删除资源安全返回且无副作用。
5. 失败：无权限、坏 category、上游创建失败时显示行级错误，不能留下幽灵 Following 状态。

### 当前缺口/可能 bug

- 当前只覆盖“新 Folder follow→Following 中出现→DELETE→行消失”；未测已有 category、duplicate、reader、read/save、回 catalog 恢复或失败恢复。
- 关注后立即依赖外部 collector/source 状态，没有 deterministic personal entry fixture。
- `POST /api/feeds/subscriptions` 对已存在 feed 仍返回 201，幂等性由 service 保证但 E2E 没有证明只有一个订阅/分类归属稳定。

### 建议测试文件

- 拆分/扩展 `tests/e2e/feeds.spec.ts`：`follow lifecycle`、`reader state` 两个 serial scenario。
- 增加 `tests/e2e/support/miniflux-fixture.ts`，只管理当前 E2E 用户和带 ownership marker 的 source/category/entry。
- 若发现重复关注/恢复问题，补 `lib/feeds/service.test.ts`、`tests/feeds-routes.test.ts`。

## 4.2 Following 分组/管理与 personal/collector/第二 Fund 隔离

### 所需夹具/依赖

- A/B 用户各自被 provision 成不同的 non-admin Miniflux identity；A/B 各自独有 category/source marker。
- 独立只读 collector `reporting_explore`，其 token 不暴露给浏览器，且个人 mutation 后 collector feed/category/count 不变化。

### 可复现成功/失败场景

- A 的 Following 只显示 A category/source；B 只显示 B；search/group/count/unread state 均不串租户。
- A 关注/取消 curated source 不改变 collector `/explore/categories|sources|entries`，也不改变 B。
- B 使用 A 的 personal entry/feed ID 做 GET/PATCH/DELETE 时拒绝或 not-found；A 数据复读不变。
- collector entry/source ref 只允许通过 read-only Explore API；客户端不能提交 collector metadata 冒充 source。

### 当前缺口/可能 bug

- secondary fixture 从未调用 `/api/feeds/connection`，也没有任何 B Miniflux 数据或独立 browser context。
- 当前浏览器测试没有验证 Following group 搜索/count、collector immutability 或跨用户 entry/subscription ID。
- 单元层 `lib/feeds/service.test.ts` 有用户隔离合同，但它不能替代真实 credential + Miniflux + browser path。

### 建议测试文件

- 新增 `tests/e2e/feeds-isolation.spec.ts`，用 A/B 两个 context 和两套 Miniflux marker。
- 扩展 `tests/feeds-routes.test.ts`、`tests/feeds-explore-routes.test.ts` 覆盖跨用户 ID 与 collector mutation 拒绝。

## 4.3 Explore Latest、Trending、解释、Deal Signals 与 Feed-to-Deal

### 所需夹具/依赖

- collector 中有可预测 Latest entries；Fund-scoped discovery runtime 有可识别 generation。
- Cron secret、background job signing/storage、Cron runner 真正 ready。
- 要验证 Deal Signals 生成，需可用且被验证的 Fund AI provider；若未配置，只能验证明确的 skipped/degraded，不能把空列表当成功。
- Deal signal 夹具包含 company name/domain、evidence、source refs；Fund A 预先无同名 Deal，另一个场景预先有 Deal 用来验证 `existingDealId`。

### 可复现成功/失败场景

1. Latest：分类、搜索、刷新、reader 内容与 source follow。
2. 通过真实 Cron entrypoint 调度 discovery job，轮询后台 attempt/generation 完成；再用 UI Refresh 读取新 generation。
3. Trending：卡片 metrics、Why trending、source articles 安全外链、stale 状态。
4. Deal Signals：打开 evidence/Why signal，点击 Create Deal，提交真实 `ManualDealDialog`，跳 `/deals/:id`；重读 signal 显示 Open Deal，且只在当前 Fund 创建一条 Deal。
5. 失败：AI/provider unavailable 时 discovery state 记录安全 error，旧 generation 仍可读且 UI 显示 stale/partial；重复 create 走 existing Deal，不重复创建。

### 当前缺口/可能 bug

- 当前 E2E 只点击 Latest/Trending/Deal Signals 链接，未检查任何数据、刷新、解释、后台作业、generation、stale、evidence 或 Deal 创建。
- 页面 Refresh 只重新 GET materialized discovery；它不会自行触发 Cron。E2E 必须明确先走真实 Cron/background path，不能把“重新读取旧数据”描述为 discovery refresh。
- 当前 capability 报告 AI 为 unconfigured，因此现有环境最多能证明安全降级，不能证明真实 Deal Signal materialization。

### 建议测试文件

- 新增 `tests/e2e/feed-discovery.spec.ts`：Cron→poll→Trending/Signal→Deal 的单一 serial graph。
- 扩展 `tests/feed-discovery-cron-route.test.ts`、`tests/feed-discovery-routes.test.ts`；Deal handoff 复用真实 `ManualDealDialog`，不要直接插入最终 Deal 代替浏览器动作。

## 4.4 Miniflux/SearXNG/provider 不可用与可恢复/partial UI

### 所需夹具/故障注入

- 必须是 E2E 自有、可恢复的故障注入，不能停止共享 Miniflux/SearXNG：例如专用 fault proxy、撤销并恢复当前 disposable Miniflux user token、专用失效 AI credential/Fund config。
- 每种故障都需记录前置 capability、故障方式、恢复动作和最终健康检查；cleanup 即使测试失败也恢复 token/endpoint。

### 可复现成功/失败场景

- Personal Miniflux timeout/401/429/malformed：Today/Following/reader 分别显示 reconnect、rate-limit 或 retry state；恢复后点 Retry 成功，先前 UI 不残留 optimistic 状态。
- Curated collector unavailable：Explore catalog/Latest 显式 error + Retry；personal Today 仍可用。
- SearXNG unavailable/partial engines：Search web source 显示 unavailable/partial，medical/feeds 结果继续显示；恢复后重新 Search 为 ok。
- AI provider unavailable：旧 discovery generation 保留，Trending/Deal Signals 显示 stale/empty-degraded 的明确信号；不能误报为最新成功。
- 全局 Web/Supabase failure：能力门禁在建 fixture 前 fail fast，且不产生残留。

### 当前缺口与可能产品 bug

- 当前没有任何浏览器级故障场景。
- `ExploreLatestFeed.loadFollowedSources()` 捕获 personal Miniflux 错误后静默把 followed set 置空并把 `followStateReady` 设为 true；页面随后把所有 source 当作未关注并重新启用 Follow。这既不显示可恢复错误，也可能诱发重复 follow。相同错误在 `/feeds/sources` catalog 中却会显示 `followingError` 并禁用 follow，两个入口行为不一致。
- `PersonalTodayFeed` 对 state mutation 失败主要通过 sr-only announcement 回滚；视觉用户可能看不到明确可重试错误，需要浏览器 UX 验证。
- Search 的 SearXNG health 在 runtime 创建时不可用会直接从 registry 移除 web adapter，页面只表现为 category unavailable；需要验证这是期望的 recoverable state，而不是悄悄改变 inventory。

### 建议测试文件

- 新增 `tests/e2e/feeds-degraded.spec.ts` 与 `tests/e2e/search-degraded.spec.ts`，每个 fault 都有 `try/finally` 恢复。
- 为 `ExploreLatestFeed` 的 follow-state 错误补组件测试（建议 `tests/feed-discovery-ui.test.tsx` 或新建 `tests/feeds-explore-follow-state.test.tsx`）。
- 继续扩展 `lib/feeds/errors.test.ts`、`lib/feeds/miniflux/client.test.ts` 和 `lib/search/adapters/web.test.ts` 作为精确错误映射层。

## 跨任务测试组织建议

建议保持 workers=1，但把状态图显式写入 fixtures，而不是依赖 spec 文件执行顺序：

1. `dependency-capabilities.spec.ts`：无业务 mutation。
2. `onboarding-auth.spec.ts`：activation-only user 创建 Fund，完成后成为可复用 primary。
3. `tenancy-auth.spec.ts`：A/B 独立 context 隔离矩阵。
4. `search.spec.ts` + `search-safety/degraded.spec.ts`：动态 adapter matrix。
5. `feeds.spec.ts` + `feeds-isolation/degraded.spec.ts`：关注、reader、A/B isolation。
6. `feed-discovery.spec.ts`：Cron/materialization/Feed-to-Deal。

每个场景应在 machine-readable evidence 中记录 `requiredCapabilities`、`observedCapabilities`、fixture ownership markers、最终 cleanup outcome。当前 `.harnesskit/evidence/comprehensive-site-e2e/verification.md` 声称完整 11/11 两次通过，但当前保留的 `results.json` 只包含 1 个 `platform-smoke.spec.ts` 测试；报告文件被 focused run 覆盖后，现有 machine-readable evidence 已不足以独立证明那次 11/11。建议 runner 为 full/focused run 使用带 run-id 的目录，并维护一个不可覆盖的 manifest。

## 优先级

1. **P0 测试真实性**：3.2 改为 A/B 独立 context + read/mutation/token 双向矩阵；3.3 去掉硬编码 inventory。
2. **P0 故障可控性**：2.4 改成按场景能力策略，并修复 browser runtime 假阳性；为 Search/Feeds 准备自有 fault fixtures。
3. **P1 端到端深度**：补 reader state、personal/collector isolation、Cron→discovery→Deal。
4. **P1 产品候选 bug**：Explore Latest 静默吞掉 following-state 错误；unsafe-only Search 被记为 empty；Feeds mutation same-origin guard 一致性。
5. **P1 证据保留**：避免 focused run 覆盖 full `results.json`。
