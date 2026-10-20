# 更新日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

0.x 阶段：不兼容变更升 minor（0.y），新功能升 minor，修复升 patch。API 与规则稳定后发布 1.0.0，此后不兼容变更升 major。

## [Unreleased]

## [0.6.1] - 2026-10-20

### 内部
- 发布走 npm Trusted Publishing（OIDC）：推 `v*` tag 由 GitHub Actions 发版，凭据不落地；包本身没有功能变化。
- CI 改用 npm 安装依赖与跑测试（原 workflow 用 pnpm，裸 runner 上报 `packages field missing or empty` 直接失败）；并加了一步「该版本已在 npm 上就跳过发布」，重推 tag 不会把流水线弄红。

## [0.6.0] - 2026-10-20

### 新增
- 局域网昵称：主机开房时可填牌桌名（同时作为自己的昵称），加入方填自己的昵称，两边都能就地改名；留空则随机生成（如「沉着的河马」）。生成与规整（去控制字符、去首尾标点、按码点截 12 字）放在 `src/names.js`。
- 主机开房支持自定义 6 位房间号与端口（留空随机生成 / 默认 47811）；面板列出已入座的远程玩家，以及他们顶替的原角色。

### 修复
- 局域网客人坐下后无法下注：客户端把「我是谁」硬编码成 0 号位，客人坐在别的座位就永远等不到操作按钮。现在按快照里的 `you` 决定座位归属（`toAct`、底牌展示、行动栏、本人高亮都按它算），新增 `src/table-view.js` 与 `test/table-view.test.mjs` 钉住这个回归。
- 加入牌桌不再要求先开自己的房间：局域网面板拆成互斥的「加入牌桌」与「作为主机」两块。加入后明确显示「你顶替了 雷军（座位 7）」，桌面座位带描边与「我」标记，小窗标题显示座位与昵称。
- 客人端不再显示 Start / 下一手 / Reset（这些归主机控制，点了只会得到 409），改为「等待主机开局」/「等待主机发下一手」。
- 客人 ticket 失效（主机重启、关闭局域网、掉线超 20 秒）时自动退回自己的牌桌并提示「与主机失去联系，已退回自己的牌桌」，不再继续空转轮询；普通网络中断仍保留在原桌等待重连。
- 纯加入方也能用 UDP 广播发现同网络的牌桌（原先只有开了房间的主机在监听广播）。

### 内部
- 快照统一带 `you`（主机 0 / 客人自己的座位）；`lan` 视图新增 `name` / `roster` / `guests`，`joined` 扩为 `{host, port, seat, seatLabel, character, nickname, table}`。
- `claimSeat(seat, nickname)` 记录并在 `releaseSeat` 还原被顶替角色的原名与 tag；新增 `table.setNickname`。
- 截图验收：`docs/lan-host.png`、`docs/lan-guest.png`、`docs/lan-join.png` 由构建出的 `lib/client.js` + 真实 CSS 在最小宿主壳里渲染。

## [0.5.0] - 2026-10-16

### 不兼容变更
- 牌桌从六人改为八人（你 + 7 位智能体）。座位数由花名册派生，依赖固定 6 座的脚本或界面断言需要按 `players.length` 计算。
- 插件更名：`dsh-holdem` → `dsh-poker-night`。包名、`cordis.patch.yml` 里的插件 id、牌局 API 前缀（`/dsh-holdem` → `/dsh-poker-night`）、会话 Cookie 名与 `localStorage` 键、头像数据目录（`$DSH_HOME/dsh-holdem/avatars` → `$DSH_HOME/dsh-poker-night/avatars`，首次运行自动搬运旧文件）都随之改变。升级方式：把 profile 里的旧包移除，再按新名重装。

### 新增
- 局域网联机：主机开一个房间（6 位房间号 + UDP 广播发现），同一网络里的其他安装加入后随机顶替一名人机角色；广播不携带房间号，快照按观看者座位生成，离开或掉线 20 秒自动交还座位。默认关闭。
- 牌桌扩为固定八人：新增雷军（小米）、张一鸣（字节跳动）两位人设，你 + 7 位智能体同桌。
- 座位环改为按人数计算（`seatAngle`/`seatPos`/`seatIsTop`），椭圆桌坐标不再写死六人；空桌提示与顶部名单从快照生成，不再硬编码「六人桌 · …」。
- 雷军与张一鸣默认使用标识头像（不随包分发真人肖像），可用「上传覆盖」换成自己的图。
- 标题接入宿主语言（`dsh-client-locale`）：Tab、牌桌顶部标题、小窗标题随宿主在英文 / 中文间切换——英文 "Texas Hold'em" / "No-Limit Inference"，中文「德州扑克」/「无限注德州扑克」。
- 桌面版适配：会话 id 改走 `X-Poker-Night-Session` 请求/响应头，CSRF 仍走 `X-CSRF-Token`。桌面壳（Electron 主进程）把 `dsh-app://` 请求转发给回环 Host 时会丢弃客户端 Cookie、并扣掉响应里的 `Set-Cookie`，只有自定义请求头能跨过去；web 端保留会话 Cookie 兜底，旧客户端不受影响。
- 头像 URL 带每会话的媒体令牌（`?t=`），`<img>` 在没有 Cookie 的桌面渲染进程里也能加载。

