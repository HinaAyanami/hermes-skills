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

## 3. 凭据红线

- 授权、一次性验证码、token、密码：一律让用户在自己浏览器里完成，绝不代填、绝不在对话里索取。
- 授权前先确认用户浏览器**已登录**目标账号，否则授权页会先要求登录，整个流程白跑一遗。

## 4. 用户不懂 Git 时的讲法

- 先用三句话给概念（仓库 = 云端的项目文件夹；上传 = 把本地这个文件夹推上去；本地已经是仓库了，只差认证），再给步骤，不要一上来抛术语。
- 给 2-3 条路线的对比表（要不要装东西 / 上手难度 / 以后更新成本 / 主要坑），并**明确推荐一条**，不要把选项摊开让用户自己猜。
- 推荐的那条要写到"点哪里、勾哪个框、选哪个绝对路径文件夹"，不留需要用户推断的环节。
- 主动点明哪几个文件/文件夹不要传（`.git\`、验证产物目录）以及原因。
- 下载/安装类操作先报实测 ETA，让用户知道要等多久；判断下载是否卡住看落盘字节，不看进程是否还活着。
