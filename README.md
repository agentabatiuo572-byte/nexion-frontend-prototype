# NexGrid 运营控制后台原型

这是可独立运行的后台交互演示源码。使用 Next.js 16、React 19、TypeScript、Tailwind CSS 4 和 Zustand，包含本地模拟数据及后台 PRD 四卷。

## 启动演示

需要 Node.js 20.9 或更高版本及 npm。

```bash
git clone --single-branch --branch codex/admin-prototype-demo https://github.com/agentabatiuo572-byte/nexion-frontend-prototype.git
cd nexion-frontend-prototype
npm ci
node -e "require('node:fs').copyFileSync('.env.example', '.env.local')"
npm run dev
```

打开 [http://localhost:3002](http://localhost:3002)。演示环境直接进入运营总览，无需账号密码。安装依赖和首次字体编译需要联网。

类型检查与生产模式演示：

```bash
npm run type-check
npm run build
npm run start
```

开发服务与生产服务均默认使用 3002 端口，运行其中一个即可。生产构建也必须先创建上述 `.env.local`，公开环境变量在构建时写入页面。

## 代码与 PRD

- `app/`：页面、组件、样式及 Next.js API 路由。
- `lib/`：导航、业务类型、本地模拟数据、状态管理和 API 客户端。
- `docs/cgm/cgm.manifest.json`：参数寄存器页面直接导入的运行数据，必须随代码保留。
- `PRD/`：从项目权威 PRD 目录原样复制的后台四卷需求文档。四卷分别覆盖不同业务域，需要合并阅读。
- `.env.example`：本地演示配置示例，不包含密钥。
- `package-lock.json`：可重复安装的依赖锁文件。

PRD：[V1](PRD/NexGrid_运营控制后台PRD_v1.md) · [V2](PRD/NexGrid_运营控制后台PRD_v2.md) · [V3](PRD/NexGrid_运营控制后台PRD_v3.md) · [V4](PRD/NexGrid_运营控制后台PRD_v4.md)。PRD 中引用的其他项目、专项规格和历史评审记录不在本演示包中；文档中的目标能力不代表本原型已经实现。

## 演示范围

`NEXT_PUBLIC_ADMIN_AUTH_BYPASS=1` 启用本地预览。主要页面、设备/商城和平台管理的数据由本地模拟数据提供，不需要启动业务后端。部分交互保存在当前浏览器；部分模拟写接口只返回成功，刷新取数后会恢复模拟数据。真实媒体上传需要独立后端和认证，不属于独立演示范围。

本分支用于交互演示，不承载真实资金、账户权限或生产业务。源码中保留的 Janus/K6 历史演示不代表恢复建设或启用；Janus 继续遵循 2026-10-28 的暂停冻结决定。

## 来源

代码快照来自 [nexion-frontend-pc](https://github.com/agentabatiuo572-byte/nexion-frontend-pc) 的 `rhythm-configurable` 分支，提交 `b702df49e426056a486fe5ba2180f2af40a1b96a`。PRD 为 2026-11-03 导出时项目 `PRD/` 目录中的四卷快照。

本分支为独立源码快照，不带源仓库历史、依赖目录、构建缓存、日志、截图、测试产物或过程文档。`type-check` 仅检查本演示源码类型；原仓库依赖其他工程及过程文档的整套验收流程不包含在此分发包中。
