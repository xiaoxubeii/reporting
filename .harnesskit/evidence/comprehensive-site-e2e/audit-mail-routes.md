# OpenSpec 6.1–6.5 只读审计：邮件、通知与剩余产品面

> 状态：修复前审计快照。以下结论描述审计当时的代码；最终修复和验证结果以 `verification.md` 与 `results.json` 为准。

审计日期：2026-07-27
工作树：`/home/ubuntu/workspace/reporting.worktrees/comprehensive-site-e2e`
范围：`openspec/changes/add-comprehensive-site-e2e/tasks.md` 的 6.1–6.5。
方法：仅阅读代码、测试、迁移和现有证据；未启动或改变共享服务，未写数据库，未执行真实邮件发送。本报告是唯一新增文件。

## 结论

6.1–6.5 继续保持未完成是正确的。现有 11 个 Playwright 场景覆盖平台首页、21 个 GP URL、租户登录/跨 Fund 拒绝以及投资流程的一部分，但没有邮件 webhook、邮件回复、通知、Auth 页面矩阵或 LP Portal 场景；移动项目只访问平台 `/`。更关键的是，以下产品边界尚不能满足 OpenSpec：

1. **没有通用的“可见站内通知”产品面。** 当前 `/api/settings/notifications` 和个人设置页只管理笔记邮件通知偏好；邮件回复唯一可见处是 Diligence 专家请求内的线程面板，没有 fund-scoped 通知记录、通知中心、未读状态或邮件事件到通知的生产逻辑。
2. **Resend webhook 的 Host 门不一致。** `middleware.ts:362-367` 把全部 `/api/inbound-email...` 排除在 middleware 外；Postmark/Mailgun handler 自己调用 `admitsRegisteredSystemRequest`，但 `app/api/inbound-email/resend/[routeToken]/route.ts:6-16` 没有。因此知道 route token 和有效 Svix 签名的请求可从 tenant Host 命中该系统入口，未落实 `lib/tenancy/route-authority.ts:105-107` 声明的 tenant system-route 拒绝。
3. **旧 Postmark/Mailgun 附件路径不是 fail-closed。** Postmark 在上传失败时把 base64 `Content` 写回 `inbound_emails.raw_payload`（`app/api/inbound-email/route.ts:131-175`），Mailgun 同样如此（`app/api/inbound-email/mailgun/route.ts:184-227`）；两者随后把包含原始附件的 payload 交给 pipeline（Postmark `:178-185`，Mailgun `:230-237`）。这与“失败不保留 base64、不处理不安全附件”的要求直接冲突。
4. **非 Resend 专家邀请没有 durable reply round trip。** `issueInvitation` 仅在 provider 为 Resend 时调用 `sendFundThreadEmail`；Postmark/Mailgun/Gmail 使用通用 `sendOutboundEmail`（`lib/expert-validation/invitation.ts:101-127`）。通用 Postmark/Mailgun/Gmail adapter 不传 `Reply-To`、RFC thread headers 或 provider idempotency key（`lib/email.ts:104-167`），也不建立 `fund_email_threads/messages/reply_routes`。因此“配置任一现有 provider 即可完成可回复邀请”目前不成立。
5. **能力探针会产生假阳性。** `scripts/e2e/capabilities.mjs:17-24,81-85` 只凭平台级 `RESEND_API_KEY`/`POSTMARK_SERVER_TOKEN`/`MAILGUN_API_KEY` 判断 `platformMail`，未检查测试 Fund 的 provider 选择、加密凭据、verified Fund domain、receiving route 或 webhook secret。当前 `capabilities.json` 正好报告 `platformMail: configured`、`fundMailEncryption: unconfigured`，而现有验证记录明确说没有可用 Fund outbound mail；测试不应据此选择“configured round trip”。

## 当前真实路径与边界

### Provider / webhook 矩阵

