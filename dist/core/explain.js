(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};

  const templates = {
    "duplicate-month": { cause: "同一月份被导入多次，常见于重复选择文件或把合计表与明细表同时当作月度明细。", impact: "月度销售和各项费用会重复累计，后续比例与利润结论全部失真。", action: "按月份和来源文件定位重复行，保留一条有效记录后重新运行核验。" },
    "month-coverage": { cause: "月度数据在首月和末月之间存在缺口。", impact: "期间累计值不完整，趋势图会把缺失误当作业务波动。", action: "补充缺失月份，或明确调整分析期间。" },
    "amount-validity": { cause: "金额字段出现空值、文本或负数。", impact: "汇总可能被低估，负数也可能代表退款或冲回而非普通成本。", action: "回到证据行确认字段类型；若为退款或冲回，应使用专门类别而不是普通成本。" },
    "monthly-closure": { cause: "某月的广告、头程、采购、FBA 与利润之和不等于销售收入。", impact: "经营结构没有闭合，可能存在漏项、重复项或口径混用。", action: "先核对差额最大的月份，再检查费用归属期和总计行。" },
    "site-revenue": { cause: "站点汇总与月度经营表采用了不同的数据范围或汇率口径。", impact: "站点占比和整体收入不能同时成立。", action: "核对站点月份覆盖、人民币折算日期和是否遗漏站点。" },
    "source-ads": { cause: "广告台账计划金额与月度广告成本不一致。", impact: "利润可能少计或多计广告费用。", action: "按归属月份核对广告发票，特别检查次月开票是否记回上月。" },
    "source-freight": { cause: "头程发票价税合计与月度头程成本不一致。", impact: "物流成本与利润口径不能闭合。", action: "按归属月份核对货代发票和税额口径。" },
    "source-purchase": { cause: "采购台账不含税金额与月度采购成本不一致。", impact: "采购成本可能混入增值税或遗漏发票。", action: "统一使用不含税金额，并检查是否有跨月或重复票据。" },
    "source-fba": { cause: "站点 FBA 原币费用折算结果与月度 FBA 成本不一致。", impact: "汇率或站点覆盖差异会直接影响利润。", action: "检查每月汇率、币种和站点 FBA 费用列。" },
    "ad-period": { cause: "广告费用归属月份与发票开具月份不符合约定的次月规则。", impact: "费用可能错入其他经营期，造成单月利润波动。", action: "以广告账单周期确定归属月，保留开票日期作为证据而非经营期。" },
    "evidence-index": { cause: "未发现可关联的票据或台账记录。", impact: "金额可以计算，但结论无法下钻到文件或数据行。", action: "补充 PDF 或对应台账，并重新建立证据索引。" }
  };

  api.explainIssue = function explainIssue(issue) {
    const template = templates[issue.id] || { cause: issue.description, impact: "该问题会降低经营结论的可核对性。", action: "查看证据索引并核对来源文件。" };
    const calculation = issue.actual != null && issue.expected != null
      ? "实算值 " + issue.actual + "；目标值 " + issue.expected + (issue.delta != null ? "；差额 " + issue.delta : "")
      : "该规则基于结构和覆盖范围判断";
    return { cause: template.cause, impact: template.impact, action: template.action, calculation: calculation, deterministic: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
