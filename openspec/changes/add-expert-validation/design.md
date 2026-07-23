## Context

reporting 当前已经具备材料分析主链：

```text
diligence_documents
→ Ingest
→ ingest_synthesis
→ checklist_assessment
→ Research
→ Scoring / Memo
```

Research 会生成 findings、contradictions、competitive map、founder dossiers 和 research gaps，但系统目前没有将某个 gap 或 contradiction 交给外部专家验证，再把专家回复作为新材料送回这条主链的能力。

现有实现已经包含 `industry_expert` 文档类型。显式 `document_ids` 的 Ingest job 会把新增文档合并进当前 `ingestion_output`，随后执行 synthesis 和 checklist assessment。Research 的 Claims verification 读取全部 Ingest 文档，因此核心验证结果可以沿现有链路进入 Research；competitors 只读取相关 claims，founders 当前只读取 `team_bio` / `pitch_deck`，本设计不扩大这些子调用的输入范围。

本设计基于以下约束：

- 不新增专家专用 Research pipeline 或平行分析结果。
- 不实现 `research_output` 版本。
- 不创建或同步 Diligence Attention、Q&A 或 LP identity。
- 专家提交后直接固化为材料，不增加 Accept/Reject 或内部审核状态。
- 第一版不实现邀请撤销；邀请只能到期或通过 reissue 轮换旧 token。
- 第一版不新增“专家材料是否晚于 Research”的精确 freshness 计算或提示。
- 第一版只支持一个固定 embedding model 和向量维度，不实现在线模型切换、旧向量识别或自动重建。
- 不复用 ClinMono；只借鉴“先做资格过滤，再做语义排序”的核心思路，并在 reporting 内重新实现。
- 专家目录由 reporting 持有，同时支持全局专家和单个 Fund 的私有专家。

## Goals / Non-Goals

**Goals:**

- 从现有 Research gap 或 contradiction 发起专家验证。
- 生成并保存一个关键验证问题、一个专家画像和必要的脱敏上下文快照，全部由内部用户在邀请前确认。
- 支持人工搜索选择专家，也支持按“脱敏验证问题 + 目标专家画像”返回 Top 5 候选后由人工确认。
- 让选定专家通过一次性、最小权限的入口提交一份文本回复。
- 专家提交后，将回复一次性、幂等地固化为 `industry_expert` 文档，专家验证流程不再覆盖其内容。
- 完整复用现有增量 Ingest、synthesis、checklist assessment 和人工 Research 重跑能力。
- 使用现有 Supabase/Postgres 加 `pgvector` 完成轻量语义检索，不引入独立向量数据库。
- 对公开 bearer 页面、全局专家联系方式和外部回复进入 AI prompt 的边界做最小必要安全隔离。

**Non-Goals:**

- 不建设专家账户、专家工作台、LP Portal 权限或 fund membership。
- 不建设复杂专家能力卡、行业/职能分类体系、required/preferred 条件模型或自动利益冲突判断。
- 不保存候选列表、matching run 或排名历史，不使用 LLM query planner、LLM rerank 或多人覆盖优化。
- 不自动选定第一名，也不自动发送专家邀请。
- 第一版不建立 HNSW/IVFFlat 近似索引。
- 第一版不支持 runtime embedding model 迁移、跨模型比较或自动重建旧向量。
- 第一版不提供 invitation revoke/cancel；token 通过到期或 reissue 失效。
- 不支持多轮访谈、会议排期、专家费用结算或专家网络运营。
- 不支持专家草稿保存、多问题结构化问卷、附件上传、邮件回复解析或外部回答 session。
- 不增加专家回复的内部 Accept/Reject、审核意见或独立 evidence approval 状态。
- 不让专家查看完整 Data Room、Research output、Memo 或其他基金数据。
- 不自动运行 Research，不计算专家材料与 Research 的 freshness；仍使用现有人工 `Run research` / `Re-run research`。
- 不修改 Research 三个子调用的现有输入筛选或输出结构。
- 不将专家验证投影到 `diligence_attention_items`。