| 路径 | 认证/签名 | Fund 与 Host 边界 | 幂等/持久化 | 本地可验证状态 |
|---|---|---|---|---|
| `POST /api/inbound-email/resend/[routeToken]` | route token 先解析连接；原始 body 用 `svix-id`、`svix-timestamp`、`svix-signature` 和该 Fund webhook secret 验签（`lib/email/resend-webhook.ts:76-105`） | route token 只解析一个 Fund；运行时还要求该 Fund 当前 `inbound_email_provider = resend`（`lib/email/resend-webhook-runtime.ts:25-39`）；收件域必须精确等于连接域（`lib/email/inbound-routing.ts:145-155`）。但缺 handler 级 system Host gate | `svix_id` 与 provider email ID 通过原子 claim；重复返回 200/`duplicate`；消息通过 RPC 原子写入（`lib/email/resend-webhook.ts:114-149`，`lib/email/fund-inbound-store.ts:20-100`） | 无 live Resend 时可稳定测 unknown route、缺 header、坏签名、超大 body、重复 claim 的 handler contract；完整成功需要可检索的真实 Resend received email、Fund receiving key/domain/webhook secret |
| `POST /api/inbound-email`（Postmark） | 不是 signed-body webhook；使用 `Authorization: Bearer <webhook token>`，或 legacy `?token=`，与 Fund/全局 token 做 constant-time compare（`app/api/inbound-email/route.ts:16-18,48-61,218-277`） | handler 自身要求 registered platform/hooks/legacy system request；按精确 `postmark_inbound_address` 找 Fund，且 provider 必须仍为 Postmark；全局地址按授权 sender 推断且多 Fund 歧义时拒绝（`:224-303`） | 以 Fund + fingerprint 查重，数据库唯一索引兜底；所有业务拒绝/异常均给 provider HTTP 200，所以结果必须查 durable state，不能只断言状态码（`:24-41,80-127`） | 可用本地签发 webhook token + JSON payload 走真实 HTTP 成功/重复/坏 token/错 Fund；无需调用 Postmark API。附件失败路径当前有 P0 缺陷 |
| `POST /api/inbound-email/mailgun` | multipart 中 timestamp/token/signature 以 Fund signing key HMAC 验证（`app/api/inbound-email/mailgun/route.ts:93-114`） | handler 自身 system Host gate；recipient domain 匹配唯一已选 Mailgun Fund（`:68-91`） | Fund + fingerprint；同样总回 200 | 可本地生成 HMAC 并真实 HTTP 注入；附件路径与 Postmark 有相同 P0 缺陷。虽非 6.1 点名，仍是当前 provider 选择面的一部分 |

Resend 的确定性状态契约可直接用于 HTTP/E2E 断言：unknown route `404 route_not_found`；缺 Svix header `400 signature_headers_missing`；坏签名 `401 invalid_signature`；body 超限 `413 payload_too_large`；重复事件 `200 duplicate`; 永久 identity/attachment 错误 `200 quarantined`; 可重试存储/provider 错误 `503 temporarily_unavailable`（`lib/email/resend-webhook.ts:87-149`）。

Postmark 的坏 token、未授权 sender、错收件地址、重复事件都刻意返回 `200 {ok:true}`。其 fail-closed 证据必须是“对应 Fund 的 `inbound_emails`/Deal/interaction/通知均没有新增”，并同时验证另一 Fund 的 marker 从未出现在响应、UI 或日志附件中。

### 回复路由

Resend 回复的实际优先级为：

1. `r_<40 hex>@<fund-domain>` 的高熵 reply token；仅查询同一 `fund_id` 下未撤销/未过期的 hash。
2. 没有 token 时，按 `In-Reply-To` / `References` 在同一 Fund 内查 thread。
3. 再退到同一 Fund、精确域名、唯一 active mailbox。
4. token 与 RFC 证据冲突、多 token、多 mailbox、未知 token 均 quarantine，不降级扩大匹配（`lib/email/inbound-routing.ts:44-104,112-155`）。

目前只有 Resend outbound 创建这一整套 durable route。`sendFundThreadEmail` 先解析同 Fund sender mailbox，服务端派生 `From`、`Reply-To`、Message-ID、provider idempotency key 并持久化，再调用 provider；retry 复用同一 outbox，已提交则不重发（`lib/email/fund-outbound.ts:237-391`）。

### 可见 UI

- Inbound Pitch/legacy email：`/emails`、`/emails/[id]`，API 为 `/api/emails...`。它展示 `inbound_emails` pipeline，不是 Fund email thread inbox。
- 专家邀请：Diligence detail 内 `ExpertValidationPanel` → `POST /api/diligence/[dealId]/expert-validations/[requestId]/invite`。
- 专家回复邮件线程：同一 panel 的 `ExpertEmailThread` → `GET .../email-thread`；只渲染 plain text 与安全附件 metadata（`components/diligence/expert-email-thread.tsx:13-61`）。
- “Notifications”：`/settings/personal` 的 `PersonalNotificationPreferences` → `/api/settings/notifications`；这里只是 `note_notification_preferences` 和 company subscriptions（`app/api/settings/notifications/route.ts:5-105`），不是站内事件通知。

