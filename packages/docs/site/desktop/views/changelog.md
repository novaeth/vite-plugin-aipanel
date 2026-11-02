# 更新日志

## v1.3.14

`2026-11-02`

### deepseek

#### 🐛 修复

- **继承不再盖掉目标 profile 自己的配置（target wins）**：`providerOptions.settingsFrom` 默认把 `web` 的 `cordis.patch.yml` 作为最高层的 `--patch` 叠到自建 profile 上，而 dsh 对同 id 的条目是**整段 `config` 替换**。于是 `workbench` 这类自己维护模型配置的 profile，`llm-pi-ai` / `agent-default-model` 会被 web 的整段盖掉：模型选择器里出现的是 web 的模型（如 `pagoda-llm` 下的 `qwen3.8:27b`、`deepseek-v4-flash`），默认模型也跟着变成 web 的，而 workbench 自己的配置在 Settings 里还改不动。现在继承只补目标**没写过**的行：目标 `cordis.patch.yml` 里的顶层 `- id:` 与它 `- insert:` 的 id 由目标作主，来源层让开；目标没写的机器级设置（搜索源、MCP 等）照常继承。目标自己管 `llm-pi-ai` 时，来源的 `agent-default-model` 也一并不继承（避免默认模型指向目标供应商列表里没有的 provider）
- 目标已经 insert 过的 id 不再被来源的 `- insert:` 叠第二遍（此前 `web-search-exa` 会在组合结果里出现两条同 id 条目）

### docs

#### 🐛 修复

- `providerOptions.settingsFrom` 的文档补上「目标 profile 自己写过的行不继承」与 target wins 的原因

## v1.3.12

`2026-10-12`

### deepseek

#### ✨ 新增

- **自建 profile 默认继承 `web` 的机器级设置**：dsh 的组合层只有 `bundle → profile → home → --patch`，**没有 profile 继承 profile**；所以把 `providerOptions.profile` 换成自建 profile（`workbench`、`codexlab` 等）之后，在 `dsh web` 里配过的模型供应商 / 搜索源 / MCP 不会跟过去，只会用建 profile 那一刻的快照（实测：同一台机器上 web 已改成 `huoyong`，自建 profile 还停在 `shichuang`）。现在默认把默认 profile（`web`）的那层配置作为一条额外的 `--patch` 叠上来，**默认就生效，不用配**；`providerOptions.settingsFrom` 只在想换来源或想关掉（`false`）时才写
- 每个界面**自己的偏好**（如主题）**不继承**：`--patch` 是最高的层，会盖掉目标 profile 自己那份，而主题这类行被盖住会把界面锁死（在工作台里切浅色会被 web 的深色顶回去，实测过）。两份 patch 的行 id 交集只有 `agent-default-model` / `ui-settings-general` / `ui-theme`，只有最后一个属于这一类

#### ⚡ 改进

- 叠层顺序固定为「来源 profile 的配置在前、AIPanel 自己的 overlay 在后」：AIPanel 插的插件行仍然压过来源 profile（有回归测试钉住）
- 来源 profile 不存在或读不动时**静默跳过**（退回老行为），不阻断启动

### docs

#### ⚡ 改进

- 配置文档新增 `providerOptions.settingsFrom`，并说明默认继承、不继承哪些、以及怎么关掉

## v1.3.11

`2026-10-12`

### deepseek

#### 🐛 修复

- **目标 profile 还没建好时，不再只报「启动超时」**：`providerOptions.profile` 指向一个尚未建好的 profile（自建的 `workbench`、`codexlab` 等，或机器上从没跑过它自己那套安装流程）时，`dsh plugin --profile <name> add` 会**自己初始化**一个只有 `@deepseek-ai/dsh-base` 的空壳——它没有 Web 应用 bundle，于是 `dsh --profile <name>` 起不了界面、stdout 永远不打印 launch token，20 秒后只表现为"启动超时"，而机器上还留下一个看起来存在的 profile。现在启动前先按 dsh 自己的 profile 契约做预检（目录在不在、`dsh.profile.bundles` 里有没有 `@deepseek-ai/dsh-web-app`），不过就**当场拒绝并说清怎么修**（给出 profile 绝对路径、现有 bundles，以及建 profile 的办法）。预检排在插件安装**之前**，因此不会再执行任何 `dsh plugin add`，也不会留下空壳 profile
- 预检只认 dsh 的 profile 契约，不认识任何具体插件——profile 里装了哪些插件与它无关

#### ⚡ 改进

- launch token 超时的错误现在带上"这次起的是哪个 profile"与它声明的 bundles（原始 stdout/stderr 尾部照旧回填），把"profile 没配好"和"页面真起不来"两种失败分开；以前两者都只有一句「没抓到 token」

### docs

#### ⚡ 改进

- 配置文档的 `providerOptions.profile` 补上前置条件与失败症状：目标 profile 必须已经建好（`dsh.profile.bundles` 含 `@deepseek-ai/dsh-web-app`），自建 profile 要先跑它自己的安装流程再填进来

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.11/packages/extension/aipanel-assistant.zip)

## v1.3.10

`2026-10-10`

### deepseek

#### ✨ 新增

- **支持自定义 dsh profile**：此前 AIPanel 固定把插件装进 `web` profile、并以 `dsh --profile web` 启动，用户自建的 profile（如 `workbench`、`codexlab`）无法与 AIPanel 共存。现在新增 `providerOptions.profile`（默认 `web`），插件安装（`dsh plugin --profile <name> add`）与 Web 进程启动（`--profile <name>`）统一指向该 profile。仅支持仍启动 Web UI 的 profile（其 `dsh.profile.bundles` 含 `@deepseek-ai/dsh-web-app`），纯终端类 profile（如 `tui`）不适用

### docs

#### ⚡ 改进

- 配置文档与快速开始补充 `providerOptions.profile` 的说明与用法；CONTEXT 明确 dsh profile 默认 `web`、可配置

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.10/packages/extension/aipanel-assistant.zip)

## v1.3.9

`2026-09-24`

### vite-plugin

#### ✨ 新增

- **选中元素的源码路径统一归一化为绝对路径**：浏览器只能上报相对路径，而基准因来源而异——unplugin-vue-inspector 相对 Vite 进程 cwd、react-dev-inspector 兼容属性相对 Vite root、code-inspector 相对 git 仓库根，AI 的工作目录又是第四种；相对路径被下游一拼，常常落到工作区之外（沙箱下直接读不到，甚至静默指向别的文件）。现在在上下文落库前按 `cwd → root → git 仓库根` 顺序探测真实文件，注入给 AI 的恒为绝对路径；文件已删除或 HMR 后失效时也回退为绝对路径（可能不存在），不再把「基准不可知」的问题推给下游

### ui

#### ✨ 新增

- **点击已选节点可跳回原页面并高亮**：点右侧「已选节点」列表、页面上的气泡，或 dsh 对话框里的节点 chip，会跳回该元素被选中时的页面，并以呼吸灯效果高亮它——元素在别的路由或页面也能找回来。同页直接定位；hash 路由不重建页面，就地等渲染后定位；整页导航则先记下目标选择器，由落地页挂件挂载时消费；呼吸期间跟着页面滚动重定位，2 秒内找不到元素会提示「页面可能已变化」

