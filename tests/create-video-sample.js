"use strict";

const fs = require("fs");
const path = require("path");
const playwrightPath = process.argv[2];
const targetUrl = process.argv[3] || "http://127.0.0.1:8765/";
const browserExecutable = process.argv[4];

if (!playwrightPath) throw new Error("Usage: node create-video-sample.js <playwright-module-path> [url] [browser]");

const { chromium } = require(playwrightPath);
const outputDir = path.resolve(__dirname, "..", "submission", "video-preview");
const outputVideo = path.join(outputDir, "跨境账证侦探-5秒效果样片.webm");
const overviewImage = path.join(outputDir, "sample-overview.png");
const workspaceImage = path.join(outputDir, "sample-workspace.png");

fs.mkdirSync(outputDir, { recursive: true });

(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: overviewImage });
  await page.click('[data-view="workspace"]');
  await page.waitForTimeout(450);
  await page.screenshot({ path: workspaceImage });

  const overviewData = "data:image/png;base64," + fs.readFileSync(overviewImage).toString("base64");
  const workspaceData = "data:image/png;base64," + fs.readFileSync(workspaceImage).toString("base64");
  const renderPage = await context.newPage();
  await renderPage.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#061817;overflow:hidden}</style>');
  await renderPage.bringToFront();
  await renderPage.exposeFunction("saveVideoBase64", async function (dataUrl) {
    const serialized = String(dataUrl);
    const base64 = serialized.slice(serialized.lastIndexOf(",") + 1);
    fs.writeFileSync(outputVideo, Buffer.from(base64, "base64"));
  });

  const captureResult = await renderPage.evaluate(async function (assets) {
    const width = 1920;
    const height = 1080;
    const duration = 5000;
    const fps = 30;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
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
    function ease(value) { return 1 - Math.pow(1 - clamp(value, 0, 1), 3); }
    function roundedRect(x, y, w, h, radius) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
    }
    function fitCover(image, scale) {
      const ratio = Math.max(width / image.width, height / image.height) * scale;
      const w = image.width * ratio;
      const h = image.height * ratio;
      ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    }
    function chip(x, y, text, delay, time) {
      const alpha = ease((time - delay) / 420);
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 28px "Microsoft YaHei", sans-serif';
      const w = ctx.measureText(text).width + 52;
      roundedRect(x, y, w, 58, 29);
      ctx.fillStyle = "rgba(7,30,28,.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(223,255,114,.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f8f5ed";
      ctx.fillText(text, x + 26, y + 39);
      ctx.restore();
      return w;
    }

    const overview = await loadImage(assets.overview);
    const workspace = await loadImage(assets.workspace);
    const stream = canvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0];

    let audioContext;
    try {
      audioContext = new AudioContext({ sampleRate: 48000 });
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, audioContext.currentTime);
      master.gain.exponentialRampToValueAtTime(0.055, audioContext.currentTime + 0.22);
      master.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 4.9);
      master.connect(destination);
      [220, 330, 440].forEach(function (frequency, index) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? 0.32 : 0.12;
        oscillator.connect(gain).connect(master);
        oscillator.start(audioContext.currentTime + index * 0.06);
        oscillator.stop(audioContext.currentTime + 5);
      });
      destination.stream.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
      await audioContext.resume();
    } catch (error) {
      // Visual sample remains valid if browser audio is unavailable.
    }

    const preferred = "video/webm;codecs=vp9,opus";
    const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : "video/webm;codecs=vp8,opus";
    const recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 9000000, audioBitsPerSecond: 128000 });
    const chunks = [];
    recorder.ondataavailable = function (event) { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise(function (resolve) { recorder.onstop = resolve; });
    recorder.start(250);

    const start = performance.now();
    await new Promise(function (resolve) {
      function frame(now) {
        const time = now - start;
        const progress = clamp(time / duration, 0, 1);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        fitCover(overview, 1 + progress * 0.018);
        ctx.restore();
        const crossfade = ease((time - 2350) / 650);
        if (crossfade > 0) {
          ctx.save();
          ctx.globalAlpha = crossfade;
          fitCover(workspace, 1.014 - progress * 0.008);
          ctx.restore();
        }

        const shade = ctx.createLinearGradient(0, 0, width, 0);
        shade.addColorStop(0, "rgba(3,18,17,.92)");
        shade.addColorStop(.56, "rgba(3,18,17,.28)");
        shade.addColorStop(1, "rgba(3,18,17,.08)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, width, height);

        const fade = ease(time / 520) * (1 - ease((time - 4680) / 320));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#dfff72";
        roundedRect(104, 92, 82, 12, 6);
        ctx.fill();
        ctx.font = '800 25px "Microsoft YaHei", sans-serif';
        ctx.letterSpacing = "5px";
        ctx.fillText("LEDGER EVIDENCE LAB", 104, 150);
        ctx.letterSpacing = "0px";

        const firstLine = ease((time - 260) / 620);
        ctx.globalAlpha = fade * firstLine;
        ctx.fillStyle = "#f8f5ed";
        ctx.font = '500 86px "Microsoft YaHei", sans-serif';
        ctx.fillText("让每一个经营数字，", 104, 340);

        const secondLine = ease((time - 900) / 680);
        ctx.globalAlpha = fade * secondLine;
        ctx.fillStyle = "#dfff72";
        ctx.font = '800 108px "Microsoft YaHei", sans-serif';
        ctx.fillText("找到它的证据。", 104, 478);

        ctx.globalAlpha = fade;
        let chipX = 108;
        chipX += (chip(chipX, 610, "本地导入", 1550, time) || 0) + 18;
        chipX += (chip(chipX, 610, "确定性复算", 1780, time) || 0) + 18;
        chip(chipX, 610, "证据下钻", 2010, time);

        const captionAlpha = ease((time - 2700) / 520);
        ctx.globalAlpha = fade * captionAlpha;
        roundedRect(104, 780, 940, 104, 24);
        ctx.fillStyle = "rgba(7,30,28,.9)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = '600 36px "Microsoft YaHei", sans-serif';
        ctx.fillText("文件不上传服务器 · 金额由程序确定性计算", 144, 846);
        ctx.restore();

        ctx.fillStyle = "rgba(255,255,255,.18)";
        ctx.fillRect(0, height - 8, width, 8);
        ctx.fillStyle = "#dfff72";
        ctx.fillRect(0, height - 8, width * progress, 8);
        if (videoTrack && typeof videoTrack.requestFrame === "function") videoTrack.requestFrame();

        if (time < duration) requestAnimationFrame(frame);
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
    await window.saveVideoBase64(dataUrl);
    return { mimeType: mimeType, chunkSizes: chunks.map(function (chunk) { return chunk.size; }), totalBytes: blob.size };
  }, { overview: overviewData, workspace: workspaceData });

  await browser.close();
  const stat = fs.statSync(outputVideo);
  console.log(JSON.stringify({ output: outputVideo, bytes: stat.size, durationSeconds: 5, format: captureResult.mimeType, chunks: captureResult.chunkSizes }, null, 2));
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
