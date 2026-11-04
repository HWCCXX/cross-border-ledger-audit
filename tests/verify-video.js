"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const playwrightPath = process.argv[2];
const browserExecutable = process.argv[3];
const videoPath = process.argv[4];

if (!playwrightPath || !videoPath) throw new Error("Usage: node verify-video.js <playwright-module-path> <browser> <video-path>");
const { chromium } = require(playwrightPath);

(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable || undefined });
  const page = await browser.newPage();
  const source = /^https?:\/\//i.test(videoPath) ? encodeURI(videoPath) : pathToFileURL(path.resolve(videoPath)).href;
  await page.setContent('<video muted preload="metadata" src="' + source.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"></video>');
  const metadata = await page.evaluate(async function () {
    const video = document.querySelector("video");
    if (!video) throw new Error("Browser did not create a video element");
    if (video.readyState < 1) await new Promise(function (resolve, reject) {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", reject, { once: true });
    });
    await video.play();
    await new Promise(function (resolve) { setTimeout(resolve, 5300); });
    return { duration: Number.isFinite(video.duration) ? video.duration : "stream", currentTime: video.currentTime, ended: video.ended, width: video.videoWidth, height: video.videoHeight, readyState: video.readyState };
  });
  console.log(JSON.stringify(metadata, null, 2));
  await browser.close();
  if (!(metadata.currentTime >= 4.8 && metadata.width === 1920 && metadata.height === 1080)) process.exitCode = 1;
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
