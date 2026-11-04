"use strict";

const fs = require("fs");
const path = require("path");

const playwrightPath = process.argv[2];
const targetUrl = process.argv[3] || "https://hwccxx.github.io/cross-border-ledger-audit/";
const browserExecutable = process.argv[4];
const importZip = process.argv[5];

if (!playwrightPath || !importZip) {
  throw new Error("Usage: node create-final-video.js <playwright-module-path> <url> <browser> <import-zip>");
}

const { chromium } = require(playwrightPath);
const projectRoot = path.resolve(__dirname, "..");
const frameDir = path.join(__dirname, "video-final-frames");
const outputVideo = path.join(projectRoot, "submission", "04-演示视频.webm");

fs.mkdirSync(frameDir, { recursive: true });
fs.mkdirSync(path.dirname(outputVideo), { recursive: true });

(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    acceptDownloads: false
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", function (message) { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", function (error) { errors.push(error.message); });
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 120000 });

  async function shot(name) {
    const file = path.join(frameDir, name + ".png");
    await page.screenshot({ path: file, fullPage: false });
    return "data:image/png;base64," + fs.readFileSync(file).toString("base64");
  }

  const assets = {};
  assets.overview = await shot("01-overview");

  await page.click('[data-view="costs"]');
  await page.waitForTimeout(400);
  assets.costs = await shot("02-costs");

  await page.click('[data-view="audits"]');
  await page.waitForTimeout(400);
  assets.audits = await shot("03-audits");
  await page.locator(".audit-item").first().click();
  await page.waitForTimeout(250);
  assets.auditDialog = await shot("04-audit-dialog");
  await page.click("#dialog-close");

  await page.click('[data-view="workspace"]');
  await page.waitForTimeout(450);
  await page.evaluate(function () { window.scrollTo(0, 0); });
  assets.workspace = await shot("05-workspace");

  await page.locator("#file-input").setInputFiles(importZip);
  await page.waitForFunction(function () {
    return document.querySelector("#workspace-status").dataset.state !== "working";
  }, null, { timeout: 120000 });
  await page.evaluate(function () { window.scrollTo(0, 0); });
  await page.waitForTimeout(350);
  assets.imported = await shot("06-imported");

  const reviewCard = page.locator('.issue-card[data-status="review"]').first();
  await reviewCard.scrollIntoViewIfNeeded();
  await reviewCard.click();
  await page.waitForTimeout(250);
  assets.issueDialog = await shot("07-issue-dialog");
  await page.click("#source-dialog-close");

  await page.locator("#evidence-library").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assets.evidence = await shot("08-evidence-library");

  await page.locator("#simulation-scenario").selectOption("combined");
  await page.click("#run-simulation");
  await page.locator("#simulation-banner").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assets.simulation = await shot("09-simulation");
  await page.click("#restore-baseline");

  if (errors.length) throw new Error("Browser errors while capturing final site: " + errors.join(" | "));

  const renderPage = await context.newPage();
  await renderPage.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#061817;overflow:hidden}</style>');
  await renderPage.exposeFunction("saveFinalVideo", async function (dataUrl) {
    const serialized = String(dataUrl);
    const base64 = serialized.slice(serialized.lastIndexOf(",") + 1);
    fs.writeFileSync(outputVideo, Buffer.from(base64, "base64"));
  });

  const result = await renderPage.evaluate(async function (images) {
    const W = 1920;
    const H = 1080;
    const fps = 30;
    const scenes = [
      { key: "overview", duration: 6000, kicker: "LEDGER EVIDENCE LAB", title: "让每一个经营数字，\n找到它的证据。", subtitle: "跨境账证侦探 · 本地优先经营核验", chips: ["本地导入", "确定性复算", "证据下钻"], dark: 0.88 },
      { key: "overview", duration: 7000, kicker: "RING 01—03 / OVERVIEW", title: "九个月经营结构，\n一屏完成复算。", subtitle: "收入 1,600 万元 · 成本 1,120 万元 · 利润率 30%", chips: ["统一口径", "逐月追踪"], dark: 0.72 },
      { key: "costs", duration: 7000, kicker: "RING 04 / COST STRUCTURE", title: "四类核心成本，\n不再散落在不同台账。", subtitle: "广告、头程、采购、FBA 统一进入月度经营结构", chips: ["趋势可见", "来源可核"], dark: 0.69 },
      { key: "audits", duration: 6500, kicker: "RING 05 / RECONCILIATION", title: "8 条基础勾稽，\n从总额核到站点。", subtitle: "收入、成本、利润、站点销售与证据数量逐项闭合", chips: ["8 / 8 通过"], dark: 0.72 },
      { key: "auditDialog", duration: 6500, kicker: "EVIDENCE INDEX", title: "每一条结果，\n都能解释怎么算。", subtitle: "计算口径、证据类型、数量与覆盖范围同时呈现", chips: ["匿名证据", "可追溯"], dark: 0.67 },
      { key: "workspace", duration: 7000, kicker: "RING 06 + 07 / LOCAL WORKSPACE", title: "导入文件，\n找到真正的异常。", subtitle: "ZIP、CSV、TSV、JSON、XLSX、PDF 只在浏览器内存处理", chips: ["不上云", "刷新即清除"], dark: 0.70 },
      { key: "imported", duration: 8000, kicker: "REAL SYNTHETIC DATASET", title: "173 个文件，\n一次完成结构识别。", subtitle: "11 张结构化表 · 165 份 PDF 索引 · 9 个月数据", chips: ["本地解析", "自动归类"], dark: 0.68 },
      { key: "issueDialog", duration: 8500, kicker: "DETERMINISTIC EXPLANATION", title: "口径差，\n必须说清楚。", subtitle: "含税采购 3,200,000 元 − 不含税台账 2,831,858.39 元 = 368,141.61 元", chips: ["1 项待复核", "定位来源行"], dark: 0.62 },
      { key: "evidence", duration: 7000, kicker: "RING 08 / EVIDENCE DRILL-DOWN", title: "不是只报异常，\n而是给出证据路径。", subtitle: "来源文件 → 工作表 → 数据行 → PDF 页面", chips: ["165 份 PDF", "按需读取"], dark: 0.69 },
      { key: "simulation", duration: 7000, kicker: "RING 09 / SAFE SIMULATION", title: "先模拟风险，\n再还原基准。", subtitle: "组合异常只作用于内存副本，不修改用户原文件", chips: ["SIMULATION", "一键还原"], dark: 0.72 },
      { key: "overview", duration: 6500, kicker: "CROSS-BORDER LEDGER AUDIT", title: "本地优先。\n确定性复算。\n证据可追溯。", subtitle: "hwccxx.github.io/cross-border-ledger-audit/", chips: ["FINAL BUILD"], dark: 0.90 }
    ];
    const totalDuration = scenes.reduce(function (sum, scene) { return sum + scene.duration; }, 0);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    function loadImage(src) {
      return new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = reject;
        image.src = src;
      });
    }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function ease(value) { value = clamp(value, 0, 1); return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2; }
    function roundedRect(x, y, w, h, radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); }
    function cover(image, scale, offsetX, offsetY) {
      const ratio = Math.max(W / image.width, H / image.height) * scale;
      const w = image.width * ratio;
      const h = image.height * ratio;
      ctx.drawImage(image, (W - w) / 2 + offsetX, (H - h) / 2 + offsetY, w, h);
    }
    function drawChip(x, y, text, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 25px "Microsoft YaHei", sans-serif';
      const width = ctx.measureText(text).width + 46;
      roundedRect(x, y, width, 54, 27);
      ctx.fillStyle = "rgba(5,28,26,.90)";
      ctx.fill();
      ctx.strokeStyle = "rgba(223,255,114,.78)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f8f5ed";
      ctx.fillText(text, x + 23, y + 36);
      ctx.restore();
      return width;
    }
    function drawMultiline(text, x, y, lineHeight, maxWidth) {
      const lines = text.split("\n");
      lines.forEach(function (line, index) { ctx.fillText(line, x, y + index * lineHeight, maxWidth); });
      return lines.length;
    }

    const loaded = {};
    for (const key of Object.keys(images)) loaded[key] = await loadImage(images[key]);

    const stream = canvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0];
    let audioContext;
    try {
      audioContext = new AudioContext({ sampleRate: 48000 });
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      const t0 = audioContext.currentTime;
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.035, t0 + 0.8);
      master.gain.setValueAtTime(0.035, t0 + totalDuration / 1000 - 1.2);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + totalDuration / 1000 - 0.1);
      master.connect(destination);
      [110, 164.81, 220].forEach(function (frequency, index) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.24 : 0.08;
        oscillator.connect(gain).connect(master);
        oscillator.start(t0);
        oscillator.stop(t0 + totalDuration / 1000);
      });
      let boundary = 0;
      scenes.forEach(function (scene, index) {
        if (index > 0) {
          const when = t0 + boundary / 1000;
          [660, 880].forEach(function (frequency, toneIndex) {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, when + toneIndex * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.07, when + toneIndex * 0.08 + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + toneIndex * 0.08 + 0.42);
            oscillator.connect(gain).connect(master);
            oscillator.start(when + toneIndex * 0.08);
            oscillator.stop(when + toneIndex * 0.08 + 0.45);
          });
        }
        boundary += scene.duration;
      });
      destination.stream.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
      await audioContext.resume();
    } catch (error) {
      // The visual track remains valid if WebAudio is unavailable.
    }

    const preferred = "video/webm;codecs=vp9,opus";
    const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : "video/webm;codecs=vp8,opus";
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 5200000,
      audioBitsPerSecond: 96000
    });
    const chunks = [];
    recorder.ondataavailable = function (event) { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise(function (resolve) { recorder.onstop = resolve; });
    recorder.start(500);

    const start = performance.now();
    await new Promise(function (resolve) {
      function frame(now) {
        const elapsed = Math.min(now - start, totalDuration);
        let cursor = 0;
        let sceneIndex = scenes.length - 1;
        for (let index = 0; index < scenes.length; index += 1) {
          if (elapsed < cursor + scenes[index].duration) { sceneIndex = index; break; }
          cursor += scenes[index].duration;
        }
        const scene = scenes[sceneIndex];
        const local = elapsed - cursor;
        const progress = clamp(local / scene.duration, 0, 1);
        const enter = ease(local / 700);
        const exit = 1 - ease((local - scene.duration + 650) / 650);
        const alpha = Math.min(enter, exit);

        ctx.clearRect(0, 0, W, H);
        ctx.save();
        const driftX = (sceneIndex % 2 ? -1 : 1) * 16 * progress;
        const driftY = (sceneIndex % 3 - 1) * 10 * progress;
        cover(loaded[scene.key], 1.015 + progress * 0.018, driftX, driftY);
        ctx.restore();

        if (local < 650 && sceneIndex > 0) {
          const previous = scenes[sceneIndex - 1];
          ctx.save();
          ctx.globalAlpha = 1 - ease(local / 650);
          cover(loaded[previous.key], 1.03, 0, 0);
          ctx.restore();
        }

        const shade = ctx.createLinearGradient(0, 0, W, 0);
        shade.addColorStop(0, "rgba(2,20,18," + scene.dark + ")");
        shade.addColorStop(0.52, "rgba(2,20,18," + Math.max(0.18, scene.dark - 0.46) + ")");
        shade.addColorStop(1, "rgba(2,20,18,.04)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#dfff72";
        roundedRect(105, 82, 78, 10, 5);
        ctx.fill();
        ctx.font = '800 24px "Microsoft YaHei", sans-serif';
        ctx.fillText(scene.kicker, 105, 142);

        ctx.fillStyle = "#f8f5ed";
        const lineCount = scene.title.split("\n").length;
        const titleSize = lineCount >= 3 ? 76 : 88;
        const titleLine = lineCount >= 3 ? 100 : 112;
        ctx.font = '800 ' + titleSize + 'px "Microsoft YaHei", sans-serif';
        drawMultiline(scene.title, 105, 300, titleLine, 1050);

        const subtitleY = 300 + lineCount * titleLine + 42;
        roundedRect(105, subtitleY, 1050, 92, 22);
        ctx.fillStyle = "rgba(4,31,28,.90)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = '600 31px "Microsoft YaHei", sans-serif';
        ctx.fillText(scene.subtitle, 142, subtitleY + 58, 980);

        let chipX = 108;
        const chipY = subtitleY + 132;
        scene.chips.forEach(function (chip) {
          chipX += drawChip(chipX, chipY, chip, alpha) + 16;
        });
        ctx.restore();

        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(0, H - 9, W, 9);
        ctx.fillStyle = "#dfff72";
        ctx.fillRect(0, H - 9, W * (elapsed / totalDuration), 9);
        if (videoTrack && typeof videoTrack.requestFrame === "function") videoTrack.requestFrame();

        if (elapsed < totalDuration) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    recorder.stop();
    await stopped;
    if (audioContext) await audioContext.close();
    const blob = new Blob(chunks, { type: mimeType });
    const dataUrl = await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await window.saveFinalVideo(dataUrl);
    return { duration: totalDuration / 1000, mimeType: mimeType, bytes: blob.size, chunks: chunks.length, fps: fps };
  }, assets);

  await browser.close();
  const stat = fs.statSync(outputVideo);
  console.log(JSON.stringify({ output: outputVideo, bytes: stat.size, render: result, source: targetUrl }, null, 2));
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
