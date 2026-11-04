(function (root) {
  "use strict";

  root.DEMO_DATA = {
    meta: {
      project: "跨境账证侦探",
      period: "2026-01 至 2026-09",
      currency: "CNY",
      generatedAt: "2026-11-04",
      datasetType: "synthetic",
      publicSafe: true,
      disclosure: "全部金额与业务关系均为程序生成的合成演示数据，不代表真实企业。"
    },
    contract: {
      monthKey: "month",
      amountFields: ["revenue", "ads", "firstMile", "purchase", "fba", "profit"],
      categoryRates: { ads: 0.10, firstMile: 0.15, purchase: 0.20, fba: 0.25, profit: 0.30 },
      totalRowLabels: ["合计", "总计", "total"]
    },
    months: [
      { month: "2026-01", revenue: 900000, ads: 90000, firstMile: 135000, purchase: 180000, fba: 225000, profit: 270000 },
      { month: "2026-02", revenue: 840000, ads: 84000, firstMile: 126000, purchase: 168000, fba: 210000, profit: 252000 },
      { month: "2026-03", revenue: 1260000, ads: 126000, firstMile: 189000, purchase: 252000, fba: 315000, profit: 378000 },
      { month: "2026-04", revenue: 1500000, ads: 150000, firstMile: 225000, purchase: 300000, fba: 375000, profit: 450000 },
      { month: "2026-05", revenue: 1650000, ads: 165000, firstMile: 247500, purchase: 330000, fba: 412500, profit: 495000 },
      { month: "2026-06", revenue: 1850000, ads: 185000, firstMile: 277500, purchase: 370000, fba: 462500, profit: 555000 },
      { month: "2026-07", revenue: 2320000, ads: 232000, firstMile: 348000, purchase: 464000, fba: 580000, profit: 696000 },
      { month: "2026-08", revenue: 2640000, ads: 264000, firstMile: 396000, purchase: 528000, fba: 660000, profit: 792000 },
      { month: "2026-09", revenue: 3040000, ads: 304000, firstMile: 456000, purchase: 608000, fba: 760000, profit: 912000 }
    ],
    sites: [
      { id: "S1", label: "站点 A", currency: "USD", revenue: 6720000, share: 0.42 },
      { id: "S2", label: "站点 B", currency: "GBP", revenue: 3680000, share: 0.23 },
      { id: "S3", label: "站点 C", currency: "EUR", revenue: 3200000, share: 0.20 },
      { id: "S4", label: "站点 D", currency: "EUR", revenue: 1440000, share: 0.09 },
      { id: "S5", label: "站点 E", currency: "CAD", revenue: 960000, share: 0.06 }
    ],
    sourceTotals: {
      sales: 16000000,
      ads: 1600000,
      firstMile: 2400000,
      purchase: 3200000,
      fba: 4000000,
      profit: 4800000
    },
    evidence: [
      { key: "sales", label: "月度销售摘要", count: 45, coverage: "5 站点 × 9 个月", publicRef: "SALES-M01…M09 / S01…S05" },
      { key: "ads", label: "广告发票", count: 45, coverage: "5 站点 × 9 个月", publicRef: "ADS-M01…M09 / S01…S05" },
      { key: "firstMile", label: "头程运费发票", count: 9, coverage: "每月 1 份", publicRef: "FRT-M01…M09" },
      { key: "purchase", label: "采购发票", count: 65, coverage: "9 个月汇总", publicRef: "PUR-M01…M09 / 匿名供应方" },
      { key: "overview", label: "广告台账汇总", count: 1, coverage: "2026 年 1—9 月", publicRef: "ADS-LEDGER-OVERVIEW" },
      { key: "structured", label: "结构化底表", count: 8, coverage: "6 CSV + 1 XLSX + 1 JSON", publicRef: "AGGREGATE-ONLY" }
    ],
    periodRules: [
      { id: "ads-lag", label: "广告账期", description: "广告发票在次月开具，但归属上月经营期。", status: "recognized" },
      { id: "fx-basis", label: "汇率口径", description: "按各月参考日期折算，公开版仅保留人民币聚合结果。", status: "recognized" }
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);