## Decisions

### 1. 专家验证是材料获取方式，不是新的 Diligence 阶段

专家验证从现有 Research 页面发起，提交后生成一种已有材料类型 `industry_expert`。它不出现在顶层 Diligence stage 列表中，也不改变现有阶段顺序。

```text
Research gap / contradiction
→ 创建 expert request
→ 人工搜索或 Auto match Top 5
→ 内部用户确认一名专家
→ 邀请并提交回复
→ 自动固化 industry_expert 文档
→ 现有增量 Ingest
→ 现有 ingest_synthesis
→ 现有 checklist_assessment
→ 人工 Re-run research
→ 按需重跑 Scoring / Memo
```

专家回复本质上是新的外部证据材料。让它进入统一证据链，可以继续使用现有 claim 提取、来源追踪、gap synthesis、checklist 和 Memo 生成逻辑，而无需平行 Research 结果。

### 2. 不修改 `research_output`，保存来源快照和已确认输入

入口使用已有 `research_gaps` 或 `contradictions`。这些数组项当前没有稳定 ID，因此 `source_ref` 使用 JSONB 保存：

```ts
type SourceRef = {
  draftId: string
  researchJobId?: string
  kind: 'research_gap' | 'contradiction'
  index: number
  snapshot: Record<string, unknown>
}
```

`draftId + kind + index` 只用于定位创建时的来源；`snapshot` 是来源被后续 Research 覆盖后仍可审计的事实记录。

用户点击“发起专家验证”后，系统使用现有 Fund 配置的 AI provider 对选中的来源按结构化 schema 生成：

```text
question: 一个聚焦、已脱敏且可由专家直接回答的问题
expert_profile: 用于匹配的专家画像
context_snapshot: 提供给专家的必要脱敏上下文
```

内部用户必须能编辑并确认三个字段；AI 失败时允许人工填写。它们保存在 expert request，不写回 `research_output`。邀请签发后，外发字段冻结。

### 3. 使用一张 request 表保存最小闭环状态

除 `experts` 目录表外，工作流只新增 `diligence_expert_requests`。一行表示“一道问题 × 一名最终专家 × 一条邀请生命周期”。同一时刻最多只有一个有效 token；reissue 轮换当前 token。

| 分组 | 字段 | 说明 |
| --- | --- | --- |
| Scope | `id`, `fund_id`, `deal_id`, `created_by`, timestamps | 基金、Deal 和审计边界 |
| Source | `source_kind`, `source_ref` | 创建时来源定位和不可变来源快照 |
| Validation | `question`, `expert_profile`, `context_snapshot` | 内部确认的三个业务输入 |
| Selected expert | `expert_id`, `selection_method`, `expert_name`, `expert_email`, `expert_snapshot` | 最终专家和邀请时身份/profile 快照 |
| Invitation | `token_hash`, `expires_at`, `invited_at` | 32-byte 随机 token 的 SHA-256 hash；明文只在签发响应出现 |
| Email provider | `email_provider_accepted_at`, `email_message_id`, `email_error_code`, `email_error_message` | provider 接受与凭证签发分离；错误必须清洗和限长 |
| Response | `response_markdown`, `submitted_at` | 一次性不可覆盖的专家原始文本 |
| Evidence | `document_id`, `materialization_error` | 自动固化的文档及可重试错误 |
| State | `status` | `draft`, `invited`, `submitted` |

`invited` 表示凭证已经签发，不表示邮件已经送达。`expired` 通过 `expires_at < now()` 且状态为 `invited` 派生。第一版不增加撤销状态；reissue 通过条件更新替换 token hash 和 expiry，使旧链接失效。

### 4. 专家提交后直接成为 `industry_expert` 材料

提交通过一条带 `token_hash`、`status = 'invited'`、`expires_at > now()` 和 `response_markdown is null` 条件的原子更新，一次写入 response 和 `submitted_at`，并转为 `submitted`。没有 Accept/Reject 或额外审核步骤。

提交成功后，服务端立即调用幂等 materializer。Markdown 至少包含：