## 6.1 配置邮件往返、Pitch、回复与可见通知

### 应测成功场景

1. **Resend 专家邀请 round trip（live capability 才运行）**
   - 在 Fund A 创建/选择 eligible expert，从真实 Diligence UI 点击 Send invitation。
   - 断言 API 200、UI 显示 issued 状态；数据库恰好一个 thread、一个 outbound message、一个有效 reply route。
   - provider 请求断言 Fund A 发送身份、`r_<token>@<fundA-domain>` Reply-To、固定 Message-ID/idempotency key；不得出现平台 key 或 Fund B 域。
   - 用 provider 收到的真实 email ID 发送有效 signed inbound event；打开同一 Diligence 页面，线程出现一条 inbound plain-text reply，重放 webhook 不增加 message。
2. **Resend Pitch inbound（live capability 才运行）**
   - signed event 的 fetched recipient 精确为 `pitch@<fundA-domain>`；最终 `/emails/[id]` 和 Deal 只各一个，来源为 email、Fund A scoped。
3. **Postmark Pitch inbound（本地可确定运行）**
   - 夹具写入 Fund A 的 Postmark inbound address + encrypted webhook token + authorized sender；向 platform/hooks Host 的 `/api/inbound-email` 注入 JSON。
   - 断言一个 `inbound_emails` 和预期 pipeline 结果；相同 MessageID 重放仍只有一个。
4. **可见通知**
   - 当前无可执行产品路径。必须先确定产品契约：新增 notification center/badge/unread，或修改 OpenSpec 明确“专家线程面板即通知”。在现文义下不能用 note notification preferences 代替。

### 所需夹具

- 扩展 `FixtureState`：Fund A/B 的 `emailSubdomain`、provider capability；不要把 raw keys/token/route token/webhook secret 写入 state/report。
- Fund A：personal/expert/pitch mailboxes、eligible expert、Diligence request、actor display name；Fund B 建同名 mailbox/thread/expert marker 以证明隔离。
- Resend live profile：Fund-owned sending + receiving keys、verified exact domain、managed webhook endpoint/secret、provider mailbox，全部通过环境/临时加密设置注入并在 cleanup 撤销。
- Postmark local profile：专用 inbound address、通过现有 mint API/helper 得到的 webhook token、authorized sender、固定 MessageID；状态文件仅保存记录 ID 和 ownership marker。
- 通知 profile（产品补齐后）：Fund A recipient、Fund B 同名 recipient、read/unread event IDs。

### 建议测试文件

- `tests/e2e/mail-roundtrip.spec.ts`：configured Resend invitation/reply + Postmark Pitch。
- `tests/e2e/mail-notifications.spec.ts`：线程可见性、通知产生/未读/已读/跨 Fund 拒绝。
- `tests/e2e/support/mail-webhooks.ts`：bounded payload builders、Svix/Postmark/Mailgun 注入；严禁记录 secret/raw attachment。
- `scripts/e2e/mail-fixture.ts` 或扩展 `investment-e2e-fixture.ts`：localhost-only、provider profile、owned-ID cleanup。

## 6.2 未配置、坏签名、错 Fund、重复事件与不安全附件

### 可立即本地验证