### 修复
- 桌面版下每次轮询都会新建牌桌、POST 恒 401 的问题。
- 桌面壳保留的 `Referer: dsh-app://app/` 被误判为跨源而 403：现在只有 http(s) 的 Referer 参与同源判断。

### 内部
- 保留并强化上游署名：README 增加「致谢」段，`LICENSE` 标注上游仓库地址，界面（侧栏与小窗）常驻「基于 dsh-holdem · MIT」。

### 安全
- 媒体令牌只授权读取头像（含用户上传的覆盖头像），不能驱动任何动作；POST 仍必须带 `X-CSRF-Token`。见 `test/desktop-transport.test.mjs`。

## [0.4.0] - 2026-09-21

### 不兼容变更
- 牌局 API 改为按浏览器会话隔离：每个浏览器一张独立牌桌，POST 必须携带首次 GET 返回的 `X-CSRF-Token`、同源 Origin 与 `application/json`，否则返回 401/403/415。直接用 curl 调用旧接口的脚本需要先 GET 拿会话。（#6）
- 买入规则：每人 3 次买入，用完出局；人类出局则本局结束。原来是无限买入。（#5）
- 非摊牌收池时会亮出赢家的两张底牌。（#5）
- `holdem_act` 工具的 `talk` 改为必填。（#6）

### 新增
- 会话区悬浮小窗（`shell.overlay`）：可拖动、可收起，不切 Tab 也能看牌、出手。（#5）
- 公共牌翻牌进场动效，翻牌三张错峰，`prefers-reduced-motion` 下关闭。（#5）
- 加注尺度按底池封顶，`allin` 成为显式选项，模型和启发式回退共用同一钳制。（#5）
- 桌边闲话回退池：模型没给或被过滤时按动作和 `bluff` 参数补一句，大小盲注时也会说话。（#6）
- WCAG 对比度检查脚本 `pnpm check:contrast`。（#5）
- 离线引擎测试 harness（stub 掉 llm 服务）。（#5）

### 修复
- 启发式回退路径绕过 `normalizeChoice` 导致意外全下。（#5）
- 出局座位导致盲注与庄家标记错位；牌桌结束后仍挂着庄/盲徽章。（#5）

### 安全
- 请求体上限 4 MiB、15 秒读超时、Content-Length 校验；响应加 `X-Content-Type-Options: nosniff`；5xx 不再回显内部错误。（#6）

### 内部
- 为 dsh 0.1.6 运行时卸载做准备：LLM 请求带 `AbortSignal`，`clearAi()` 时中止；`client.inject` 里停更的 `dsh-client-runtime` 换成 `dsh-client-ui-renderer`。（#7）

## [0.3.0] - 2026-08-23

### 新增
- 玩家头像与五位智能体的肖像，支持上传覆盖。（#4）
- 小盲/大盲座位徽章。

### 修复
- 盲注与行动顺序改为从按钮位顺时针。（#3）
- 底池百分比快捷键不再静默变成全下。（#2）
- 摊牌横幅区分主池与边池。

### 内部
- 抽出纯逻辑模块 `cards.js`、`pots.js` 与 client CSS，补单测。
- `pnpm dev` watch 构建，配合客户端 HMR。

## [0.2.0] - 2026-08-21

### 新增
- AI 创始人阵容与人设、座位重设计、每人投入显示、赢家效果。

## [0.1.0] - [0.1.3] - 2026-08-20

- 首次发布：六人无限注德州扑克插件，host 引擎 + client Tab。0.1.1 至 0.1.3 为发布当天的打包修补。

[Unreleased]: https://github.com/dingchenhui0618-arch/dsh-poker-night/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/dingchenhui0618-arch/dsh-poker-night/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/dingchenhui0618-arch/dsh-poker-night/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/dingchenhui0618-arch/dsh-poker-night/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/bubbleptr/dsh-holdem/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/bubbleptr/dsh-holdem/releases/tag/v0.3.0