- 验证问题；
- 外发的脱敏上下文快照；
- 最终专家身份快照，但不复制邮箱等联系字段；
- 专家原始回复；
- 提交时间和 request ID。

随后：

1. 将 Markdown 写入私有 `diligence-documents` bucket。
2. 创建 `diligence_documents`，固定 `detected_type = 'industry_expert'`、`type_confidence = 'high'`、`parse_status = 'pending'`。
3. 将 document ID 写回 request。
4. 调用现有 `enqueueIngestForDocuments`，显式传入 document ID。

materializer 必须能从跨 Storage/DB/worker 的部分失败中恢复：

1. 使用确定性 `{dealId}/expert-validation/{requestId}.md` 路径；对象已经存在时复用，绝不覆盖为不同内容。
2. 按唯一 `storage_path` 复用文档行；文档存在但 request 尚未链接时，只恢复 `document_id`。
3. 文档已 `parsed` 时不再 enqueue；否则调用现有 helper。若 Deal 有 active job，helper 返回 deferred，文档保持 `pending`，之后由现有 Data Room `Process` / `Analyze data room` 处理。
4. 提交重试或内部 `Retry evidence processing` 都调用同一 materializer，只补齐缺失步骤。

公开接口对已 `submitted` 的同一 token 只返回通用的“已提交”和 `submitted_at`，不返回原始回复；若 evidence materialization 尚未完成，服务端可以幂等重试，但不向专家暴露内部状态。

### 5. 完整复用现有增量 Ingest 链

不增加 expert worker kind。专家材料继续使用：

- `memo_agent_jobs.kind = ingest`；
- 显式 `payload.document_ids`；
- `runIngestJob` 的 merge 语义；
- `ingest_synthesis`；
- `checklist_assessment`。

若 Deal 已有 active job，现有 enqueue helper 不会排第二个 job。内部 UI 显示 document 的实际 `pending / processing / parsed / failed` 状态，不能把 `submitted` 等同于已经 Ingest，也不承诺自动续跑。

外部专家回复属于不可信材料。写入 Data Room 的 Markdown 保留原文，但构造 Ingest AI 输入时必须使用不能被回复内容闭合的安全边界，并在系统级指令中明确：文档内的命令、角色声明或 prompt 均为待分析内容，不得执行。测试必须覆盖包含闭合标签和 prompt-injection 指令的回复。

### 6. Research 只复用现有人工重跑，不新增 freshness 逻辑

专家文档成功 Ingest 后，系统不自动运行 Research，也不新增“专家材料比 Research 更新”的派生计算或提示。内部用户根据现有 document/job 状态，在材料处理完成后使用已有 `Run research` / `Re-run research`。

Research 仍完整运行三个现有子调用并覆盖当前 draft 的单一 `research_output`：

- Claims verification 读取全部 Ingest 文档，因此会读取专家材料；
- competitors 只读取现有规则筛出的相关 claims；
- founders 当前只读取 `team_bio` / `pitch_deck`，不会因为本功能扩大到 `industry_expert`。

本方案不声称每一份专家材料都会改变所有三个 Research 子输出。

### 7. 使用 fragment bearer token 和现有邮件层完成最小邀请

内部用户确认专家、问题和脱敏 context 后，人工触发 `Send invitation`：

1. 生成 32-byte CSPRNG token，只持久化 SHA-256 hash、expiry 和 `invited_at`。
2. 通过 `status = 'draft'` 的条件更新原子取得首次签发权并转为 `invited`；只有更新成功的调用才能发送对应 token。
3. 生成 `/expert-response#token=<raw-token>`，fragment 不进入初始 GET、路径、query 或访问日志。
4. 通过现有 `getOutboundConfig(..., 'system')` 和 `sendOutboundEmail()` 发送邮件。
5. provider 接受时记录 `email_provider_accepted_at` / `email_message_id`；失败只记录清洗、限长且不含请求正文、token 或 URL 的错误码/消息。
6. 明文 URL 只在本次成功签发响应中返回给授权内部用户，作为 `Copy link` 兜底。

