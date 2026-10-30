// node render.cjs preview t1,t2,...   |   node render.cjs video out.mp4 [fps]
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const FFMPEG = process.env.FFMPEG;
(async () => {
  const [mode, arg, fpsArg] = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('file:///' + path.resolve(__dirname, 'video.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.evaluate(() => Promise.all([...document.images].filter(i => i.getAttribute('src')).map(i => i.decode())));
  const total = await page.evaluate(() => window.TOTAL);
  console.log('TOTAL', total.toFixed(1), 's');
  if (mode === 'preview') {
    for (const t of arg.split(',').map(Number)) {
      await page.evaluate(t => seek(t), t); await page.evaluate(() => { const w = window.__wait; window.__wait = null; return w; });
      await page.screenshot({ path: path.join(__dirname, `prev_${t}.jpg`), type: 'jpeg', quality: 80 });
    }
  } else {
    const fps = Number(fpsArg || 30);
    const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '27', '-movflags', '+faststart', arg], { stdio: ['pipe', 'ignore', 'inherit'] });
    const n = Math.ceil(total * fps);
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => seek(t), i / fps); await page.evaluate(() => { const w = window.__wait; window.__wait = null; return w; });
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