#### 🐛 修复

- 修复**会话列表项被压扁**：列表项在可滚动的 flex 列里会被压到约 20px，现在固定不收缩、保持 32px 高度，会话一多也能正常滚动

### core

#### ⚡ 改进

- 新增源码路径工具并作为单一来源：路径分隔符归一化、兼容两种分隔符取文件名、依赖目录判定、`路径:行:列` 位置拼装；挂件气泡、节点卡片与进程日志不再各写一份 `split("/").pop()`，Windows 下带 `\` 的绝对路径也不会把整条路径当成文件名

### deepseek

#### ✨ 新增

- 节点 chip 的引用载荷解析与序列化收敛为一处共用实现：插入时序列化进 chip、提交时还原成会话里的 `@节点[id]` 标记、点击时按 id 反查元素——点击 chip 也能定位回原页面

#### ⚡ 改进

- 节点上下文对依赖包内文件（`node_modules`）补一行「源码归属」提示：AI 拿到这类路径时不会顺着它去改第三方实现，而是回到项目内源码

### opencode

#### ⚡ 改进

- 桥接脚本同步对依赖包内文件声明源码归属，措辞与判定依据和 dsh 侧完全一致（同一份单一来源）

### docs

#### ⚡ 改进

- 使用指南补充「点击已选节点跳回页面并高亮」的用法；新增 ADR 记录「源码路径归一化收口在宿主」的决策

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.9/packages/extension/aipanel-assistant.zip)

## v1.3.8

`2026-09-23`

### core

#### 🐛 修复

- 修复**编辑后「没有问题」也照样刷一条通知**：这一步的命令成功退出、且没有任何结构化发现时，不再注入诊断上下文，不会每个 step 都插一条「没有发现问题」；手动调 `run_diagnostics` 仍照旧给出完整输出

### docs

#### ⚡ 改进

- 配置文档补充「编辑后无发现不注入」的说明，与 ADR 对齐

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.8/packages/extension/aipanel-assistant.zip)

## v1.3.7

`2026-09-23`

### core

#### ✨ 新增

- 诊断检查新增 `targets` 配置：可按目标形态（`edited` 编辑后 / `file` 单文件 / `project` 全量）限定某个检查何时执行。例如给「项目全量检查」标 `targets: ["project"]`，就只在 `run_diagnostics` 不传文件时触发，不会被编辑后诊断白白拉起

### docs

#### ⚡ 改进

- 配置文档补充 `targets` 字段说明与示例

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.7/packages/extension/aipanel-assistant.zip)

## v1.3.6

`2026-09-23`

### vite-plugin

#### 🐛 修复

- 修复**React 等未装 vue 的项目启动即报 `Failed to resolve import "vue"`**：Vue 的 Inspector 会向 `index.html` 注入依赖 `vue` 的运行时，此前它会被注册进所有项目；现在改为在 Vite 解析插件列表时（`apply`）按框架门控——只有识别为 Vue 的项目才注册，React 与未识别框架的项目不再注入，插件原有的「仅 dev 生效」门控也保留（生产构建同样不注入）

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.6/packages/extension/aipanel-assistant.zip)

## v1.3.5

`2026-09-23`

### core

#### ✨ 新增

- **诊断配置收拢到一处**（`providerOptions.diagnostics`），两个引擎语义一致：
  - `checks`：有序检查列表，不写 = 内置 ESLint + oxlint + 类型检查（项目装了什么跑什么，没装的自动跳过）；内置 linter 只是「预设」，展开后与自定义检查走完全相同的执行与适配逻辑，也可局部覆盖参数
  - 新增 stylelint 内置预设（默认只在 `.css` / `.scss` / `.less` 上跑）
  - 自研工具可按同形接入：`bin` / `command` + `args`（支持 `{file}` 逐文件、`{files}` 一次传全部）+ 输出 `format` 或自定义 `adapter`
  - `auto`（编辑后自动诊断）、`exposeTool`（是否把 `run_diagnostics` 暴露给模型）、`severity`（`error` 只报错误 / `warning` 错误与警告都报）、`maxFindingsPerSection`、`maxMessageChars` 均可配
- 内置 ESLint / oxlint / stylelint 均输出结构化诊断，诊断卡片与严重级别门槛对它们同样生效

#### 🐛 修复

- 修复**被忽略的文件「假装已检查」**：ESLint 对「被显式传入、但不在配置范围内」的文件只回一条忽略提示，以前这条提示会被当成一条诊断发现、每个 step 都刷出来；现在它不再算发现——编辑后阶段静默，手动诊断时另给一行「该文件不在 ESLint 配置范围内，未检查」，不会让人误以为查过了
- 修复**命令输出解析失败时看不出原因**：错误信息现在带上原始输出摘要
- 修复 `{files}` 占位符展开：作为独立参数时正确展开成多个 argv 项，不再挤成一个字符串传给工具
- 项目外文件的诊断展示改用绝对路径；空分区不再出现在结果里

### deepseek

#### ⚡ 改进

- 移除 `enableDiagnostics`、`autoDiagnose` 旧开关，统一改用 `diagnostics` 配置；默认值从 core 取，行为与默认保持一致

### opencode

#### ⚡ 改进

- 移除 `enableLsp` 旧开关，统一改用 `diagnostics` 配置，与 DeepSeek 侧共用同一套策略契约与默认值

### docs

#### ⚡ 改进

- 配置文档新增完整的「诊断配置」说明（检查字段、内置预设、自定义命令与适配器；排除规则仍交给底层工具自己）；新增 ADR 记录诊断用户配置契约

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.5/packages/extension/aipanel-assistant.zip)

## v1.3.4

`2026-09-23`

### deepseek

#### ⚡ 改进

- 适配新版 dsh 的消息格式：插件产生的上下文消息来源 `kind` 由共用的 `plugin` 改为插件自有的 `aipanel`——dsh 会话格式 v4 起要求来源由生产者自己声明，旧的 `plugin` 会在写入/读取时被直接拒绝；节点上下文与编辑后诊断两条消息都走这一处
- 读取工作区快照时一并解析新增的 `pinnedSessionIds`：该集合不参与会话可见性，只是随官方 baseline 结构一起取出
- 同步升级 dsh 相关依赖至 0.1.7-alpha.2（含 `@deepseek-ai/cordis` 至 ~4.0.4）

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.4/packages/extension/aipanel-assistant.zip)

## v1.3.3

`2026-09-21`

### core

#### ⚡ 改进

- **诊断检查器优先用「你项目里装的那套」**：ESLint、oxlint、tsc、vue-tsc 都先按被诊断的项目解析，项目没装才回落到插件自带的 vue-tsc。变化在 Vue / Nuxt 项目上最明显：以前无论项目里装了什么，跑的都是插件自带的那份 vue-tsc——它背后的 TypeScript 比老项目新得多，Vue 2、旧版 tsconfig 这类老项目容易拿到不可信的结果
- **老项目（TypeScript 5.6 以下）的类型检查方式变了**：以前固定用 `tsc --build --noEmit`，这个组合在 5.6 之前不被允许，这类项目只会收到一条「Compiler option '--noEmit' may not be used with '--build'」，一条类型错误都看不到；现在改成逐个 tsconfig 的 `-p --noEmit`，create-vue 这种根配置只声明 `references` 的布局也会顺着找到 `tsconfig.app.json` 等真正的子项目，能正常拿到类型错误。TypeScript 5.6 及以上的项目不受影响，仍是一次构建查全项目

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.3/packages/extension/aipanel-assistant.zip)

## v1.3.2

`2026-09-21`

### mcp

#### 🐛 修复

- 修复**共用同一个对象的字段被误写成 `[Circular Reference]`**：判定循环引用时，原来记的是「序列化过程中出现过的所有对象」，于是**被多处引用的对象**（例如同一个路由 `meta` 既挂在顶层记录、又挂在嵌套 children 上）也被当成了环——AI 读 `meta.title` 只能拿到 `"[Circular Reference]"`，还会以为数据真的有环。现在改为按**当前路径上的祖先**判环：真正的环照旧标记（序列化不会失败），共享引用正常展开，`get_routes` 里嵌套 children 的 `meta`（title / lang / prefix）也能正常读到

## v1.3.0 & v1.3.1

`2026-09-21`

### mcp

#### ✨ 新功能

- **AI 能看「刚才发生了什么事」了**：新增 `vue-devtools_get_timeline`，把页面最近的组件渲染、组件事件、路由跳转按时间线交给 AI。以前它排查「页面为什么卡 / 为什么没更新」只能翻组件树和状态快照——那都是某个瞬间的样子，看不出「两秒前那一下是谁引起的」。现在一次调用就能拿到：这次交互引发了哪些组件重渲染、各耗时多少、哪几个最慢、有没有路由跳转或组件事件；每条记录都带组件 nodeId 和源码文件路径，AI 可以顺着直接查状态、或去改那个文件
- **只看某一次动作引起的变化**：用 `vue-devtools_mark_timeline` 打一个标记 → 做交互（点击/输入）→ `vue-devtools_get_timeline` 带上 `sinceMark`，就只拿这次动作引发的事件，不受页面上其它活动干扰；想要干净窗口先 `vue-devtools_clear_timeline`
- **不用「开始录制」**：时间线在页面内存里常驻采集最近约 1000 条事件，所以「用户说刚才很卡、但 AI 那时还没开始查」这种情况也能回看。SPA 路由切换保留记录，整页刷新会清空（会明确告知）；仅 Vue 项目注入

#### ⚡ 改进

- **组件树 `filter` 的说明纠错**：以前写的是「按组件名过滤，大小写不敏感」，实际**大小写敏感**——传 `App` 会得到空结果，传 `app` 才有；现在描述里把真实规则写清楚了（匹配的是组件名，命中组件会连带返回整棵子树），AI 不会白跑一轮还以为组件不存在
- **「查不到」和「不存在」分开说**：`get_component_state` 描述现在明确提示，provide / inject / 事件监听 / 模板 ref 这几类是**为省 token 刻意裁掉的**，看不到不等于不存在；`__undefined__`、`[Function]`、`<max depth>`、`<... (N chars)>` 这些占位记号也逐个解释了，不会被误当成真实值

#### 🐛 修复

- 修复**两个路由工具互相牵连产生的 `[Circular Reference]` 噪声**：`get_current_route` 与 `get_routes` 底层取的是同一批路由记录，原来放在一次序列化里会互相影响——路由表里会混进字符串元素、顶层 `meta` 被替换成占位符；现在两段各自序列化，`get_routes` 的描述也改成了实际的扁平列表形态
- 修复**时间线数据「看起来完整、实际缺了一段」**：窗口内被缓冲淘汰、明细被条数/体积裁剪、渲染缺 start 或 end（耗时为**缺失**而不是 0ms）这三种情况，现在都会显式给出计数与自然语言说明，AI 不会把「没看到」读成「没发生」、把「耗时缺失」读成「很快」
- 修复**同名组件在统计摘要里出现两行**：页面挂载最早那一瞬还拿不到 app 标识，部分记录会落到匿名分组；现在按 devtools 自身的退路解析，这些记录也能拿到正确的 nodeId

### docs

#### ⚡ 改进

- 配置文档里 `vue-devtools_*` 的能力清单补上「时间线」，与实际下发的工具面一致

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.3.1/packages/extension/aipanel-assistant.zip)

## v1.2.28

`2026-09-20`

### deepseek

#### ⚡ 改进

- **编辑后自动诊断改为「下一步的一条通知」**：以前诊断文本是**并进那次编辑的工具输出**的，现在统一在一步结束时诊断一次，以一条「自动诊断（编辑后）」上下文消息插进下一步；原生编辑（write / edit）与程序内批量编辑（`run_code` 里调 write / edit）走同一条路径，出现时机与格式不再两套——注意编辑工具的结果里不再附带诊断文本
- **一步改多个文件只诊断一次、只发一条消息**：类型检查按 tsconfig 项目合并为一次 `--build`（此前 N 个文件就要跑 N 次项目构建），Lint 逐文件执行；批量重构时等待明显变短，也不会一步刷出一串诊断消息
- **大文件不再整段灌进来**：自动通知里每个分区最多列 3 条发现，超出折叠成「…还有 N 条，完整结果请调用 run_diagnostics」；要完整清单让 AI 调一次 `run_diagnostics` 即可（手动调用始终是全量）

#### 🐛 修复

- 修复**问题还在、却不再提醒**：此前自动诊断按文件内容去重，和上一次完全一致就静默，于是「报过一次但一直没修」的错误再也不会出现在上下文里，看上去像已经修好了；现在只要这个文件本步仍有发现，就会重新给出

### opencode

#### ⚡ 改进

- 编辑后诊断与 `run_diagnostics`、dsh 侧自动诊断**共用同一分区格式**：`## ESLint` 在前、类型检查在后，且只列有发现的分区；同一份诊断在不同入口看到的内容与顺序一致

