\set ON_ERROR_STOP on

begin;
set transaction isolation level serializable;

select set_config('reporting.demo_fund_id', :'fund_id', true);
select set_config('reporting.demo_fund_name', :'fund_name', true);
select set_config('reporting.demo_apply_token', :'apply_token', true);

do $guard$
begin
  if current_setting('reporting.demo_apply_token') <> 'investor-medtech-v1-confirmed' then
    raise exception 'Explicit apply confirmation is required';
  end if;

  if not exists (
    select 1
    from public.funds
    where id = current_setting('reporting.demo_fund_id')::uuid
      and name = current_setting('reporting.demo_fund_name')
  ) then
    raise exception 'Target fund identity does not match';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('investor-demo:' || current_setting('reporting.demo_fund_id'), 0)
  );
end
$guard$;

-- Remove durable research jobs before their JSON deal references become stale.
delete from public.background_jobs
where fund_id = current_setting('reporting.demo_fund_id')::uuid
  and kind = 'deal_research'
  and payload->>'dealId' in (
    select id::text
    from public.inbound_deals
    where fund_id = current_setting('reporting.demo_fund_id')::uuid
  );

-- Preserve derived/manual metrics while detaching the source emails being removed.
update public.metric_values
set source_email_id = null
where source_email_id in (
  select id
  from public.inbound_emails
  where fund_id = current_setting('reporting.demo_fund_id')::uuid
);

-- Explicit order makes the deletion boundary auditable. Related conversations,
-- parsing reviews, and routing corrections follow their declared cascades.
delete from public.inbound_deals
where fund_id = current_setting('reporting.demo_fund_id')::uuid;

delete from public.inbound_emails
where fund_id = current_setting('reporting.demo_fund_id')::uuid;

delete from public.experts
where fund_id = current_setting('reporting.demo_fund_id')::uuid
  and lower(email) = any (array[
    'demo.expert+01@example.com', 'demo.expert+02@example.com',
    'demo.expert+03@example.com', 'demo.expert+04@example.com',
    'demo.expert+05@example.com', 'demo.expert+06@example.com',
    'demo.expert+07@example.com', 'demo.expert+08@example.com',
    'demo.expert+09@example.com', 'demo.expert+10@example.com',
    'demo.expert+11@example.com', 'demo.expert+12@example.com',
    'demo.expert+13@example.com', 'demo.expert+14@example.com',
    'demo.expert+15@example.com', 'demo.expert+16@example.com',
    'demo.expert+17@example.com', 'demo.expert+18@example.com',
    'demo.expert+19@example.com', 'demo.expert+20@example.com'
  ]);

