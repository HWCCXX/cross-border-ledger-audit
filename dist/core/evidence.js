(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};

  api.evidenceFor = function evidenceFor(data, auditId) {
    const map = {
      "monthly-vs-sales": ["sales", "structured"],
      "site-vs-sales": ["sales", "structured"],
      "cost-closure": ["ads", "firstMile", "purchase", "overview", "structured"],
      "rate-closure": ["structured"],
      "ads-source": ["ads", "structured"],
      "freight-source": ["firstMile", "structured"],
      "purchase-source": ["purchase", "structured"],
      "fba-source": ["sales", "structured"]
    };
    const keys = map[auditId] || [];
    return data.evidence.filter(function (item) { return keys.includes(item.key); });
  };
})(typeof window !== "undefined" ? window : globalThis);