### core

#### ⚡ 改进

- 新增批量诊断能力（类型检查按 tsconfig 项目合并、Lint 逐文件），供 step 边界的一次性收尾诊断复用：批量编辑 N 个文件时，类型检查从 N 次项目构建降为 1 次
- 诊断分区文本支持「发现条数上限 + 省略提示」：自动注入走摘要，手动 `run_diagnostics` 保持全量输出

### docs

#### ⚡ 改进

- 配置文档里 `providerOptions.autoDiagnose` 的说明由「并入工具输出」更新为「以上下文消息插入」，与实际行为对齐

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.28/packages/extension/aipanel-assistant.zip)

## v1.2.27

`2026-09-20`

### ⚠️ 兼容性

- 子进程调用统一改用 `execa`（ESM-only）。**Node.js 18 及更早版本**、且以 CommonJS 方式加载插件的项目（`vite.config.cjs`，或未声明 `"type": "module"` 的项目里配置被编译成 CJS）启动时会报 `ERR_REQUIRE_ESM`；升级到 Node 20.19+ / 22.12+，或把配置改成 ESM（`vite.config.mjs` 或 `"type": "module"`）即可

### providers

#### 🐛 修复

- 修复**工作区路径含空格或特殊字符时 dsh / opencode 起不来**的问题：此前引擎的启动参数会被拼成一条命令字符串交给 shell 重新解析，路径里的空格直接把参数拆成两半（`|`、`&`、`~`、`$` 之类还会被 shell 当语法执行）；现在参数原样直传，`/Users/me/My Projects/app` 这类目录可以正常启动