insert into public.inbound_emails (
  id, fund_id, from_address, subject, received_at, raw_payload,
  processing_status, claude_response, metrics_extracted, attachments_count,
  created_at, email_type, email_fingerprint, routed_to, routing_label,
  routing_confidence, routing_reasoning
)
values
(
  '6d4f1001-0000-4000-8000-000000000001', current_setting('reporting.demo_fund_id')::uuid,
  'founder+pulseview@example.com', '引荐：PulseView AI 心脏超声智能定量平台 A轮', now() - interval '1 day',
  jsonb_build_object(
    'From', '林澈 <founder+pulseview@example.com>',
    'To', 'deals@example.com',
    'Subject', '引荐：PulseView AI 心脏超声智能定量平台 A轮',
    'TextBody', E'您好，\n\n这是虚构演示项目 PulseView AI。平台对超声心动图自动完成 EF、GLS 与心腔容积量化，已完成三家中心的回顾性验证，计划以 FDA 510(k) 与 NMPA 三类器械路径推进。团队正在募集 1,200 万美元 A 轮，用于多中心前瞻性试验和跨设备泛化验证。\n\n本邮件仅用于 Reporting 投资人演示。',
    'MessageID', 'demo-pulseview-v1',
    'Tag', 'investor-medtech-v1'
  ),
  'success', jsonb_build_object('demo', true, 'classification', 'deal', 'company', 'PulseView AI'),
  0, 0, now() - interval '1 day', 'deal', 'investor-medtech-v1:pulseview',
  'deals', 'deals', 0.97, '医疗 AI 融资项目，具备明确的多中心临床验证与监管路径。'
),
(
  '6d4f1001-0000-4000-8000-000000000002', current_setting('reporting.demo_fund_id')::uuid,
  'founder+oncopath@example.com', 'OncoPath Vision 数字病理临床验证与融资材料', now() - interval '2 days',
  jsonb_build_object(
    'From', '周宁 <founder+oncopath@example.com>',
    'To', 'deals@example.com',
    'Subject', 'OncoPath Vision 数字病理临床验证与融资材料',
    'TextBody', E'您好，\n\n这是虚构演示项目 OncoPath Vision。产品为肿瘤数字病理切片分型与区域标注辅助系统，当前重点验证乳腺癌和肺癌场景的敏感性、特异性以及读片效率。公司计划募集 1,500 万美元 A 轮，扩大跨中心临床验证和病理工作流集成。\n\n本邮件仅用于 Reporting 投资人演示。',
    'MessageID', 'demo-oncopath-v1',
    'Tag', 'investor-medtech-v1'
  ),
  'success', jsonb_build_object('demo', true, 'classification', 'deal', 'company', 'OncoPath Vision'),
  0, 0, now() - interval '2 days', 'deal', 'investor-medtech-v1:oncopath',
  'deals', 'deals', 0.94, '数字病理 AI 项目，临床终点和工作流价值较为清晰。'
),
(
  '6d4f1001-0000-4000-8000-000000000003', current_setting('reporting.demo_fund_id')::uuid,
  'founder+surgitwin@example.com', 'SurgiTwin Medical 术前规划 SaMD 产品更新', now() - interval '3 days',
  jsonb_build_object(
    'From', '顾言 <founder+surgitwin@example.com>',
    'To', 'deals@example.com',
    'Subject', 'SurgiTwin Medical 术前规划 SaMD 产品更新',
    'TextBody', E'您好，\n\n这是虚构演示项目 SurgiTwin Medical。公司将 CT/MRI 影像重建为患者特异性手术数字孪生，用于肝胆和复杂外科术前规划。目前已完成可用性研究，下一步需要证明对手术时间、切缘和并发症的临床效益。团队募集 600 万美元种子轮。\n\n本邮件仅用于 Reporting 投资人演示。',
    'MessageID', 'demo-surgitwin-v1',
    'Tag', 'investor-medtech-v1'
  ),
  'success', jsonb_build_object('demo', true, 'classification', 'deal', 'company', 'SurgiTwin Medical'),
  0, 0, now() - interval '3 days', 'deal', 'investor-medtech-v1:surgitwin',
  'deals', 'deals', 0.91, '手术规划 SaMD，技术可行性较强但临床效益证据仍需补充。'
),
(
  '6d4f1001-0000-4000-8000-000000000004', current_setting('reporting.demo_fund_id')::uuid,
  'founder+neuroguard@example.com', 'NeuroGuard ICU 神经监测贴片项目申请', now() - interval '4 days',
  jsonb_build_object(
    'From', '秦舒 <founder+neuroguard@example.com>',
    'To', 'deals@example.com',
    'Subject', 'NeuroGuard ICU 神经监测贴片项目申请',
    'TextBody', E'您好，\n\n这是虚构演示项目 NeuroGuard Wearables。一次性脑电贴片面向 ICU 连续脑功能监测和癫痫早筛，目标是缩短告警时间并减少传统 EEG 部署负担。Pre-A 轮计划融资 800 万美元，关键风险包括误报率、长期信号质量及护士工作流负担。\n\n本邮件仅用于 Reporting 投资人演示。',
    'MessageID', 'demo-neuroguard-v1',
    'Tag', 'investor-medtech-v1'
  ),
  'success', jsonb_build_object('demo', true, 'classification', 'deal', 'company', 'NeuroGuard Wearables'),
  0, 0, now() - interval '4 days', 'deal', 'investor-medtech-v1:neuroguard',
  'deals', 'deals', 0.88, '神经监护器械项目，临床需求明确，需重点验证误报和工作流影响。'
),
(
  '6d4f1001-0000-4000-8000-000000000005', current_setting('reporting.demo_fund_id')::uuid,
  'founder+trialbridge@example.com', 'TrialBridge 肿瘤试验匹配平台合作与融资介绍', now() - interval '5 days',
  jsonb_build_object(
    'From', '沈凡 <founder+trialbridge@example.com>',
    'To', 'deals@example.com',
    'Subject', 'TrialBridge 肿瘤试验匹配平台合作与融资介绍',
    'TextBody', E'您好，\n\n这是虚构演示项目 TrialBridge Health。平台利用 NLP 解析病历和临床试验入排标准，为肿瘤患者推荐候选试验。团队募集 400 万美元种子轮，仍需验证真实入组提升、召回率、公平性、医院集成成本与可持续商业模式。\n\n本邮件置信度较低，已进入人工复核，仅用于 Reporting 投资人演示。',
    'MessageID', 'demo-trialbridge-v1',
    'Tag', 'investor-medtech-v1'
  ),
  'needs_review', jsonb_build_object('demo', true, 'classification', 'deal', 'company', 'TrialBridge Health'),
  0, 0, now() - interval '5 days', 'deal', 'investor-medtech-v1:trialbridge',
  'deals', 'deals', 0.82, '临床试验匹配方向相关，但商业模式和实际入组效果仍需人工复核。'
);

