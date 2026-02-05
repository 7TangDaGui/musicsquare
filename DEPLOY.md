# MusicSquare 极简部署指南

本文档提供两种部署方案，请根据您的需求选择 **其中一种**。

---

## 方案一：免费极简部署 (GitHub Pages + Cloudflare)
**特点**：完全免费、不需要服务器、不需要安装命令行工具 (Node.js/Java)，直接在网页上点点点即可完成。
**架构**：前端 (GitHub Pages) + 后端 (Cloudflare Worker) + 数据库 (Cloudflare D1)。

### 第一步：后端部署 (Cloudflare)

1.  **准备账号**
    *   注册并登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。

2.  **创建数据库 (D1)**
    *   在 Cloudflare后台左侧菜单，点击 **Workers & Pages** -> **D1 SQL Database**。
    *   点击 **Create**，数据库名称填 `musicsquare_db`，点击 **Create**。
    *   创建成功后，点击进入数据库详情页，点击 **Console** (控制台) 标签。
    *   打开本地文件 `backend/schema.sql`，全选复制内容，粘贴到网页的控制台输入框中，点击 **Execute**。
    *   *(提示：看到 success 表示表结构创建成功)*

3.  **创建后端服务 (Worker)**
    *   点击左侧 **Workers & Pages** -> **Overview** -> **Create Application**。
    *   点击 **Create Worker** -> 名字随便填 (例如 `pikachu-music`) -> **Deploy**。
    *   点击 **Edit code** 进入在线编辑器。
    *   **重点**：打开本地 `backend/worker.js`，全选复制，**覆盖** 在线编辑器里的所有代码，点击右上角 **Save and Deploy**。