#### ⚡ 改进

- 引擎进程现在是直接子进程（不再隔着 shell 启动），停止服务时的进程回收路径更短

### core

#### 🐛 修复

- 同类问题一并修复，覆盖 CLI 探测与代码诊断：`opencode` / `dsh --version` 探测，以及 tsc / vue-tsc / ESLint / oxlint 的调用都改为参数直传；项目路径含空格时，诊断不再因为路径被拆开而落空

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.27/packages/extension/aipanel-assistant.zip)

## v1.2.26

`2026-09-20`

### deepseek

#### 🐛 修复

- 修复嵌入式 dsh 界面里**浏览器 / 终端等右侧面板在宽屏下消失**的问题：布局覆盖样式此前会把 AppFrame 的三轨 grid 压成单轨，右侧面板落进隐式行后被外层裁掉；现在只隐藏 dsh 侧栏列、让主列跨过侧栏轨道，右侧面板照常显示，并补了回归测试

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.26/packages/extension/aipanel-assistant.zip)

## v1.2.25

`2026-09-20`

### deepseek

#### ⚡ 改进

- DeepSeek 启动等待的计时口径更准：启动令牌的 20 秒窗口改为**从 dsh 进程真正拉起那一刻起算**，不再把装插件（`dsh plugin add`，可能数十秒）等编排耗时算进去——编排慢的项目不会再被误判成「没抓到启动令牌」而启动失败
- 等待期间若停止 / 重启服务，挂起的启动令牌等待会立即失败，不再白等到超时
- 真失败时仍旧把 dsh 的原始启动输出整段打出来，直接看得到根因

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.25/packages/extension/aipanel-assistant.zip)

## v1.2.24

`2026-09-18`

### mcp

#### 🐛 修复

- 修复 Vue 项目里 AI 拿不到 Vue DevTools 调试工具的问题：组件树、组件运行时状态、渲染源码、当前路由、路由表、应用切换这批工具没被列进工具清单，模型侧根本看不到，能力等于不存在；现在清单和实际可调用的能力重新对齐，Vue 项目共 36 个工具（含 7 个 `vue-devtools_*`）
- 同样修复 `logs-devtools_vite_logs` 没被列进清单的问题：AI 排查「页面没更新 / HMR 失效 / 构建报错」时用不到这条查 Vite 运行日志的能力，现已恢复
- React 等非 Vue 项目不再列出 `vue-devtools_*`：这些工具依赖只注入 Vue 页面的调试桥，列出来也只会调用失败；现在按项目框架下发，未下发的名称直接返回「工具不存在」

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.24/packages/extension/aipanel-assistant.zip)

## v1.2.23

`2026-09-18`

### deepseek

#### 🐛 修复

- 修复新版 dsh（0.1.6-alpha.2）下从 AIPanel 点击会话无法切换的问题：dsh 把「当前会话」的归属从会话控制器移到了界面导航层，插件已改走官方新接口（`uiWorkspace.openSession`）；此前依赖的旧接口在新版已被移除，会话切换会静默失效
- 会话「已就绪」判定同步改用官方列表状态（主视图持有标记 + 列表就绪阶段）：新版 dsh 的会话列表不再提供 `current` 字段，原先基于它的就绪判断会一直不成立，导致 AIPanel 侧 loading 无法放行

### ui

#### ⚡ 改进

- 会话列表的时间标签对齐 DeepSeek 官方的相对时间写法：刚刚 / N分钟 / N小时 / N天 / N个月 / N年；此前超过一周就退回成绝对日期时间，与 dsh 侧栏里的显示不一致

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.23/packages/extension/aipanel-assistant.zip)

## v1.2.22

`2026-09-14`

### core

#### ✨ 新增

- 代码检查支持 oxlint：项目里装了 oxlint 时会和 ESLint 一起参与检查，两者并行互补（重复规则的去重交给项目自己的 `eslint-plugin-oxlint`），诊断结果分别标注来源；只装了其中一个就只跑那一个，两个都没装时会明确提示「未运行」，不再笼统显示「没有发现问题」造成误判

#### ⚡ 改进

- 类型检查按项目自动挑检查器：Vue / Nuxt 项目继续用 vue-tsc（能检查 `.vue`），React 等纯 TypeScript 项目改用项目自己的 tsc——检查器版本和项目保持一致，也省掉 Volar 转换开销；检查器跑不动时会自动回退，尽量保证诊断可用
- 诊断结果不再写死「ESLint」「vue-tsc」标题：卡片上的分区标题跟随本次实际跑了的检查器（如「ESLint + oxlint」「tsc」），看到什么就代表真跑了什么
- ESLint 与 oxlint 的展示格式统一：错误 / 警告分级、警告过多时的截断、点击跳转定位的表现完全一致，多个检查器的结果合并后一起给出

### providers

#### ⚡ 改进

- DeepSeek 的审查工具与编辑后自动诊断、OpenCode 的编辑后诊断同步跟上新检查器：诊断卡片分区标题与实际执行的检查器一致，不再出现标题写着 vue-tsc、实际跑的是 tsc 的情况

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.22/packages/extension/aipanel-assistant.zip)

## v1.2.21

`2026-09-14`

### deepseek

#### 🐛 修复

- 修复选中「多行文本元素」时的上下文注入：元素内部文本里的真实换行现在作为文本内容本身传给 AI，不再和上下文中用于排版的换行混在一起（此前 AI 容易把两者看成同一层级）；同时注入的文本更精简，避免长文案挤占上下文

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.21/packages/extension/aipanel-assistant.zip)

## v1.2.20

`2026-09-14`

### vite-plugin

#### ✨ 新增

- 元素选择器升级为多框架架构：新增统一的 Inspector 适配器契约，框架适配与宿主逻辑解耦，UI 层不再硬编码框架实现而是动态加载适配器，首版落地 Vue 支持
- 新增 React 框架的元素选择支持：复用 `@code-inspector/core` 官方 `transformCode` API 在 dev 阶段为 jsx/tsx 注入源码坐标标记（仅 serve 生效，生产构建零影响），运行时配套新增 React 解析适配器；Vue 项目（含 vue-jsx）自动跳过注入
- 新增构建期框架检测：通过 Vite 已装配插件前缀识别 Vue / React 项目，用于驱动适配器选择与注入门控

#### ⚡ 改进

- Vue DevTools 桥注入按框架门控：React 项目不再注入无关的桥脚本

### deepseek

#### ✨ 新增

