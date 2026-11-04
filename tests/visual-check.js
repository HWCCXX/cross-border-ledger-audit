"use strict";

const fs = require("fs");
const path = require("path");
const playwrightPath = process.argv[2];
const targetUrl = process.argv[3] || "http://127.0.0.1:8765/";
const browserExecutable = process.argv[4];
const importZip = process.argv[5];

if (!playwrightPath) throw new Error("Usage: node visual-check.js <playwright-module-path> [url]");

const { chromium } = require(playwrightPath);

(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", function (message) { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", function (error) { errors.push(error.message); });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const report = await page.evaluate(function () {
    return {
      title: document.title,
      hasProject: document.body.innerText.includes("跨境账证侦探"),
      hasDisclosure: document.body.innerText.includes("合成数据演示"),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  await page.click('[data-view="costs"]');
  report.costRows = await page.locator("#monthly-body tr").count();
  report.costViewVisible = await page.locator("#costs").isVisible();
  await page.click('[data-view="audits"]');
  report.auditRows = await page.locator(".audit-item").count();
  await page.locator(".audit-item").first().click();
  report.evidenceDialogVisible = await page.locator("#evidence-dialog").isVisible();
  await page.locator("#dialog-close").click();
  await page.click('[data-view="workspace"]');
  report.workspaceRuleCount = Number(await page.locator("#workspace-rule-count").textContent());
  report.workspaceIssueRows = await page.locator(".issue-card").count();
  await page.selectOption("#simulation-scenario", "combined");
  await page.click("#run-simulation");
  report.simulationReviewCount = Number(await page.locator("#rule-review-count").textContent());
  report.simulationVisible = await page.locator("#simulation-banner").isVisible();
  report.simulationMode = await page.evaluate(function () { return window.LedgerApp.state().mode; });
  await page.click("#restore-baseline");
  report.restoredReviewCount = Number(await page.locator("#rule-review-count").textContent());

  if (importZip) {
    await page.locator("#file-input").setInputFiles(importZip);
    await page.waitForFunction(function () {
      return document.querySelector("#workspace-status").dataset.state !== "working";
    }, null, { timeout: 120000 });
    report.importStatus = await page.locator("#workspace-status").textContent();
    report.importRibbon = await page.locator(".demo-ribbon").textContent();
    report.fileSummary = await page.locator("#file-summary").textContent();
    report.importWarnings = await page.locator("#import-warnings li").allTextContents();
    report.importState = await page.evaluate(function () {
      const current = window.LedgerApp.state();
      return {
        mode: current.mode,
        revenue: current.summary.totals.revenue,
        documents: current.summary.totals.documentCount,
        months: current.summary.rows.length
      };
    });
    report.importReviewCount = Number(await page.locator("#rule-review-count").textContent());
    report.importReviewTitles = await page.locator('.issue-card[data-status="review"] .issue-main b').allTextContents();
    report.importReviewDetails = await page.evaluate(function () {
      const current = window.LedgerApp.state();
      return window.LedgerAudit.runAnomalyRules(current.data, current.summary).filter(function (item) { return item.status === "review"; }).map(function (item) {
        return { id: item.id, actual: item.actual, expected: item.expected, delta: item.delta };
      });
    });
    report.pdfButtons = await page.locator("[data-pdf-id]").count();
    report.visibleImportedFiles = await page.locator("#file-list .import-file").count();
    report.fileListToggleText = await page.locator("#file-list-toggle").textContent();
    if (report.pdfButtons) {
      await page.locator("[data-pdf-id]").first().click();
      await page.waitForFunction(function () {
        const body = document.querySelector("#source-dialog-body");
        return body && !body.textContent.includes("正在本地读取");
      }, null, { timeout: 30000 });
      report.pdfDialogText = (await page.locator("#source-dialog-body").textContent()).slice(0, 300);
      report.pdfEvidenceLoaded = !report.pdfDialogText.includes("PDF 读取失败");
      await page.locator("#source-dialog-close").click();
    }
  }
  report.errors = errors;
  const output = path.join(__dirname, "qa-home.png");
  await page.screenshot({ path: output, fullPage: true });
  report.screenshot = output;

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobileErrors = [];
  mobile.on("console", function (message) { if (message.type() === "error") mobileErrors.push(message.text()); });
  mobile.on("pageerror", function (error) { mobileErrors.push(error.message); });
  await mobile.goto(targetUrl, { waitUntil: "networkidle" });
  await mobile.click('[data-view="workspace"]');
  await mobile.waitForTimeout(400);
  report.mobile = await mobile.evaluate(function () {
    return { bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth, workspaceVisible: !document.querySelector("#workspace").hidden };
  });
  report.mobile.errors = mobileErrors;
  report.mobile.screenshot = path.join(__dirname, "qa-mobile.png");
  await mobile.screenshot({ path: report.mobile.screenshot, fullPage: true });
  await mobile.close();
  fs.writeFileSync(path.join(__dirname, "qa-browser-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  const importFailed = importZip && (!report.importStatus.includes("解析完成") || !report.importRibbon.includes("本地数据模式") || !report.importRibbon.includes("不会上传服务器") || !report.fileSummary.includes("173 个文件") || !report.fileSummary.includes("165 份 PDF") || report.importState.mode !== "import" || report.importState.revenue !== 16000000 || report.importState.documents !== 165 || report.importState.months !== 9 || report.importReviewCount !== 1 || report.importReviewDetails[0].id !== "source-purchase" || Math.abs(report.importReviewDetails[0].delta - 368141.61) > 0.01 || report.visibleImportedFiles !== 18 || !report.fileListToggleText.includes("173") || !report.pdfEvidenceLoaded);
  if (errors.length || mobileErrors.length || report.bodyWidth > report.viewportWidth || report.mobile.bodyWidth > report.mobile.viewportWidth || !report.mobile.workspaceVisible || report.costRows !== 9 || report.auditRows !== 8 || !report.evidenceDialogVisible || report.workspaceRuleCount !== 11 || report.workspaceIssueRows !== 11 || report.simulationReviewCount < 3 || !report.simulationVisible || report.simulationMode !== "simulation" || report.restoredReviewCount !== 0 || importFailed) process.exitCode = 1;
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