| 场景 | 请求/操作 | 必须断言 |
|---|---|---|
| 未配置邀请 | 当前 Fund 保持 `asks_email_provider` 未配置，真实 UI 点击邀请 | API 202；warning 与只读 invitation URL 可见；request 状态为 invited；没有 thread/message/provider ID；刷新后不泄露 token |
| Resend unknown/错 route | 随机 token、Fund B token + Fund A event | 404 或 signed/fetched identity quarantine；两 Fund 均无 message/Deal/notification；响应不含 Fund 名、domain、secret |
| Resend 坏/过期/修改签名 | 同一 raw body 分别缺 header、改 1 byte、旧 timestamp | 400/401，且 claim/retrieve/persist 都未发生。过期 timestamp 应由 Svix verifier 证明 |
| Resend duplicate | 同一 `svix-id` 或 provider email ID 重放 | 两次均可 ack，但 durable event/message/business action 各一个 |
| Postmark 坏 token/错地址/未授权 sender | platform webhook POST | HTTP 200 是预期；零新 row/Deal/notification，Fund B marker 零曝光 |
| Host 错位 | 三个 webhook 从 tenant Host 与 platform/hooks Host 分别提交 | system Host 接收；tenant Host 应 404。Resend 当前会暴露缺口，先加 handler gate |
| unsafe attachment | 超大、扩展名/MIME mismatch、scanner unsafe、storage failure | 整封/附件 quarantine；不创建业务记录；不在 JSON 保留 base64；不传 pipeline；private storage 无对象 |

### 最小产品修复（按优先级）

1. **P0 — Postmark/Mailgun 附件 fail-closed。** 在任何 `inbound_emails`/业务处理前做 bounded count/bytes + scan；任一 unsafe/storage failure 标记 quarantine 并停止 pipeline；绝不把 `Content` 写回 JSON。最好抽取与 Resend 共用的安全附件 materialization contract。
2. **P0 — Resend handler 加 system Host admission。** 与 Postmark/Mailgun 一样在 route 内调用 `admitsRegisteredSystemRequest`；因 middleware 明确排除 inbound 路径，不能依赖 middleware。
3. **P0 — provider round-trip 契约收敛。** 若 Postmark/Mailgun/Gmail 仍可选作 asks provider，就让它们支持 server-derived From/Reply-To/RFC headers/idempotency 并写同一 durable thread；否则 UI/设置明确限制 reply-capable expert invitation 只允许 Resend，避免“发送成功但无法回复”的假成功。
4. **P1 — Postmark/Mailgun 输入上限。** 在解析 JSON/form-data 和 base64/File 前加 request/attachment 数量与字节限制；不能依赖 provider 声明的 `ContentLength`。
5. **P1 — 能力探针按 fixture Fund 检查。** 分开记录 `platformMail`、`fundOutbound(provider/purpose)`、`fundInbound(provider/domain/webhook)`、`roundTripReady`；只有最后一个为 true 才跑 configured round trip。

## 6.3 专家邀请 delivery 与 copy-link/fail-closed

真实行为：invite API 先通过当前 session 的 write gate 和 `assertDeal(...fundId...)`，然后原子把 draft 变为 invited、只存 token hash；provider 接受返回 200，未接受但 link 已签发返回 202（`app/api/diligence/[id]/expert-validations/[requestId]/invite/route.ts:5-24`，`lib/expert-validation/invitation.ts:53-147`）。UI 对 202 当作恢复态，显示 warning、只读 URL 和 Copy link 按钮（`components/diligence/expert-validation-panel.tsx:147-160,207-212`）。

必须覆盖：

- configured Resend：200、provider accepted timestamp/message/thread ID、线程 visible；双击/网络 retry 不重复发送。
- selected non-Resend：在修复 durable reply contract 前只能验证 delivery，不能宣称 6.1 round trip。
- unconfigured/provider rejection：202、可键盘到达 URL 与 Copy 按钮、Enter 可复制；页面清楚说明人工发送；无平台 key fallback。
- accepted but tracking write failed：仍为 200 + “不要重发”警告；再次操作不得静默重复邮件。
- cross-Fund copied deal/request ID、失去 write grant、ineligible expert、submitted request：404/403/冲突，无 token rotation、无 provider call。
- reload：raw token 不应从持久化恢复；如人工 fallback 必须跨 reload 可用，产品需要显式“重新签发”交互，而不是存 raw token。

建议将场景放入 `tests/e2e/expert-invitation-mail.spec.ts`，复用投资场景生成的真实 Diligence/Expert，不用 service-role 直接制造“sent”最终态。最小 UX 修复是为 clipboard success/failure 加可见且 `aria-live` 的反馈；当前 `navigator.clipboard.writeText` promise 未处理，失败时用户无提示。

## 6.4 GP 主导航：桌面、移动、localization、keyboard

### 真实导航源

