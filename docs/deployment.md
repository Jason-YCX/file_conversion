# 生产部署

本文档描述在一台已经运行Nginx的Linux服务器上部署轻转前端、API、转换 Worker、PostgreSQL、Redis和MinIO的流程。GitHub Actions负责构建应用镜像并推送腾讯云TCR，生产服务器只拉取镜像和运行容器；生产环境使用独立的 `compose.production.yaml`，不复用会向宿主机暴露基础设施端口的本地 `compose.yaml`。

## 部署结构

- 宿主机 `Nginx`：继续监听80/443并承载其他网站，同时读取三套腾讯云手动证书，将轻转的三个域名转发到回环端口。
- `web`：运行Vinext standalone前端，容器内监听3000，仅映射到宿主机 `127.0.0.1:13000`。
- `api`：运行NestJS API，容器内监听4000，仅映射到宿主机 `127.0.0.1:14000`。
- `worker`：与API使用同一个后端镜像，独立消费conversion和archive队列。
- `postgres`：持久化任务和归档记录。
- `redis`：仅承载BullMQ队列并开启AOF。
- `minio`：保存上传、转换结果和归档文件，API仅映射到宿主机 `127.0.0.1:19000`；控制台不开放宿主机端口。

生产环境只有宿主机Nginx直接暴露80、443。三个回环端口无法从公网访问，PostgreSQL、Redis、MinIO控制台也不映射宿主机端口。

## 服务器准备

公开服务仍建议从4核CPU、8GB内存、100GB SSD的Ubuntu LTS服务器起步。2核4GB服务器适合低并发起步，但必须由GitHub Actions完成镜像构建，生产转换与归档并发保持为1，并建议在宿主机配置2GB Swap。安装Git、curl、OpenSSL、Docker Engine和Docker Compose插件，并确认：

```bash
docker version
docker compose version
```

确认服务器现有Nginx配置正常：

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
```

首次部署前确认其他站点没有占用轻转的三个 `server_name`；没有输出表示尚未配置：

```bash
sudo nginx -T 2>/dev/null | grep -nE 'qingzhuan(-api|-files)?\.jason-ycx\.top' || true
```

防火墙只需开放SSH、HTTP和HTTPS TCP端口：

```text
22/tcp
80/tcp
443/tcp
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
sudo mkdir -p /usr/local/projects/file_conversion
sudo chown "$USER":"$USER" /usr/local/projects/file_conversion
git clone git@github.com:Jason-YCX/file_conversion.git /usr/local/projects/file_conversion
cd /usr/local/projects/file_conversion
```

创建生产环境文件：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`：

1. 确认前端、API和文件域名与当前DNS解析一致；如需换域名再修改。
2. 确认TCR配置为 `ccr.ccs.tencentyun.com/jason-docker`，Web和Backend仓库名称与控制台一致。
3. 为PostgreSQL、Redis和MinIO分别设置不同的随机密码。
4. 密码建议使用 `openssl rand -hex 24` 生成，避免URL中需要额外编码的特殊字符。

默认回环端口如下；仅当服务器已有进程占用这些端口时才修改，并让部署脚本重新生成Nginx配置：

```text
WEB_HOST_PORT=13000
API_HOST_PORT=14000
MINIO_HOST_PORT=19000
```

服务器需要登录TCR才能拉取私有镜像：

```bash
docker login --username 你的TCR用户名 ccr.ccs.tencentyun.com
```

输入TCR访问密码并确认出现 `Login Succeeded`。该凭据只用于服务器拉取镜像，不要写入仓库或 `.env.production`。

## 腾讯云手动证书

宿主机Nginx不会为本项目申请ACME证书，生产环境需要提前放置三套腾讯云证书：

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

部署脚本也会在拉取应用镜像前自动执行相同校验。证书至少需要剩余7天有效期，否则部署会停止。

Nginx模板位于 `nginx/file-conversion.conf.template`。`npm run nginx:install` 会读取 `.env.production` 和当前项目绝对路径，生成 `/etc/nginx/sites-available/file-conversion.conf`，创建 `sites-enabled` 软链接，运行 `nginx -t` 并热重载。它只管理这一份站点文件，不修改其他网站；若校验或重载失败，会恢复此前的同名配置。GitHub Actions使用的 `PRODUCTION_USER` 必须是root，或对Nginx测试、站点文件写入和 `systemctl reload nginx` 配置免密sudo；当前使用root部署时无需额外配置。