- 优化 PTC 子调度自动诊断：重构 post-execute 钩子，将 PTC 子调度的编辑目标登记与最终诊断聚合分离，外层调用收尾时对登记的编辑文件统一执行批量诊断并追加上下文，子调度内的多次编辑不再各自触发诊断

#### 🐛 修复

- 修复嵌入式场景下 dsh 侧栏未按预期隐藏的问题：改用类名匹配替代 data 属性匹配

### extension

#### 🐛 修复

- 修复多实例串扰问题：为选择模式相关消息添加服务实例 ID 隔离，过滤规则收紧为仅主题全局广播放行、其余消息必须匹配当前实例 ID，多项目同时使用时不再互相干扰

### ui

#### ⚡ 改进

- 会话列表样式对齐设计系统规范，会话标题添加悬浮提示

### test

#### ⚡ 改进

- 为所有子包新增 `test:coverage` 覆盖率脚本与 vitest 覆盖率配置
- 大规模补齐单元测试：覆盖 vite 端点/服务/代理服务器、ui 组件与 composables、扩展 background/content/sidepanel、deepseek 与 opencode provider 核心逻辑等
- 新增 `ServiceTaskState` 类型统一任务状态传递；修复 provider 加载失败的错误字段命名；优化 opencode provider 的配置合并与错误处理

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.20/packages/extension/aipanel-assistant.zip)

## v1.2.19

`2026-09-10`

### deepseek

#### 🐛 修复

- 修复 dsh 插件无法自动更新的问题：生产环境依赖安装目标改为显式带版本号的包名，精确绑定当前 provider 版本；开发环境仍使用本地源码链接
- 新增 dsh 插件与 provider 的版本同步校验：读取当前包版本与已安装依赖版本，本地安装版本与当前 provider 不一致时给出升级提示

### core

#### ⚡ 改进

- 优化 `getCliVersion` 实现，支持从 stderr 读取版本输出，修复部分 CLI 版本获取失败问题；统一工具函数参数换行与 spawn 命令参数格式，提升代码可读性

## v1.2.18

`2026-09-10`

### providers

#### ⚡ 改进

- 为 OpenCode 与 DeepSeek 提供者新增版本检测调试日志（仅详细日志模式可见）
- 重构 DeepSeek 超时诊断日志输出：将超时时的进程 stdout/stderr 合并为单条告警日志，并增加日志幂等标记，避免重复打印启动日志

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.18/packages/extension/aipanel-assistant.zip)

## v1.2.17

`2026-09-10`

### deepseek

#### ✨ 新增

- 为 LaunchToken 增加超时输出诊断能力：缓存进程最近的 stdout/stderr 输出，超时错误时回填，帮助定位 token 未打印的根因，并同步补充对应测试用例

#### ⚡ 改进

- 更新 deepseek 相关依赖至 0.1.5-rc.1 版本

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.17/packages/extension/aipanel-assistant.zip)

## v1.2.16

`2026-09-10`

### deps

#### ⚡ 改进

- 升级 `chrome-devtools-mcp` 依赖至 1.9.0，同步更新官方工具元数据（新增 `evaluate_script` 的 `javascriptEvaluation` 条件声明），默认工具暴露面不变

### opencode

#### ⚡ 改进

- 新增 vitest 单元测试：为 opencode provider 与 api 补齐测试脚本与用例，覆盖核心调用逻辑

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.16/packages/extension/aipanel-assistant.zip)

## v1.2.15

`2026-09-10`

### deepseek

#### 🐛 修复

- 修复跨网络环境下会话状态与标题无法实时同步的问题：事件中继此前在未收到 `viteHost` 时静默回退到 `127.0.0.1` 并吞掉推送失败，现要求显式传入 Vite 实际绑定 host（缺失即报错并停用中继），端到端统一事件链路，会话 running / 标题更新恢复正常
- 优化会话列表加载状态显示逻辑，避免列表加载过程的状态错乱

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.15/packages/extension/aipanel-assistant.zip)

## v1.2.14

`2026-09-09`

### vite-plugin

#### ✨ 新增

- 支持自定义 Vite 绑定 host：通配/无效 host（`0.0.0.0` / `::` 等）统一归一化到实际配置地址，可指定局域网/自定义 host 绑定，修复跨网络环境下客户端与扩展无法连接 Vite 服务的问题

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.14/packages/extension/aipanel-assistant.zip)

## v1.2.13

`2026-09-08`

### vite-plugin

#### 🐛 修复

- 修复地址族错位导致的 Vite 服务连接失败：客户端、扩展与插件对 Vite 服务地址的解析与连接统一按实际地址族处理，避免 IPv4/IPv6 不一致导致的连接失败

#### ⚡ 改进

- 调整 TypeScript 配置与类型检查工具，完善仓库级类型检查流程；同步整理项目配置与代码类型优化

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.13/packages/extension/aipanel-assistant.zip)

## v1.2.12

`2026-09-08`

### deepseek

#### 🐛 修复

- 修复会话列表混入「不属于当前项目」的残留会话：dsh 0.1.3 起磁盘上会残留未挂载任何工作区的旧会话（早期空白会话 / 测试遗留），此前列表按会话自身目录归属，这些游离会话会被误并入当前项目；而官方侧边栏并不会把它们归入该工作区。现在会话归属以工作区注册的会话清单为准，目录仅在该工作区尚未建档（如全新目录）时才兜底，列表不再出现删不掉、点开却是别处会话的「幽灵行」，与 dsh 自身可见性保持一致

#### ⚡ 改进

- 同步升级 dsh 相关依赖至 0.1.3-alpha.2，适配新版工作区/会话注册语义

### ui

#### ⚡ 改进

- 界面全面对齐 DeepSeek 官方主题规范：交互高亮与「主操作按钮」解耦——主按钮改为近黑高对比色（暗色主题下为白底高亮），链接、进行中、焦点、加载、思考光效与元素选中高亮统一改用 DeepSeek 品牌蓝；边框、圆角、阴影、滚动条、弹窗蒙层、骨架屏、按压反馈等细节按官方规范分级对齐，明暗双主题同步更新
- 会话列表样式重构：会话条目改为单行紧凑布局（状态指示点 + 标题 + 右侧时间），当前会话与悬停使用统一浅色覆盖层，不再整行实色填充；列表头部改为小字号标签 + 圆形「新建会话」按钮，视觉更贴近 DeepSeek 原生侧栏
- 侧栏「无服务」提示页、Chrome 预热失败页等加载与兜底界面同步应用新主题样式

### core

#### ⚡ 改进

- 预留「Provider 接管会话侧栏」能力（当前为平台能力，引擎默认未启用，行为不变）：Provider 可声明接管宿主自绘的会话列表、改由其官方原生侧栏管理会话导航，并支持将折叠开关归属宿主（左上角按钮驱动）或 Provider（自带开关）任意一侧；配套新增宿主 ↔ iframe 的侧栏模式 / 折叠双向同步消息协议

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.12/packages/extension/aipanel-assistant.zip)

## v1.2.11

`2026-09-07`

### deepseek

#### ✨ 新增

