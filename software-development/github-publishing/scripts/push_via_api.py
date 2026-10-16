"""把本地仓库推送到 GitHub —— 只走 api.github.com 的 Git Data API 通道。

用途：`github.com:443` 被阻断（`Failed to connect to github.com port 443`）时的等价替代。
把 `git ls-files` 列出的每个文件（自动遵循 .gitignore）作为 blob 上传，自底向上组装 tree，
创建一次 commit，再把分支指过去。

用法：
    python scripts/push_via_api.py <本地仓库目录> [仓库名] [owner]

- 仓库名默认取本地目录名；owner 默认取 `gh api /user --jq .login`。
- token 由 `gh auth token` 取，绝不打印到 stdout。
- 首次推送时若远程仓库还不存在，先建：`gh api -X POST /user/repos -f name=<name> -F private=false`。
"""
import base64
import concurrent.futures as cf
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = 'https://api.github.com'
BRANCH = 'main'

if len(sys.argv) < 2:
    sys.exit(__doc__)
REPO_DIR = Path(sys.argv[1]).resolve()
REPO = sys.argv[2] if len(sys.argv) > 2 else REPO_DIR.name


def sh(*args):
    out = subprocess.run(list(args), capture_output=True, text=True, check=True)
    return out.stdout.strip()


OWNER = sys.argv[3] if len(sys.argv) > 3 else sh('gh', 'api', '/user', '--jq', '.login')
TOKEN = sh('gh', 'auth', 'token')
if not TOKEN:
    sys.exit('拿不到 token（gh auth token 返回空），先跑 gh auth login --web')


class Http404(Exception):
    """对象还不存在：空仓库时 GitHub 返回 404 或 409。"""


def api(path, data=None, method=None, retries=4):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(API + path, data=body, method=method or ('POST' if body else 'GET'))
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    if body:
        req.add_header('Content-Type', 'application/json')
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode() or '{}')
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            last = f'HTTP {e.code} {path}: {detail}'
            if e.code in (404, 409):        # 空仓库 / 分支不存在，交给调用方判断
                raise Http404(last)
            if e.code >= 500:               # 服务端错误重试
                time.sleep(2 + attempt * 2)
                continue
            raise
        except Exception as e:              # 连接类错误重试
            last = f'{type(e).__name__}: {e}'
            time.sleep(2 + attempt * 2)
    raise RuntimeError(f'重试 {retries} 次仍失败: {last}')


def local_files():
    out = subprocess.run(['git', 'ls-files', '-z'], cwd=str(REPO_DIR),
                         capture_output=True, text=True, check=True)
    return [f for f in out.stdout.split('\0') if f]


def commit_message():
    return subprocess.run(['git', 'log', '-1', '--pretty=%B'], cwd=str(REPO_DIR),
                          capture_output=True, text=True, check=True).stdout.strip()


def ensure_initialized():
    """完全空的仓库不能直接用 Git Data API（409），先用 Contents API 落一个文件激活它。

    注意必须用 PUT —— 该端点没有 POST 路由，POST 会得到 404。
    """
    try:
        ref = api(f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
        return ref['object']['sha'], BRANCH
    except Http404:
        seed = '.gitattributes'
        if not (REPO_DIR / seed).exists():
            seed = local_files()[0]
        content = base64.b64encode((REPO_DIR / seed).read_bytes()).decode()
        res = api(f'/repos/{OWNER}/{REPO}/contents/{seed}',
                  {'message': 'chore: initialize repository', 'content': content}, method='PUT')
        branch = api(f'/repos/{OWNER}/{REPO}')['default_branch']
        print(f'仓库为空，已建立初始提交 {res["commit"]["sha"][:7]}（分支 {branch}）')
        return res['commit']['sha'], branch


INIT_SHA, BRANCH = ensure_initialized()

files = local_files()
total = sum((REPO_DIR / f).stat().st_size for f in files)
print(f'待推送 {len(files)} 个文件，{total / 1024 / 1024:.2f}MB')


def upload(rel):
    raw = (REPO_DIR / rel).read_bytes()
    blob = api(f'/repos/{OWNER}/{REPO}/git/blobs',
               {'content': base64.b64encode(raw).decode(), 'encoding': 'base64'})
    return rel, blob['sha'], len(raw)


t0 = time.time()
shas = {}
with cf.ThreadPoolExecutor(max_workers=4) as ex:      # 并发上传；串行会慢 3-4 倍
    for i, (rel, sha, size) in enumerate(ex.map(upload, files), 1):
        shas[rel] = sha
        print(f'  [{i:2d}/{len(files)}] {rel}  ({size / 1024:.0f}KB)  {time.time() - t0:.0f}s', flush=True)

# 组织成嵌套目录结构
root = {}
for rel in files:
    node = root
    *dirs, name = rel.split('/')
    for d in dirs:
        node = node.setdefault(d, {})
    node[name] = {'type': 'blob', 'sha': shas[rel], 'mode': '100644'}


def build_tree(node):
    """自底向上建树：GitHub 不接受内联的嵌套 tree 数组（422），子目录要先建成 tree 再按 sha 引用。"""
    entries = []
    for name, v in node.items():
        if 'type' in v:
            entries.append({'path': name, 'mode': v['mode'], 'type': 'blob', 'sha': v['sha']})
        else:
            entries.append({'path': name, 'mode': '040000', 'type': 'tree', 'sha': build_tree(v)})
    entries.sort(key=lambda e: e['path'])
    return api(f'/repos/{OWNER}/{REPO}/git/trees', {'tree': entries})['sha']


ROOT_SHA = build_tree(root)
print('root tree:', ROOT_SHA)

me = api('/user')
actor = {'name': me.get('name') or me['login'],
         'email': f"{me['login']}@users.noreply.github.com",
         'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}

commit = api(f'/repos/{OWNER}/{REPO}/git/commits',
             {'message': commit_message(), 'tree': ROOT_SHA, 'parents': [INIT_SHA],
              'author': actor, 'committer': actor})
print('commit:', commit['sha'])

ref = api(f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
api(f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}', {'sha': commit['sha'], 'force': True}, method='PATCH')
print(f'分支 {BRANCH}: {ref["object"]["sha"][:7]} → {commit["sha"][:7]}')

print()
print('PUSH_OK')
print(f'https://github.com/{OWNER}/{REPO}/commit/{commit["sha"]}')
print(f'耗时 {time.time() - t0:.0f}s')
