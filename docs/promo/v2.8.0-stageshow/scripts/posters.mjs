import {launch} from './browser.mjs'
const browser=await launch();const page=await browser.newPage({viewport:{width:840,height:900},deviceScaleFactor:1.25,reducedMotion:'reduce'});
for(const [scene,name] of [['lookup','昵称查找收藏'],['panels','按钮与面板交互']]){await page.goto('http://127.0.0.1:4188/?scene='+scene,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);await page.locator('.demo-frame').screenshot({path:`deliverables/oh-my-x-2.8.0-${name}-封面.png`})}await browser.close()