insert into public.inbound_deals (
  id, email_id, fund_id, company_name, company_url, company_domain,
  founder_name, founder_email, co_founders, intro_source, referrer_name,
  referrer_email, company_summary, thesis_fit_analysis, thesis_fit_score,
  stage, industry, raise_amount, status, extracted_data, created_at, updated_at,
  research_status, research_summary, research_findings, research_sources, researched_at
)
values
(
  '6d4f2001-0000-4000-8000-000000000001', '6d4f1001-0000-4000-8000-000000000001', current_setting('reporting.demo_fund_id')::uuid,
  'PulseView AI（虚构演示）', null, 'pulseview.demo.invalid',
  '林澈（虚构）', 'founder+pulseview@example.com', '[]'::jsonb, 'warm_intro', '陈医生（虚构）',
  'referrer+pulseview@example.com', 'AI 超声心动图自动定量平台，面向 EF、GLS 与心腔容积分析。',
  '符合医疗 AI 与心血管临床验证方向；重点核查多中心前瞻性证据和跨设备泛化。', 'strong',
  'Series A', '心血管影像 / 医疗 AI', '$12M', 'advancing',
  jsonb_build_object('demo', true, 'clinical_evidence', '三中心回顾性验证', 'regulatory_path', 'FDA 510(k) / NMPA'),
  now() - interval '1 day', now() - interval '1 day', 'done',
  '演示研究摘要：临床需求明确，验证设计合理；跨厂商设备泛化和前瞻性临床终点仍是主要风险。',
  jsonb_build_object('founder_background', '虚构团队具有心血管影像与医疗器械研发经验。', 'traction_corroboration', '演示材料称已完成三中心回顾性验证，尚需核对前瞻性方案。', 'market_context', '心脏超声自动量化需求明确，但需证明跨设备一致性。', 'red_flags', jsonb_build_array('尚无前瞻性临床终点数据'), 'open_questions', jsonb_build_array('不同超声设备上的性能是否一致？', '510(k) 对标器械如何选择？')),
  '[]'::jsonb, now() - interval '20 hours'
),
(
  '6d4f2001-0000-4000-8000-000000000002', '6d4f1001-0000-4000-8000-000000000002', current_setting('reporting.demo_fund_id')::uuid,
  'OncoPath Vision（虚构演示）', null, 'oncopath.demo.invalid',
  '周宁（虚构）', 'founder+oncopath@example.com', '[]'::jsonb, 'referral', '李教授（虚构）',
  'referrer+oncopath@example.com', '用于肿瘤分型和可疑区域标注的数字病理 AI。',
  '符合临床 AI 与诊断器械主题；需评估病理金标准、跨站点漂移和工作流整合。', 'strong',
  'Series A', '数字病理 / 肿瘤 AI', '$15M', 'reviewing',
  jsonb_build_object('demo', true, 'clinical_evidence', '乳腺癌与肺癌回顾性队列', 'regulatory_path', 'NMPA 三类器械'),
  now() - interval '2 days', now() - interval '2 days', 'done',
  '演示研究摘要：数字病理场景价值清楚，当前最关键的是统一金标准和跨中心外部验证。',
  jsonb_build_object('founder_background', '虚构团队由病理科医生与计算机视觉工程师组成。', 'traction_corroboration', '演示数据覆盖两类肿瘤，但外部验证站点有限。', 'market_context', '病理科数字化率提升为算法落地提供基础。', 'red_flags', jsonb_build_array('训练与验证站点可能存在分布偏差'), 'open_questions', jsonb_build_array('病理医师仲裁规则是什么？', '不同扫描仪上的性能如何？')),
  '[]'::jsonb, now() - interval '44 hours'
),
(
  '6d4f2001-0000-4000-8000-000000000003', '6d4f1001-0000-4000-8000-000000000003', current_setting('reporting.demo_fund_id')::uuid,
  'SurgiTwin Medical（虚构演示）', null, 'surgitwin.demo.invalid',
  '顾言（虚构）', 'founder+surgitwin@example.com', '[]'::jsonb, 'demo_day', null, null,
  '基于 CT/MRI 的患者特异性术前规划和手术数字孪生 SaMD。',
  '技术方向相关，但需要从可用性研究推进到手术时间、切缘和并发症等临床效益终点。', 'moderate',
  'Seed', '外科规划 / 医疗器械 SaMD', '$6M', 'met',
  jsonb_build_object('demo', true, 'clinical_evidence', '单中心可用性研究', 'regulatory_path', 'SaMD 临床评价'),
  now() - interval '3 days', now() - interval '3 days', 'done',
  '演示研究摘要：三维规划体验良好，但尚未证明能够改变患者结局或显著提高效率。',
  jsonb_build_object('founder_background', '虚构团队具备医学影像重建与外科导航经验。', 'traction_corroboration', '当前证据以可用性和医生满意度为主。', 'market_context', '复杂外科规划有明确痛点，但采购价值依赖临床效益。', 'red_flags', jsonb_build_array('缺少对照临床研究'), 'open_questions', jsonb_build_array('首个适应症如何选择？', '主要临床终点是什么？')),
  '[]'::jsonb, now() - interval '68 hours'
),
(
  '6d4f2001-0000-4000-8000-000000000004', '6d4f1001-0000-4000-8000-000000000004', current_setting('reporting.demo_fund_id')::uuid,
  'NeuroGuard Wearables（虚构演示）', null, 'neuroguard.demo.invalid',
  '秦舒（虚构）', 'founder+neuroguard@example.com', '[]'::jsonb, 'event', '神经重症论坛（演示）',
  'referrer+neuroguard@example.com', '面向 ICU 连续脑功能监测和癫痫早筛的一次性脑电贴片。',
  '临床需求明确；需验证误报率、长期信号质量、告警延迟和护士工作流负担。', 'moderate',
  'Pre-A', '神经监护 / 可穿戴医疗器械', '$8M', 'new',
  jsonb_build_object('demo', true, 'clinical_evidence', '早期 ICU 观察队列', 'regulatory_path', '监护器械注册'),
  now() - interval '4 days', now() - interval '4 days', 'done',
  '演示研究摘要：连续监护场景有价值，器械可靠性和误报对护理资源的影响需要重点验证。',
  jsonb_build_object('founder_background', '虚构团队具备可穿戴传感与神经电生理经验。', 'traction_corroboration', '早期观察队列显示部署速度优势。', 'market_context', 'ICU 脑功能连续监测存在覆盖不足。', 'red_flags', jsonb_build_array('误报可能增加护士负担'), 'open_questions', jsonb_build_array('连续 72 小时信号有效率是多少？', '告警如何进入现有护理流程？')),
  '[]'::jsonb, now() - interval '92 hours'
),
(
  '6d4f2001-0000-4000-8000-000000000005', '6d4f1001-0000-4000-8000-000000000005', current_setting('reporting.demo_fund_id')::uuid,
  'TrialBridge Health（虚构演示）', null, 'trialbridge.demo.invalid',
  '沈凡（虚构）', 'founder+trialbridge@example.com', '[]'::jsonb, 'cold', null, null,
  '利用 NLP 解析病历与试验入排标准的肿瘤临床试验匹配平台。',
  '临床试验方向相关，但真实入组提升、公平性、医院集成成本和商业模式尚不清晰。', 'weak',
  'Seed', '临床试验匹配 / 医疗 AI', '$4M', 'new',
  jsonb_build_object('demo', true, 'clinical_evidence', '算法回顾性评估', 'regulatory_path', '临床决策支持边界待明确'),
  now() - interval '5 days', now() - interval '5 days', 'done',
  '演示研究摘要：问题真实，但产品价值不能仅由离线召回率证明，需要真实入组率和工作流研究。',
  jsonb_build_object('founder_background', '虚构团队具有临床 NLP 和试验运营经验。', 'traction_corroboration', '离线匹配结果尚未转化为真实入组证据。', 'market_context', '试验招募效率低，但医院系统集成复杂。', 'red_flags', jsonb_build_array('尚无真实入组率提升数据', '商业模式依赖医院深度集成'), 'open_questions', jsonb_build_array('相较人工筛选能提升多少真实入组？', '如何评估不同人群的匹配公平性？')),
  '[]'::jsonb, now() - interval '116 hours'
);

