# 三条发布路线与网络实测

## 路线对比

| 路线 | 要装什么 | 用户操作量 | 以后更新 | 什么时候选 |
|---|---|---|---|---|
| gh CLI + device flow | gh 免安装 zip（~15MB） | 浏览器输 8 位码 + Authorize | 一条命令，可顺带建仓库 | **默认推荐**：零安装、凭据不进对话、非交互终端也能用 |
| 网页拖拽上传 | 无 | 每个仓库都要重拖一次 | 最差 | 只有一次性上传、且不在意没有提交历史 |
| GitHub Desktop | 安装包常 200MB+ | 点鼠标最直观 | 一键 Push | 用户明确要长期图形化管理，且实测网速几分钟内能下完 |

网页拖拽的两个硬坑：网页上传**不受 `.gitignore` 保护**（验证产物目录得手动排除）；`.git` 目录传不上去，因此没有提交历史。

## gh 免安装 + device flow（推荐流程）

```bash
# 1) 取最新版并下载（慢网下后台跑 + 续传）
tag=$(curl -sL --max-time 30 https://api.github.com/repos/cli/cli/releases/latest \
      | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
curl -L -C - --retry 5 --retry-delay 3 -o "$LOCALAPPDATA/Temp/gh.zip" \
  "https://github.com/cli/cli/releases/download/v${tag}/gh_${tag}_windows_amd64.zip"

# 2) 解压到已在 PATH 里的用户目录（如 %LOCALAPPDATA%\hermes\bin），免管理员权限
gh --version

# 3) 授权：pty 后台跑，读到一次性 code 后交给用户去浏览器完成
gh auth login --hostname github.com --git-protocol https --web

# 4) 建仓库 + 推送（本地已 git init/commit 时一步到位）
gh repo create <repo-name> --public --source="<本地仓库绝对路径>" --push
```

- 授权成功后凭据落在 `%APPDATA%\GitHub CLI\hosts.yml`，gh 会接管后续 `git push`。
- 不要用静默安装参数绕过交互；授权必须由用户本人完成。
- 用户浏览器未登录时，授权页会先跳登录；先让他登录好再启动。

## 网络实测与等待纪律

- 测速必须落盘真实文件：git-bash 下 `-o /dev/null` 会让 curl 报 `client returned ERROR on write of N bytes`，而 `http_code` 仍显示 200，极易误判成"通了但慢"。
- 判断"能不能推"用 `git ls-remote`，不要用 `curl https://github.com`；两者会不一致。
- 估 ETA：`curl -r 0-2000000` 拉 2MB 取 `speed_download`，再乘总体积。
- 判断下载是否真卡住：看目标文件的落盘字节是否在增长，不看进程是否还活着 —— 包管理器可能长时间零落盘。
- 部分下载的文件保留，`-C -` 换个时间继续下。

## 代理

- 直连可用时不要套代理；需要时代理环境变量导出 `HTTP_PROXY` / `HTTPS_PROXY`。
- pip 从 GitHub 源码安装可能即便设了代理仍失败，改用 curl 预下载再本地安装。
