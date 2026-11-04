(function (root) {
  "use strict";

  const api = root.LedgerAudit = root.LedgerAudit || {};
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MAX_ZIP_ENTRIES = 500;
  const SUPPORTED = new Set(["csv", "tsv", "json", "xlsx", "pdf", "zip"]);

  function extension(name) {
    const match = String(name || "").toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function decodeBytes(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(view.subarray(3));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(view);
    } catch (_error) {
      try { return new TextDecoder("gb18030").decode(view); }
      catch (_fallbackError) { return new TextDecoder("utf-8").decode(view); }
    }
  }

  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(value); value = ""; }
      else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
      else value += char;
    }
    row.push(value.replace(/\r$/, ""));
    if (row.some(function (cell) { return String(cell).trim() !== ""; })) rows.push(row);
    const nonEmpty = rows.filter(function (cells) { return cells.some(function (cell) { return String(cell).trim() !== ""; }); });
    if (!nonEmpty.length) return { headers: [], rows: [] };
    const used = Object.create(null);
    const headers = nonEmpty[0].map(function (header, index) {
      const base = String(header || ("列" + (index + 1))).replace(/^\ufeff/, "").trim();
      used[base] = (used[base] || 0) + 1;
      return used[base] === 1 ? base : base + "_" + used[base];
    });
    const objects = nonEmpty.slice(1).map(function (cells, index) {
      const result = { _row: index + 2 };
      headers.forEach(function (header, column) { result[header] = cells[column] == null ? "" : String(cells[column]).trim(); });
      return result;
    });
    return { headers: headers, rows: objects };
  }

  function detectRole(name, headers) {
    const file = String(name || "").toLowerCase();
    const joined = (headers || []).join("|").toLowerCase();
    if (/月度成本结构/.test(file) || (joined.includes("销售收入rmb") && joined.includes("预留利润"))) return "monthly-cost";
    if (/站点月度销售/.test(file) || (joined.includes("站点") && joined.includes("销售收入原币"))) return "site-sales";
    if (/广告发票台账/.test(file) || (joined.includes("推广费") && joined.includes("计划rmb"))) return "ad-ledger";
    if (/头程运费发票清单/.test(file) || (joined.includes("货代公司") && joined.includes("价税合计"))) return "freight-ledger";
    if (/采购发票清单/.test(file) || (joined.includes("供应商") && joined.includes("不含税金额"))) return "purchase-ledger";
    if (/季度成本结构/.test(file) || joined.includes("季度")) return "quarterly-cost";
    return "unknown-table";
  }

  function parseTableText(name, bytes, delimiter) {
    const parsed = parseDelimited(decodeBytes(bytes), delimiter);
    return {
      id: "table-" + Math.random().toString(36).slice(2),
      name: name,
      kind: delimiter === "\t" ? "tsv" : "csv",
      role: detectRole(name, parsed.headers),
      headers: parsed.headers,
      rows: parsed.rows,
      sheet: null
    };
  }

  function cellColumn(reference) {
    const letters = String(reference || "A1").match(/[A-Z]+/i);
    if (!letters) return 0;
    return letters[0].toUpperCase().split("").reduce(function (total, char) {
      return total * 26 + char.charCodeAt(0) - 64;
    }, 0) - 1;
  }

  function xmlText(node) {
    return Array.from(node.getElementsByTagName("t")).map(function (item) { return item.textContent || ""; }).join("");
  }

  async function parseXlsx(name, bytes) {
    if (!root.JSZip) throw new Error("XLSX 解析组件未加载");
    const zip = await root.JSZip.loadAsync(bytes);
    const workbookFile = zip.file("xl/workbook.xml");
    const relsFile = zip.file("xl/_rels/workbook.xml.rels");
    if (!workbookFile || !relsFile) throw new Error("不是有效的 XLSX 工作簿");
    const parser = new DOMParser();
    const workbook = parser.parseFromString(await workbookFile.async("text"), "application/xml");
    const rels = parser.parseFromString(await relsFile.async("text"), "application/xml");
    const relMap = {};
    Array.from(rels.getElementsByTagName("Relationship")).forEach(function (rel) {
      relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
    });
    const sharedFile = zip.file("xl/sharedStrings.xml");
    let shared = [];
    if (sharedFile) {
      const sharedXml = parser.parseFromString(await sharedFile.async("text"), "application/xml");
      shared = Array.from(sharedXml.getElementsByTagName("si")).map(xmlText);
    }
    const tables = [];
    const sheets = Array.from(workbook.getElementsByTagName("sheet"));
    for (const sheet of sheets) {
      const sheetName = sheet.getAttribute("name") || "Sheet";
      const relId = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      let target = relMap[relId];
      if (!target) continue;
      target = target.replace(/^\//, "");
      if (!target.startsWith("xl/")) target = "xl/" + target.replace(/^\.\//, "");
      const sheetFile = zip.file(target);
      if (!sheetFile) continue;
      const sheetXml = parser.parseFromString(await sheetFile.async("text"), "application/xml");
      const matrix = [];
      Array.from(sheetXml.getElementsByTagName("row")).forEach(function (rowNode) {
        const rowIndex = Math.max(0, Number(rowNode.getAttribute("r") || matrix.length + 1) - 1);
        const row = matrix[rowIndex] = matrix[rowIndex] || [];
        Array.from(rowNode.getElementsByTagName("c")).forEach(function (cell) {
          const column = cellColumn(cell.getAttribute("r"));
          const type = cell.getAttribute("t");
          const valueNode = cell.getElementsByTagName("v")[0];
          let value = valueNode ? valueNode.textContent || "" : "";
          if (type === "s") value = shared[Number(value)] == null ? value : shared[Number(value)];
          else if (type === "inlineStr") value = xmlText(cell);
          else if (type === "b") value = value === "1" ? "TRUE" : "FALSE";
          row[column] = value;
        });
      });
      const compact = matrix.filter(function (row) { return row && row.some(function (cell) { return String(cell || "").trim() !== ""; }); });
      if (!compact.length) continue;
      const maxColumns = compact.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
      const text = compact.map(function (row) {
        return Array.from({ length: maxColumns }, function (_unused, index) {
          const value = row[index] == null ? "" : String(row[index]);
          return '"' + value.replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\n");
      const parsed = parseDelimited(text, ",");
      tables.push({
        id: "table-" + Math.random().toString(36).slice(2),
        name: name,
        kind: "xlsx",
        role: detectRole(name + " " + sheetName, parsed.headers),
        headers: parsed.headers,
        rows: parsed.rows,
        sheet: sheetName
      });
    }
    if (!tables.length) throw new Error("XLSX 中没有可读取的数据表");
    return tables;
  }

  function parseJson(name, bytes) {
    const value = JSON.parse(decodeBytes(bytes));
    if (value && Array.isArray(value.months) && value.contract) return { directDataset: value, tables: [] };
    if (value && Array.isArray(value.months)) return { sourceJson: value, tables: [] };
    const rows = Array.isArray(value) ? value : (Array.isArray(value.rows) ? value.rows : null);
    if (!rows) throw new Error("JSON 需为数组，或包含 months/rows 数组");
    const headers = Array.from(rows.reduce(function (set, row) {
      Object.keys(row || {}).forEach(function (key) { if (!key.startsWith("_")) set.add(key); });
      return set;
    }, new Set()));
    return { tables: [{ id: "table-" + Math.random().toString(36).slice(2), name: name, kind: "json", role: detectRole(name, headers), headers: headers, rows: rows.map(function (row, index) { return Object.assign({ _row: index + 1 }, row); }), sheet: null }] };
  }

  function fileRecord(name, size, origin, getBytes) {
    return { id: "file-" + Math.random().toString(36).slice(2), name: name, size: Number(size || 0), kind: extension(name), origin: origin, getBytes: getBytes };
  }

  async function expandInputFile(file) {
    const ext = extension(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ext !== "zip") return [fileRecord(file.name, file.size, "selected", async function () { return bytes; })];
    if (!root.JSZip) throw new Error("ZIP 解析组件未加载");
    const zip = await root.JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files).filter(function (entry) { return !entry.dir && SUPPORTED.has(extension(entry.name)) && extension(entry.name) !== "zip"; });
    if (entries.length > MAX_ZIP_ENTRIES) throw new Error("ZIP 内支持文件超过 " + MAX_ZIP_ENTRIES + " 个，已停止处理");
    return entries.map(function (entry) {
      const size = entry._data && entry._data.uncompressedSize || 0;
      return fileRecord(entry.name, size, file.name, async function () { return entry.async("uint8array"); });
    });
  }

  api.importFiles = async function importFiles(fileList, onProgress) {
    const selected = Array.from(fileList || []);
    if (!selected.length) throw new Error("请选择至少一个文件");
    const result = { files: [], tables: [], warnings: [], directDataset: null, sourceJson: null };
    let expanded = [];
    for (const file of selected) {
      if (file.size > MAX_FILE_BYTES && extension(file.name) !== "zip") {
        result.warnings.push(file.name + " 超过 30 MB，已跳过");
        continue;
      }
      if (!SUPPORTED.has(extension(file.name))) {
        result.warnings.push(file.name + " 格式不受支持，已跳过");
        continue;
      }
      expanded = expanded.concat(await expandInputFile(file));
    }
    for (let index = 0; index < expanded.length; index += 1) {
      const record = expanded[index];
      result.files.push(record);
      if (onProgress) onProgress({ current: index + 1, total: expanded.length, name: record.name });
      try {
        if (record.kind === "pdf") continue;
        const bytes = await record.getBytes();
        if (record.kind === "csv") result.tables.push(parseTableText(record.name, bytes, ","));
        else if (record.kind === "tsv") result.tables.push(parseTableText(record.name, bytes, "\t"));
        else if (record.kind === "xlsx") result.tables.push.apply(result.tables, await parseXlsx(record.name, bytes));
        else if (record.kind === "json") {
          const parsed = parseJson(record.name, bytes);
          if (parsed.directDataset) result.directDataset = parsed.directDataset;
          if (parsed.sourceJson) result.sourceJson = parsed.sourceJson;
          result.tables.push.apply(result.tables, parsed.tables || []);
        }
      } catch (error) {
        result.warnings.push(record.name + "：" + error.message);
      }
    }
    if (!result.tables.length && !result.directDataset && !result.sourceJson) throw new Error("没有找到可用于经营计算的结构化数据");
    return result;
  };

  function normalizedKey(value) {
    return String(value || "").toLowerCase().replace(/[\s_（）()/%·-]/g, "");
  }

  function pick(row, aliases) {
    const keys = Object.keys(row || {});
    for (const alias of aliases) {
      const exact = keys.find(function (key) { return normalizedKey(key) === normalizedKey(alias); });
      if (exact != null) return row[exact];
    }
    return "";
  }

  function numberValue(value) {
    if (typeof value === "number") return value;
    const cleaned = String(value == null ? "" : value).replace(/[,¥￥\s]/g, "").replace(/%$/, "");
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : NaN;
  }

  function sumRows(table, aliases) {
    if (!table) return NaN;
    return table.rows.reduce(function (total, row) {
      const value = numberValue(pick(row, aliases));
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function monthKey(row, yearFallback) {
    const raw = String(pick(row, ["月份", "month", "归属月份"]) || "").trim();
    const date = String(pick(row, ["汇率日期", "日期", "开票日期"]) || "");
    const year = (date.match(/^(20\d{2})/) || [])[1] || yearFallback || "2026";
    const match = raw.match(/(20\d{2})[-/]?(\d{1,2})/) || raw.match(/^(\d{1,2})$/);
    if (!match) return raw;
    const month = match.length === 3 ? match[2] : match[1];
    const resolvedYear = match.length === 3 ? match[1] : year;
    return resolvedYear + "-" + String(Number(month)).padStart(2, "0");
  }

  function evidenceFromFiles(files, tables) {
    const pdfs = files.filter(function (file) { return file.kind === "pdf"; });
    const count = function (pattern) { return pdfs.filter(function (file) { return pattern.test(file.name.split("/").pop()); }).length; };
    const structured = files.filter(function (file) { return ["csv", "tsv", "json", "xlsx"].includes(file.kind); }).length;
    const sales = count(/MonthlySummary\.pdf$/i);
    const ads = count(/^AD-.*\.pdf$/i);
    const freight = count(/^FRT-.*\.pdf$/i);
    const purchase = count(/^PUR-.*\.pdf$/i);
    const overview = count(/^广告发票台账\.pdf$/i);
    const tableCount = function (role) { const table = tables.find(function (item) { return item.role === role; }); return table ? table.rows.length : 0; };
    return [
      { key: "sales", label: "月度销售摘要", count: sales || tableCount("site-sales"), coverage: sales ? "按 PDF 文件索引" : "按结构化记录索引", publicRef: "LOCAL / MonthlySummary", files: pdfs.filter(function (file) { return /MonthlySummary\.pdf$/i.test(file.name); }).map(function (file) { return file.id; }) },
      { key: "ads", label: "广告发票", count: ads || tableCount("ad-ledger"), coverage: ads ? "按 PDF 文件索引" : "按台账记录索引", publicRef: "LOCAL / AD", files: pdfs.filter(function (file) { return /^AD-.*\.pdf$/i.test(file.name.split("/").pop()); }).map(function (file) { return file.id; }) },
      { key: "firstMile", label: "头程运费发票", count: freight || tableCount("freight-ledger"), coverage: freight ? "按 PDF 文件索引" : "按清单记录索引", publicRef: "LOCAL / FRT", files: pdfs.filter(function (file) { return /^FRT-.*\.pdf$/i.test(file.name.split("/").pop()); }).map(function (file) { return file.id; }) },
      { key: "purchase", label: "采购发票", count: purchase || tableCount("purchase-ledger"), coverage: purchase ? "按 PDF 文件索引" : "按清单记录索引", publicRef: "LOCAL / PUR", files: pdfs.filter(function (file) { return /^PUR-.*\.pdf$/i.test(file.name.split("/").pop()); }).map(function (file) { return file.id; }) },
      { key: "overview", label: "广告台账汇总", count: overview, coverage: "汇总 PDF", publicRef: "LOCAL / LEDGER", files: pdfs.filter(function (file) { return /^广告发票台账\.pdf$/i.test(file.name.split("/").pop()); }).map(function (file) { return file.id; }) },
      { key: "structured", label: "结构化底表", count: structured, coverage: "本地解析", publicRef: "LOCAL / STRUCTURED", files: [] }
    ].filter(function (item) { return item.count > 0; });
  }

  api.buildDatasetFromImport = function buildDatasetFromImport(importResult) {
    if (importResult.directDataset) {
      const direct = JSON.parse(JSON.stringify(importResult.directDataset));
      direct.meta = Object.assign({}, direct.meta, { datasetType: "local-import", publicSafe: false, disclosure: "本地导入数据仅在当前浏览器内存中处理，未上传服务器。" });
      direct._runtime = { files: importResult.files, tables: importResult.tables, warnings: importResult.warnings };
      return direct;
    }
    if (importResult.sourceJson && Array.isArray(importResult.sourceJson.months)) {
      const source = importResult.sourceJson;
      const rows = source.months.map(function (item, index) {
        return {
          month: String(item.month).match(/^20/) ? String(item.month) : "2026-" + String(item.month).padStart(2, "0"),
          revenue: Number(item.income_rmb), ads: Number(item.ad_rmb), firstMile: Number(item.freight_rmb),
          purchase: Number(item.purchase_rmb), fba: Number(item.fba_rmb), profit: Number(item.profit_rmb),
          _source: { file: "数值底稿.json", row: index + 1 }
        };
      });
      importResult.tables.push({ id: "json-months", name: "数值底稿.json", kind: "json", role: "monthly-cost", headers: Object.keys(rows[0] || {}), rows: rows, sheet: null, internal: true });
    }
    const tables = importResult.tables;
    const monthly = tables.find(function (table) { return table.role === "monthly-cost"; });
    if (!monthly) throw new Error("缺少月度成本结构表；请导入包含销售、广告、头程、采购、FBA 和利润的月度表");
    const amountFields = ["revenue", "ads", "firstMile", "purchase", "fba", "profit"];
    const aliases = {
      revenue: ["销售收入RMB", "销售收入", "income_rmb", "revenue"],
      ads: ["广告成本10%", "广告10%", "ad_rmb", "ads"],
      firstMile: ["货代头程15%", "头程15%", "freight_rmb", "firstMile"],
      purchase: ["采购成本20%", "采购20%", "purchase_rmb", "purchase"],
      fba: ["FBA尾程25%", "FBA25%", "fba_rmb", "fba"],
      profit: ["预留利润30%", "利润30%", "profit_rmb", "profit"]
    };
    const rows = monthly.rows.filter(function (row) { return !api.isTotalRow({ month: pick(row, ["月份", "month"]) }, ["合计", "总计", "total"]); }).map(function (row) {
      const result = { month: monthKey(row, "2026"), _source: { file: monthly.name, sheet: monthly.sheet, row: row._row } };
      amountFields.forEach(function (key) { result[key] = numberValue(pick(row, aliases[key])); });
      return result;
    });
    const invalid = rows.find(function (row) { return amountFields.some(function (key) { return !Number.isFinite(row[key]); }); });
    if (invalid) throw new Error("月度成本结构存在无法识别的金额字段，来源行：" + invalid._source.row);
    const siteTable = tables.find(function (table) { return table.role === "site-sales"; });
    let sites = [];
    if (siteTable) {
      const groups = {};
      siteTable.rows.forEach(function (row) {
        const key = String(pick(row, ["站点", "site"]) || "未知站点");
        groups[key] = groups[key] || { currency: String(pick(row, ["币种", "currency"]) || ""), revenue: 0, rows: [] };
        groups[key].revenue += numberValue(pick(row, ["销售收入RMB", "销售收入", "income_rmb", "revenue"])) || 0;
        groups[key].rows.push(row._row);
      });
      const revenueTotal = Object.values(groups).reduce(function (sum, item) { return sum + item.revenue; }, 0);
      sites = Object.keys(groups).sort().map(function (key, index) {
        const item = groups[key];
        return { id: "S" + (index + 1), label: "站点 " + String.fromCharCode(65 + index), currency: item.currency, revenue: item.revenue, share: revenueTotal ? item.revenue / revenueTotal : 0, _source: { file: siteTable.name, rows: item.rows } };
      });
    }
    if (!sites.length) sites = [{ id: "S1", label: "导入合计", currency: "CNY", revenue: rows.reduce(function (sum, row) { return sum + row.revenue; }, 0), share: 1 }];
    const tableByRole = function (role) { return tables.find(function (table) { return table.role === role; }); };
    const adTable = tableByRole("ad-ledger");
    const freightTable = tableByRole("freight-ledger");
    const purchaseTable = tableByRole("purchase-ledger");
    const evidence = evidenceFromFiles(importResult.files, tables);
    const monthlySum = function (key) { return rows.reduce(function (sum, row) { return sum + row[key]; }, 0); };
    const fbaFromSites = siteTable ? siteTable.rows.reduce(function (sum, row) {
      const local = numberValue(pick(row, ["FBA尾程费用原币", "FBA费用原币"]));
      const rate = numberValue(pick(row, ["汇率", "rate"]));
      return sum + (Number.isFinite(local) && Number.isFinite(rate) ? local * rate : 0);
    }, 0) : NaN;
    const dataset = {
      meta: { project: "跨境账证侦探", period: rows[0].month + " 至 " + rows[rows.length - 1].month, currency: "CNY", generatedAt: new Date().toISOString().slice(0, 10), datasetType: "local-import", publicSafe: false, disclosure: "本地导入数据仅在当前浏览器内存中处理，未上传服务器。" },
      contract: { monthKey: "month", amountFields: amountFields, categoryRates: { ads: .10, firstMile: .15, purchase: .20, fba: .25, profit: .30 }, totalRowLabels: ["合计", "总计", "total"] },
      months: rows,
      sites: sites,
      sourceTotals: {
        sales: monthlySum("revenue"),
        ads: adTable ? sumRows(adTable, ["计划RMB", "计划金额RMB"]) : monthlySum("ads"),
        firstMile: freightTable ? sumRows(freightTable, ["价税合计", "金额"]) : monthlySum("firstMile"),
        purchase: purchaseTable ? sumRows(purchaseTable, ["不含税金额", "采购金额"]) : monthlySum("purchase"),
        fba: Number.isFinite(fbaFromSites) && fbaFromSites > 0 ? Math.round(fbaFromSites) : monthlySum("fba"),
        profit: monthlySum("profit")
      },
      evidence: evidence,
      periodRules: [
        { id: "ads-lag", label: "广告账期", description: "广告发票应在次月开具，并归属上月经营期。", status: adTable ? "testable" : "not-loaded" },
        { id: "fx-basis", label: "汇率口径", description: siteTable ? "已读取站点汇率与人民币金额。" : "未导入站点汇率表。", status: siteTable ? "recognized" : "not-loaded" }
      ],
      _runtime: { files: importResult.files, tables: tables, warnings: importResult.warnings, sourceTables: { monthly: monthly && monthly.id, sites: siteTable && siteTable.id, ads: adTable && adTable.id, freight: freightTable && freightTable.id, purchase: purchaseTable && purchaseTable.id } }
    };
    return dataset;
  };

  let pdfModulePromise = null;
  async function loadPdfModule() {
    if (!pdfModulePromise) {
      const moduleUrl = new URL("vendor/pdf.min.mjs", document.baseURI).href;
      pdfModulePromise = import(moduleUrl).then(function (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", document.baseURI).href;
        return pdfjs;
      });
    }
    return pdfModulePromise;
  }

  api.inspectPdf = async function inspectPdf(file, pageNumber) {
    if (!file || file.kind !== "pdf") throw new Error("未找到 PDF 证据文件");
    const pdfjs = await loadPdfModule();
    const bytes = await file.getBytes();
    const documentTask = pdfjs.getDocument({ data: bytes });
    const pdf = await documentTask.promise;
    const pageIndex = Math.max(1, Math.min(Number(pageNumber || 1), pdf.numPages));
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items.map(function (item) { return item.str; }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return { file: file.name, pages: pdf.numPages, page: pageIndex, text: text, snippets: text.match(/.{1,120}/g) || [] };
  };

  api.importHelpers = { extension: extension, parseDelimited: parseDelimited, detectRole: detectRole, pick: pick, numberValue: numberValue, monthKey: monthKey };
})(typeof window !== "undefined" ? window : globalThis);
