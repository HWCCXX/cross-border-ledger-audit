(function () {
  "use strict";

  let data = window.DEMO_DATA;
  const audit = window.LedgerAudit;
  let summary = audit.computeSummary(data);
  let results = audit.runAudits(data, summary);
  let totals = summary.totals;
  let datasetMode = "demo";

  const costMeta = [
    { key: "ads", label: "广告投放", color: "#ee7158", note: "平台广告发票" },
    { key: "firstMile", label: "头程物流", color: "#e6af48", note: "货代运费发票" },
    { key: "purchase", label: "采购成本", color: "#8ebdd0", note: "匿名采购发票" },
    { key: "fba", label: "FBA 尾程", color: "#8e82b4", note: "站点费用折算" },
    { key: "profit", label: "预留利润", color: "#dfff72", note: "确定性差额" }
  ];
  const siteColors = ["#2f746c", "#5e948d", "#8ebdd0", "#e6af48", "#ee7158"];

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.from((scope || document).querySelectorAll(selector)); }
  function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
  function money(value) { return audit.money(value); }
  function fullMoney(value) { return "¥" + audit.number(value); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char];
    });
  }

  function renderHeadline() {
    const pass = results.filter(function (item) { return item.status === "pass"; }).length;
    const review = results.length - pass;
    const passRate = results.length ? pass / results.length : 0;
    setText("#hero-pass", pass);
    setText("#hero-docs", totals.documentCount + " 份");
    setText("#hero-review", review + " 项");
    setText("#nav-count", results.length);
    setText("#kpi-revenue", money(totals.revenue));
    setText("#kpi-profit", money(totals.profit));
    setText("#kpi-margin", "利润率 " + audit.percent(totals.margin));
    setText("#kpi-sites", totals.siteCount + " 个");
    setText("#kpi-documents", totals.documentCount + " 份");
    setText("#cost-revenue", money(totals.revenue));
    setText("#audit-rate", audit.percent(passRate));
    setText("#audit-summary", pass + " 条通过 · " + review + " 条待复核");
    setText("#growth-rate", "+" + audit.percent((summary.rows.at(-1).revenue / summary.rows[0].revenue) - 1));
    setText("#period-value", data.meta && data.meta.period || "—");
    setText("#dataset-mode-label", datasetMode === "demo" ? "内置基准" : (datasetMode === "simulation" ? "模拟异常" : "本地导入"));
    if (datasetMode === "demo") {
      setText("#ribbon-title", "合成数据演示");
      setText("#ribbon-text", "全部金额与业务关系均为程序生成，不代表真实企业");
      document.title = "跨境账证侦探｜合成数据演示";
    } else if (datasetMode === "simulation") {
      setText("#ribbon-title", "模拟异常模式");
      setText("#ribbon-text", "当前结果含明确注入的实验异常，原始导入文件未被修改");
      document.title = "跨境账证侦探｜模拟异常";
    } else {
      setText("#ribbon-title", "本地数据模式");
      setText("#ribbon-text", "文件仅在当前浏览器内存中处理，不会上传服务器");
      document.title = "跨境账证侦探｜本地核验";
    }
    $("#score-orbit").style.setProperty("--score", (passRate * 100) + "%");
  }

  function renderTrendChart() {
    const rows = summary.rows;
    const width = 820;
    const height = 260;
    const left = 45;
    const right = 18;
    const top = 24;
    const bottom = 38;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const max = Math.max.apply(null, rows.map(function (row) { return row.revenue; })) * 1.08;
    const slot = plotWidth / rows.length;
    const barWidth = Math.min(36, slot * .48);
    const y = function (value) { return top + plotHeight - (value / max) * plotHeight; };

    const grid = [0, .25, .5, .75, 1].map(function (ratio) {
      const gy = top + plotHeight * ratio;
      const value = max * (1 - ratio);
      return '<line class="chart-grid" x1="' + left + '" y1="' + gy + '" x2="' + (width - right) + '" y2="' + gy + '"></line>' +
        '<text class="chart-label" x="0" y="' + (gy + 4) + '">' + (value / 10000).toFixed(0) + '万</text>';
    }).join("");

    const bars = rows.map(function (row, index) {
      const x = left + slot * index + (slot - barWidth) / 2;
      const barY = y(row.revenue);
      return '<g><rect class="chart-bar" x="' + x + '" y="' + barY + '" width="' + barWidth + '" height="' + (top + plotHeight - barY) + '" rx="6">' +
        '<title>' + escapeHtml(row.month) + ' 销售收入 ' + fullMoney(row.revenue) + '</title></rect>' +
        '<text class="chart-label" x="' + (x + barWidth / 2) + '" y="' + (height - 14) + '" text-anchor="middle">' + Number(row.month.slice(5)) + '月</text></g>';
    }).join("");

    const points = rows.map(function (row, index) {
      return [left + slot * index + slot / 2, y(row.profit)];
    });
    const path = points.map(function (point, index) { return (index ? "L" : "M") + point[0] + " " + point[1]; }).join(" ");
    const dots = points.map(function (point, index) {
      return '<circle class="chart-profit-dot" cx="' + point[0] + '" cy="' + point[1] + '" r="4"><title>' +
        escapeHtml(rows[index].month) + ' 预留利润 ' + fullMoney(rows[index].profit) + '</title></circle>';
    }).join("");

    $("#trend-chart").innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="销售收入柱状图与预留利润折线图">' +
      grid + bars + '<path class="chart-profit-line" d="' + path + '"></path>' + dots + '</svg>';
  }

  function renderSites() {
    let cursor = 0;
    const stops = data.sites.map(function (site, index) {
      const start = cursor;
      cursor += site.share * 100;
      return siteColors[index % siteColors.length] + " " + start + "% " + cursor + "%";
    });
    $("#site-donut").style.background = "conic-gradient(" + stops.join(",") + ")";
    $("#site-list").innerHTML = data.sites.map(function (site, index) {
      return '<div class="site-item" style="--site-color:' + siteColors[index % siteColors.length] + '">' +
        '<div class="site-item-head"><span><b>' + escapeHtml(site.label) + '</b>' + escapeHtml(site.currency) + '</span>' +
        '<strong>' + money(site.revenue) + ' · ' + audit.percent(site.share) + '</strong></div>' +
        '<div class="mini-track"><i style="width:' + (site.share * 100) + '%"></i></div></div>';
    }).join("");
  }

  function renderCosts() {
    $("#stacked-bar").innerHTML = costMeta.map(function (item) {
      const share = totals[item.key] / totals.revenue;
      return '<button class="stack-segment" type="button" data-cost="' + item.key + '" style="width:' + (share * 100) + '%;--share:' + (share * 100) + ';background:' + item.color + '">' +
        '<span><b>' + audit.percent(share) + '</b><small>' + escapeHtml(item.label) + '</small></span></button>';
    }).join("");

    $("#cost-list").innerHTML = costMeta.map(function (item, index) {
      const share = totals[item.key] / totals.revenue;
      return '<button class="cost-item' + (index === 0 ? ' is-selected' : '') + '" type="button" data-cost="' + item.key + '" style="--cost-color:' + item.color + '">' +
        '<span><i></i>' + escapeHtml(item.label) + ' · ' + audit.percent(share) + '</span>' +
        '<b>' + money(totals[item.key]) + '</b><small>' + escapeHtml(item.note) + '</small></button>';
    }).join("");

    $$('[data-cost]').forEach(function (button) {
      button.addEventListener("click", function () {
        const key = button.dataset.cost;
        $$(".cost-item").forEach(function (item) { item.classList.toggle("is-selected", item.dataset.cost === key); });
        const target = $('.cost-item[data-cost="' + key + '"]');
        if (target) target.focus({ preventScroll: true });
      });
    });

    $("#monthly-body").innerHTML = summary.rows.map(function (row) {
      const parts = row.ads + row.firstMile + row.purchase + row.fba + row.profit;
      const closed = Math.abs(parts - row.revenue) < .01;
      return '<tr><td>' + escapeHtml(row.month) + '</td><td><b>' + fullMoney(row.revenue) + '</b></td>' +
        '<td>' + fullMoney(row.ads) + '</td><td>' + fullMoney(row.firstMile) + '</td><td>' + fullMoney(row.purchase) + '</td>' +
        '<td>' + fullMoney(row.fba) + '</td><td>' + fullMoney(row.profit) + '</td><td><span class="row-pass">' + (closed ? '通过' : '复核') + '</span></td></tr>';
    }).join("");
  }

  function formatAuditValue(result, key) {
    const value = result[key];
    return result.id === "rate-closure" ? audit.percent(value) : fullMoney(value);
  }

  function renderAuditList(filter) {
    const visible = filter === "all" ? results : results.filter(function (result) { return result.status === filter; });
    $("#audit-list").innerHTML = visible.length ? visible.map(function (result) {
      const delta = result.id === "rate-closure" ? audit.percent(Math.abs(result.delta), 2) : fullMoney(Math.abs(result.delta));
      return '<button class="audit-item" type="button" data-audit-id="' + result.id + '" data-status="' + result.status + '">' +
        '<span class="audit-status">' + (result.status === "pass" ? '✓' : '!') + '</span>' +
        '<span class="audit-copy"><b>' + escapeHtml(result.title) + '</b><small>' + escapeHtml(result.description) + '</small></span>' +
        '<span class="audit-amounts"><b>' + formatAuditValue(result, "actual") + ' / ' + formatAuditValue(result, "expected") + '</b><small>差额 ' + delta + '</small></span>' +
        '<span class="audit-arrow">→</span></button>';
    }).join("") : '<div class="audit-empty">当前筛选下没有结果</div>';

    $$('[data-audit-id]').forEach(function (button) {
      button.addEventListener("click", function () { openEvidence(button.dataset.auditId); });
    });
  }

  function renderPeriodRules() {
    $("#period-rules").innerHTML = data.periodRules.map(function (rule) {
      return '<div class="period-rule"><b>' + escapeHtml(rule.label) + '<span>已识别</span></b><p>' + escapeHtml(rule.description) + '</p></div>';
    }).join("");
  }

  function openEvidence(auditId) {
    const result = results.find(function (item) { return item.id === auditId; });
    const evidence = audit.evidenceFor(data, auditId);
    if (!result) return;
    setText("#evidence-title", result.title);
    setText("#evidence-description", result.description);
    $("#calculation-box").innerHTML = '实算值&nbsp; ' + escapeHtml(formatAuditValue(result, "actual")) + '<br>' +
      '目标值&nbsp; ' + escapeHtml(formatAuditValue(result, "expected")) + '<br>' +
      '差&nbsp;&nbsp;额&nbsp; ' + escapeHtml(result.id === "rate-closure" ? audit.percent(result.delta, 2) : fullMoney(result.delta));
    $("#evidence-items").innerHTML = evidence.map(function (item) {
      return '<div class="evidence-card"><div><b>' + escapeHtml(item.label) + '</b><small>' + escapeHtml(item.coverage) + ' · ' + escapeHtml(item.publicRef) + '</small></div>' +
        '<span class="evidence-count">' + item.count + '</span></div>';
    }).join("");
    const dialog = $("#evidence-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function switchView(name, updateHash) {
    const known = ["overview", "costs", "audits", "workspace"];
    const target = known.includes(name) ? name : "overview";
    $$('[data-view-panel]').forEach(function (panel) {
      const active = panel.dataset.viewPanel === target;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    $$('[data-view]').forEach(function (button) { button.classList.toggle("is-active", button.dataset.view === target); });
    if (updateHash) history.replaceState(null, "", "#" + target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyDataset(nextData, mode) {
    data = nextData || window.DEMO_DATA;
    datasetMode = mode || (data.meta && data.meta.datasetType === "simulation" ? "simulation" : (data.meta && data.meta.datasetType === "local-import" ? "import" : "demo"));
    summary = audit.computeSummary(data);
    results = audit.runAudits(data, summary);
    totals = summary.totals;
    renderHeadline();
    renderTrendChart();
    renderSites();
    renderCosts();
    renderAuditList("all");
    renderPeriodRules();
    window.dispatchEvent(new CustomEvent("ledger:analysis-updated", { detail: { data: data, summary: summary, results: results, mode: datasetMode } }));
  }

  function bindInteractions() {
    $$('[data-view]').forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.view, true); });
    });
    $$('[data-jump]').forEach(function (button) {
      button.addEventListener("click", function () { switchView(button.dataset.jump, true); });
    });
    $("#method-button").addEventListener("click", function () { $("#method-strip").scrollIntoView({ behavior: "smooth", block: "center" }); });
    $$(".filter-button").forEach(function (button) {
      button.addEventListener("click", function () {
        $$(".filter-button").forEach(function (item) { item.classList.toggle("is-active", item === button); });
        renderAuditList(button.dataset.filter);
      });
    });
    $("#dialog-close").addEventListener("click", function () { $("#evidence-dialog").close(); });
    $("#evidence-dialog").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    window.addEventListener("hashchange", function () { switchView(location.hash.slice(1), false); });
  }

  renderHeadline();
  renderTrendChart();
  renderSites();
  renderCosts();
  renderAuditList("all");
  renderPeriodRules();
  bindInteractions();
  switchView(location.hash.slice(1) || "overview", false);
  window.LedgerApp = {
    applyDataset: applyDataset,
    reset: function () { applyDataset(window.DEMO_DATA, "demo"); },
    state: function () { return { data: data, summary: summary, results: results, totals: totals, mode: datasetMode }; },
    switchView: function (name) { switchView(name, true); }
  };
})();