先检查配置能否解析：

```bash
APP_VERSION="$(git rev-parse HEAD)" docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  config --quiet
```

生产服务器不再执行Docker构建。GitHub Actions在 `linux/amd64` Runner中使用 `Dockerfile.web` 和 `Dockerfile.backend` 构建两个镜像，并以完整Git提交SHA推送：

```text
ccr.ccs.tencentyun.com/jason-docker/file-conversion-web:<完整Git SHA>
ccr.ccs.tencentyun.com/jason-docker/file-conversion-backend:<完整Git SHA>
```

API、Worker和数据库迁移共用Backend镜像。GitHub构建阶段通过npmmirror下载 `ffmpeg-static` 二进制，并使用Buildx缓存加速后续发布；该下载地址不会进入最终运行容器环境。

确认DNS、TCR登录、生产环境变量和三套证书全部准备好后，在GitHub仓库的Actions页面手动运行 `Deploy production`。如镜像已经由工作流成功推送，也可以在服务器补发指定SHA：

```bash
APP_VERSION=完整Git提交SHA SKIP_GIT_PULL=1 ./scripts/deploy.sh
```

部署脚本会依次完成：

1. 校验Compose配置和三套HTTPS证书。
2. 从TCR拉取工作流已经构建的前端和后端SHA镜像。
3. 启动PostgreSQL、Redis和MinIO。
4. 在迁移前备份数据库。
5. 执行Drizzle迁移。
6. 更新Web、API和Worker，并清理旧Caddy孤儿容器。
7. 安装或更新宿主机Nginx站点，校验后热重载Nginx。
8. 检查数据库、Redis、存储和Worker心跳。

从旧Caddy部署切换时不要停止宿主机Nginx。新版Compose已经没有Caddy服务，部署命令中的 `--remove-orphans` 会移除旧Caddy容器；其他网站和Nginx主进程不会受影响。

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

日常更新默认在GitHub Actions中手动运行 `Deploy production`。如果工作流已经完成镜像构建和推送，只需在服务器补发指定SHA：

```bash
cd /usr/local/projects/file_conversion
git pull --ff-only
APP_VERSION=完整Git提交SHA SKIP_GIT_PULL=1 ./scripts/deploy.sh
```

GitHub工作流拒绝部署服务器上的已跟踪改动，通过 `git pull --ff-only` 拉取配置，并核对服务器HEAD与本次构建SHA完全一致。部署脚本只拉取和更新Web、API、Worker；PostgreSQL、Redis和MinIO数据卷不会删除。Worker预留210秒优雅退出时间，覆盖当前180秒转换超时。

不要执行以下命令：

```bash
docker compose down -v
docker volume prune
docker system prune -a
```

它们可能删除生产数据卷。

## 每三个月替换证书

在腾讯云重新申请三个域名的证书后：

1. 将新bundle/fullchain证书和私钥复制到对应目录，保持文件名为 `cert.pem`、`key.pem`。
2. 执行 `npm run certs:check`，确认域名、有效期和密钥完全匹配。
3. 执行 `npm run certs:reload`，脚本会先运行 `nginx -t`，再热重载三套证书。
4. 分别用浏览器检查三个HTTPS域名的证书有效期。

```bash
cd /usr/local/projects/file_conversion
npm run certs:check
npm run certs:reload
```

热重载不会重启前端、API、Worker、PostgreSQL、Redis或MinIO；配置校验失败时Nginx不会重载。

## GitHub手动发布

`.github/workflows/deploy-production.yml` 提供“检查、构建推送、SSH部署”的手动工作流。首次使用前，在GitHub的 `production` Environment中配置Secrets：

```text
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_PORT
PRODUCTION_SSH_PRIVATE_KEY
PRODUCTION_SSH_KNOWN_HOSTS
TCR_USERNAME
TCR_PASSWORD
```

- `PRODUCTION_SSH_PRIVATE_KEY`：GitHub Actions登录服务器使用的专用私钥。
- `PRODUCTION_SSH_KNOWN_HOSTS`：提前在可信网络执行 `ssh-keyscan -H 服务器地址` 得到的主机指纹。
- `TCR_USERNAME`、`TCR_PASSWORD`：GitHub Runner登录TCR并推送私有镜像使用的凭据。
- 服务器还需要配置仓库只读Deploy Key，使 `git pull` 可以读取私有仓库。