insert into public.experts (
  id, scope, fund_id, name, email, title, organization, profile_text, status, created_by
)
values
('6d4f3001-0000-4000-8000-000000000001', 'fund', current_setting('reporting.demo_fund_id')::uuid, '陈睿（虚构专家）', 'demo.expert+01@example.com', '心血管影像主任医师', '华东心血管临床中心（演示）', '心血管超声与影像专家，具有18年三甲医院临床和多中心研究经验。熟悉 EF、GLS、心腔容积、超声设备一致性与 AI 辅助定量验证，可回答临床终点、阅片一致性和设备泛化问题。覆盖中国大型心血管中心场景；无真实商业关系，本资料仅用于演示。', 'active', (select user_id from public.fund_members where fund_id = current_setting('reporting.demo_fund_id')::uuid order by created_at limit 1)),
('6d4f3001-0000-4000-8000-000000000002', 'fund', current_setting('reporting.demo_fund_id')::uuid, '刘心怡（虚构专家）', 'demo.expert+02@example.com', '心衰中心主任医师', '南方心衰研究中心（演示）', '心衰与临床终点专家，具有16年临床队列和器械试验经验。可评估住院、运动耐量、生活质量、影像替代终点及患者分层，熟悉区域医疗中心和随访体系。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000003', 'fund', current_setting('reporting.demo_fund_id')::uuid, '赵明川（虚构专家）', 'demo.expert+03@example.com', '介入心脏病主任医师', '国家介入医学协作中心（演示）', '介入心脏病与高风险器械专家，具有20年导管室和注册临床经验。可回答器械学习曲线、术者差异、复合终点、核心实验室和上市后监测问题，覆盖大型中心与区域转诊网络。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000004', 'fund', current_setting('reporting.demo_fund_id')::uuid, '孙晓岚（虚构专家）', 'demo.expert+04@example.com', '心电生理主任医师', '心律失常诊疗中心（演示）', '心电生理与连续监测专家，具有15年动态心电、消融和远程监护经验。可评估信号质量、事件检出、误报、可穿戴设备依从性及临床工作流，熟悉多层级医院部署。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000005', 'fund', current_setting('reporting.demo_fund_id')::uuid, '高倩（虚构专家）', 'demo.expert+05@example.com', '放射科 AI 临床平台主管', '医学影像人工智能中心（演示）', '放射科 AI 临床验证专家，具有14年影像诊断和算法评价经验。擅长外部验证、站点漂移、读片研究、敏感性与特异性分析，可回答 PACS 集成和临床采纳问题。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000006', 'fund', current_setting('reporting.demo_fund_id')::uuid, '韩卓（虚构专家）', 'demo.expert+06@example.com', '神经影像主任医师', '脑影像临床研究中心（演示）', '神经影像与急性卒中专家，具有17年 MRI、CT 灌注和多中心研究经验。可评估影像算法的临床适应症、时间窗、金标准和跨设备泛化，熟悉卒中中心网络。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000007', 'fund', current_setting('reporting.demo_fund_id')::uuid, '许嘉宁（虚构专家）', 'demo.expert+07@example.com', '神经重症主任医师', '神经重症监护联盟（演示）', '神经重症和连续脑电监测专家，具有13年 ICU 临床与监护器械研究经验。可回答癫痫早筛、告警延迟、误报、连续信号质量和护士工作流问题。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000008', 'fund', current_setting('reporting.demo_fund_id')::uuid, '周清禾（虚构专家）', 'demo.expert+08@example.com', '数字病理平台主管', '肿瘤病理协作中心（演示）', '数字病理和肿瘤分型专家，具有19年病理诊断和算法验证经验。可评估病理金标准、医生仲裁、扫描仪差异、站点漂移及读片效率，覆盖大型肿瘤中心场景。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000009', 'fund', current_setting('reporting.demo_fund_id')::uuid, '蒋文博（虚构专家）', 'demo.expert+09@example.com', '肿瘤内科主任医师', '精准肿瘤临床中心（演示）', '实体瘤诊疗与精准医学专家，具有18年肿瘤临床和真实世界研究经验。可回答诊疗路径、伴随诊断、患者分层、临床价值与终点选择问题。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000010', 'fund', current_setting('reporting.demo_fund_id')::uuid, '沈若彤（虚构专家）', 'demo.expert+10@example.com', '肿瘤临床试验平台主管', '临床试验招募协作网（演示）', '肿瘤临床试验运营专家，具有12年方案执行和患者招募经验。可评估入排标准解析、筛选失败、真实入组率、站点启动和患者公平性，熟悉研究型医院与区域中心。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000011', 'fund', current_setting('reporting.demo_fund_id')::uuid, '顾行舟（虚构专家）', 'demo.expert+11@example.com', '普外科主任医师', '微创外科创新中心（演示）', '肝胆与微创外科专家，具有20年手术及器械评价经验。可评估术前规划、切缘、手术时间、并发症、学习曲线和数字孪生的临床效益，熟悉复杂病例转诊中心。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000012', 'fund', current_setting('reporting.demo_fund_id')::uuid, '罗安然（虚构专家）', 'demo.expert+12@example.com', '麻醉与围术期主任医师', '围术期医学研究中心（演示）', '麻醉与围术期风险管理专家，具有15年临床和监测器械研究经验。可回答围术期终点、监护告警、术后并发症和工作流影响，覆盖综合医院手术平台。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000013', 'fund', current_setting('reporting.demo_fund_id')::uuid, '彭知远（虚构专家）', 'demo.expert+13@example.com', '重症医学主任医师', '重症监护临床评价中心（演示）', 'ICU 监护与临床评价专家，具有17年重症临床和设备采购经验。可评估连续监测可靠性、误报、护理负担、感染控制及实际部署价值，熟悉不同等级 ICU。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000014', 'fund', current_setting('reporting.demo_fund_id')::uuid, '方芷（虚构专家）', 'demo.expert+14@example.com', '呼吸与肺功能主任医师', '呼吸生理研究中心（演示）', '呼吸疾病与肺功能评估专家，具有16年临床和器械研究经验。可回答生理信号质量、患者分层、远程监测、运动与肺功能终点，覆盖专科与基层随访场景。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000015', 'fund', current_setting('reporting.demo_fund_id')::uuid, '段启明（虚构专家）', 'demo.expert+15@example.com', '急诊医学主任医师', '急诊医疗创新中心（演示）', '急诊分诊与床旁器械专家，具有14年急危重症和流程改进经验。可评估时间敏感终点、误报漏报、床旁部署和医护采纳，熟悉大型急诊和区域急救网络。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000016', 'fund', current_setting('reporting.demo_fund_id')::uuid, '林悦（虚构专家）', 'demo.expert+16@example.com', '内分泌与慢病管理主任医师', '数字慢病管理中心（演示）', '内分泌慢病与数字健康专家，具有13年糖尿病队列和远程管理经验。可评估依从性、长期终点、数字生物标志物和基层推广，熟悉医院与社区协同。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000017', 'fund', current_setting('reporting.demo_fund_id')::uuid, '叶岚（虚构专家）', 'demo.expert+17@example.com', '医疗器械临床评价专家', '医疗器械评价实验室（演示）', '医疗器械临床评价专家，具有18年有源器械、SaMD 和注册试验经验。可回答对照器械、临床评价路径、风险管理、可用性工程及上市后研究，覆盖中国和美国监管场景。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000018', 'fund', current_setting('reporting.demo_fund_id')::uuid, '陶景行（虚构专家）', 'demo.expert+18@example.com', '临床信息学平台主管', '智慧医院集成中心（演示）', '临床信息学和医院系统集成专家，具有15年 HIS、EMR、PACS 与数据治理经验。可评估接口成本、数据质量、隐私、安全、医护工作流和规模化部署，覆盖大型医院集团。无真实商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000019', 'fund', current_setting('reporting.demo_fund_id')::uuid, '谢昭（虚构专家）', 'demo.expert+19@example.com', '医疗监管与注册临床顾问', '医疗产品法规研究院（演示）', '医疗器械与 AI 注册策略专家，具有17年 NMPA、FDA 510(k) 和 SaMD 项目经验。可回答产品分类、临床评价、变更管理、算法锁定和上市后监测；无真实监管机构任职或商业关系，本资料仅用于演示。', 'active', null),
('6d4f3001-0000-4000-8000-000000000020', 'fund', current_setting('reporting.demo_fund_id')::uuid, '孟思远（虚构专家）', 'demo.expert+20@example.com', '临床生物统计平台主管', '临床试验方法学中心（演示）', '生物统计与试验设计专家，具有16年诊断、器械和 AI 临床研究经验。可回答样本量、敏感性特异性、缺失数据、多重性、外部验证和真实世界研究，覆盖多中心注册试验。无真实商业关系，本资料仅用于演示。', 'active', null);

