# Vite 插件配置

Vite 插件负责启动 AIPanel Web 服务（AI 对话后端），是浏览器扩展正常工作所必需的。默认配置即可满足大多数场景，以下配置用于高级定制。

## 安装

```bash
npm install -D vite-plugin-aipanel
```

## 最小配置

```ts
import { defineConfig } from "vite";
import aipanelAssistant from "vite-plugin-aipanel";

export default defineConfig({
  plugins: [aipanelAssistant()],
});
```

## 完整配置

```ts
import aipanelAssistant from "vite-plugin-aipanel";

aipanelAssistant({
  // === 基础配置 ===
  enabled: true, // 是否启用，默认 true
  provider: "default", // AI 引擎：默认 "default"（等价 "opencode"），可选 "deepseek"
  webPort: 5097, // AIPanel Web 服务端口，默认 5097（被占用时自动换端口）
  proxyPort: 6097, // 代理端口，默认 6097（处理跨域与页面通信）
  hostname: "127.0.0.1", // 服务绑定地址
  verbose: false, // 详细日志
  mcpOnly: false, // 纯净 MCP 模式：只暴露 MCP 工具服务，不启动 AI 引擎/不注入对话界面

  // === 面板与行为 ===
  theme: "dark", // light | dark | auto，默认 dark
  open: false, // 服务就绪后是否自动打开面板，默认 false
  hotkey: "ctrl+k", // 打开/关闭面板快捷键
  warmupChromeMcp: true, // 启动时预热 Chrome DevTools 连接
  chromeDevtoolsPort: 9222, // Chrome 远程调试端口

  // === Chrome DevTools MCP（可选，详见下文「Chrome DevTools MCP（chromeMcp）」）===
  chromeMcp: {
    // 进程透传：向 chrome-devtools-mcp 追加 CLI 参数与环境变量
    // （核心受保护参数不可覆盖，冲突项自动剔除并告警）
    args: ["--foo"], // 追加的 CLI 参数
    env: { FOO: "bar" }, // 额外环境变量
    project: {
      // 自动项目页之外，额外可打开/可见/可操作的页面。
      // 每条三种写法：精确 origin / glob 通配符 / 正则字面量
      allowOrigins: ["https://*.example.com/**"],
      // 是否允许扩展页（chrome-extension://）进入可操作范围（默认 false）
      includeExtensionPages: false,
      tools: {
        // 在默认白名单之外按名字追加官方工具（flag 自动推导注入）
        extra: ["click_at"],
        // 从默认白名单按名字隐藏工具
        deny: ["upload_file"],
      },
    },
  },

  // === Provider 专属配置（以 providerOptions 段声明）===
  providerOptions: {
    // —— OpenCode 引擎 ——
    language: "zh", // 界面语言
    settings: {
      general: {
        showReasoningSummaries: true,
        showFileTree: false,
        followup: "suggest",
      },
      appearance: {
        fontSize: 14,
        mono: "JetBrains Mono",
      },
      permissions: {
        autoApprove: false,
      },
      notifications: {
        agent: true,
        permissions: true,
        errors: true,
      },
    },
    diagnostics: {
      // 不写 checks = 内置 ESLint + oxlint + 类型检查（项目装了什么跑什么）
      // 自定义：内置预设（eslint / oxlint / stylelint / typecheck）与自研工具混搭
      checks: [
        { builtin: "eslint" },
        { builtin: "oxlint" },
        { builtin: "stylelint" }, // 只在编辑 .css/.scss/.less 时跑
        { builtin: "typecheck" },
        // { name: "自研检查", bin: "my-lint", args: ["--json", "{files}"], format: "aipanel-json" },
        // { name: "项目全量检查", command: "pnpm", args: ["run", "lint:all"], targets: ["project"] },
      ],
      auto: true, // 编辑后自动诊断
      exposeTool: true, // 是否把 run_diagnostics 暴露给模型
      severity: "error", // "error" 只报错误；"warning" 错误 + 警告
      maxFindingsPerSection: 3, // 自动诊断每分区条数上限
      maxMessageChars: 4000, // 自动诊断注入字符上限
    },
    enablePrettier: true, // 启用代码格式化，默认 true
  },

  // === 自定义日志文件（让 AI 能读取外部服务日志）===
  logFiles: [
    {
      name: "backend-logs",
      path: "/path/to/backend.log",
      description: "后端服务错误日志",
    },
  ],
});
```

