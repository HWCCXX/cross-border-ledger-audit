(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};

  api.isTotalRow = function isTotalRow(row, labels) {
    const value = String(row.month ?? row["月份"] ?? "").trim().toLowerCase();
    return (labels || ["合计", "总计", "total"]).some(function (label) {
      return value === String(label).toLowerCase();
    });
  };

  api.normalizeMonths = function normalizeMonths(rows, contract) {
    const labels = contract && contract.totalRowLabels;
    return (rows || []).filter(function (row) {
      return !api.isTotalRow(row, labels);
    }).map(function (row) {
      const clean = { month: String(row.month) };
      (contract.amountFields || []).forEach(function (key) {
        const value = Number(row[key]);
        if (!Number.isFinite(value)) throw new Error("字段 " + key + " 不是有效数字");
        clean[key] = value;
      });
      return clean;
    });
  };
})(typeof window !== "undefined" ? window : globalThis);