- 会话状态指示全面升级：会话列表现在能实时看出每个会话「正在做什么」，不再只有单一的思考转圈：
  - **等待你确认**（琥珀色圆点，悬停可看提示）：DeepSeek 发起工具审批、向你提问或请求确认实施计划时，对应会话立即亮起——切到别的会话忙别的，也不会错过它正在等你
  - **运行中**（蓝色点阵转圈，样式与官方进度指示一致）：会话正在思考或执行任务；若当前跑的是**子代理**，父会话会显示「子代理运行中 (n)」，主任务与子任务的进展一览无余
  - **已完成**（绿色圆点）：会话刚跑完且不在当前查看时给出提醒，点开该会话后提醒自动消失，不会一直挂在那里
- 子代理任务不再单独占用会话列表：子代理的运行进度统一归并到其父会话展示，会话列表保持清爽，同时不遗漏任何后台任务的进行状态

#### 🐛 修复

- 修复会话切换被「强制回拉」干扰：从 AIPanel 点击会话切换后，若目标会话迟迟未能就位（例如你已在 DeepSeek 内主动切到子代理会话），超过超时窗口（10 秒）将放弃补聚焦，不再反复打断你在 DeepSeek 内的手动切换
- 修复 dsh 版本比较在段数不一致的版本号（如 `0.1` 与 `0.1.2`）上判断错误的问题：低于最低要求的旧版 dsh 现在会被正确识别并提示升级，不再等到认证或事件异常时才暴露

### vite-plugin

#### 🐛 修复

- 修复 Chrome MCP 工具隐藏不彻底：`chromeMcp.project.tools.deny` 现在同样作用于 `tools.extra` 额外开启的工具，`deny` 的生效范围与工具清单、调用守卫保持一致——被隐藏的工具不会再出现在 Agent 的可调用列表里

### docs

#### ⚡ 改进

- 文档全面改版：统一项目命名（OpenCode / DeepSeek Harness (dsh) 双引擎描述）与使用流程，重构「快速开始 / 使用指南 / 配置 / FAQ」结构，补充 Chromium 内核浏览器（Edge / Arc / Brave）支持等说明，并按新流程重排安装顺序

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.11/packages/extension/aipanel-assistant.zip)

## v1.2.10

`2026-09-06`

### vite-plugin

#### ✨ 新增

- 新增 `chromeMcp.project` 项目边界配置（默认缺失 = 保持原行为），从此可以控制 Chrome MCP 能"看到并操作"哪些页面：
  - `allowOrigins`：项目页之外额外可打开 / 可见 / 可操作的页面白名单。每条支持三种写法：精确 origin（`"https://example.com"`）、glob 通配符（`"https://*.example.com/**"`）、正则字面量（`"/^https:\\/\\/app\\.example\\.com\\//"`）
  - `includeExtensionPages`：是否允许 `chrome-extension://` 扩展页纳入可操作范围，启用后自动注入对应官方 flag
  - `tools.extra` / `tools.deny`：在默认白名单之外按名字追加（如 `click_at`）或隐藏（如 `upload_file`）官方工具
- Chrome MCP 工具改为"白名单 + 项目内操作"模型，默认只暴露可安全用于本项目的官方页面级工具：
  - 工具名单由官方元数据构建期自动同步（页面级、无附加条件、分类安全），官方版本演进不会静默改变暴露面；官方声明的实验性等条件工具需在 `tools.extra` 显式开启，所需 CLI flag 自动推导注入，无需手写
  - 页面级工具统一要求并实时校验 `pageId` 属于可操作范围（项目页 ∪ allowOrigins）；`list_pages` / `current_page` 只返回范围内的页面，越界 pageId、越界跳转（navigate/new）会被拒绝并给出明确原因
- `chrome-devtools_new_page` 语义区分：项目页全局只开一个（重复打开返回已有页面，引导用 `list_pages` 获取 ID 操作）；allowOrigins 白名单页不限制数量，可直接多次打开
- `vue-devtools_*` 工具桥（`window.__aipanel_vue`）仅注入项目页面，因此这些工具只允许在项目页执行，白名单外部页不可用

#### ⚡ 改进

- `allowOrigins` 精确 origin 保持前缀匹配的既有行为，glob 通配由 picomatch 成熟引擎解析，避免自研匹配逻辑
- `current_page` 说明：通过注入上下文定位项目页；操作白名单页请先 `list_pages` 拿到 `pageId` 再调用页面级工具
- 上传类工具不受本地路径限制，可上传项目外文件（由 `--allow-unrestricted-paths` 统一放开，用户传入同参数会告警忽略以保护边界）
- 拒绝/空态提示文案改为中性的"项目页或 allowOrigins 白名单页"，Agent 按错误提示自纠时不会被误导

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.10/packages/extension/aipanel-assistant.zip)

## v1.2.9

`2026-09-05`

### vite-plugin

#### ✨ 新增

- 新增 `chromeMcp` 透传配置：支持向 chrome-devtools-mcp 进程追加 CLI 参数（`args`）与额外环境变量（`env`）；`auto-connect` / `usage-statistics` / `performance-crux` / `page-id-routing` 等核心受保护参数不可覆盖，冲突项自动剔除并告警，保证代理页面路由等核心行为稳定

### core

#### ⚡ 改进

- 核心包代码按运行环境拆分：新增 `common`（跨环境常量/类型/工具）、`node`（Node 专属）、`client`（浏览器端）目录及 `@aipanel/core/client` 导出入口，各环境按需引用，避免浏览器端误引入 Node 依赖

### deepseek

#### ⚡ 改进

- 移除选中元素的 @ 菜单候选列表：点选元素后直接以文件 chip 插入输入框（官方 `insertReference`，codec 序列化为 `@节点[n<id>]`），本地候选存储等辅助逻辑一并清理，引用流程更简洁
- 精简选中元素注入上下文：源码行列号直接并入文件路径（如 `index.vue:53:11`），并移除「页面标题」字段及其端到端传递（core 类型定义、client 选中处理、扩展消息转发同步清理），减少注入冗余
- 重构 provider 与宿主插件，落地 AGENTS.md 代码规范：会话 ID 统一引用 `SESSION_ID_KEY`、跨包接口收敛至 core 单一来源、provider 设置（agentPreset / permissionPreset / busyEnter）改由插件启动期写入 dsh settings（替代启动后的 RPC 变更）
- 事件中继改用官方权威信号：`session.status` 以 `@deepseek-ai/dsh-agent` 的 `agent/status`（running ⇄ idle）为准，thinking / 标题事件直接引用 `@deepseek-ai/dsh-session` 官方类型，移除自定义结构副本并简化状态更新逻辑

#### 🐛 修复

- 修复连续点选多个元素时文件碎片插入失效与光标错位：改为调用官方 `SessionInput.caretSpan()` 获取插入坐标（替代自算 draft 投影长度），并在输入机过渡阶段（claimed/adjudicating）带限重试，保证后续引用不丢失

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.9/packages/extension/aipanel-assistant.zip)

## v1.2.8

`2026-09-04`

### core

#### ⚡ 改进