> 旧写法（顶层 `language` / `settings` / `enablePrettier`）仍兼容，但已废弃，推荐统一迁移到 `providerOptions` 段。

## 配置项速查表

| 配置项                                    | 类型      | 默认值        | 说明                                                         |
| ----------------------------------------- | --------- | ------------- | ------------------------------------------------------------ |
| `enabled`                                 | `boolean` | `true`        | 是否启用                                                     |
| `provider`                                | `string`  | `"default"`   | AI 引擎（`"default"`→opencode，另可选 `"deepseek"`）         |
| `webPort`                                 | `number`  | `5097`        | AIPanel Web 端口                                             |
| `proxyPort`                               | `number`  | `6097`        | 代理端口                                                     |
| `hostname`                                | `string`  | `"127.0.0.1"` | 服务地址                                                     |
| `theme`                                   | `string`  | `"dark"`      | 主题：`light` / `dark` / `auto`                              |
| `open`                                    | `boolean` | `false`       | 服务就绪后是否自动打开面板                                   |
| `hotkey`                                  | `string`  | `"ctrl+k"`    | 打开/关闭面板快捷键（如 `"ctrl+k"` / `"cmd+k"`）             |
| `verbose`                                 | `boolean` | `false`       | 详细日志                                                     |
| `mcpOnly`                                 | `boolean` | `false`       | 纯净 MCP 模式                                                |
| `warmupChromeMcp`                         | `boolean` | `true`        | 预热 Chrome MCP                                              |
| `chromeDevtoolsPort`                      | `number`  | `9222`        | Chrome 调试端口                                              |
| `chromeMcp`                               | `object`  | -             | Chrome DevTools MCP 透传与项目边界（见下）                   |
| `chromeMcp.project.allowOrigins`          | `array`   | -             | 额外可操作页面（精确 origin / glob / 正则）                  |
| `chromeMcp.project.includeExtensionPages` | `boolean` | `false`       | 允许扩展页进入可操作范围                                     |
| `chromeMcp.project.tools.extra`           | `array`   | -             | 追加官方工具（flag 自动推导注入）                            |
| `chromeMcp.project.tools.deny`            | `array`   | -             | 隐藏默认白名单工具                                           |
| `providerOptions.language`                | `string`  | -             | 界面语言                                                     |
| `providerOptions.settings`                | `object`  | -             | Provider 内部设置                                            |
| `providerOptions.diagnostics`             | `object`  | -             | 诊断配置（检查来源 / 触发 / 投递，两个 provider 通用，见下） |
| `providerOptions.enablePrettier`          | `boolean` | `true`        | 代码格式化                                                   |
| `logFiles`                                | `array`   | -             | 自定义日志文件                                               |

### 纯净 MCP 模式（mcpOnly）

`mcpOnly: true` 时插件只暴露 MCP 工具服务（Chrome DevTools 控制、Vue DevTools、日志读取等），
不启动 AI 引擎、不注入对话界面，适合作为独立 MCP server 供外部 Agent 消费。
可用工具由默认白名单 + `chromeMcp.project.tools` 调整决定（见下方「Chrome DevTools MCP（chromeMcp）」）：
`chrome-devtools_*`（页面级操作/截图/网络/控制台等安全分类）、`vue-devtools_*`（组件树/状态/渲染源码/路由/时间线）、
`logs-devtools_*`（日志）。页面仅注入轻量的静默上下文上报脚本（无 UI 副作用），

因此 `chrome-devtools_current_page` 也能感知当前浏览页面。

```ts
aipanelAssistant({
  mcpOnly: true,
});
```

启动后 MCP 端点固定挂在 Vite dev server 上（需保持 `vite dev` 运行），外部 MCP 客户端配置
Streamable HTTP 即可接入：

```
http://localhost:5173/__aipanel_mcp__
```

> 端口随 Vite dev server 变化（默认 5173），以实际输出日志中的 `MCP endpoint` 地址为准。

#### MCP 客户端接入示例

兼容 `mcpServers` 标准结构的客户端（Claude Code / Cursor 等）均可直接接入，
把 `aipanel` 注册为 Streamable HTTP 类型的 server：

```json
{
  "mcpServers": {
    "aipanel": {
      "type": "http",
      "url": "http://localhost:5173/__aipanel_mcp__"
    }
  }
}
```

