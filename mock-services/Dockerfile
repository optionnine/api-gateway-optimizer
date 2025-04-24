# 使用与网关相同的 Node.js 基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖 (主要是 express)
RUN npm install

# 复制所有服务代码
COPY . .

# 暴露端口不是必须的，因为服务间通信通过 Docker 网络
# EXPOSE 8081
# EXPOSE 8082
# EXPOSE 8083
# EXPOSE 8084

# 关键：容器启动命令，接收文件名和端口作为参数
# 例如，运行 'node serviceA.js 8081'
# 我们将在 docker-compose.yml 中传递这些参数
ENTRYPOINT [ "node" ]
# CMD 设置默认参数，但会被 docker-compose 覆盖
CMD [ "serviceA.js", "8081" ]