4.  **绑定数据库与变量**
    *   回到 Worker 的详情页 (Settings)。
    *   **绑定数据库**: 点击 **Settings** -> **Variables** -> 向下滚动到 **D1 Database Bindings** -> 点击 **Add binding**。
        *   Variable name 填: `DB` (必须是大写)
        *   D1 database 选择: `musicsquare_db`
    *   **设置密钥**: 向上滚动到 **Environment Variables** -> 点击 **Add variable**。
        *   Variable name 填: `TUNEHUB_API_KEY`
        *   Value 填: 您的 TuneHub API Key (前往 https://tunehub.sayqz.com 获取)
    *   **最后**: 点击 **Deploy** (或 Save and Deploy) 确保设置生效。

5.  **获取后端地址**
    *   在 Worker 详情页顶部，找到 **Preview** 下方的链接 (例如 `https://pikachu-music.xxx.workers.dev`)。
    *   复制这个链接，这就是您的**后端 API 地址**。
    *   *(如果不绑定自定义域名，该地址在国内可能无法访问，请参考下方进阶部分)*

### 进阶：解决国内无法访问问题 (绑定自定义域名)

由于 `*.workers.dev` 域名在国内部分地区被阻断，强烈建议绑定自定义域名。

1.  **获取免费/付费域名**
    *   推荐使用 **[帝恩社 (dnshe.com)](https://my.dnshe.com/index.php?m=domain_hub)** 获取免费二级域名。
    *   **邀请码**: `HCC427FA1A`
    *   注册并登录后，搜索想要的域名并“购买” (有免费选项)。

2.  **接入 Cloudflare**
    *   在 Cloudflare Dashboard 点击 **Add a site**。
    *   输入您刚申请的域名。
    *   **关键步骤**：Cloudflare 会给您两个 Nameserver (NS) 地址 (例如 `bob.ns.cloudflare.com`)。
    *   回到域名注册商 (如帝恩社) 的控制台，找到 **修改 DNS/Nameserver** 的地方，将原来的 NS 替换为 Cloudflare 提供的这两个。

3.  **绑定 Worker**
    *   回到 Cloudflare 的 **Workers & Pages** -> 选择您的 Worker (如 `pikachu-music`)。
    *   点击 **Settings** -> **Triggers**。
    *   在 **Custom Domains** 区域，点击 **Add Custom Domain**。
    *   输入您刚才接入的域名 (例如 `api.yourname.dnshe.net`)，点击 **Add Custom Domain**。
    *   等待几分钟生效。现在，`https://api.yourname.dnshe.net` 就是您的**新后端 API 地址**！请用这个地址替换 `js/service.js` 中的配置。

### 第二步：前端部署 (GitHub Pages)

1.  **修改配置**
    *   打开本地 `js/service.js`。
    *   修改 `API_BASE` 为上一步获取的 `https://.../api` (注意要在末尾加上 `/api`)。

2.  **上传代码**
    *   将整个项目上传到您的 GitHub 仓库。

3.  **开启 Pages**
    *   在 GitHub 仓库 -> Settings -> Pages。
    *   Source 选择 `Deploy from a branch`，Branch 选择 `main` (或 master) -> `/ (root)` -> Save。
    *   等待几分钟，GitHub 会给您一个访问链接，部署完成！

---

## 方案二：云服务器部署 (Windows/Linux)
**特点**：数据私有、性能更强、适合有云服务器 (VPS) 的用户。
**架构**：Java 后端 + MySQL 数据库。

### 第一步：环境与代码获取

1.  **安装软件**: 确保服务器安装了 `Java 17+` (JDK), `MySQL 8.0+`, `git`, `Maven`, `PM2`。
2.  **获取代码**:
    *   在服务器上拉取项目代码：
        ```bash
        cd /opt
        git clone https://github.com/7TangDaGui/musicsquare.git
        cd musicsquare
        ```
3.  **导入数据库**:
    *   登录 MySQL，创建一个名为 `musicsquare` 的数据库。
    *   导入 `backend/mysql_schema.sql` 文件。

### 第二步：后端部署 (Java)

1.  **修改配置**:
    *   打开 `java-backend/src/main/resources/application.yml`。
    *   修改数据库密码 (`password`)。
    *   确认端口配置为 `3459` (默认已配置)。

2.  **打包运行**:
    *   在 `java-backend` 目录执行打包 (Maven): `mvn clean package`。
    *   得到 `target/music-backend-1.0.0.jar`。
    *   **使用 PM2 后台运行** (在 jar 包所在目录执行):
        ```bash
        pm2 start java --name "music-backend" -- -jar music-backend-1.0.0.jar --server.port=3459
        ```
    *   **常用 PM2 命令**:
        *   启动: `pm2 start java [...]` (见上)
        *   查看状态: `pm2 status`
        *   查看日志: `pm2 logs music-backend`
        *   重启服务: `pm2 restart music-backend`
        *   停止服务: `pm2 stop music-backend`
        *   设置开机自启: `pm2 startup` (根据提示执行命令) -> `pm2 save`

### 第三步：前端部署 (Nginx)

云服务器部署前端**必须**使用 Web 服务器。

1.  **修改前端配置**:
    *   在服务器上修改 `js/service.js`，将 `API_BASE` 改为 `http://服务器公网IP:3459/api`。

2.  **配置 Nginx (直接复制)**:
    *   编辑配置: `sudo nano /etc/nginx/sites-available/default`
    *   **清空原内容，粘贴以下配置**:
        ```nginx
        server {
            listen 80;
            server_name _; # 匹配所有域名和IP
            
            # 指向我们刚 Clone 下来的项目目录
            location / {
                root /opt/musicsquare;
                index index.html;
                try_files $uri $uri/ /index.html;
            }
        }
        ```
    *   重启生效: `sudo systemctl restart nginx`

3.  **大功告成**:
    *   现在打开浏览器，输入 `http://您的服务器IP` 即可访问完整应用！

---
> **常见问题**
> *   **端口不通？** 请检查云服务器的安全组/防火墙是否放行了 `3459` 端口。
> *   **混合部署？** 也可以使用 GitHub Pages 托管前端，连接到您的云服务器后端 (需配置后端跨域/Nginx)。
