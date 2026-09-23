const styles = `
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f7fb; color: #14213d; }
  header { background: linear-gradient(135deg, #173b67, #276fbf); color: white; padding: 24px 40px; }
  header h1 { margin: 0 0 6px; font-size: 28px; }
  header p { margin: 0; opacity: .85; }
  main { max-width: 1050px; margin: 32px auto; padding: 0 24px; }
  .card { background: white; border: 1px solid #dce5f0; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(24, 55, 90, .08); margin-bottom: 24px; }
  .login { max-width: 460px; margin: 80px auto; }
  label { display: block; font-weight: 650; margin: 16px 0 6px; }
  input, button { width: 100%; padding: 11px 12px; border-radius: 8px; font: inherit; }
  input { border: 1px solid #b9c7d8; }
  button { margin-top: 18px; border: 0; background: #276fbf; color: white; font-weight: 700; cursor: pointer; }
  button:hover { background: #1d5d9f; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .badge { display: inline-block; padding: 5px 9px; border-radius: 999px; background: #e6f1ff; color: #155896; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 12px; border-bottom: 1px solid #e6edf5; text-align: left; }
  th { color: #4f6175; font-size: 13px; text-transform: uppercase; }
  .muted { color: #65758a; }
  .error { color: #b42318; min-height: 22px; margin-top: 12px; }
  .success { color: #157347; min-height: 22px; margin-top: 12px; }
  code { background: #eef3f8; padding: 2px 5px; border-radius: 4px; }
`;

export function loginPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CampusClaw 登录</title><style>${styles}</style></head>
<body>
  <main class="login">
    <section class="card">
      <h2>本班知识库检索</h2>
      <p class="muted">检索范围来自服务端登录会话，只返回当前班级材料，并显示来源。</p>
      <form id="search-form">
        <input id="search-query" name="query" placeholder="输入要检索的知识" required>
        <button type="submit">检索</button>
      </form>
      <div id="search-message" class="muted"></div>
      <div id="search-results"></div>
    </section>
    <section class="card">
      <h1>CampusClaw</h1>
      <p class="muted">班级教学材料管理系统</p>
      <form id="login-form">
        <label for="account">账号</label>
        <input id="account" name="accountIdentifier" autocomplete="username" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">登录</button>
        <div id="message" class="error" role="alert"></div>
      </form>
    </section>
  </main>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('message');
      message.textContent = '';
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          accountIdentifier: document.getElementById('account').value,
          password: document.getElementById('password').value
        })
      });
      if (!response.ok) {
        message.textContent = '账号或密码错误';
        return;
      }
      location.href = '/app/materials';
    });
  </script>
</body></html>`;
}

export function materialsPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CampusClaw 教师首页</title><style>${styles}</style></head>
<body>
  <header>
    <h1>CampusClaw 教学材料</h1>
    <p>教师首页 · 当前数据由服务端按班级强制隔离</p>
  </header>
  <main>
    <section class="card toolbar">
      <div>
        <strong id="identity">正在识别当前用户…</strong>
        <div class="muted">身份来自服务端 session，不采用请求中的 user_id、role 或 class_id。</div>
      </div>
      <span class="badge">已登录</span>
    </section>
    <section class="card">
      <h2>上传教学材料</h2>
      <p class="muted">仅支持非空 UTF-8 <code>.txt</code> 和 <code>.md</code> 文件。</p>
      <form id="upload-form">
        <input id="material-file" name="file" type="file" accept=".txt,.md" required>
        <button type="submit">上传并写入知识库</button>
        <div id="upload-message" class="success"></div>
      </form>
    </section>
    <section class="card">
      <div class="toolbar"><h2>本班材料</h2><button id="refresh" style="width:auto;margin:0">刷新列表</button></div>
      <table>
        <thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>班级</th><th>材料 ID</th></tr></thead>
        <tbody id="materials"><tr><td colspan="5" class="muted">正在加载…</td></tr></tbody>
      </table>
    </section>
  </main>
  <script>
    async function loadIdentity() {
      const response = await fetch('/api/session');
      if (response.status === 401) { location.href = '/login'; return; }
      const {user} = await response.json();
      document.getElementById('identity').textContent =
        '用户：' + user.userId + ' ｜ 角色：' + user.role + ' ｜ 班级：' + user.classId;
    }
    async function loadMaterials() {
      const response = await fetch('/api/materials');
      if (response.status === 401) { location.href = '/login'; return; }
      const {materials} = await response.json();
      document.getElementById('materials').innerHTML = materials.length
        ? materials.map(material => '<tr><td>' + material.original_filename + '</td><td>.' + material.file_type +
          '</td><td>' + material.size_bytes + ' bytes</td><td>' + material.class_id +
          '</td><td><code>' + material.id + '</code></td></tr>').join('')
        : '<tr><td colspan="5" class="muted">本班暂无材料</td></tr>';
    }
    document.getElementById('refresh').addEventListener('click', loadMaterials);
    document.getElementById('search-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const response = await fetch('/api/knowledge-search', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({query: document.getElementById('search-query').value})});
      const result = await response.json();
      const message = document.getElementById('search-message');
      const results = document.getElementById('search-results');
      if (!response.ok) { message.textContent = result.error || '检索失败'; results.innerHTML = ''; return; }
      message.textContent = '检索模式：' + result.retrievalMode;
      results.innerHTML = result.results.length ? result.results.map(item => '<article><strong><a href="/api/materials/' + encodeURIComponent(item.source.materialId) + '">' + item.source.originalFilename + '</a></strong> · 序号 ' + item.source.sequenceNumber + '<p>' + item.excerpt + '</p><small>entry=' + item.source.knowledgeEntryId + ' · material=' + item.source.materialId + ' · rank=' + item.rank + ' · combined=' + item.scores.combined + '</small></article>').join('') : '<p class="muted">没有找到本班匹配内容。</p>';
    });
    document.getElementById('upload-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData();
      data.append('file', document.getElementById('material-file').files[0]);
      const response = await fetch('/api/materials', {method: 'POST', body: data});
      const result = await response.json();
      const message = document.getElementById('upload-message');
      message.className = response.ok ? 'success' : 'error';
      message.textContent = response.ok ? '上传成功，材料已写入知识库。' : (result.error || '上传失败');
      if (response.ok) await loadMaterials();
    });
    loadIdentity();
    loadMaterials();
  </script>
</body></html>`;
}
