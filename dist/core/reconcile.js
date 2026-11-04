(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};
  const EPSILON = 0.01;

  function check(id, title, actual, expected, description) {
    const delta = actual - expected;
    return {
      id: id,
      title: title,
      actual: actual,
      expected: expected,
      delta: delta,
      status: Math.abs(delta) <= EPSILON ? "pass" : "review",
      description: description
    };
  }

  api.runAudits = function runAudits(data, summary) {
    const totals = summary.totals;
    const source = data.sourceTotals;
    const operatingParts = totals.ads + totals.firstMile + totals.purchase + totals.fba + totals.profit;
    const siteRevenue = api.sum(data.sites, "revenue");
    const categoryRates = Object.values(data.contract.categoryRates).reduce(function (a, b) { return a + b; }, 0);

    return [
      check("monthly-vs-sales", "月度销售汇总", totals.revenue, source.sales, "9 个月销售汇总与销售来源合计一致"),
      check("site-vs-sales", "站点归集合计", siteRevenue, totals.revenue, "5 个匿名站点合计与月度销售一致"),
      check("cost-closure", "经营结构闭合", operatingParts, totals.revenue, "广告、头程、采购、FBA 与利润完整覆盖销售收入"),
      check("rate-closure", "比例口径闭合", categoryRates, 1, "五类比例加总应为 100%"),
      check("ads-source", "广告费用勾稽", totals.ads, source.ads, "广告归属经营期后的合计与来源底表一致"),
      check("freight-source", "头程费用勾稽", totals.firstMile, source.firstMile, "头程发票合计与成本结构一致"),
      check("purchase-source", "采购费用勾稽", totals.purchase, source.purchase, "采购发票合计与成本结构一致"),
      check("fba-source", "FBA 费用勾稽", totals.fba, source.fba, "站点 FBA 费用折算后与成本结构一致")
    ];
  };
})(typeof window !== "undefined" ? window : globalThis);

