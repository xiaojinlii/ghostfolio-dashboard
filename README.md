# sidecar

Sidecar 是一个独立的 Vite + React 应用（端口 5173），启动方式如下：

启动步骤

# 1. 进入 sidecar 目录
cd apps/sidecar

# 2. 拷贝.env.example
cp .env.example .env

# 3. 首次需要安装依赖
npm install

# 4. 启动开发服务器
npm run dev


环境变量：
GHOSTFOLIO_URL=http://ghostfolio:3333


docker run -d --name ghostfolio-dashboard -p 5173:5173 -e GHOSTFOLIO_URL=http://ghostfolio-app:3333 ghostfolio-dashboard:latest