do $validate$
declare
  target_fund uuid := current_setting('reporting.demo_fund_id')::uuid;
  demo_email_ids uuid[] := array[
    '6d4f1001-0000-4000-8000-000000000001'::uuid,
    '6d4f1001-0000-4000-8000-000000000002'::uuid,
    '6d4f1001-0000-4000-8000-000000000003'::uuid,
    '6d4f1001-0000-4000-8000-000000000004'::uuid,
    '6d4f1001-0000-4000-8000-000000000005'::uuid
  ];
begin
  if (select count(*) from public.inbound_emails where fund_id = target_fund) <> 5 then
    raise exception 'Expected exactly 5 target-fund emails';
  end if;
  if (select count(*) from public.inbound_deals where fund_id = target_fund) <> 5 then
    raise exception 'Expected exactly 5 target-fund deals';
  end if;
  if (select count(distinct email_id) from public.inbound_deals where fund_id = target_fund) <> 5 then
    raise exception 'Expected one unique source email per demo deal';
  end if;
  if exists (
    select 1 from public.inbound_deals
    where fund_id = target_fund and not (email_id = any (demo_email_ids))
  ) then
    raise exception 'Unexpected source email in target-fund deals';
  end if;
  if (
    select count(*) from public.experts
    where fund_id = target_fund and lower(email) like 'demo.expert+%@example.com'
  ) <> 20 then
    raise exception 'Expected exactly 20 investor-demo experts';
  end if;
end
$validate$;

commit;