`components/app-sidebar.tsx:80-142` 定义主项：Review（有 badge 才显示）、Pending Actions、Inbound、Deals、Feeds/Follow Sources、Search、Diligence/Inbox/Analytics/Experts、Portfolio 下 Import/Investments/Asks/Interactions/Letters/Notes/Compliance、LPs 下 Capital/Documents/Preview/Activity、Funds accounting、Usage、Personal Settings。可见性由 live role、feature visibility、domain grant 和 LP Portal master switch 共同决定（`:65-78,203-244`）。移动端通过 `AppHeader` 的 Radix Sheet 渲染同一 sidebar，并有 focus return（`components/app-header.tsx:30-109`）。

### 当前覆盖缺口

- `tests/e2e/major-navigation.spec.ts:5-44` 硬编码 21 个 URL 并逐个 `page.goto`；没有点击真实 nav，也无法发现“新 link 已启用但测试列表没更新”。
- 每页只断言 200、URL、`main`、无通用错误文本；没有页面自己的 loaded/empty/API terminal state。
- 当前 fixture 没启用 `lp_portal_enabled`、accounting/lp_tracking，因而 Documents/Preview/Activity/Funds 分支完全未覆盖。
- `/settings`、`/settings/email-routing`、`/settings/public-site` 和 route-specific detail/action 页不在 sweep。
- `tests/e2e/mobile/platform-smoke.spec.ts` 只访问平台 `/`；没有任何 authenticated mobile GP 导航。
- 没有 locale switch、`html[lang]`/翻译文本、Tab/Enter/Escape/focus-return、横向溢出断言。`tests/ui-surface-inventory.test.ts` 只证明 109 个 page 文件被分配 namespace，不证明浏览器渲染已本地化。

### 建议测试设计

1. 把 `NAV_ITEMS` 移到无 React 副作用的共享只读 registry，产品 sidebar 和测试都消费；测试另从 DOM 收集当前可见 `nav a[href]`，两者做集合相等，防止 silent omission。
2. 桌面管理员 profile 开启所有产品开关并准备必要空/最小数据；member/viewer profile 验证不应出现的 nav 与直接 URL/API denial。
3. 每个 route 提供一个 semantic assertion（heading、table/list empty state 或关键 API 2xx），而不是统一 `<main>`。
4. 补 `tests/e2e/mobile/major-navigation.spec.ts`：点击 Open menu，逐项导航，断言 drawer 关闭；Escape 后 focus 回到 menu button；390 px 下 `scrollWidth <= clientWidth`，核心按钮不被遮挡。
5. 在英/中各跑一组风险采样：sidebar、Settings、Emails、Diligence thread、LP management；切换语言后断言 `html lang` 和一个 route-specific 翻译，不接受只检查无英文硬编码。
6. keyboard 基线：从 skip/main 或首个控件开始，仅用 Tab/Shift+Tab/Enter/Space/Escape 完成 nav、mobile drawer、关键 dialog；断言 focus 可见且 dialog focus trap/return 正确。

建议文件：保留并重写 `tests/e2e/major-navigation.spec.ts`；新增 `tests/e2e/mobile/major-navigation.spec.ts`、`tests/e2e/localization-accessibility.spec.ts`、`tests/e2e/support/route-inventory.ts`。

## 6.5 Public、Auth 与 LP Portal

### 真实路径和身份边界

- Platform public：`/`，以及在 marketing flags 开启时的 `/contact`、`/pricing`、`/license`、`/privacy`、`/terms` 和 `*-explainer`；tenant `/` 是 Fund public homepage（`middleware.ts:117-140`）。
- Token public：tenant `/submit/[token]`、`/expert-response#token=...`、`/invite`；先做精确 tenant Host 解析，页面/API 再校验 token/Fund。
- Auth：`/auth`、`/auth/signup`、`/auth/forgot-password`、`/auth/magic-link`、`/auth/reset-password`、`/auth/mfa-verify`、callback/post-login。登录 form 有 label/Enter path，`next` 经 safe relative path 处理。
- LP：tenant `/portal/welcome`、`/portal/overview`、`/portal/snapshots`、`/portal/snapshots/[id]`、`/portal/letters/[id]`、`/portal/settings`、`/portal/contact`；tabs 在 `components/portal-chrome.tsx:13-19`。
- middleware 将 GP 与 LP access graph 分开：active LP 才能进 portal；invited LP 去 welcome；LP-only 访问 GP 自动回 portal；GP-only 访问 portal 回 `/`；tenant Fund 不一致返回 404（`middleware.ts:223-269`）。Portal API 另外要求 `resolve_my_lp_fund()` 等于 Host Fund（`:206-220`）。

