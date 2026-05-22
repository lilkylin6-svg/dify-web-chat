# ForJue Dify Vue Demo

一个基于 `Vue 3 + Vite + Pinia` 的轻量聊天前端，配合 `Vercel Serverless Function` 代理调用 Dify Workflow API，并隐藏真实 API Key。

## 设计思路

- 前端读取从 DSL 提炼出的工作流配置，自动识别需要用户输入的字段。
- 结合你补充的截图，当前工作流真正对外暴露的输入只有 `sys.query`，因此页面主交互是一个聊天输入框。
- 使用 Pinia 管理消息列表、会话 ID、发送状态和错误信息。
- 前端请求同仓库下的 `/api/chat`，由 Vercel Serverless Function 携带 `DIFY_API_KEY` 转发到 `POST /v1/workflows/run`。
- 代理层直接透传 Dify 的 SSE 流，前端边收边渲染。

## 文件结构

```text
.
├── api/
│   └── chat.js
├── src/
│   ├── config/
│   │   └── chatflow.ts
│   ├── lib/
│   │   └── difyStream.ts
│   ├── stores/
│   │   └── chat.ts
│   ├── types/
│   │   └── chat.ts
│   ├── App.vue
│   ├── env.d.ts
│   └── main.ts
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
DIFY_API_KEY=app-xxxxxxxxxxxxxxxxxxxx
DIFY_BASE_URL=https://api.dify.ai/v1
VITE_API_BASE=/api/chat
```

说明：

- `DIFY_API_KEY`：Dify Workflow 所属应用的 API Key
- `DIFY_BASE_URL`：Dify 服务地址，当前按你的配置使用 `https://api.dify.ai/v1`
- `VITE_API_BASE`：前端请求代理地址，本地和 Vercel 同仓部署时直接用 `/api/chat`

## 安装依赖

```bash
npm install
```

## 本地开发

```bash
npm run dev
```

启动后访问：

```text
http://localhost:5173
```

## 部署到 Vercel

1. 将项目推送到 GitHub。
2. 登录 Vercel，导入该仓库。
3. 在项目环境变量中配置：
   - `DIFY_API_KEY`
   - `DIFY_BASE_URL`
   - `VITE_API_BASE=/api/chat`
4. 执行部署。
5. 部署完成后，前端页面和 `/api/chat` 会一起上线。

## 鉴权说明

- `Authorization: Bearer ${process.env.DIFY_API_KEY}` 只应出现在后端代理 `api/chat.js` 中。
- 前端不直接携带 Dify API Key，否则会把密钥暴露给浏览器。
- 浏览器只请求同源 `/api/chat`，由代理转发到 Dify 并处理 streaming。

## 输入结构说明

根据你提供的 DSL 和界面截图：

- `sys.query`：真正由用户输入的文本问题
- `sys.files`：系统文件变量，但当前工作流已关闭文件上传
- `sys.dialogue_count`、`sys.conversation_id`、`sys.user_id` 等：由 Dify 运行时自动注入

因此这个版本不会把这些系统变量错误地渲染成公开表单，只保留用户真正需要操作的聊天输入框。

## 你后续可以改什么

- 如果你以后在 Dify 起始节点新增自定义输入字段，可以更新 `src/config/chatflow.ts` 中的 `inputFields`。
- 如果你希望把工作流说明、推荐问题或欢迎语做成运营配置，也可以继续从该文件扩展。
