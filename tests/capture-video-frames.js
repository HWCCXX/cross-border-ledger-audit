"use strict";

const fs = require("fs");
const path = require("path");
const playwrightPath = process.argv[2];
const browserExecutable = process.argv[3];
const videoUrl = process.argv[4];
const outputDir = process.argv[5];

if (!playwrightPath || !videoUrl || !outputDir) throw new Error("Usage: node capture-video-frames.js <playwright> <browser> <video-url> <output-dir>");
const { chromium } = require(playwrightPath);

(async function () {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;background:#061817;overflow:hidden}video{width:1920px;height:1080px;object-fit:contain}</style><video muted preload="auto" src="' + encodeURI(videoUrl).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"></video>');
  await page.locator("video").evaluate(async function (video) {
    if (video.readyState < 2) await new Promise(function (resolve, reject) {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener("error", reject, { once: true });
    });
  });
  const checkpoints = [
    { time: 1.5, name: "final-frame-01-opening.png" },
    { time: 20, name: "final-frame-02-audits.png" },
    { time: 38, name: "final-frame-03-import.png" },
    { time: 52, name: "final-frame-04-issue.png" },
    { time: 69, name: "final-frame-05-closing.png" }
  ];
  for (const item of checkpoints) {
    await page.locator("video").evaluate(async function (video, time) {
      video.currentTime = time;
      await new Promise(function (resolve) { video.addEventListener("seeked", resolve, { once: true }); });
    }, item.time);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputDir, item.name) });
  }
  await browser.close();
  console.log(path.resolve(outputDir));
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