- 新增请求上下文静默模式：被高频轮询的端点（如扩展后台脚本每 2s 调用的服务状态心跳）不再输出调试日志，避免进程日志刷屏

### deepseek

#### ✨ 新增

- 升级 dsh 相关依赖至 0.1.2-rc.1+，适配新版认证与事件架构：
  - 实现 dsh browser-session 认证：启动时从 `dsh web` 输出 URL 解析 launch token 换取签名 Cookie，并经代理注入转发请求；dsh 版本低于最低要求时给出明确升级提示
  - 重构事件流：dsh 0.1.2+ 移除全局事件下推后，改由宿主内 dsh-plugin 监听 `session/event` 总线、经令牌校验回推 core 再广播，恢复会话 running / thinking 状态指示（思考动画等）
  - 会话列表按当前选中会话过滤：排除子代理与已归档会话，空白（未开始回合）会话仅当前选中时展示，与 dsh UI 可见性规则对齐
- 新增会话标题实时同步：监听 dsh `session/title` 事件（自动生成或手动改名）并转发为 `session.updated`，外层会话列表标题无需整页刷新即可更新

#### 🐛 修复

- 补全 dsh 客户端需注入的 cordis 服务（`sessions` / `inputTriggers` / `conversation`），修复选中元素插入、输入触发与会话切换能力不可用的问题
- 修复 Lexical 编辑器（contenteditable）下插入选中元素光标定位不准确的问题：不再仅依赖 `textarea`，新增可编辑内容选区文本节点遍历换算光标坐标，并兼容两种输入框的焦点恢复与光标回位
- 桥接脚本支持跨 iframe 键盘事件转发与选择模式处理：修复聊天 iframe 内 Esc 无法退出选择模式、Ctrl+P 无法开启选择模式的问题（选择模式下优先转发并阻止按键被 dsh 自身处理吞掉）

### docs

#### ✨ 新增

- 配置文档新增「MCP 客户端接入示例」：给出兼容 `mcpServers` 标准结构的客户端（Claude Code / Cursor 等）接入纯净 MCP 模式（mcpOnly）的 Streamable HTTP 配置 JSON 与写入位置

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.8/packages/extension/aipanel-assistant.zip)

## v1.2.7

`2026-09-01`

### opencode

#### ⚡ 改进

- 重构编辑后诊断插件：移除独立 `@aipanel/opencode-plugins` 包，插件随 provider 包一起编译到 `es/plugins`，统一复用核心层诊断引擎（与 dsh 侧审查工具共用同一实现，保证行为一致）
- 新增 `run_diagnostics` 工具，支持 Agent 主动触发单文件或全量项目诊断（ESLint + vue-tsc）
- 移除 `MIGRATED_TO_MCP_PLUGINS` 过滤逻辑，清理旧插件包残留
- 移除 `enableBlockOnError` 配置项：编辑后不再因错误回滚文件，改为将诊断结果追加到工具输出供 Agent 查看，并同步清理 types / 默认配置 / 环境变量 / 文档速查表中的相关配置

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.7/packages/extension/aipanel-assistant.zip)

## v1.2.6

`2026-08-31`

### core

#### ✨ 新增

- 新增代码诊断引擎，封装 ESLint + vue-tsc 检查逻辑，作为审查工具与编辑后自动诊断的统一实现

### deepseek

#### ✨ 新增

- 新增 `enableDiagnostics`（诊断总开关）与 `autoDiagnose`（编辑后自动诊断）配置项，默认开启，对齐 opencode `enableLsp` 的默认行为
- 新增诊断卡片视图，结构化渲染诊断结果：卡片式布局、作用域标识、可点击的文件跳转，兼容 snake_case / camelCase 文件路径参数

### opencode

#### ⚡ 改进

- 重构 block-on-error 插件，移除重复的诊断实现，统一复用核心层诊断引擎

### ui

#### 🐛 修复

- 修复诊断面板展开逻辑，仅在任务完成后才可展开
- 移除样式中的硬编码默认色值，统一使用 CSS 变量引用

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.6/packages/extension/aipanel-assistant.zip)

## v1.2.5

`2026-08-28`

### deepseek

#### ✨ 新增

- 实现选中元素上下文精准注入：为选中元素分配稳定的节点 ID（`ensureNodeId`），引用以 `@节点[n<id>]` 标记序列化进会话文本，host 端（dsh-plugin）在 agent/pre-step 按 ID 从核心层 context 端点精确反查并注入用户实际引用的节点上下文，注入后清空已消费元素，避免残留与重复
- 选中元素交互优化：引用以节点标记插入输入框光标处（自动补齐前后空格保证气泡高亮），同一节点（filePath+line）重复选中时复用已分配 ID，保持会话标记与上下文注入一致

### ui

#### 🐛 修复

- 修复元素选择时文本提取不完整的问题：不再只取直接文本节点，改用 `innerText` 获取整棵子树的完整可见文本（SVG 等无 `innerText` 时回退到 `textContent`），避免行内子元素（如 `<span>`/`<b>`）文本丢失

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.5/packages/extension/aipanel-assistant.zip)

## v1.2.4

`2026-08-27`

### 🐛 修复

- 回退 MCP 代理的 pageId 路由处理：关闭 `chrome-devtools-mcp` 的 `pageIdRouting`，在转发工具调用前先通过 `select_page` 选中目标页面并剥离 `pageId` 参数，规避底层 schema 强制必填 `pageId` 导致的参数校验失败

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.4/packages/extension/aipanel-assistant.zip)

## v1.2.3

`2026-08-27`

### 🐛 修复

- 适配 `chrome-devtools-mcp` 1.8+ 的 `pageIdRouting` 模式：强制开启并按 pageId 原样透传目标参数，由底层工具路由，解决页面级工具调用报「缺失 pageId」校验错误的问题

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.3/packages/extension/aipanel-assistant.zip)

## v1.2.2

`2026-08-27`

### ⚡ 优化

- 优化 DeepSeek 引擎选中元素的序列化格式，统一特殊字符转义规则，使用带引号的格式以完整保留类选择器空格并支持整条高亮

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.2/packages/extension/aipanel-assistant.zip)

## v1.2.1

`2026-08-26`

### 🐛 修复

- 修复 MCP 进程异常退出（崩溃/启动即退）时错误信息不明确的问题，现在会输出包含退出码、信号与 stderr 的精确原因
- 修复 MCP 启动失败后错误被永久缓存的问题，失败后允许重新拉起进程

### ⚡ 优化

- 升级 `chrome-devtools-mcp` 依赖到 1.8.0
- MCP 进程异常退出时默认在控制台输出 warn 级告警日志，方便定位 Chrome 未启动、CDP 连接失败等问题

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.1/packages/extension/aipanel-assistant.zip)

## v1.2.0

`2026-08-26`

### ✨ 新增

- 支持 **DeepSeek Harness (dsh)** AI 引擎，可与 OpenCode 自由切换（需额外安装 `@aipanel/provider-deepseek`）
- 新增 **纯净 MCP 模式**（`mcpOnly`）：只提供 AI 工具能力，不启动对话界面，方便外部 Agent 调用