- **Claude Code**：写入项目根目录 `.mcp.json`，或在终端执行
  `claude mcp add --transport http aipanel http://localhost:5173/__aipanel_mcp__`；
- **Cursor**：写入项目根目录 `.cursor/mcp.json`；
- 其他客户端：按其文档把上述 `mcpServers` 片段放入对应配置文件即可。

> 端点无需鉴权。URL 端口须与当前 `vite dev` 端口一致（默认 5173），以启动日志中的
> `MCP endpoint` 地址为准。

### Chrome DevTools MCP（chromeMcp）

插件内置 chrome-devtools-mcp 代理，对外暴露 `chrome-devtools_*` / `vue-devtools_*` / `logs-devtools_*`
工具。`chromeMcp` 分两段配置：进程透传（`args` / `env`）与项目边界策略（`project`）。

```ts
aipanelAssistant({
  chromeMcp: {
    // 1) 进程透传：向 chrome-devtools-mcp 追加 CLI 参数与环境变量（v1.2.9）
    //    auto-connect / usage-statistics / performance-crux / page-id-routing 等
    //    核心受保护参数不可覆盖，冲突项自动剔除并告警
    args: ["--foo"],
    env: { BAR: "1" },

    // 2) 项目边界策略：控制 MCP 能“看到并操作”哪些页面（v1.2.10）
    project: {
      // 自动项目页之外，额外可打开/可见/可操作的页面。每条三种写法：
      //   精确 origin：  "https://example.com"（前缀匹配，含任意路径）
      //   glob 通配符：  "https://*.example.com/**"（picomatch，* 不跨 /，放开路径需 /**）
      //   正则字面量：  "/^https:\\/\\/app\\.example\\.com\\//"（对完整 URL 匹配）
      allowOrigins: ["https://*.baidu.com/**"],

      // 是否允许 chrome-extension:// 扩展页纳入可操作范围（需开启对应官方 flag，自动注入）
      includeExtensionPages: false,

      tools: {
        // 在默认白名单外按名字追加官方工具（如实验性/二级分类工具；所需 CLI flag 自动推导注入）
        extra: ["click_at"],
        // 从默认白名单隐藏工具（如不想让 AI 上传文件）
        deny: ["upload_file"],
      },
    },
  },
});
```

#### 默认工具白名单

页面级官方工具按“安全子集”默认暴露（页面级 + 官方未声明附加条件 + 分类安全的工具），
外加少量全局工具（如 `list_pages` / `new_page` / `evaluate_script`）。名单由官方元数据在构建期
自动同步并受快照测试守护，官方工具演进不会静默改变暴露面；官方声明了条件的工具（如实验性
能力）需在 `tools.extra` 显式开启。

#### 项目内操作约束

- 页面级工具统一要求 `pageId` 参数，调用前实时校验其属于**可操作范围**（自动项目页 ∪
  `allowOrigins`）；`list_pages` / `current_page` 只返回范围内的页面
- `navigate_page` 跳转目标（`type=url`）与 `new_page` 打开目标必须属于可操作范围，
  越界会被拒绝并给出明确原因（报错会列出允许条目）
- `new_page` 对**项目页**全局去重（重复打开返回已有页面，引导先 `list_pages` 拿 pageId）；
  对 `allowOrigins` 白名单页**不限制数量**
- `vue-devtools_*` 桥只注入项目页面，因此仅在自动项目页可用，白名单外部页不可用
- 上传类工具（`upload_file`）不受本地路径限制，可上传项目外文件

> 以上边界仅用于约束 AI 能操作哪些页面；不配置 `project` 时保持默认行为（仅自动项目页可操作）。

### logFiles 说明

配置后 AI 可获得 `get_{name}_logs` 工具，查看指定日志文件的最近 50 条（最多 200 条）：

```ts
logFiles: [
  {
    name: "backend-logs", // 生成工具名 get_backend-logs_logs
    path: "/path/to/error.log", // 日志文件绝对路径
    description: "后端错误日志", // 告诉 AI 何时使用
  },
];
```

## 选择 AI 引擎

插件默认使用 **OpenCode**（`provider` 未配置或为 `"default"` / `"opencode"`），适配已内置；若使用 **DeepSeek Harness (dsh)**，需先安装其 provider 包与 CLI：

```bash
npm install -D @aipanel/provider-deepseek
npm install -g @deepseek-ai/dsh
```

