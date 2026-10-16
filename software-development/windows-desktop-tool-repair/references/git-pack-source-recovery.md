# 从残留的 .git pack 恢复丢失的源码

## 场景

源码目录被删得只剩构建残留：`.git/objects/pack/*.pack` + `*.idx` 还在，但 `HEAD`、`config`、`index` 都没了。这时 `git log` / `git cat-file` 在原目录里都不工作。

**不要修原仓库。** 另建一个空仓库，把 pack 挂进去即可。

## 步骤

```bash
R="$LOCALAPPDATA/Temp/recover"; rm -rf "$R"; mkdir -p "$R"; cd "$R"
git init -q .
mkdir -p .git/objects/pack
cp "<残留目录>/.git/objects/pack/"* .git/objects/pack/

# 1) 列出 pack 里所有对象（类型 + 大小 + sha）
git cat-file --batch-all-objects --batch-check

# 2) 从顶层 commit 拿到 tree sha
git cat-file -p <commit-sha>

# 3) 从 tree 读出文件名 → blob sha 的映射
git cat-file -p <tree-sha>

# 4) 逐个导出（文件名用 tree 里给的名字，不要猜）
git cat-file -p <blob-sha> > out/<filename>
```

## 要点

- `git verify-pack -v <idx>` 也能列对象，但 `cat-file --batch-all-objects --batch-check` 直接给出可用 sha，省一步。
- pack 往往来自浅克隆，只有一个 commit，**但树是完整的** —— 源码文件都在。
- 一个 pack 里可能同时有文本源码和一个明显的二进制资源（尺寸大很多的那个），二进制也照样导出。
- 导出后立刻搬到产物目录再分析；临时恢复仓库用完可以删。
- 如果连 pack 都没有，退回从 exe 提字符串（.NET 的是 UTF-16LE）来判断它原本做什么。
