# 360 Panorama Viewer 商业成熟度审查

日期：2026-10-25（Asia/Shanghai）。对象：[正式站](https://360panoramaviewer.com/)。

结论：网站已经有可使用的免费工具、AI 工作台和订阅入口。距离成熟商业网站，最需要补齐的是可信购买依据、账户自助服务、异常交易恢复，以及可衡量的转化和毛利。当前不宜仅凭页面完整度判断已经具备稳定经营能力。

## 范围与证据等级

- **线上确认**：匿名访问首页、价格页、登录/注册入口、购买前登录、作品展示页、免费查看器；检查 1440px、390px、320px 布局、公开配置接口、原始 HTML 和 JSON-LD。
- **本地确认/代码风险**：两位独立审查代理分别检查后台交易与账户、埋点与能力承诺；主代理检查相关实现。工作区存在大量原有改动，代码发现不能直接等同于线上正在发生。
- **待核实**：真实用户转化率、上游模型实际成本、送达率、生产备份/恢复与告警、第三方边缘防护。
- 本次没有创建真实账户、发送验证邮件、调用收费生成、创建或支付订阅、执行退款或修改任何生产设置。未做渗透测试、真实设备 VR 验证或法律合规认证。

可复核数据：[live-evidence.json](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/live-evidence.json)。其中只保存公开配置摘要，未保存用户会话或凭据。

## 已有基础

- 本次 `/api/models`、`/api/billing`、`/api/paypal/config` 均返回 200；PayPal 公开配置为 `enabled: true`、`mode: live`。这证明正式收款配置已暴露给前端，**不证明真实付款、回调与权益到账全流程通过**。
- 价格页能显示月付/年付实际金额、积分和自动续费说明，说明 PayPal 批准并不等于积分到账。
- 免费查看器成功读取本地 2048×1024 测试图，切换 Sphere/Little Planet；相关正常流程未发现业务控制台错误。
- 首页 390px、首页及价格页 320px 检查未见页面横向溢出。不能据此推断全部弹窗、所有语言、真实低端手机均通过。
- 后台已有验签、付款金额核对、重复发放防护，以及生成预算/限流基础。以下风险并非“完全没有安全措施”。

## 问题概览

10 项发现：P1 五项、P2 五项；另列两项经营判断。P1 表示应优先于扩大收费获客处理，P2 表示影响转化或可运营性。未在本次有限范围内确认 P0，不代表不存在。

| 编号 | 优先级 | 问题 | 证据等级 |
|---|---|---|---|
| A01 | P1 | 条款、隐私、客服与退款说明未形成可访问的信任闭环 | 线上确认 |
| A02 | P1 | 忘记密码后没有自助恢复途径 | 线上确认；本地亦缺账户删除流程 |
| A03 | P1 | 订阅取消、付款对账与退款状态存在异常分支缺口 | 本地确认/代码风险 |
| A04 | P1 | 生成扣积分缺少可持久核对的交易和补偿记录 | 本地代码风险 |
| A05 | P1 | 无法从现有埋点衡量完整商业转化漏斗 | 线上 + 本地确认 |
| A06 | P2 | 静态 HTML / JSON-LD 与实际能力说明冲突 | 线上 + 本地确认 |
| A07 | P2 | 缺少可判断付费生成质量的公开真实样例 | 线上确认 |
| A08 | P2 | 首次生成遇到注册门槛时，落入默认登录流程 | 线上确认 |
| A09 | P2 | 本地图片的 Embed 代码不能直接交付当前作品 | 线上确认 |
| A10 | P2 | 敏感管理操作缺少可归责的审计记录 | 本地确认；外围保护待核实 |

## 发现与建议

### A01 — 购买前缺少完整的信任与售后信息

**复现**：打开首页或价格页，滚动至 Company & Legal。Terms of Service、Privacy Policy 都是 `SPAN`，不是可打开的链接。请求 `/terms/`、`/privacy/` 均返回 404；本次检查的首页/价格页公开页脚也没有客服邮箱入口。`/copyright/` 当前同样 404，本地已有候选页面，不能称其已上线。

**影响**：用户无法在付费前核对服务主体、参考图如何处理、商业使用条件、退款范围和联系渠道。商业授权文案引用站点条款，但条款不可读。这里指出的是信息与服务缺口，不是宣告某个司法辖区已经违法。

**建议**：先提供实际运营主体与有效客服联系方式；发布能打开的条款、隐私和退款说明并连接注册/付款入口。说明本地查看、AI 参考图上传、公开分享三类数据流，明确取消续费和退款的区别。具体政策需由真实业务规则支持，不能填虚构地址或承诺。

**证据**：[页脚截图](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/screenshots/footer-policy.png)、[源码](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/App.tsx:1405)。

### A02 — 付费账户缺少自助找回

**复现**：Sign in → Trouble signing in?。线上明确显示 “Self-service password reset is not available yet.”，没有重置入口。

**影响**：忘记密码会阻断积分使用、作品访问和站内订阅管理；公开客服入口缺失会放大此问题。

**建议**：复用现有邮箱发送与一次性令牌机制，实现限时重置、令牌一次使用、限流和重置后旧会话撤销；提供真实可用的人工恢复渠道。本地亦未发现账户删除及关联会话/作品/订阅的完整处理流程，删除之前应明确如何处理仍在续费的订阅。

**证据**：[登录截图](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/screenshots/signin-desktop.png)、[登录提示实现](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/components/commercial/UserAuthModal.tsx:244)。

### A03 — 异常交易还不能可靠收尾

独立审查对本地实现指出三种具体情况：

1. 用户被暂停后，订阅接口的共同 `active` 检查也阻断取消操作。内存模拟得到 403；站内暂停不会自动取消 PayPal 续费。用户仍可能从 PayPal 外部取消，不能表述为“任何途径都无法取消”。
2. 内存模拟分别确认：远端创建成功但本地关联失败时会清理未关联的 pending 记录；付款事件若找不到本地映射，会返回 `200 ignored`；刷新订阅只更新状态，不补查历史付款。**这三项不能直接串联为“该创建故障导致用户付款后漏发积分”**：批准链接要在关联成功后才返回，目前未证明该故障下用户仍可完成批准付款。当前只能确认映射缺失时缺少自动核对路径，付款影响及具体可达条件待验证。未在生产制造故障。
3. webhook 仅处理付款成功与部分订阅生命周期事件，未形成退款/付款撤销对应的发票、积分与权益状态闭环。人工在 PayPal 处理退款并不等于站内账务已同步。

**建议**：先允许已验证身份的暂停用户取消自己的续费；保留可核对的 pending 交易，建立付款对账与安全重放；记录退款/撤销与权益处理结果。先补现有流程，不必先引入复杂账务平台。

**证据**：[共同状态检查](/Users/han/Documents/ChatGPT/pp/panorama-generator/server/paypal.mjs:173)、[取消入口](/Users/han/Documents/ChatGPT/pp/panorama-generator/server/paypal.mjs:188)、[创建异常清理](/Users/han/Documents/ChatGPT/pp/panorama-generator/server/paypal.mjs:238)、[回调忽略分支](/Users/han/Documents/ChatGPT/pp/panorama-generator/server/paypal.mjs:156)、[事件白名单](/Users/han/Documents/ChatGPT/pp/panorama-generator/server/paypal.mjs:149)。

### A04 — 生成失败的积分补偿依赖当前请求存活

**本地事实**：先直接减少余额，再请求模型；未完成时在 `finally` 加回积分。存在普通失败退款逻辑，不能称“失败都扣费”。但进程被终止，或退款写库失败时，没有对应的持久生成交易可供恢复和对账。

**影响**：用户报告“扣了积分却没有结果”时，运营人员难以可靠判定该笔请求该补多少、是否已经补过。

**建议**：给每次生成记录请求 ID、用户、预扣额、状态、实际费用和补偿状态；通过幂等状态变化确认/退回，提供超时未结算记录的核对路径。

**证据**：[预扣](/Users/han/Documents/ChatGPT/pp/panorama-generator/functions/api/[[route]].ts:1130)、[请求内补偿](/Users/han/Documents/ChatGPT/pp/panorama-generator/functions/api/[[route]].ts:1236)。未对生产进行终止或故障注入。

### A05 — 无法回答流量为什么没有变成收入

**线上事实**：本次正常浏览中 `window.gtag`、`window.dataLayer` 未定义，没有观察到 GA4 请求；抽查首页、生成页、HDRI 页原始 HTML 也没有 GA 加载代码。Cloudflare 自身统计脚本存在，所以不能称“完全没有统计”。

**本地事实**：存在待发布的 GA 注入与 SPA `page_view`，但未发现注册成功、邮箱验证成功、首次生成成功、结账开始、实际付款成功等完整业务事件。

**建议**：按真实成功状态记录 `sign_up`、邮箱验证、首次成功生成、下载、`begin_checkout` 与付款确认；对财务收入使用服务端已验签的支付事实，并防止重复计数。再按来源、落地页、设备观察各步转化。不要把 PayPal 按钮点击当成交。

**证据**：[线上记录](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/live-evidence.json)、[当前本地埋点](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/App.tsx:412)、[候选 GA 注入](/Users/han/Documents/ChatGPT/pp/panorama-generator/vite.config.ts:103)。未查看 GA 后台，不能据此断言历史数据为零。

### A06 — 产品承诺存在多个版本

**线上复现**：读取 `/360-image-maker/` 原始 HTML，仍有 `true 4K`、`No upload needed`；`/ai-hdri-generator/` 静态 FAQ 和 JSON-LD 仍保证无接缝，并对 HDR/EXR 导出给出含糊肯定答案。交互界面却已经说明模型可能返回更少像素、接缝混合可能重影、HDR 容器不重建实测动态范围。

**本地依据**：HDR 导出器将 8-bit Canvas 颜色编码成 RGBE；这不创造原来没有的光照数据。参考图模式会将图片发送到生成服务。“No upload”只应描述本地查看与本地转换。

**建议**：一次统一可见正文、meta、静态回退、JSON-LD、FAQ、页脚和各语言页面。把“请求 4K”“真实返回尺寸”“HDR 格式容器”讲清楚，删除无证据的绝对质量承诺。搜索引擎是否已采用这些文字需另查，当前只确认服务器仍提供冲突内容。

**证据**：[线上 HTML 摘录](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/live-evidence.json)、[HDR 编码](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/utils/hdrExporter.ts:40)、[生成页静态步骤](/Users/han/Documents/ChatGPT/pp/panorama-generator/360-image-maker/index.html:166)、[HDRI 静态文案](/Users/han/Documents/ChatGPT/pp/panorama-generator/ai-hdri-generator/index.html:192)。

### A07 — 付费生成缺少足够的结果证明

**线上复现**：首页 prompt library 明确说明演示是程序化生成、不是 AI 结果；`/showcase/` 显示没有公开作品，对应公开 API 返回空列表。这种标注是诚实的，但演示无法证明付费模型的实际输出质量。

**建议**：先制作少量授权明确的真实生成案例。每项展示提示词、模型、原始尺寸、积分、实际耗时、未修接缝的原图与可旋转预览；再展示确实导入 Unity/Blender 的结果。用真实案例解释适合的用途，不虚构客户或评价。

**证据**：[作品页截图](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/screenshots/showcase.png)、[程序化演示实现](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/components/commercial/ShowcaseGallery.tsx:96)。这不是对模型生成质量本身的测试结论。

### A08 — 新访客的第一次生成流程绕了一步

**线上复现**：匿名访客在默认 4K 工作台点击 Generate (4 Credits)，收到注册验证提示，但弹窗默认是 Sign in。新用户需要自己切换 Create account，然后注册、收信验证、返回生成。工作台直到点击时才解释试用要求。

**建议**：访客按钮直接表达“注册并验证邮箱，领取试用积分”，默认打开注册，并保存提示词、参考图和返回意图。验证完成后回到原任务。保留免费 demo 让用户先判断价值。需用转化事件验证改动是否有效，不能假定摩擦必然导致某个比例流失。

**证据**：[手机首次生成截图](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/screenshots/first-generation-mobile.png)、[生成前检查](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/components/GeneratorTab.tsx:386)。本次未提交注册，因此没有验证真实邮件送达和注册后的续接。

### A09 — Embed 的可复制结果没有直接包含当前本地图

**线上复现**：在免费查看器打开 Enhance & embed → Embed。本地/临时图片提示用户先自行托管，生成的 iframe URL 没有 `pano=` 参数，直接复制不能显示正在查看的那张图片。提示已存在，所以这不是静默上传或秘密换图。

**影响**：网站把 Embed 当作工作流能力展示，但非技术用户还需要另找托管服务、理解公开 URL 才能完成交付。

**建议**：明确区分“本地预览”与“可发布作品”；复用已有分享流程，先得到可访问的作品链接再生成 iframe，并预览最终结果。涉及上传时清晰说明与征得相应分享选择，不能为了省步骤自动公开私图。

**证据**：[导入本地测试图后的 Embed 弹窗](/Users/han/Documents/ChatGPT/pp/panorama-generator/docs/commercial-audit-2026-10-25/screenshots/embed-local.png)、[Embed 实现](/Users/han/Documents/ChatGPT/pp/panorama-generator/src/components/commercial/EmbedModal.tsx:50)。本次只检查代码与弹窗输出，没有创建生产分享。

### A10 — 调整积分和暂停用户缺少运营审计

**本地事实**：管理会话只有 token/到期时间，未绑定具体操作人；积分调整与暂停状态更新未记录操作者、原因、前后值。应用内未发现 MFA；Cloudflare Access 或其他外围保护未核实，不能称管理后台对外完全无防护。

**建议**：为影响账户/资金的操作保存最少必要审计记录；明确管理员身份，限制生产入口和敏感操作。不要将“页脚展示 Admin Console”本身当作安全漏洞。

**证据**：[会话结构](/Users/han/Documents/ChatGPT/pp/panorama-generator/functions/api/[[route]].ts:225)、[调积分](/Users/han/Documents/ChatGPT/pp/panorama-generator/functions/api/[[route]].ts:815)、[暂停用户](/Users/han/Documents/ChatGPT/pp/panorama-generator/functions/api/[[route]].ts:845)。

## 两项经营判断

### 生成毛利需优先核实

线上 Pro 为 $9.90 / 1,000 积分，4K 每次 4 积分：全部用完可生成 250 次，收入分摊 **$0.0396/次**。Studio 为 $29.99 / 5,000 积分：1,250 次 4K，约 **$0.023992/次**。Studio 年付 $348 / 60,000 积分：15,000 次 4K，约 **$0.0232/次**。

这是按满额使用计算的套餐收入分摊，不是已测利润。尚无真实上游账单、重试率、PayPal 费用和退款率，不能断言正在亏损。需要按模型和分辨率测算一次成功交付的总成本，再确认套餐是否承受得住高使用率用户；超时后已发生的上游费用也应计入。

### 首页需要更明确的付费对象

当前同时面向本地查看照片、AI 创作、游戏 skybox、HDRI、Globe、视频、嵌入。工具丰富，但首页主要解释功能清单，缺少具体人群“为什么付费、能拿走什么、如何验收”的短路径。这是基于页面结构的产品判断，未用用户访谈或 A/B 实验验证。

建议保留清晰的免费查看入口，并优先选一个付费场景，用真实案例连接“输入 → 成果 → 导出 → 目标软件使用”；先证明有人完成该路径，再决定新增哪些功能。无需为此重做全部 UI。

## 建议执行顺序与验收

1. **购买与售后底线**：A01、A02、A03。验收政策页可访问、客服可收信、密码可找回、暂停账户可取消续费、重复回调不重复发放、映射故障可核对、退款状态一致。
2. **交付与经济性**：A04 + 成本核算。验收每笔积分变化可追溯、超时/中断有恢复路径，取得各模型成功交付的成本样本与套餐毛利边界。
3. **可衡量增长**：A05、A06、A07、A08。验收真实成功事件能连成漏斗、所有版本的能力说明一致、真实作品可查看/下载、注册验证后可返回原任务。
4. **持续运营**：A09、A10，以及生产告警、备份恢复演练。备份和告警当前仅列为待核实，不能仅因仓库中没看到就判定没有配置。

## 测试说明

- 结构化公开端点检查记录和截图位于本报告目录；交互步骤见逐项复现说明，完整原始浏览器日志未归档。公开端点状态和抓取的旧承诺片段见 evidence JSON。
- 正常首页、价格页、查看器流程未发现业务 JS 错误。审查主动请求不存在的政策地址、测试 404 和一个候选 API 地址产生的 404，不应混入正常运行错误率。
- 自动化中 Turnstile 出现挑战相关输出；本次没有跨越挑战或实际注册，因此未据此判断真实用户注册失败。
- 一次禁用 JS 的新浏览器上下文未能定位目标 FAQ，未把该尝试作为 no-JS 可视渲染证据；A06 依赖同源获取的生产原始 HTML 与结构化数据。
- 旁证代理自述完成五项内存模拟分支检查、HDR 编码往返 28 项测试通过；完整命令和运行日志未归档，主代理未逐项复跑，因此不将这些数字作为独立可复核的验收结论。主代理另外用本地函数与内存替身复现暂停账户取消返回 403，且订阅查询和外部请求均未执行；此为主代理观察。代理的 PayPal 验签结果也是内存替身，不能等同真实验签。以上不替代线上真实付款与真实生成验收。
- 本次未修改应用源码、部署代码或更换邮件服务；只生成审查文档和截图。
