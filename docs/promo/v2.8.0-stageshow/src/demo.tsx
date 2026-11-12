import React from 'react'
import { Home, Search, Bell, Mail, List, User, MoreHorizontal, ArrowLeft, MessageCircle, Repeat2, Heart, BarChart2, Share, GripVertical, X as Close, Check, Bookmark, Settings } from 'lucide-react'
import { Stage, Window, Field, Row, Avatar, Bar, Popover, Collapse, Roll, type Act } from '../kit'

type S = {open:boolean; query:string; lookup:0|1|2; selected:boolean; chinese:boolean; english:boolean; listOpen:boolean; focus:string; saved:boolean; veil:boolean; step:number}
const initial:S={open:false,query:'',lookup:0,selected:false,chinese:false,english:false,listOpen:false,focus:'',saved:false,veil:false,step:0}
const poster:S={...initial,open:true,chinese:true,english:true,step:3}
const panelPoster:S={...initial,open:true,saved:true,chinese:true,step:1}
const cn={name:'林舟',handle:'linzhou_demo'}, en={name:'Chris Chen',handle:'chris_demo'}
const Star=({filled=false,size=18}:{filled?:boolean;size?:number})=><svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></svg>
async function lookupScript(a:Act<S>){
 await a.wait(500); a.mark('open'); await a.click({at:'favorites',x:.85,y:.5}); await a.set({open:true,step:1}); await a.wait(450)
 a.mark('chinese-input'); await a.click({at:'add-field',x:.25,y:.5}); await a.type('query','林舟',{interval:230}); await a.wait(220); await a.set({lookup:1}); await a.wait(800)
 a.mark('chinese-choice'); await a.click({at:'candidate-cn',x:.88,y:.5}); await a.set({chinese:true,lookup:0,query:''}); await a.wait(1150)
 a.mark('english-input'); await a.click({at:'add-field',x:.25,y:.5}); await a.type('query','Chris',{interval:100}); await a.wait(220); await a.set({lookup:2,step:2}); await a.wait(950)
 a.mark('keyboard-choice'); await a.key('down'); await a.set({selected:true}); await a.wait(250); await a.key('enter'); await a.set({english:true,lookup:0,query:'',selected:false,step:3}); await a.move({at:'panel-title',x:.88,y:.5}); await a.wait(2200)
 a.mark('close'); await a.key('esc'); await a.set({open:false}); await a.wait(400); await a.snap({chinese:false,english:false,step:0}); await a.wait(200)
 await a.move({at:'outside',x:.8,y:.5},{duration:450}); await a.wait(150);
 ;(window as any).__demoDone=true
}
async function panelScript(a:Act<S>){
 await a.wait(650); a.mark('compact-actions'); await a.click({at:'profile-favorite',x:.8,y:.55}); await a.set({saved:true,chinese:true,step:1}); await a.wait(1100)
 a.mark('open-favorites'); await a.click({at:'favorites',x:.85,y:.5}); await a.set({open:true}); await a.wait(1400)
 a.mark('escape'); await a.key('esc'); await a.set({open:false,focus:'favorites',step:2}); await a.wait(850)
 a.mark('open-lists'); await a.click({at:'lists',x:.85,y:.5}); await a.set({listOpen:true,focus:''}); await a.wait(1150)
 a.mark('toggle-close'); await a.click({at:'lists',x:.85,y:.5}); await a.set({listOpen:false}); await a.wait(650)
 a.mark('outside-close'); await a.click({at:'lists',x:.85,y:.5}); await a.set({listOpen:true,step:3}); await a.wait(700); await a.click({at:'outside',x:.88,y:.5}); await a.set({listOpen:false}); await a.wait(1300)
 a.mark('reset'); await a.click({at:'profile-favorite',x:.8,y:.55}); await a.set({saved:false,chinese:false,focus:'',step:0}); await a.wait(450)
 await a.move({at:'outside',x:.8,y:.5},{duration:450}); await a.wait(150);
 ;(window as any).__demoDone=true
}
const nav=[['主页',Home,'home'],['探索',Search,'search'],['通知',Bell,'notice'],['聊天',Mail,'chat'],['我的列表',List,'lists'],['收藏',Star,'favorites'],['个人资料',User,'profile'],['更多',MoreHorizontal,'more']] as const
export function Demo({kind}:{kind:'lookup'|'panels'}){
 return <div className="demo-frame"><header className="demo-header"><div className="demo-kicker">oh-my-x <span>2.8.0</span></div><div className="demo-title">{kind==='lookup'?'只记得昵称，也能收藏':'操作更轻，开合更顺手'}</div><div className="demo-sub">{kind==='lookup'?'中文 / 英文昵称，选对人再收藏':'紧凑按钮 · 统一面板交互'}</div><span className="demo-watermark">界面模拟 · 演示账号</span></header><Stage<S> width={840} height={570} compact={{below:560,width:358,height:570}} initial={initial} poster={kind==='lookup'?poster:panelPoster} script={kind==='lookup'?lookupScript:panelScript} keys={{wide:'bottom-right',compact:'bottom-right'}} cursor={{at:{at:'outside',x:.8,y:.5},ripple:true}} accent="#1d9bf0" greys="cool" fidelity="realistic" className="omx" tokens={{'--ss-font':'-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'}}>
 {(s,rect,layout)=>{const compact=layout==='compact'; const fav=rect('favorites'), list=rect('lists'); const left=compact?19:205; const top=compact?62:62; return <>
 <Window url="x.com" urlShape="pill" className="omx-window" style={{left:compact?12:20,top:20,width:compact?560:800,height:660}} body={{className:'omx-body','data-crop':true}}>
 <aside className="omx-nav">
 <div className="omx-xmark">𝕏</div>
 <div className="omx-nav-links">{nav.map(([title,Ic,target])=><div key={target} data-target={target} data-cursor="pointer" className="omx-nav-item" data-open={(target==='favorites'&&s.open)||(target==='lists'&&s.listOpen)||undefined} data-focus={s.focus===target||undefined}><Ic size={22}/><span>{title}</span></div>)}</div>
 <div className="omx-post-btn">发帖</div>
 </aside>
 <main className="omx-profile">
 <div className="omx-profile-top"><ArrowLeft size={19}/><div><strong>林舟</strong><small>创作者 · 示例主页</small></div></div>
 <div className="omx-cover"><div>把有用的想法，留在眼前。</div></div>
 <div className="omx-profile-hero"><Avatar name="林舟" size={62}/><div className="omx-native-actions"><MoreHorizontal size={18}/><span>已关注</span></div></div>
 <div className="omx-name"><strong>林舟</strong><div className="omx-actions"><span data-target="profile-list" data-cursor="pointer">加列表</span><span data-target="profile-favorite" data-cursor="pointer" data-saved={s.saved||undefined}><Star size={14} filled={s.saved}/><Roll variant="fade">{s.saved?'已收藏':'收藏'}</Roll></span></div></div>
 <div className="omx-handle">@linzhou_demo</div>
 <div className="omx-bio" data-target="outside">记录产品、阅读和日常灵感。<br/>用小工具，把关注变得更有条理。</div>
 <div className="omx-count"><strong>128</strong> 正在关注 <strong>2,048</strong> 关注者</div>
 <div className="omx-tabs"><b>帖子</b><span>回复</span><span>媒体</span></div>
 <div className="omx-tweet"><Avatar name="林舟" size={34}/><div><div className="omx-tweet-name">林舟 <span>@linzhou_demo · 2小时</span></div><div>好工具不是多一个按钮，<br/>而是少一次来回查找。</div><div className="omx-tweet-actions"><MessageCircle size={15}/><Repeat2 size={15}/><Heart size={15}/><BarChart2 size={15}/><Share size={15}/></div></div></div>
 <div className="omx-tweet omx-filler"><Avatar name="夏禾" size={34}/><div><Bar w={150} h={7}/><Bar w={260} h={7}/><Bar w={215} h={7}/></div></div>
 </main></Window>
 <Popover show={s.open} origin="top left" className="omx-fav-panel" style={{left,top,width:320}}>
 <div className="omx-panel-title" data-target="panel-title"><span>收藏</span></div>
 <div className="omx-add-form"><Field value={s.query} placeholder="昵称、@用户名或主页链接" focused={!!s.query||s.lookup>0} box={{'data-target':'add-field'}}/><span className="omx-add">收藏博主</span></div>
 <Collapse open={s.lookup>0} reveal="clip"><div className="omx-lookup" data-visible={s.lookup>0||undefined}><div className="omx-lookup-message"><span>选择博主即可收藏</span></div><div className="omx-candidate-set" data-snap="query-results">{s.lookup===2||s.english?<><Candidate name="Chris Chen" handle="chris_demo" following selected={s.selected} target="candidate-en"/><div className="omx-direct">按用户名收藏 @Chris</div></>:<><Candidate name="林舟" handle="linzhou_demo" following target="candidate-cn"/></>}</div></div></Collapse>
 <div className="omx-search"><Field value="" placeholder="搜索收藏的博主"/></div>
 <Collapse open={s.chinese||s.english} reveal="drop"><div className="omx-status"><Check size={14}/><Roll variant="fade">{s.english?'已收藏 @chris_demo':'已收藏 @linzhou_demo'}</Roll></div></Collapse>
 <div className="omx-saved-list"><Collapse open={s.english} reveal="drop"><Saved name={en.name} handle={en.handle}/></Collapse><Collapse open={s.chinese} reveal="drop"><Saved name={cn.name} handle={cn.handle}/></Collapse><Saved name="夏禾" handle="xiahe_demo"/></div>
 <div className="omx-local"><span>仅保存在当前浏览器，不影响 X 关注和 Lists</span></div>
 </Popover>
 <Popover show={s.listOpen} origin="top left" className="omx-list-panel" style={{left:compact?19:list.x+list.width+12,top:100,width:300}}>
 <div className="omx-panel-title"><span>我的列表</span></div><div className="omx-list-filters"><span className="active">全部 <small>3</small></span><span>置顶 <small>1</small></span><span>创建 <small>2</small></span><span>关注 <small>1</small></span></div>
 <Row pad={12} title="独立开发者" meta={<PinMark filled/>}/><Row pad={12} title="产品与设计" meta={<PinMark/>}/><Row pad={12} title={<>值得反复读的人 <small className="omx-followed">关注</small></>} meta={<PinMark/>}/>
 </Popover>
 <div className="omx-veil" data-show={s.veil||undefined}/>
 </>}}
 </Stage><footer className="demo-footer">{kind==='lookup'?'点击候选，或用 ↓ + 回车收藏。仅保存在当前浏览器。':'Esc、再次点击入口、点击外部：面板用同一套方式关闭。'}</footer></div>
}
function Candidate({name,handle,following,selected,target}:{name:string;handle:string;following?:boolean;selected?:boolean;target?:string}){return <Row className="omx-candidate" pad={8} lead={<Avatar name={name} size={32}/>} title={name} subtitle={`@${handle}${following?' · 已关注':''}`} selected={selected} data-target={target} data-cursor="pointer"/>}
function Saved({name,handle}:{name:string;handle:string}){return <Row className="omx-saved" pad={8} lead={<GripVertical size={15}/>} title={name} subtitle={`@${handle}`}><span className="omx-remove"><Close size={12}/></span></Row>}

function PinMark({filled=false}:{filled?:boolean}){return <svg width="16" height="16" viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>}