同一Environment中配置Variables：

```text
TCR_REGISTRY=ccr.ccs.tencentyun.com
TCR_NAMESPACE=jason-docker
WEB_IMAGE=file-conversion-web
BACKEND_IMAGE=file-conversion-backend
DOCKER_PLATFORM=linux/amd64
PRODUCTION_API_BASE_URL=https://qingzhuan-api.jason-ycx.top/api/v1
PRODUCTION_PROJECT_DIR=/usr/local/projects/file_conversion
```

配置完成后，在GitHub Actions中手动运行 `Deploy production`。工作流始终先执行 `npm run lint` 和 `npm test`，然后读取服务器 `.deploy/current` 作为生产基线，并与本次Git SHA比较构建输入：

- 前端页面、资源、前端构建配置或 `Dockerfile.web` 变化时构建Web镜像。
- `apps/api` 或 `Dockerfile.backend` 变化时构建Backend镜像。
- 根 `package.json`、`package-lock.json`、`.dockerignore` 或发布工作流变化时构建两个镜像。
- 纯文档、Compose、Nginx或部署脚本变化时不重新构建应用镜像，但仍执行服务器部署以应用配置。

以后新增会进入生产镜像的顶层源码目录或构建配置时，必须同步加入工作流的 `web_paths` 或 `backend_paths`；现有前后端目录和依赖清单已经覆盖。

未变化的镜像不会缺少本次Git SHA标签：工作流使用TCR中当前生产镜像复制出本次SHA标签，不重新上传镜像层；如果生产SHA无效、不是本次提交的祖先、旧标签不存在或复制失败，会自动回退为重新构建对应镜像。首次发布会构建两个镜像。

如果修改了GitHub Environment中的 `PRODUCTION_API_BASE_URL`、`DOCKER_PLATFORM` 等不体现在源码差异里的构建变量，运行工作流时勾选 `force_rebuild`，强制重新构建两个镜像。无论是否构建镜像，最终仍连接服务器拉取相同SHA并部署；默认不在推送main时自动上线。

## 日志和状态

```bash
APP_VERSION="$(cat .deploy/current)" docker compose --env-file .env.production -f compose.production.yaml ps
APP_VERSION="$(cat .deploy/current)" docker compose --env-file .env.production -f compose.production.yaml logs -f web api worker
sudo journalctl -u nginx -f
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

部署脚本保留当前和上一个完整Git提交SHA。新版本异常时运行：

```bash
./scripts/rollback.sh
```

也可以指定TCR中仍然存在的完整Git提交SHA：

```bash
./scripts/rollback.sh 0123456789abcdef0123456789abcdef01234567
```

回滚脚本先从TCR拉取目标SHA，因此本机旧镜像被清理后仍可回滚。它只切换Web、API和Worker镜像，不自动回滚数据库结构；数据库迁移必须优先采用向后兼容的新增字段、先扩展后收缩策略。首次从旧的服务器构建方式切换到TCR时没有可用的上一版TCR镜像，完成第二次TCR发布后才会形成自动回滚目标。

## 数据位置和清理

生产Compose使用以下Docker数据卷：

```text
postgres-data
redis-data
minio-data
```

从旧版切换后，历史 `caddy-data`、`caddy-config` 卷可能暂时保留，但不会再挂载；确认新站点稳定后可以仅删除这两个旧卷，不要执行会批量清理数据卷的命令。

原始上传、转换结果和ZIP仍只保留2小时，由Worker启动时及每10分钟清理。数据库任务记录继续保留，用于向用户说明文件已经过期。

每次成功部署或回滚后，`scripts/cleanup-images.sh` 会删除本机更旧的Web和Backend镜像，只保留 `.deploy/current` 与 `.deploy/previous` 对应的两个版本，并清理悬空镜像层。也可以手动运行：

```bash
npm run cleanup:prod
```

该脚本不会删除TCR远程标签、数据库卷、Redis卷或MinIO卷。TCR个人版建议在控制台保留最近10至20个SHA版本，再手动删除更旧标签，避免给GitHub Actions授予远程删除权限。
