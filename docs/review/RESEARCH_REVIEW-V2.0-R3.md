# RESEARCH_REVIEW-V2.0-R3（Pair Engine / Signal Engine）

- Plan Version（评的是哪版 PRODUCT_PLAN）：`PRODUCT_PLAN_V2.0-DRAFT.2` + `docs/pm/V2-R3-event-table.md`（FROZEN，D3=A）
- Review Round（第几轮）：R3（Pair Engine / Signal Engine；R1/R2已PASS不重审）
- Result：FAIL＋一句话结论：R3方向成立但数值与fixture缺失，3 PASS / 4 FAIL，无新增blocking P1，打回Planner补齐P1-05后复审。
- P0 / P1 / P2：
  - P0：无新增（R3不新开P0；全局P0-01~P0-04状态以DRAFT.2为准，不重审）。
  - P1：blocking P1=0（R3四项FAIL全部归入既有非blocking P1-05，不新增blocking；全局blocking P1-01/P1-02/P1-03/P1-04仍在，与R3无关）。
  - P2：R3-07需补一句显式声明（Score仅排序），记P2。
- Key Assumptions（逐条列＋是否成立）：
  - R3事件表是计数唯一口径：成立（DRAFT.2 §C与R3事件表一致，REL_CARD_COMPLETED唯一+1，Heat 0–3/4–7/8–12/13+，mutual 9/14/19）。
  - Pair/Signal数值可在DEVELOP前补齐而不改R3计数语义：成立（有条件；补齐不得反改事件表与Heat锁）。
- Verified Facts（已验证事实＋证据）：
  - 计数/Heat/mutual口径冻结：DRAFT.2 §C一~六与R3事件表全文一致。
  - 四库分离原则已写入E.1/E.2与Data模型（shared/compatibility/crowd/personal分字段＋分别封顶＋Crowd/Personal不建MATCH）。
  - MATCH不绕过cooldown已写入F.4；QUALIFYING计数须过cooldown过滤已写入F.3。
  - 硬过滤前置于Coverage/Cooldown/drawBand已写入User Flow §3；70/30不覆盖consent与公平已写入F.6。
- R3逐条 verdict（DRAFT.2＋R3事件表为准）：
  - [R3-01 Coverage+Signal-Cooldown公平性] FAIL（非blocking，归P1-05）：仅有Technical Approach §5“Coverage + Signal − Cooldown”方向句，无权重/公式/上下界/归一化与fixture，无法验证不垄断。Required Fix：补公式＋边界＋3局型fixture。
  - [R3-02 小局pair≤6降权] FAIL（非blocking，归P1-05）：全文仅Risks提“small-pool降权”概念，无“≤6”阈值、无降权系数、无触发/恢复条件。Required Fix：补阈值＋系数＋多MATCH竞争例。
  - [R3-03 Shared/Compatibility/Crowd/Personal分离] PASS：E.1分库/分别封顶/不得互升＋E.2 Crowd/Personal不建MATCH＋Data模型四证据字段分离。
  - [R3-04 Signal cap防锁死] FAIL（非blocking，归P1-05，关联blocking P1-01）：仅“分别封顶”四字，无cap数值、无防单边锁死/防刷分证明。Required Fix：补各库cap＋封顶后行为（截断/衰减/停记）＋防锁死断言。
  - [R3-05 MATCH受cooldown] PASS：F.4“不绕过cooldown”＋F.3 QUALIFYING须过cooldown过滤＋多MATCH排序不豁免cooldown。
  - [R3-06 4人/5人/4男1女/1男4女局型稳定] FAIL（非blocking，归P1-05）：有eligiblePair谓词＋NO_ELIGIBLE_PAIR/SINGLE_TARGET_GENDER降级路径，但无四局型pair边数/稳定性分析与fixture（4M1F/1M4F单边垄断风险未量化）。Required Fix：补四局型边数表＋最小fixture（4人/5人/4M1F/1M4F）＋暂离/退出不死锁断言。
  - [R3-07 Routing Score仅优先级] PASS（附P2补声明）：User Flow §3硬过滤先于Coverage/Cooldown/drawBand＋F.6带宽不覆盖规则，Score仅在合法候选内排序成立；需补一句“Score不覆盖任何硬过滤”显式声明防Builder误读。
- External Sources：无（本轮禁联网禁外部文件，未做外部验证；缺口见Unverified）。
- Competitor Findings：无（本轮未做；沿用DRAFT.2 §Competitor/Research Summary，不扩大解读）。
- Counter-evidence：无（本轮范围内未发现与DRAFT.2矛盾的已验证反证）。
- Unverified Items（未验证项＋验证方法）：
  - 权重/降权系数/cap数值/四局型节奏：未验证；方法：Planner补数值＋unit/property/fixture＋真人局抽查（Phase2 DoD §4/§9）。
  - 传手机耗时/尴尬/泄露观察：未验证；方法：真机弱光4人/5人局（沿用DRAFT.2缺口口径）。
