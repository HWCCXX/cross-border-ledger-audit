(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};

  api.sum = function sum(rows, key) {
    return (rows || []).reduce(function (total, row) { return total + Number(row[key] || 0); }, 0);
  };

  api.computeSummary = function computeSummary(data) {
    const rows = api.normalizeMonths(data.months, data.contract);
    const fields = data.contract.amountFields;
    const totals = {};
    fields.forEach(function (key) { totals[key] = api.sum(rows, key); });
    totals.margin = totals.revenue ? totals.profit / totals.revenue : 0;
    totals.siteCount = data.sites.length;
    totals.documentCount = data.evidence
      .filter(function (item) { return item.key !== "structured"; })
      .reduce(function (sum, item) { return sum + item.count; }, 0);
    return { rows: rows, totals: totals };
  };

  api.money = function money(value) {
    if (Math.abs(value) >= 10000000) return "¥" + (value / 10000000).toFixed(1) + "千万";
    if (Math.abs(value) >= 10000) return "¥" + (value / 10000).toFixed(value % 10000 === 0 ? 0 : 1) + "万";
    return "¥" + Number(value).toLocaleString("zh-CN");
  };

  api.number = function number(value) {
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  };

  api.percent = function percent(value, digits) {
    return (Number(value) * 100).toFixed(digits == null ? 0 : digits) + "%";
  };
})(typeof window !== "undefined" ? window : globalThis);

