# 生产HTTPS证书目录

此目录只保留目录结构，真实证书和私钥不得提交到Git。腾讯云下载的证书建议选择Nginx/PEM格式，将包含完整证书链的文件和私钥复制并统一重命名为：

```text
certs/
├── qingzhuan/
│   ├── cert.pem  # qingzhuan.jason-ycx.top 完整证书链
│   └── key.pem   # 对应私钥
├── qingzhuan-api/
│   ├── cert.pem  # qingzhuan-api.jason-ycx.top 完整证书链
│   └── key.pem   # 对应私钥
└── qingzhuan-files/
    ├── cert.pem  # qingzhuan-files.jason-ycx.top 完整证书链
    └── key.pem   # 对应私钥
```

如果一张证书覆盖三个域名，可以将同一套 `cert.pem` 和 `key.pem` 分别复制到三个目录。证书文件可以来源于腾讯云的 `.crt` 文件，只要内容是PEM格式；`cert.pem` 应优先使用包含中间证书的bundle/fullchain文件。

服务器上建议限制私钥权限：

```bash
chmod 600 certs/*/key.pem
chmod 644 certs/*/cert.pem
```

放置或替换证书后先校验：

```bash
npm run certs:check
```

Caddy已经运行时，热重载新证书：

```bash
npm run certs:reload
```