- Required Fixes（Planner 必须改项，打回依据）：
  - 1. 补R3-01公式与边界＋fixture（归P1-05）。
  - 2. 补R3-02“≤6”阈值与降权系数（归P1-05）。
  - 3. 补R3-04各库cap与封顶后行为（归P1-05）。
  - 4. 补R3-06四局型边数表与fixture（归P1-05）。
  - 5. R3-07补一句显式声明（P2）。
  - 以上均不得反改R3事件表计数/Heat/mutual锁；数值进新受控JSON快照＋重签SHA256后才生效（R5 Gate）。
- Plan Readiness Score：不重打分（R3只出逐条verdict；全局71/100与Gate条件以DRAFT.2为准）。
- Human-only Decisions：无新增（D1/D2/D5/D6/D7/D8保持TBD，Human Gate前不拍板）。
- Next Action：回 Planner 修订后复审R3；不进 WAITING_HUMAN_APPROVAL（全局blocking P1-01~04未清＋R3有4 FAIL）。
- R3结论一句：R3为FAIL，无新增blocking P1，四项FAIL补齐数值与fixture后复审。

---

## R3复审（2026-09-25复审轮，历史结论保留，以上不改）

- 复审依据：`docs/pm/V2-R3-event-table.md` 现行FROZEN版 §六/§七/§八/§九/§十（只审公式·降权·cap·四局型fixture四节；计数/Heat 0–3/4–7/8–12/13+/mutual 9/14/19锁未动，无反改）。
- [R3-01 公式] 由FAIL转PASS，关闭：§6.1给出`C_e`逆min-max、`S_e=(min(shared,4)+min(compat,4))/8`、`D_e∈{1,0.5,0}`、`raw=wC·C+wS·S−wD·D`、`R=clamp01(raw+wD)`、冻结权重0.60/0.25/0.15（和=1，raw∈[−0.15,0.85]故R∈[0,1]）、权重边界wC[0.55,0.75]/wS[0.10,0.30]/wD[0.10,0.20]、排序键R↓→c↑→上次分配时间↑→seed+canonicalPairId hash；三fixture数值已验算成立（A三者R=0.75；B为0.40 vs 0.75；C为0.425 vs 0.575）。
- [R3-02 ≤6降权] 由FAIL转PASS，关闭：§七锁定`|E_t|≤6`触发、`k=0.50`致wC'=0.725/wS'=0.125/wD'=0.15、恢复须连续两次`|E_t|≥7`且回落重置；`FX-R3-02-MULTI_MATCH`已验算成立（0.275/0.5375/0.95，DE>AC>AB），MATCH不越Coverage/硬过滤断言明确。
- [R3-03 分离] 维持PASS：§八cap表重申Crowd/Personal禁入`S_e`禁建MATCH，与原E.1/E.2一致。
- [R3-04 cap防锁死] 由FAIL转PASS，关闭：§八锁定shared 4/compat 4/crowd 3/personal 3，封顶只截断计分贡献（rawEvidenceLog续记不停记），衰减5/5/4/4且衰减钟仅由`REL_CARD_COMPLETED`推进；防锁死净优势普通0.20/小池0.45>0，`FX-R3-04-CAP_NO_LOCK`已验算成立（R_AB=0.40 vs R_CD=0.60，CD必胜）。
- [R3-05 MATCH受cooldown] 维持PASS：§6.1硬cooldown先行＋软D不代替硬过滤，与原F.3/F.4一致。
- [R3-06 四局型fixture] 由FAIL转PASS，关闭：§九边数表4P全边6/跨M/F 4、5P 10/6、4M1F 10/4、1M4F 10/4及最小枚举集正确；O(|E_t|)有界返回、`participantSetVersion`重算、`NO_ELIGIBLE_PAIR`/`SINGLE_TARGET_GENDER`降级、暂离回席/退出永久排除、并发单提交/E_t=0立即降级五断言齐备。
- [R3-07 仅排序] 由PASS（附P2）转PASS并关闭P2：§6.1第1条“Score只在E_t内排序，不得覆盖或复活硬过滤”＋§十`scoreNeverOverridesHardFilters:true`即所要显式声明。
- R3复审结论一句：R3为PASS，7/7通过、无新增blocking P1，原P1-05四项已补齐关闭（§十常量以新受控JSON快照＋重签SHA256后才生效，见R5 Gate）。
