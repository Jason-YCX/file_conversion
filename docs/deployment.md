# 生产部署

本文档描述将轻转的前端、API、转换 Worker、PostgreSQL、Redis、MinIO和Caddy全部部署到同一台Linux服务器的流程。生产环境使用独立的 `compose.production.yaml`，不复用会向宿主机暴露基础设施端口的本地 `compose.yaml`。

## 部署结构

- `Caddy`：监听80/443，读取腾讯云手动证书，并转发三个域名。
- `web`：运行Vinext standalone前端，只在Docker网络内监听3000。
- `api`：运行NestJS API，只在Docker网络内监听4000。
- `worker`：与API使用同一个后端镜像，独立消费conversion和archive队列。
- `postgres`：持久化任务和归档记录。
- `redis`：仅承载BullMQ队列并开启AOF。
- `minio`：保存上传、转换结果和归档文件；控制台不开放公网。

生产环境只有Caddy的80、443端口映射到宿主机。PostgreSQL、Redis、MinIO和Node服务均不直接暴露公网。

## 服务器准备

建议从4核CPU、8GB内存、100GB SSD的Ubuntu LTS服务器起步。安装Git、curl、OpenSSL、Docker Engine和Docker Compose插件，并确认：

```bash
docker version
docker compose version
```

防火墙只需开放SSH、HTTP和HTTPS：

```text
22/tcp
80/tcp
443/tcp
443/udp
```

将以下DNS记录解析到服务器公网IP：

```text
qingzhuan.jason-ycx.top
qingzhuan-api.jason-ycx.top
qingzhuan-files.jason-ycx.top
```

如果配置了AAAA记录，必须保证服务器的IPv6也可以访问80和443，否则部分用户可能无法访问。

## 首次部署

将仓库放在固定目录：

```bash
sudo mkdir -p /opt/qingzhuan
sudo chown "$USER":"$USER" /opt/qingzhuan
git clone git@github.com:Jason-YCX/file_conversion.git /opt/qingzhuan
cd /opt/qingzhuan
```

创建生产环境文件：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`：

1. 确认前端、API和文件域名与当前DNS解析一致；如需换域名再修改。
2. 为PostgreSQL、Redis和MinIO分别设置不同的随机密码。
3. 密码建议使用 `openssl rand -hex 24` 生成，避免URL中需要额外编码的特殊字符。

## 腾讯云手动证书

Caddy不会申请ACME证书，生产环境需要提前放置三套腾讯云证书：

```text
certs/
├── qingzhuan/
│   ├── cert.pem  # qingzhuan.jason-ycx.top
│   └── key.pem
├── qingzhuan-api/
│   ├── cert.pem  # qingzhuan-api.jason-ycx.top
│   └── key.pem
└── qingzhuan-files/
    ├── cert.pem  # qingzhuan-files.jason-ycx.top
    └── key.pem
```

从腾讯云下载Nginx/PEM格式证书，将bundle/fullchain证书复制为对应目录的 `cert.pem`，私钥复制为 `key.pem`。如果同一张证书覆盖三个域名，可以将同一套证书和私钥分别复制到三个目录。证书和私钥已经被Git与Docker构建上下文排除，不能提交到仓库。

设置权限并校验域名、有效期和密钥配对：

```bash
chmod 600 certs/*/key.pem
chmod 644 certs/*/cert.pem
npm run certs:check
```

部署脚本也会在构建前自动执行相同校验。证书至少需要剩余7天有效期，否则部署会停止。

先检查配置能否解析：

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  config --quiet
```

构建阶段的 `ffmpeg-static` 会额外下载平台对应的FFmpeg二进制。生产Compose默认通过以下配置使用国内镜像，避免服务器无法访问GitHub Releases时长期停在 `RUN npm ci`：

```dotenv
FFMPEG_BINARIES_URL=https://cdn.npmmirror.com/binaries/ffmpeg-static
```

该值只在构建Web和后端镜像时使用，不会进入最终运行容器。需要切换到其他可信镜像时，只修改 `.env.production` 中的这个变量。Docker构建中的 `npm ci` 已关闭audit和fund请求，减少无关的外网访问。

确认DNS已经生效且三套证书已经放好后执行首次部署：

```bash
SKIP_GIT_PULL=1 ./scripts/deploy.sh
```

部署脚本会依次完成：

1. 校验Compose配置和三套HTTPS证书。
2. 构建带Git提交标签的前端和后端镜像。
3. 启动PostgreSQL、Redis和MinIO。
4. 在迁移前备份数据库。
5. 执行Drizzle迁移。
6. 更新Web、API、Worker和Caddy。
7. 检查数据库、Redis、存储和Worker心跳。

