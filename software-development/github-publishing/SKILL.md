---
name: github-publishing
description: "Publish a local repo to GitHub: route, auth, speed."
---

# 把本地仓库发布到 GitHub

触发：用户要"上传/发布到 GitHub"、问怎么上传，或本地仓库已建好只差推上去。

配套：内容怎么整理成仓库（隐私扫描、脚本参数化、元文件、提交）见 `github-repo-packaging`；本技能只管"怎么推上去 + 怎么跟不懂 Git 的用户讲"。

## 1. 先实测，再选路线（30 秒）

```bash
curl -sS -o "$LOCALAPPDATA/Temp/probe.bin" -w "%{http_code} %{speed_download}B/s\n" --max-time 15 https://github.com
git ls-remote https://github.com/git/git.git HEAD   # git 层能不能推，不只是网页能不能开
git config --get credential.helper                  # 凭据环境决定命令行推送是否可行
```

- 直连可用就**不要**套代理（套上反而连不上）；"代理常驻"也要实测端口是否在听。
- 凭据助手是 `helper-selector`、或未安装 Git Credential Manager 时，非交互终端里的 `git push` 会卡在要用户名密码 —— 改走 gh 的浏览器授权。

## 2. 选路线

默认 **gh CLI（免安装 zip ~15MB）+ device flow**：零安装、用户只需在浏览器输一次性 code 点授权、能顺带创建仓库。

其余两条（网页拖拽、GitHub Desktop）的对比、坑与完整命令见 [references/routes-and-auth.md](references/routes-and-auth.md)。

- 体积和速度**都要实测再承诺**：安装包体积常与直觉差一倍以上；先拉 2MB 测速算出 ETA，超过几分钟就换路线，不要让用户干等。
- 慢速下载：后台 + 完成通知 + `curl -C -` 续传；换路线时别删已下好的部分文件，续传还能用。

## 3. 当 git 端点被阻断：改走 Git Data API

**`github.com:443` 与 `api.github.com` 的封锁状态是分开的** —— 同一分钟内可能 `curl https://github.com` 超时 20s，而 `api.github.com/rate_limit` 返回 200/0.24s。
所以 `git push` 报 `Failed to connect to github.com port 443` 时**不要反复重试**，先体检再换通道。

```bash
# 体检（MSYS 下 -o /dev/null 会报 client returned ERROR on write，测不了速；写真实文件）
curl -m 12 -o "$LOCALAPPDATA/Temp/probe.bin" -w '%{http_code}\n' https://api.github.com/rate_limit
# 换通道：把每个文件作为 blob 上传 → 自底向上组装 tree → 建一次 commit → 分支指过去，等价于一次 push
python scripts/push_via_api.py <本地仓库目录> <仓库名>
# 建仓库也可以纯 API，完全不碰 git 端点
gh api -X POST /user/repos -f name=<name> -F private=false
```

三个坑（脚本里已处理，改脚本时别改回去）：

1. **空仓库不能直接用 Git Data API**（`409 Git Repository is empty`）：先用 Contents API `PUT /contents/<file>` 落一个文件激活仓库。**必须是 PUT —— 默认发 POST 得到 404 Not Found。**
2. **tree 不接受内联的嵌套结构**（`422 Unprocessable Entity`）：子目录要先递归 `POST /git/trees` 建成子树，再在父级以 `{path, mode:'040000', type:'tree', sha}` 引用，自底向上组装。
3. 走 API 推送后**远端与本地历史不一致**（远端是"初始化提交 + 内容提交"）：以后要用 `git push` 必须先 `git fetch && git reset --hard origin/main`。

收尾核对（不要只看脚本自报成功）：`gh api '/repos/{o}/{r}/git/trees/<branch>?recursive=1' --jq '.tree|map(select(.type=="blob"))|length'` 的数字要等于 `git ls-files | wc -l`；打标签用 `gh api -X PUT /repos/{o}/{r}/topics -f 'names[]=xxx'`。

## 4. 凭据红线

- 授权、一次性验证码、token、密码：一律让用户在自己浏览器里完成，绝不代填、绝不在对话里索取。
- 授权前先确认用户浏览器**已登录**目标账号，否则授权页会先要求登录，整个流程白跑一遗。

## 5. 用户不懂 Git 时的讲法

- 先用三句话给概念（仓库 = 云端的项目文件夹；上传 = 把本地这个文件夹推上去；本地已经是仓库了，只差认证），再给步骤，不要一上来抛术语。
- 给 2-3 条路线的对比表（要不要装东西 / 上手难度 / 以后更新成本 / 主要坑），并**明确推荐一条**，不要把选项摊开让用户自己猜。
- 推荐的那条要写到"点哪里、勾哪个框、选哪个绝对路径文件夹"，不留需要用户推断的环节。
- 主动点明哪几个文件/文件夹不要传（`.git\`、验证产物目录）以及原因。
- 下载/安装类操作先报实测 ETA，让用户知道要等多久；判断下载是否卡住看落盘字节，不看进程是否还活着。