### 当前已有与缺失

- 已有：desktop public Pitch 成功提交；GP tenant login；Fund A session 复制到 Fund B page/API 得 404；平台 `/` desktop/mobile smoke。
- 缺失：登录失败、signup/forgot/reset/magic/MFA、safe `next`/恶意 external next；tenant public published/private/unpublished；invalid/wrong-Fund Pitch token；真实 expert public resolve/submit；全部 LP 页面和 API；invited/active/GP-only/LP-only/dual-role/cross-Fund 身份；public/auth/portal 的中文、移动和 keyboard。

### 所需 LP/public 夹具

- 每个 Fund 建 active LP user、invited LP user、GP-only、dual GP+LP；状态文件只存 auth user/resource IDs。
- Fund A/B 各建 LP investor/entity/account mapping，同名 snapshot、letter、document；只 share Fund A 的指定资源给 LP A，用同 ID/URL 尝试 Fund B。
- 启用 `lp_portal_enabled` 与 feature flags；准备 portal overview 的最小 capital/performance 数据、一个 snapshot/letter/document、access history。
- Fund public site 三态（published/private/unpublished）和 Fund A/B branding marker。
- 专家 public token 只保存在当前 test 进程内；artifact/report 需 redact fragment 和 raw token。

### 建议场景与文件

- `tests/e2e/public-auth.spec.ts`：platform public 路由、tenant homepage 三态、valid/invalid/wrong-Fund Pitch/Expert tokens、Auth 全页面、safe next、恶意 next 拒绝。
- `tests/e2e/lp-portal.spec.ts`：invited activation、active LP tabs与资源 detail、GP-only/LP-only/dual-role、cross-Fund page/API denial。
- `tests/e2e/mobile/public-auth-portal.spec.ts`：390 px public/auth/portal、tab overflow 可滚动且无页面横向溢出。
- `tests/e2e/localization-accessibility.spec.ts`：英/中切换、`html lang`、label/name、Tab/Enter/Escape、focus return。

对动态 detail 资源，必须从真实列表 link 点击取得 URL；service-role 仅可创建有 ownership marker 的初始 fixture，不能直接写“已浏览/已授权/已提交”来绕过用户步骤。

## 证据与完成门

现有 `.harnesskit/evidence/comprehensive-site-e2e/verification.md:9-34` 是历史汇总，不是 6.1–6.5 完成证据：它明确记录无 live Fund mail，且没有 LP/Auth/mail 场景。目前的 `results.json` 已被一次 focused run 覆盖，只含 `platform-smoke.spec.ts` 的单个 desktop result；因此最终 full run 必须使用 run-ID 子目录或原子 manifest，避免 focused run 覆盖 release evidence。

6.1–6.5 可勾选的最低证据：

- machine report 对每个 provider/profile 标记 `passed`、`designed-degraded`、`dependency-failed` 或 `not-run`，不得以 `platformMail configured` 代替 Fund round-trip capability；
- 邮件场景记录 outbound provider ID、thread/message/event ID 的 redacted/hash 形式、重复前后计数、Fund A/B 零泄露检查；
- webhook failure artifact 不保存 raw body、附件、token、Svix signature、provider key；
- GP/Public/Auth/LP 每条 route 有 desktop/mobile、meaningful state、locale/keyboard 风险级别和 artifact；
- 对上述 P0 缺陷先加 focused regression，再在真实 HTTP/browser 路径重跑；
- cleanup 按 owned ID 验证 Fund、auth users、LP rows、mail rows、provider endpoint/credentials 和 private storage objects 均归零。

## 推荐实施顺序

1. 先修 Resend Host gate、Postmark/Mailgun attachment fail-closed、provider reply contract，并明确通知产品契约。
2. 扩展 capability 与 localhost-only mail/LP fixtures，先跑全部 negative paths（不需要 live provider）。
3. 补 unconfigured invite、Postmark local inbound、通知 UI 和 LP/Public/Auth/GP/mobile sweeps。
4. 最后在具备 Fund-owned Resend credentials + verified DNS 时跑 configured Resend round trip；缺外部条件时保持 `not-run/dependency-failed`，不能以 handler unit tests 或 202 copy-link fallback 代替。
