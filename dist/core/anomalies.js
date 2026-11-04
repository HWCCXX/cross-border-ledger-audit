(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};
  const EPSILON = 1;

  function result(id, title, status, severity, description, evidence, metrics) {
    return Object.assign({ id: id, title: title, status: status, severity: severity, description: description, evidence: evidence || [] }, metrics || {});
  }

  function sourceForMonth(row, field) {
    return row && row._source ? [{ file: row._source.file, sheet: row._source.sheet, row: row._source.row, field: field, value: row[field] }] : [];
  }

  function tableByRole(data, role) {
    return data._runtime && data._runtime.tables && data._runtime.tables.find(function (table) { return table.role === role; });
  }

  function evidenceForTable(table, field, sampleRows) {
    if (!table) return [];
    const rows = (sampleRows || table.rows.slice(0, 3)).map(function (row) { return row._row; });
    return [{ file: table.name, sheet: table.sheet, row: rows.join(", "), field: field, value: table.rows.length + " 条记录" }];
  }

  function monthSequence(months) {
    if (!months.length) return [];
    const numeric = months.map(function (month) {
      const parts = String(month).split("-");
      return Number(parts[0]) * 12 + Number(parts[1]) - 1;
    }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!numeric.length) return [];
    const expected = [];
    for (let value = numeric[0]; value <= numeric[numeric.length - 1]; value += 1) {
      expected.push(Math.floor(value / 12) + "-" + String(value % 12 + 1).padStart(2, "0"));
    }
    return expected;
  }

  function dateNextMonthMatches(row) {
    const helpers = api.importHelpers;
    if (!helpers) return true;
    const month = Number(helpers.pick(row, ["归属月份", "月份", "month"]));
    const date = String(helpers.pick(row, ["开票日期", "日期"]) || "");
    const dateMatch = date.match(/^(20\d{2})-(\d{2})/);
    if (!month || !dateMatch) return true;
    const expectedMonth = month === 12 ? 1 : month + 1;
    return Number(dateMatch[2]) === expectedMonth;
  }

  api.runAnomalyRules = function runAnomalyRules(data, summary) {
    const rows = summary.rows;
    const totals = summary.totals;
    const issues = [];
    const monthCounts = rows.reduce(function (map, row) { map[row.month] = (map[row.month] || 0) + 1; return map; }, {});
    const duplicates = Object.keys(monthCounts).filter(function (month) { return monthCounts[month] > 1; });
    issues.push(result("duplicate-month", "月份唯一性", duplicates.length ? "review" : "pass", "high", duplicates.length ? "发现重复月份：" + duplicates.join("、") : "每个经营月份仅出现一次", duplicates.flatMap(function (month) { return rows.filter(function (row) { return row.month === month; }).flatMap(function (row) { return sourceForMonth(row, "month"); }); }), { actual: duplicates.length, expected: 0 }));

    const expectedMonths = monthSequence(rows.map(function (row) { return row.month; }));
    const actualMonths = new Set(rows.map(function (row) { return row.month; }));
    const missingMonths = expectedMonths.filter(function (month) { return !actualMonths.has(month); });
    issues.push(result("month-coverage", "月份连续性", missingMonths.length ? "review" : "pass", "medium", missingMonths.length ? "缺少月份：" + missingMonths.join("、") : "首月至末月期间连续", [], { actual: rows.length, expected: expectedMonths.length }));

    const amountFields = data.contract.amountFields || [];
    const invalidAmounts = [];
    rows.forEach(function (row) {
      amountFields.forEach(function (field) {
        if (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0) invalidAmounts.push({ row: row, field: field });
      });
    });
    issues.push(result("amount-validity", "金额有效性", invalidAmounts.length ? "review" : "pass", "high", invalidAmounts.length ? "存在空值、非数字或负金额" : "全部经营金额均为非负数字", invalidAmounts.slice(0, 10).flatMap(function (item) { return sourceForMonth(item.row, item.field); }), { actual: invalidAmounts.length, expected: 0 }));

    const unclosed = rows.filter(function (row) {
      return Math.abs(row.ads + row.firstMile + row.purchase + row.fba + row.profit - row.revenue) > EPSILON;
    });
    issues.push(result("monthly-closure", "月度经营结构闭合", unclosed.length ? "review" : "pass", "high", unclosed.length ? unclosed.length + " 个月的费用与利润未覆盖销售收入" : "每个月的费用与利润均覆盖销售收入", unclosed.flatMap(function (row) { return sourceForMonth(row, "revenue"); }), { actual: unclosed.length, expected: 0 }));

    const siteTotal = api.sum(data.sites, "revenue");
    const siteDelta = siteTotal - totals.revenue;
    issues.push(result("site-revenue", "站点与月度销售勾稽", Math.abs(siteDelta) > EPSILON ? "review" : "pass", "high", Math.abs(siteDelta) > EPSILON ? "站点收入与月度销售存在差额" : "站点收入合计与月度销售一致", data.sites.slice(0, 5).map(function (site) { return { file: site._source && site._source.file || "站点销售表", row: site._source && site._source.rows && site._source.rows.slice(0, 3).join(", "), field: "销售收入RMB", value: site.revenue }; }), { actual: siteTotal, expected: totals.revenue, delta: siteDelta }));

    const sourceRules = [
      ["source-ads", "广告费用来源", "ads", "ad-ledger", "计划RMB"],
      ["source-freight", "头程费用来源", "firstMile", "freight-ledger", "价税合计"],
      ["source-purchase", "采购费用来源", "purchase", "purchase-ledger", "不含税金额"],
      ["source-fba", "FBA 费用来源", "fba", "site-sales", "FBA尾程费用原币 × 汇率"]
    ];
    sourceRules.forEach(function (config) {
      const id = config[0], title = config[1], key = config[2], role = config[3], field = config[4];
      const expected = Number(data.sourceTotals[key]);
      const actual = Number(totals[key]);
      const delta = actual - expected;
      const table = tableByRole(data, role);
      issues.push(result(id, title, Math.abs(delta) > EPSILON ? "review" : "pass", "high", Math.abs(delta) > EPSILON ? title + "与经营结构存在差额" : title + "与经营结构一致", evidenceForTable(table, field), { actual: actual, expected: expected, delta: delta }));
    });

    const adTable = tableByRole(data, "ad-ledger");
    let periodMismatches = adTable ? adTable.rows.filter(function (row) { return !dateNextMonthMatches(row); }) : [];
    if (data._simulation && data._simulation.periodMismatch) periodMismatches = periodMismatches.concat([{ _row: "SIM-1" }]);
    const periodStatus = adTable || data._simulation ? (periodMismatches.length ? "review" : "pass") : "not-tested";
    issues.push(result("ad-period", "广告归属期与开票期", periodStatus, "medium", periodStatus === "not-tested" ? "未导入广告台账，无法验证次月开票规则" : (periodMismatches.length ? "发现归属月份与开票月份不符合次月规则" : "广告发票均在次月开具并归属上月"), evidenceForTable(adTable, "归属月份 / 开票日期", periodMismatches.slice(0, 5)), { actual: periodMismatches.length, expected: 0 }));

    const evidenceCounts = data.evidence.reduce(function (sum, item) { return sum + (item.key === "structured" ? 0 : Number(item.count || 0)); }, 0);
    issues.push(result("evidence-index", "证据索引完整性", evidenceCounts ? "pass" : "not-tested", "low", evidenceCounts ? "已建立 " + evidenceCounts + " 份账证索引" : "未导入 PDF 或明细台账，暂不能建立文件索引", [], { actual: evidenceCounts, expected: evidenceCounts }));

    return issues;
  };

  api.simulateDataset = function simulateDataset(source, scenario) {
    const runtime = source._runtime;
    const clone = JSON.parse(JSON.stringify(source, function (key, value) { return key === "_runtime" ? undefined : value; }));
    clone._runtime = runtime;
    clone.meta = Object.assign({}, clone.meta, { datasetType: "simulation", disclosure: "当前结果来自明确标注的模拟异常；原始导入数据未被修改。" });
    clone._simulation = { scenario: scenario, createdAt: new Date().toISOString(), periodMismatch: false };
    if (scenario === "ads-gap" || scenario === "combined") clone.sourceTotals.ads = Number(clone.sourceTotals.ads) - 120000;
    if (scenario === "duplicate-month" || scenario === "combined") {
      const base = clone.months[Math.min(6, clone.months.length - 1)];
      if (base) clone.months.push(Object.assign({}, base, { _source: { file: "SIMULATION", row: "复制 " + base.month }, _simulated: true }));
    }
    if (scenario === "period-shift" || scenario === "combined") clone._simulation.periodMismatch = true;
    return clone;
  };
})(typeof window !== "undefined" ? window : globalThis);

