import { chromium } from '@playwright/test';
import { encode } from 'fast-png';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
const result={runtimeErrors:[],failedRequests:[],layouts:[],stress:{}};
page.on('pageerror',e=>result.runtimeErrors.push(e.message));
page.on('requestfailed',r=>result.failedRequests.push({url:r.url(),failure:r.failure()}));
for(const [route,width,height] of [['/',1440,960],['/',1024,768],['/',768,720],['/',390,844],['/editor/',1440,960],['/editor/',1280,720],['/editor/',1024,768],['/editor/',800,600]]){
 await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:3102'+route);await page.waitForLoadState('networkidle');
 const measurements=await page.evaluate(()=>{
  const box=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();const c=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,display:c.display,overflow:c.overflow}};
  return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,tools:box('.tools-panel'),buttons:[...document.querySelectorAll('.tools-grid button')].map(el=>({width:el.clientWidth,height:el.clientHeight})),patch:box('.pixel-patch'),detailPixel:box('.feature-pixels i'),header:box('.app-bar'),steps:[...document.querySelectorAll('.home-steps article')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}),arrows:[...document.querySelectorAll('.step-arrow')].map(el=>{const r=el.getBoundingClientRect();return {center:r.left+r.width/2,display:getComputedStyle(el).display}})};
 });result.layouts.push({route,width,height,...measurements});
 await page.screenshot({path:`artifacts/audit-${route==='/'?'home':'editor'}-${width}.png`,fullPage:true});
}
function fixture(size,i){const data=new Uint8Array(size*size*4);for(let n=0;n<data.length;n+=4)data.set([80+i*5,130,60,255],n);return {name:`frame-${String(i).padStart(2,'0')}.png`,mimeType:'image/png',buffer:Buffer.from(encode({width:size,height:size,channels:4,depth:8,data}))};}
await page.setViewportSize({width:1440,height:960});await page.goto('http://127.0.0.1:3102/editor/');
await page.getByRole('button',{name:'动画编辑',exact:true}).click();
let started=performance.now();await page.getByTestId('file-input').setInputFiles(Array.from({length:20},(_,i)=>fixture(256,i)));
await page.getByRole('status').filter({hasText:'已导入'}).waitFor();result.stress.twentyFrameImportMs=performance.now()-started;
await page.getByRole('spinbutton',{name:'帧率'}).fill('20');
const play=page.getByRole('button',{name:'播放',exact:true});await play.click();
result.stress.previewSamples=[];for(let i=0;i<8;i++){await page.waitForTimeout(500);result.stress.previewSamples.push(await page.getByTestId('preview-index').textContent());}
await page.getByRole('button',{name:'暂停',exact:true}).click();
await page.getByRole('button',{name:'清空',exact:true}).click();
await page.getByRole('button',{name:'图片编辑',exact:true}).click();started=performance.now();await page.getByTestId('file-input').setInputFiles(Array.from({length:15},(_,i)=>fixture(1024,i)));
await page.getByRole('status').filter({hasText:'已导入'}).waitFor({timeout:30000});result.stress.fifteenLargeImportMs=performance.now()-started;
result.stress.heap=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null);
await page.getByTestId('file-input').setInputFiles([fixture(1024,16)]);await page.getByRole('alert').filter({hasText:'总像素'}).waitFor();result.stress.overLimitRejected=true;
await page.getByRole('button',{name:'关闭提示'}).click();
await page.getByRole('button',{name:'导出选项'}).click();
const download=page.waitForEvent('download');started=performance.now();await page.getByRole('button',{name:/全部图片/}).click();const file=await download;result.stress.largeZipMs=performance.now()-started;result.stress.zipName=file.suggestedFilename();result.stress.downloadFailure=await file.failure();
await writeFile('artifacts/release-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
