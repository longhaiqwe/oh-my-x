import {buildSync} from 'esbuild'
import {mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {launch} from './browser.mjs'
const scene=process.argv[2]||'lookup', compact=process.argv[3]==='compact', fps=20
const root=`out/${scene}${compact?'-compact':''}`
const source=buildSync({entryPoints:['kit/clock.ts'],bundle:true,write:false,format:'iife',globalName:'StageshowClock',target:'es2022'}).outputFiles[0].text
const browser=await launch(),context=await browser.newContext({viewport:{width:compact?390:840,height:900},deviceScaleFactor:1.25})
await context.addInitScript({content:source+'\nStageshowClock.installVirtualClock({fps:20,epoch:1794304800000});'})
const page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await page.goto(`http://127.0.0.1:4188/?scene=${scene}`,{waitUntil:'networkidle'})
await page.evaluate(async()=>{await document.fonts.ready;await window.__stageshow.clock.flushLayout();await window.__stageshow.clock.settle()})
const clip=await page.locator('.demo-frame').boundingBox()
rmSync(root+'-frames',{recursive:true,force:true});mkdirSync(root+'-frames',{recursive:true})
let count=0,done=false
for(let frame=0;frame<500;frame++){
 await page.screenshot({path:`${root}-frames/${String(frame).padStart(4,'0')}.png`,clip})
 count++;done=await page.evaluate(()=>Boolean(window.__demoDone));if(done)break
 await page.evaluate(()=>window.__stageshow.clock.step())
 if(frame%100===0)console.log(scene,frame/fps)
}
writeFileSync(root+'-metadata.json',JSON.stringify({fps,frames:count,duration:count/fps,clip,errors,done},null,2))
await browser.close();if(!done||errors.length)throw Error(JSON.stringify({done,errors}));console.log(scene,'completed',count/fps)
