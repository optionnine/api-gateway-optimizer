# 使用官方 Node.js 镜像作为基础 (选择一个 LTS 版本)
FROM node:18-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json
# 利用 Docker 的层缓存机制，只有当这两个文件改变时才重新安装依赖
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 暴露网关运行的端口
EXPOSE 8080

# 容器启动时运行的命令
CMD [ "node", "gateway.js" ]