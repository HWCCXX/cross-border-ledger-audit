(function () {
  "use strict";

  const api = window.LedgerAudit;
  const app = window.LedgerApp;
  let importResult = null;
  let importedDataset = null;
  let analysisDataset = window.DEMO_DATA;
  let issues = [];
  let fileListExpanded = false;

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.from((scope || document).querySelectorAll(selector)); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char];
    });
  }
  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
    return bytes + " B";
  }
  function basename(path) { return String(path || "").split(/[\\/]/).pop(); }
  function statusLabel(status) { return status === "pass" ? "通过" : (status === "review" ? "待复核" : "未测试"); }

  function setWorkspaceStatus(message, state) {
    const node = $("#workspace-status");
    node.textContent = message;
    node.dataset.state = state || "idle";
  }

  function renderFiles(result) {
    const roleLabels = { "monthly-cost": "月度成本", "site-sales": "站点销售", "ad-ledger": "广告台账", "freight-ledger": "头程清单", "purchase-ledger": "采购清单", "quarterly-cost": "季度汇总", "unknown-table": "待映射" };
    const tableMap = result.tables.reduce(function (map, table) {
      map[table.name] = map[table.name] || [];
      map[table.name].push(table);
      return map;
    }, {});
    const visibleFiles = fileListExpanded ? result.files : result.files.slice(0, 18);
    $("#file-list").innerHTML = visibleFiles.map(function (file) {
      const tables = tableMap[file.name] || [];
      const description = file.kind === "pdf" ? "PDF 已索引，正文按需读取" : (tables.length ? tables.map(function (table) { return (table.sheet ? table.sheet + " · " : "") + (roleLabels[table.role] || table.role) + " · " + table.rows.length + " 行"; }).join("；") : "已读取");
      return '<div class="import-file"><span class="file-type">' + escapeHtml(file.kind.toUpperCase()) + '</span><div><b>' + escapeHtml(basename(file.name)) + '</b><small>' + escapeHtml(description) + '</small></div><em>' + escapeHtml(formatBytes(file.size)) + '</em></div>';
    }).join("") + (result.files.length > 18 ? '<button class="file-list-toggle" id="file-list-toggle" type="button">' + (fileListExpanded ? "收起文件列表" : "展开全部 " + result.files.length + " 个文件") + '</button>' : "");
    const toggle = $("#file-list-toggle");
    if (toggle) toggle.addEventListener("click", function () { fileListExpanded = !fileListExpanded; renderFiles(result); });
    $("#file-summary").textContent = result.files.length + " 个文件 · " + result.tables.length + " 张结构化表 · " + result.files.filter(function (file) { return file.kind === "pdf"; }).length + " 份 PDF 索引";
    const warningBox = $("#import-warnings");
    warningBox.hidden = !result.warnings.length;
    warningBox.innerHTML = result.warnings.map(function (warning) { return "<li>" + escapeHtml(warning) + "</li>"; }).join("");
  }

  function renderEvidenceLibrary(data) {
    const runtimeFiles = data._runtime && data._runtime.files || [];
    $("#evidence-library").innerHTML = (data.evidence || []).map(function (item) {
      const firstFileId = item.files && item.files[0];
      const file = firstFileId && runtimeFiles.find(function (entry) { return entry.id === firstFileId; });
      return '<article class="evidence-library-item"><div><span>' + escapeHtml(item.count) + '</span><b>' + escapeHtml(item.label) + '</b><small>' + escapeHtml(item.coverage) + '</small></div>' +
        (file ? '<button type="button" data-pdf-id="' + escapeHtml(file.id) + '">查看样例原件 →</button>' : '<em>结构化行可下钻</em>') + '</article>';
    }).join("");
    $$('[data-pdf-id]').forEach(function (button) {
      button.addEventListener("click", function () { openPdf(button.dataset.pdfId, 1); });
    });
  }

  function renderIssues(data) {
    analysisDataset = data;
    const summary = api.computeSummary(data);
    issues = api.runAnomalyRules(data, summary);
    const review = issues.filter(function (item) { return item.status === "review"; }).length;
    const pass = issues.filter(function (item) { return item.status === "pass"; }).length;
    const notTested = issues.filter(function (item) { return item.status === "not-tested"; }).length;
    $("#rule-pass-count").textContent = pass;
    $("#rule-review-count").textContent = review;
    $("#rule-untested-count").textContent = notTested;
    $("#workspace-rule-count").textContent = issues.length;
    $("#issue-list").innerHTML = issues.map(function (issue) {
      const explanation = api.explainIssue(issue);
      return '<button class="issue-card" type="button" data-issue-id="' + escapeHtml(issue.id) + '" data-status="' + escapeHtml(issue.status) + '">' +
        '<span class="issue-status">' + (issue.status === "pass" ? "✓" : (issue.status === "review" ? "!" : "—")) + '</span>' +
        '<span class="issue-main"><b>' + escapeHtml(issue.title) + '</b><small>' + escapeHtml(issue.description) + '</small></span>' +
        '<span class="issue-action">' + escapeHtml(issue.status === "review" ? explanation.action : statusLabel(issue.status)) + '</span><span class="audit-arrow">→</span></button>';
    }).join("");
    $$('[data-issue-id]').forEach(function (button) {
      button.addEventListener("click", function () { openIssue(button.dataset.issueId); });
    });
    renderEvidenceLibrary(data);
    const banner = $("#simulation-banner");
    banner.hidden = !(data.meta && data.meta.datasetType === "simulation");
  }

  function openDialog(title, eyebrow, html) {
    $("#source-dialog-title").textContent = title;
    $("#source-dialog-kicker").textContent = eyebrow;
    $("#source-dialog-body").innerHTML = html;
    const dialog = $("#source-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function findPdfForEvidence(evidence) {
    const files = analysisDataset._runtime && analysisDataset._runtime.files || [];
    const expected = basename(evidence && evidence.file);
    if (!expected) return null;
    return files.find(function (file) { return file.kind === "pdf" && (basename(file.name) === expected || basename(file.name).includes(expected.replace(/\.(csv|xlsx|json)$/i, ""))); });
  }

  function openIssue(issueId) {
    const issue = issues.find(function (item) { return item.id === issueId; });
    if (!issue) return;
    const explanation = api.explainIssue(issue);
    const evidence = issue.evidence.length ? issue.evidence.map(function (item) {
      const pdf = findPdfForEvidence(item);
      return '<div class="source-row"><div><b>' + escapeHtml(basename(item.file || "未指定来源")) + '</b><small>' +
        (item.sheet ? "工作表 " + escapeHtml(item.sheet) + " · " : "") + (item.page ? "第 " + escapeHtml(item.page) + " 页 · " : "") +
        (item.row ? "第 " + escapeHtml(item.row) + " 行 · " : "") + escapeHtml(item.field || "") + '</small></div><span>' + escapeHtml(item.value == null ? "" : item.value) + '</span>' +
        (pdf ? '<button type="button" data-dialog-pdf="' + escapeHtml(pdf.id) + '">读 PDF</button>' : '') + '</div>';
    }).join("") : '<p class="source-empty">该规则当前没有可定位的原始行。导入对应明细或 PDF 后可继续下钻。</p>';
    openDialog(issue.title, "DETERMINISTIC EXPLANATION", '<div class="explain-grid"><section><span>可能原因</span><p>' + escapeHtml(explanation.cause) + '</p></section><section><span>影响</span><p>' + escapeHtml(explanation.impact) + '</p></section><section><span>建议动作</span><p>' + escapeHtml(explanation.action) + '</p></section><section><span>计算口径</span><p>' + escapeHtml(explanation.calculation) + '</p></section></div><h3>证据位置</h3><div class="source-list">' + evidence + '</div><p class="local-note">解释由固定规则模板生成；金额仍由确定性程序计算。</p>');
    $$('[data-dialog-pdf]').forEach(function (button) { button.addEventListener("click", function () { openPdf(button.dataset.dialogPdf, 1); }); });
  }

  async function openPdf(fileId, page) {
    const files = analysisDataset._runtime && analysisDataset._runtime.files || [];
    const file = files.find(function (entry) { return entry.id === fileId; });
    if (!file) return;
    openDialog(basename(file.name), "PDF EVIDENCE · LOCAL ONLY", '<div class="pdf-loading">正在本地读取 PDF 第 ' + page + ' 页…</div>');
    try {
      const inspected = await api.inspectPdf(file, page);
      const controls = '<div class="pdf-controls"><button type="button" data-pdf-page="' + (inspected.page - 1) + '"' + (inspected.page <= 1 ? ' disabled' : '') + '>← 上一页</button><span>第 ' + inspected.page + ' / ' + inspected.pages + ' 页</span><button type="button" data-pdf-page="' + (inspected.page + 1) + '"' + (inspected.page >= inspected.pages ? ' disabled' : '') + '>下一页 →</button></div>';
      $("#source-dialog-body").innerHTML = controls + '<div class="pdf-text">' + escapeHtml(inspected.text || "本页未提取到可读文字") + '</div><p class="local-note">正文只存在于当前浏览器内存，不会写入公开包或上传服务器。</p>';
      $$('[data-pdf-page]').forEach(function (button) { button.addEventListener("click", function () { openPdf(fileId, Number(button.dataset.pdfPage)); }); });
    } catch (error) {
      $("#source-dialog-body").innerHTML = '<div class="import-error">PDF 读取失败：' + escapeHtml(error.message) + '</div><p class="local-note">若直接双击 index.html 打开，请改用本地 HTTP 预览或部署地址；CSV/XLSX/ZIP 分析不受影响。</p>';
    }
  }

  async function processFiles(files) {
    const button = $("#choose-files-button");
    button.disabled = true;
    setWorkspaceStatus("正在读取本地文件…", "working");
    fileListExpanded = false;
    try {
      importResult = await api.importFiles(files, function (progress) {
        setWorkspaceStatus("正在解析 " + progress.current + "/" + progress.total + "：" + basename(progress.name), "working");
      });
      importedDataset = api.buildDatasetFromImport(importResult);
      renderFiles(importResult);
      renderIssues(importedDataset);
      app.applyDataset(importedDataset, "import");
      setWorkspaceStatus("解析完成：数据已应用到主看板", "success");
      $("#import-results").hidden = false;
      $("#analysis-results").hidden = false;
      app.switchView("workspace");
    } catch (error) {
      setWorkspaceStatus("读取失败：" + error.message, "error");
    } finally {
      button.disabled = false;
      $("#file-input").value = "";
    }
  }

  function bindWorkspace() {
    const input = $("#file-input");
    const zone = $("#drop-zone");
    $("#choose-files-button").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { if (input.files.length) processFiles(input.files); });
    ["dragenter", "dragover"].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) { event.preventDefault(); zone.classList.add("is-dragging"); });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      zone.addEventListener(eventName, function (event) { event.preventDefault(); zone.classList.remove("is-dragging"); });
    });
    zone.addEventListener("drop", function (event) { if (event.dataTransfer.files.length) processFiles(event.dataTransfer.files); });
    $("#run-simulation").addEventListener("click", function () {
      const base = importedDataset || window.DEMO_DATA;
      const simulated = api.simulateDataset(base, $("#simulation-scenario").value);
      renderIssues(simulated);
      app.applyDataset(simulated, "simulation");
      setWorkspaceStatus("模拟异常已应用；原始数据未修改", "simulation");
    });
    $("#restore-baseline").addEventListener("click", function () {
      const base = importedDataset || window.DEMO_DATA;
      renderIssues(base);
      app.applyDataset(base, importedDataset ? "import" : "demo");
      setWorkspaceStatus(importedDataset ? "已还原本地导入基准" : "已还原内置基准", "success");
    });
    $("#reset-demo").addEventListener("click", function () {
      importedDataset = null;
      importResult = null;
      analysisDataset = window.DEMO_DATA;
      app.reset();
      renderIssues(window.DEMO_DATA);
      $("#import-results").hidden = true;
      setWorkspaceStatus("当前使用内置合成基准", "idle");
    });
    $("#source-dialog-close").addEventListener("click", function () { $("#source-dialog").close(); });
    $("#source-dialog").addEventListener("click", function (event) { if (event.target === event.currentTarget) event.currentTarget.close(); });
  }

  bindWorkspace();
  renderIssues(window.DEMO_DATA);
})();
