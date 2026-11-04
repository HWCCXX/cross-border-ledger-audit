"use strict";

const path = require("path");
const root = path.resolve(__dirname, "..", "dist");

require(path.join(root, "data", "demo-public.js"));
require(path.join(root, "core", "normalize.js"));
require(path.join(root, "core", "calculate.js"));
require(path.join(root, "core", "reconcile.js"));
require(path.join(root, "core", "evidence.js"));
require(path.join(root, "core", "anomalies.js"));
require(path.join(root, "core", "explain.js"));

const data = globalThis.DEMO_DATA;
const api = globalThis.LedgerAudit;
const summary = api.computeSummary(data);
const audits = api.runAudits(data, summary);
const anomalyRules = api.runAnomalyRules(data, summary);
let passed = 0;

function assert(name, condition, detail) {
  if (!condition) {
    console.error("✗ " + name + (detail ? " — " + detail : ""));
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log("✓ " + name);
}

assert("总计行不会重复入账", api.normalizeMonths(data.months.concat([{ month: "合计", revenue: 16000000, ads: 0, firstMile: 0, purchase: 0, fba: 0, profit: 0 }]), data.contract).length === 9);
assert("九个月销售收入为 1600 万元", summary.totals.revenue === 16000000, String(summary.totals.revenue));
assert("成本与利润结构闭合", summary.totals.ads + summary.totals.firstMile + summary.totals.purchase + summary.totals.fba + summary.totals.profit === summary.totals.revenue);
assert("五站点销售合计等于月度销售", api.sum(data.sites, "revenue") === summary.totals.revenue);
assert("利润率为 30%", summary.totals.margin === 0.30, String(summary.totals.margin));
assert("公开证据索引对应 165 份 PDF", summary.totals.documentCount === 165, String(summary.totals.documentCount));
assert("八条基础勾稽规则全部通过", audits.length === 8 && audits.every(function (item) { return item.status === "pass"; }));
assert("广告次月开票规则已登记", data.periodRules.some(function (item) { return item.id === "ads-lag" && item.status === "recognized"; }));
assert("十一条异常规则均已登记", anomalyRules.length === 11, String(anomalyRules.length));
assert("内置基准只有广告期间规则待导入后测试", anomalyRules.filter(function (item) { return item.status === "review"; }).length === 0 && anomalyRules.filter(function (item) { return item.status === "not-tested"; }).map(function (item) { return item.id; }).join(",") === "ad-period");

const baselineJson = JSON.stringify(data);
const simulated = api.simulateDataset(data, "combined");
const simulatedSummary = api.computeSummary(simulated);
const simulatedRules = api.runAnomalyRules(simulated, simulatedSummary);
const reviewIds = simulatedRules.filter(function (item) { return item.status === "review"; }).map(function (item) { return item.id; });
assert("组合模拟能触发重复月份", reviewIds.includes("duplicate-month"), reviewIds.join(", "));
assert("组合模拟能触发广告来源差额", reviewIds.includes("source-ads"), reviewIds.join(", "));
assert("组合模拟能触发广告期间错配", reviewIds.includes("ad-period"), reviewIds.join(", "));
assert("模拟运行不修改原始基准", JSON.stringify(data) === baselineJson);

const duplicateIssue = simulatedRules.find(function (item) { return item.id === "duplicate-month"; });
const explanationA = api.explainIssue(duplicateIssue);
const explanationB = api.explainIssue(duplicateIssue);
assert("问题解释由确定性模板生成", explanationA.deterministic === true && JSON.stringify(explanationA) === JSON.stringify(explanationB));
assert("广告汇总证据标签与来源一致", data.evidence.some(function (item) { return item.key === "overview" && item.label === "广告台账汇总"; }));

if (!process.exitCode) console.log("\n" + passed + "/" + passed + " tests passed");