邮件只包含专家姓名、邀请方、简短用途、预计回答时间、截止时间和入口按钮。Deal 名称、问题、context、Research gap 和其他内部信息不得进入邮件正文，所有动态值必须 HTML escape。

reissue 只适用于 `invited` 且尚未提交的 request。它通过对当前 token hash 的条件更新轮换凭证；并发 reissue 只有一个调用能获胜并发送，旧链接立即失效。第一版不提供 revoke/cancel。

### 8. 外部回答页直接使用 bearer token，但隔离脚本和缓存

专家不注册、不创建 session。公开页面必须满足：

- 不加载 Vercel Analytics、Speed Insights、Fathom、Google Analytics 或其他第三方脚本；
- 使用 route-specific restrictive CSP；
- 在任何应用或第三方脚本运行前同步读取并从地址栏清除 fragment；
- token 只保存在当前页面内存，不写 cookie、localStorage、sessionStorage 或日志；
- 页面、resolve API 和 submit API 返回 `Cache-Control: no-store` 及相应 CDN no-store header。

页面使用 JSON POST 调用 token-scoped resolve/submit API。有效 token 只允许读取邀请方、截止时间、验证问题、回复说明和脱敏 context，并提交一份不超过配置上限的文本。它不能读取专家画像、source object、Deal、Data Room、Research、Memo 或其他 request。

公开接口校验 content type、请求大小和回答长度，并同时做 IP 和 token 维度限流。token 限流 key 只能使用 token hash 或 HMAC，不能把明文 token 写入 rate-limit 表、日志或 telemetry。无效、过期、轮换或状态不符统一返回不可枚举错误。

### 9. 不复用 Attention、Q&A 或 LP identity

- Attention 是 Memo 内部待处理事项，不需要映射专家邀请状态。
- Diligence Q&A 是基金成员与 AI 的内部对话，没有外部专家邀请语义。
- LP invitation 会创建 Auth/LP access graph，权限远超单个问题。

这些模块均不参与本闭环。

### 10. 使用 reporting 自有的最小专家目录

新增一张 `experts` 表，第一版只保存：

```ts
type Expert = {
  id: string
  scope: 'global' | 'fund'
  fundId?: string
  name: string
  email: string
  title?: string
  organization?: string
  profileText: string
  status: 'active' | 'inactive'
  embedding?: number[]
  embeddingModel?: string
}
```

`scope = 'global'` 对所有 Fund 可选；`scope = 'fund'` 时 `fund_id` 必填并只对该 Fund 可见。`experts` 不向 authenticated client 直接授予表级读取；全局和 Fund 私有目录均通过授权服务端 API 返回不含邮箱的 DTO。邮箱只在服务端确认选择和签发邀请时读取。全局记录只允许受信任管理路径写入，Fund 记录按 membership 隔离。

`profile_text` 是专家行业、岗位和相关经历的统一描述，不包含邮箱等联系字段。新增或修改时，服务端用第一版固定的 embedding model 和固定维度生成向量并记录 model 名称。生成失败不阻断人工选择。

第一版不支持运行时切换 embedding model；若部署要更换模型，必须先离线重新生成全部向量再启用自动匹配，本变更不实现该迁移工具或在线一致性判断。

### 11. 人工选择与自动匹配汇合到同一个确认动作

- `manual`：按姓名、职位、机构或 `profile_text` 搜索可访问目录。
- `auto_match`：使用内部已确认且脱敏的 `question + expert_profile` 生成 query embedding，返回 Top 5。

两种方式最终都由授权 Fund 成员确认一名专家，并把 `expert_id`、`selection_method` 和身份/profile 快照写入 request。自动匹配不自动选择第一名，不发送邀请，也不保存候选或 matching run。

一个 request 只关联一名最终专家。需要多名专家回答时复制 request。

### 12. 使用 pgvector 精确余弦检索，不增加独立向量数据库

自动匹配候选只包含：

1. `scope = 'global'` 或 `fund_id = current_fund_id`；
2. `status = 'active'`；
3. 存在可用邮箱和 embedding。