验证入口：

```text
https://qingzhuan.jason-ycx.top
https://qingzhuan-api.jason-ycx.top/api/v1/health
https://qingzhuan-api.jason-ycx.top/docs
```

健康接口必须返回 `status: ok` 和 `conversionEngine: enabled`。随后手动完成一次真实的上传、转换、单文件下载和批量ZIP下载。

## 对象存储地址

生产环境区分两个MinIO地址：

- `S3_ENDPOINT=http://minio:9000`：API和Worker在Docker网络内读写文件。
- `S3_PUBLIC_ENDPOINT=https://qingzhuan-files.jason-ycx.top`：生成浏览器可访问的签名上传和下载地址。

签名URL不能使用 `minio:9000`，因为该名称只能在Docker网络中解析。MinIO存储桶保持私有，公网访问必须携带有效签名。

## 日常更新

服务器手动更新只需要：

```bash
cd /opt/qingzhuan
./scripts/deploy.sh
```

脚本拒绝覆盖服务器上的已跟踪改动，通过 `git pull --ff-only` 拉取代码，只重新构建和更新Web、API、Worker；PostgreSQL、Redis和MinIO数据卷不会删除。Worker预留210秒优雅退出时间，覆盖当前180秒转换超时。

不要执行以下命令：

```bash
docker compose down -v
docker volume prune
```

它们可能删除生产数据卷。

## 每三个月替换证书

在腾讯云重新申请三个域名的证书后：

1. 将新bundle/fullchain证书和私钥复制到对应目录，保持文件名为 `cert.pem`、`key.pem`。
2. 执行 `npm run certs:check`，确认域名、有效期和密钥完全匹配。
3. 执行 `npm run certs:reload`，Caddy会先验证完整配置，再热重载三套证书。
4. 分别用浏览器检查三个HTTPS域名的证书有效期。

```bash
cd /opt/qingzhuan
npm run certs:check
npm run certs:reload
```

热重载不会重启前端、API、Worker、PostgreSQL、Redis或MinIO；校验失败时仍继续使用旧证书和旧配置。

## GitHub手动发布

`.github/workflows/deploy-production.yml` 提供“先测试、后SSH部署”的手动工作流。首次使用前，在GitHub的 `production` Environment中配置：

```text
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_PORT
PRODUCTION_SSH_PRIVATE_KEY
PRODUCTION_SSH_KNOWN_HOSTS
```

- `PRODUCTION_SSH_PRIVATE_KEY`：GitHub Actions登录服务器使用的专用私钥。
- `PRODUCTION_SSH_KNOWN_HOSTS`：提前在可信网络执行 `ssh-keyscan -H 服务器地址` 得到的主机指纹。
- 服务器还需要配置仓库只读Deploy Key，使 `git pull` 可以读取私有仓库。

配置完成后，在GitHub Actions中手动运行 `Deploy production`。工作流只有在 `npm run lint` 和 `npm test` 全部通过后才会连接服务器执行部署。默认不在推送main时自动上线，避免服务器尚未准备好时误部署。

## 日志和状态

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs -f web api worker
docker compose --env-file .env.production -f compose.production.yaml logs -f caddy
```

容器日志限制为每个文件10MB、最多5个文件，防止长期运行占满磁盘。仍需监控服务器磁盘、内存、CPU以及 `/api/v1/health`。

## 备份与恢复

手动备份PostgreSQL：

```bash
./scripts/backup.sh
```

备份默认保存在 `backups/`，权限仅限当前用户。至少再同步一份到服务器以外的位置；只保存在同一块磁盘不能应对整机故障。

确认恢复某个备份：

```bash
CONFIRM_RESTORE=yes ./scripts/restore.sh backups/qingzhuan-时间.dump
```

恢复期间API和Worker会停止，完成后重新启动并执行健康检查。建议在正式恢复前先在测试环境验证备份可用。

## 应用回滚

部署脚本保留当前和上一个Git提交标签。新版本异常时运行：

```bash
./scripts/rollback.sh
```

也可以指定本机仍然存在的镜像标签：

```bash
./scripts/rollback.sh 0123456789ab
```

回滚脚本只切换Web、API和Worker镜像，不自动回滚数据库结构。因此数据库迁移必须优先采用向后兼容的新增字段、先扩展后收缩策略。

## 数据位置和清理

生产Compose使用以下Docker数据卷：

```text
caddy-data
caddy-config
postgres-data
redis-data
minio-data
```

原始上传、转换结果和ZIP仍只保留2小时，由Worker启动时及每10分钟清理。数据库任务记录继续保留，用于向用户说明文件已经过期。