### 🐛 修复

- 优化会话加载体验，修复对话过程中的加载闪动与卡住问题
- 修复会话标题显示与自动切换不同步的问题

### ⚡ 优化

- 完善 DeepSeek 引擎的会话管理与界面交互
- 隐藏 DeepSeek 界面中无用的「选择工作区」按钮
- 插件整体更名为 AIPanel 品牌，入口更统一

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.2.0/packages/extension/aipanel-assistant.zip)

## v1.1.69

`2026-08-21`

### deps

#### ⚡ 改进

- 升级 `@pagoda-cli/core` 依赖从 1.0.18 到 1.0.20

### mcp

#### ⚡ 改进

- 优化页面会话标识长度，使用 8 位随机字符，避免多 Tab 场景下标识碰撞
- 简化 Chrome 页面匹配策略，仅使用 `sessionId` 匹配并移除 URL 降级逻辑
- 添加页面查询重试机制，规避 Chrome 连接/标签页枚举未完成时的竞态问题
- 完善错误处理，明确返回调用失败原因，透出页面定位失败的具体原因

### docs

#### ⚡ 改进

- 完善主题定制文档，补充三层变量体系架构说明、组件精细定制示例与暗黑模式角色分工细节

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.69/packages/extension/opencode-assistant.zip)

## v1.1.68

`2026-08-17`

### deps

#### ⚡ 改进

- 升级 `@pagoda-cli/core` 依赖从 1.0.17 到 1.0.18

### docs

#### ⚡ 改进

- 重构 vite 包 README 文档，精简为快速开始流程，补充浏览器扩展安装步骤与工作原理说明

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.68/packages/extension/opencode-assistant.zip)

## v1.1.67

`2026-08-14`

### mcp

#### ✨ 新增

- 新增 `chrome-devtools_new_page` 工具，支持打开新标签页加载页面；仅允许访问当前项目的页面，若项目已有打开的页面则自动复用并返回已有页面信息，避免重复打开

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.67/packages/extension/opencode-assistant.zip)

## v1.1.66

`2026-08-13`

### mcp

#### ⚡ 改进

- 统一 DevTools 工具命名规范，改为 `chrome-devtools_` 前缀，移除工具名映射表
- 将 Vue DevTools 调试能力迁移至 MCP 工具体系，以 `vue-devtools_` 前缀提供组件树、组件状态、路由等工具
- 将 Vite 进程日志与服务日志插件迁移为 MCP 工具，以 `logs-devtools_` 前缀提供日志查询能力
- 移除 MCP 令牌校验逻辑，简化端点认证

### vue-devtools

#### ⚡ 改进

- `executeAction` 调整为导出函数，供 MCP 端点复用

### opencode

#### ⚡ 改进

- 重构插件加载逻辑，过滤已迁移到 MCP 的插件（`vue-devtools.js`、`vite-logs.js`、`service-logs.js`），避免工具重复

### docs

#### ⚡ 改进

- 更新页面上下文提示文本中的工具命名规范

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.66/packages/extension/opencode-assistant.zip)

## v1.1.65

`2026-08-13`

### vue-devtools

#### 🐛 修复

- 增加 `nodeId` 有效性校验，避免获取已卸载组件的状态
- 统一接口返回格式为 JSON 字符串，补充组件状态获取失败等错误提示

#### ⚡ 改进

- 组件树查询接口新增 `filter` 参数支持，可按组件名过滤缩小查询范围
- 优化 Vue 内部对象识别逻辑，新增 `__isVue` 实例判断

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.65/packages/extension/opencode-assistant.zip)

## v1.1.64

`2026-08-13`

### test

#### ⚡ 改进

- 清理测试文件中冗余的导入和测试用例

### utils

#### ⚡ 改进

- 从 shared 包抽离通用的 `createPackageRequire` 与 `resolvePackageDir` 工具函数
- 移除各模块内重复的包目录解析实现，统一复用公共工具

### vue-devtools

#### ⚡ 改进

- 简化 Vue DevTools 桥接文件路径解析逻辑

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.64/packages/extension/opencode-assistant.zip)

## v1.1.63

`2026-08-13`

### deps

#### ⚡ 改进

- 升级 `chrome-devtools-mcp` 依赖从 1.6.0 到 1.7.0

### mcp

#### ⚡ 改进

- 默认启动参数新增 `--no-performance-crux`，禁用向 Google CrUX API 上报性能 trace 数据

### 📦 产物

- [Chrome 插件下载](https://github.com/code-farmer-i/vite-plugin-aipanel/raw/v1.1.63/packages/extension/opencode-assistant.zip)

## v1.1.62

`2026-08-12`

### config

#### ✨ 新增

- 新增 `enablePrettier` 配置项，支持控制代码格式化功能的开关，默认开启

### process

#### ⚡ 改进

- 重构 `killOrphanOpenCodeProcesses` 孤儿进程清理逻辑，增加超时处理机制

### vue-devtools

#### ⚡ 改进

- 全面优化 `vue-devtools-bridge` 桥接脚本，增加组件数据裁剪与安全处理
- 删除冗余的 `vue_devtools_find_component` 工具方法，精简 Vue DevTools 插件

## v1.1.61

`2026-08-12`

### mcp

#### ⚡ 改进

- 统一页面 ID 校验逻辑，提取 `validatePageId` 公用方法，MCP 代理和 Vue DevTools 端点复用

### vue-devtools

#### ⚡ 改进

- 工具改为显式传入 `pageId` 参数，支持多页面场景下精确定位目标页面
- 移除端点的自动页面解析逻辑（`resolveActivePageId`），简化调用链路

## v1.1.60

`2026-08-12`

### config

#### ⚡ 改进

- 调整默认配置：默认主题改为 `dark`，默认展示模式改为 `extension`
- `DEFAULT_CONFIG` 补充 `Partial<OpenCodeOptions>` 类型定义

## v1.1.59

`2026-08-12`

### vue-devtools

#### 🐛 修复

- 修复 `toggleApp` 调用返回值异常的问题，添加显式 ok 返回
- 修复获取路由信息的逻辑，改为直接使用 Vue DevTools 提供的全局路由信息对象
- 添加 `safeStringify` 方法处理循环引用导致的序列化问题

## v1.1.58

`2026-08-12`

### deps

#### ⚡ 改进

- 升级 Vite 依赖版本到 8.2.1
- 安装 `@vue/devtools-kit` 依赖包

### docs

#### ✨ 新增

- 新增更新日志页面并添加导航入口

### vue-devtools

#### ✨ 新增

- 新增 Vue DevTools 集成能力
  - 新增桥接脚本，注入页面暴露调试 API
  - 新增 API 端点，通过 MCP 代理调用浏览器调试能力
  - 新增插件，提供组件树、状态、路由等调试工具

## v1.1.57

`2026-08-10`

### deps

#### ⚡ 改进

- 更新 `@pagoda-cli/core` 依赖到 1.0.17

### opencode

#### 🐛 修复

- npm 全局安装 OpenCode 时检测不到的问题，子进程调用添加 `shell` 参数