`providerOptions` 段承载各引擎专属配置。**OpenCode** 引擎的配置见上方「完整配置」。切换到 **dsh** 引擎：

```ts
aipanelAssistant({
  provider: "deepseek",
  providerOptions: {
    home: "~/.dsh", // dsh 数据目录（$DSH_HOME），默认跟随系统 ~/.dsh
    profile: "web", // dsh profile 名（$DSH_HOME/profiles/<name>），默认 web
    agentPreset: "standard", // 新建会话的默认 Agent 预设
    permissionPreset: "read-only", // 默认权限预设：read-only | workspace-write | danger-full-access
    busyEnter: "queue", // 繁忙时 Enter 行为：queue | steer
  },
});
```

### OpenCode 专属配置速查

| 配置项                           | 类型      | 默认值 | 说明                                  |
| -------------------------------- | --------- | ------ | ------------------------------------- |
| `providerOptions.language`       | `string`  | -      | 界面语言（如 `"zh"`）                 |
| `providerOptions.settings`       | `object`  | -      | OpenCode 内部设置（外观/权限/通知等） |
| `providerOptions.diagnostics`    | `object`  | -      | 诊断配置（见下）                      |
| `providerOptions.enablePrettier` | `boolean` | `true` | 代码格式化                            |

### DeepSeek (dsh) 配置项速查

| 配置项                             | 类型              | 默认值   | 说明                                                                                   |
| ---------------------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `providerOptions.home`             | `string`          | `~/.dsh` | dsh 数据目录（`$DSH_HOME`）                                                            |
| `providerOptions.profile`          | `string`          | `web`    | dsh profile 名（`$DSH_HOME/profiles/<name>`），AIPanel 插件与 Web 进程都指向该 profile |
| `providerOptions.settingsFrom`     | `string \| false` | `web`    | 机器级设置（供应商 / 搜索源 / MCP）从哪个 profile 继承；**默认就继承**，不用配         |
| `providerOptions.agentPreset`      | `string`          | -        | 新建会话的默认 Agent 预设                                                              |
| `providerOptions.permissionPreset` | `string`          | -        | 默认权限预设                                                                           |
| `providerOptions.busyEnter`        | `string`          | -        | 繁忙时 Enter 行为（`queue` / `steer`）                                                 |
| `providerOptions.diagnostics`      | `object`          | -        | 诊断配置（见下）                                                                       |

> `providerOptions.profile` 仅支持仍启动 Web UI 的 profile（其 `dsh.profile.bundles` 含 `@deepseek-ai/dsh-web-app`，如 `web`、`workbench`）；纯终端类 profile（如 `tui`）不适用。
>
> ⚠️ **目标 profile 必须已经建好**。写一个还不存在的 profile 名不会让 AIPanel 替你建对：dsh 的 `plugin` 子命令在 profile 目录缺失时会自己初始化一个**只有 `@deepseek-ai/dsh-base`** 的空壳（无 Web 应用），于是启动只会表现为"等 launch token 超时"，看不出根因。启动前会做预检：profile 目录不在、或 `dsh.profile.bundles` 里没有 `@deepseek-ai/dsh-web-app` 时当场拒绝并说明怎么修（在此之前不会执行任何 `dsh plugin add`，也不会留下空壳 profile）。
>
> 所以自建 profile（`workbench`、`codexlab` 等）要**先用它自己的安装流程建好**再填进这里 —— 例如工作台：`npx --yes @dsh-workbench/core@latest setup`。
>
> **关于 `providerOptions.settingsFrom`（默认 `web`，不用配）**：dsh 的组合层只有 `bundle → profile → home → --patch`，**没有 profile 继承 profile**。所以一旦把 `profile` 换成自建 profile，你在 `dsh web` 里配过的模型供应商 / 搜索源 / MCP 本来是不会跟过去的 —— 会用建 profile 那一刻的快照。现在默认把默认 profile（`web`）的配置作为一层 `--patch` 叠上去，**只补目标 profile 自己没写过的行**（`profile` 仍填 `web` 时这层等于没有，行为不变）。
>
> - **目标 profile 自己写过的行不继承（目标作主）**：`--patch` 是最高层，且 dsh 对同 id 的条目是**整段 `config` 替换**。所以目标 `cordis.patch.yml` 里已有的条目、以及它自己 `- insert:` 过的 id，来源层一律让开。例：`workbench` 自己维护 `llm-pi-ai` / `agent-default-model`，它的模型配置与默认模型不会被 `web` 的那套盖掉；`web` 里独有的行仍会补进来。目标自己管 `llm-pi-ai` 时，来源的 `agent-default-model` 也一并不继承 —— 那个默认值可能指向目标供应商列表里没有的 provider。
> - 每个界面**自己的偏好**（如主题）永远不继承 —— 那类行跟着来源走会把界面锁死（比如在工作台里切浅色会被 web 的深色顶回去）。
> - 想只保留目标 profile 自己的配置：`settingsFrom: false`。想换来源 profile：填它的名字。