过滤后按余弦距离排序并返回 Top 5。第一版不建立地域、年限、语言、可用时间或利益冲突 hard/soft constraint 模型，由内部用户查看资料并确认。

向量存储和查询继续位于 Supabase/Postgres：启用 `pgvector`，保存单个向量列，通过服务端函数/RPC 做范围过滤和精确排序。只为 scope、fund、status 等字段建立普通索引；数据量证明需要时再增加近似索引。

匹配只发送已脱敏的 `question + expert_profile` 给 Fund 批准的 embedding provider，不发送 context、Deal 名称或专家邮箱。

## Risks / Trade-offs

- **[没有内部审核]** 专家提交会直接进入材料链 → 只允许内部选定专家、冻结问题和脱敏 context；按不可信外部材料防 prompt injection；错误材料可继续使用现有 Data Room 管理权限删除。
- **[没有邀请撤销]** 已签发链接只能等待到期或 reissue → 使用高熵、短期 token；本期接受这一产品限制，不实现 cancel/revoke。
- **[没有 Research freshness]** 系统不判断 Research 是否已经包含最新专家材料 → 展示真实 document/job 状态，由用户在材料处理完成后使用现有 Re-run research。
- **[固定 embedding model]** 第一版不处理配置切换或旧向量 → 将 model/dimension 视为部署级固定参数；切换前需要离线全量重建，本期不提供工具。
- **[Research 没有版本]** 新结果覆盖旧 `research_output` → expert request、专家文档和 job 仍保留来源审计；本期接受无法直接比较前后差异。
- **[并发 Ingest]** Deal 有 active job 时新文档保持 pending → 明确显示状态，使用现有 Data Room Process / Analyze data room。
- **[Embedding provider 可用性]** 向量生成失败会使自动匹配不可用 → 保留人工搜索。
- **[自动匹配不判断合规适用性]** 相似专家未必无利益冲突或当前可访谈 → Top 5 只是推荐，必须人工确认。
- **[上下文泄露]** 生成内容可能包含不应披露的信息 → 问题和 context 都必须脱敏并在邀请前由内部用户确认。
- **[Bearer link 被转发]** 持有链接者即可访问外发内容 → 高熵短期 token、fragment、无 analytics、严格 CSP、no-store、限流和最小外发字段。
- **[邮件状态不等于送达]** provider accepted 不代表最终 delivered → 状态命名为 `invited`，单独展示 provider 结果，不宣称真实送达。

## Migration Plan

1. 启用 `pgvector`，新增 `experts` 表、global/fund 约束、server-only 访问和 RLS；不引入独立向量数据库。
2. 新增只有 `draft / invited / submitted` 三态的 expert request 表；不增加 review、receipt、cancel 或 freshness 字段。
3. 增加专家目录管理、脱敏 DTO、人工搜索、固定模型 embedding 和 Top 5 匹配 API。
4. 增加来源快照、AI/manual generation、create/list/status API 和 Research 页面入口。
5. 增加原子 fragment token 签发/reissue、邮件发送、最小公开回答页和隔离的 CSP/no-store 策略。
6. 在提交后自动调用幂等 response → document → enqueue materializer，并提供内部 retry evidence processing。
7. 加固外部材料进入 Ingest prompt 的不可信边界。
8. 验证现有 Ingest、synthesis、checklist、Research、Scoring 和 Memo 主链；不新增 Research freshness 或专家专用分支。

回滚时关闭内部入口和公开路由。已经生成的 `industry_expert` 文档继续作为普通 Data Room 材料保留；expert request 用于来源审计。专家 workflow 不重复生成或覆盖材料，但不改变现有 Data Room 管理员对普通文档的删除权限。

## Open Questions

以下实现参数在编码前确定，但不改变架构：

1. 第一版固定使用哪个 embedding provider/model 和向量维度。
2. 全局专家记录的受信任服务端管理入口放在哪个内部页面。
3. 邀请默认有效期、最长回答长度和公开接口限流阈值。