### 诊断配置（`providerOptions.diagnostics`，两个引擎通用）

`checks` 是有序的检查列表；不写 = 内置 ESLint + oxlint + 类型检查（项目装了什么跑什么）。
内置 linter 是**预设**，展开后与自定义检查走完全相同的执行与适配逻辑：

```ts
aipanelAssistant({
  provider: "deepseek",
  providerOptions: {
    diagnostics: {
      checks: [
        { builtin: "eslint" }, // 内置预设：默认参数 / 输出格式 / 匹配扩展名都来自内置目录
        { builtin: "oxlint" },
        { builtin: "stylelint" }, // 默认只在 .css/.scss/.less 上跑
        { builtin: "typecheck" }, // 类型检查（tsconfig 归并，项目本地 tsc/vue-tsc 优先）
        {
          // 自研工具：与内置同形
          name: "自研检查",
          bin: "my-lint", // 项目本地包的 bin（解析不到会明确报出）
          args: ["--json", "{files}"], // {file} 逐文件 / {files} 一次传全部
          projectArgs: ["--json", "src"], // 全量诊断时的 argv
          format: "aipanel-json", // 或 adapter: "./tools/my-lint-adapter.mjs"
          extensions: [".ts", ".tsx"],
        },
        {
          // 只在全量诊断（run_diagnostics 不传 filePath）时触发：
          name: "项目全量检查",
          command: "pnpm",
          args: ["run", "lint:all"],
          targets: ["project"],
        },
      ],
      auto: true, // 编辑后自动诊断
      exposeTool: true, // 是否把 run_diagnostics 暴露给模型
      severity: "warning", // "error" 只报错误
      maxFindingsPerSection: 3, // 自动诊断每分区条数上限
      maxMessageChars: 4000, // 自动诊断注入字符上限
    },
  },
});
```

| 检查字段          | 说明                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `builtin`         | `eslint` / `oxlint` / `stylelint` / `typecheck` 预设（可局部覆盖其余字段）                                                          |
| `name`            | 自定义检查的分区标题                                                                                                                |
| `bin` / `command` | 项目本地包的 bin / 任意可执行文件（argv 直传，不经 shell）                                                                          |
| `args`            | 默认 argv；`{file}` 逐文件一次、`{files}` 一次传全部                                                                                |
| `projectArgs`     | 全量诊断（无目标文件）时的 argv；含占位符又没写它 → 全量时跳过该检查                                                                |
| `extensions`      | 只在这些扩展名的文件上跑；缺省：内置 lint 为源码扩展名、自定义为不限                                                                |
| `format`          | `text`（默认）/ `tsc` / `eslint-json` / `oxlint-json` / `stylelint-json` / `aipanel-json`                                           |
| `adapter`         | 自定义适配器模块（相对项目根，default export 一个函数，可 async）                                                                   |
| `run`             | `edit`（编辑后）/ `manual`（agent 调工具）/ `both`（默认）                                                                          |
| `targets`         | 只在这些目标形态下跑：`edited`（编辑后）/ `file`（单文件诊断）/ `project`（全量诊断）；缺省不限。`["project"]` = 只在全量诊断时触发 |
| `timeoutMs`       | 单次命令超时，默认 60000                                                                                                            |

> 排除规则（哪些文件不该被检查）交给底层工具自己：ESLint 自身 ignore、tsconfig `exclude`、
> 或命令自己的 glob。AIPanel 不另立一套 glob 语义。

> **自动诊断只在"有发现"时注入**：命令成功退出（exit 0）且没有结构化条目就算干净——即使它打印了
> `✓ 0 problems found` 之类的成功信息，也不会每个 step 注入上下文。命令非零退出、跑不起来或输出
> 解析失败仍会明确告知。手动 `run_diagnostics` 不受此规则影响，始终给完整输出。
