// 设计原型。所有记录为合成数据；只导出用户选择的演示结果，不读取或写入真实账号。
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => n === null ? '未获取' : n.toLocaleString('zh-CN');
const buckets = [
  { label: '不足3千', min: 0, max: 3000, count: 168 },
  { label: '3千–不足1万', min: 3000, max: 10000, count: 52 },
  { label: '1万–不足3万', min: 10000, max: 30000, count: 26 },
  { label: '3万–不足5万', min: 30000, max: 50000, count: 9 },
  { label: '5万–不足10万', min: 50000, max: 100000, count: 6 },
  { label: '10万及以上', min: 100000, max: Infinity, count: 3 },
];
const topics = ['界面设计', '独立开发', '产品研究', '读书记录', '创作笔记', '技术观察'];
let serial = 1;
const followers = buckets.flatMap(b => Array.from({length: b.count}, (_, i) => {
  const id = serial++;
  return { id, name: `示例·${topics[id % 6]}`, handle: `demo_${String(id).padStart(3, '0')}`, followers: b.min + Math.floor(((b.max === Infinity ? 180000 : b.max) - b.min) * i / b.count), following: 100 + id * 3, followsMe: null, ageDays: null };
}));
const missing = Array.from({length: 8}, (_, i) => ({ id: 265+i, name: '示例·资料待补', handle: `demo_${265+i}`, followers: null, following: null, followsMe: null, ageDays: null }));
const following = Array.from({length: 90}, (_, i) => ({
  id: i + 1, name: `示例·${topics[i % 6]}`, handle: `follow_${String(i + 1).padStart(3, '0')}`,
  followers: i < 12 ? 73600 - i * 5200 : i >= 84 ? 20 + i - 84 : 9800 - (i - 12) * 120,
  following: i === 88 ? 0 : 160 + (i * 79) % 2400,
  followsMe: i < 50 ? false : i < 84 ? true : null,
  ageDays: i % 10 === 0 ? 30 + i / 10 : 365 + i * 10,
}));
let kind = 'followers';
let filter = 'all', page = 0, relation = 'all', followPage = 0;
const attributes = new Set();
let returnFocus = null;
const currentState = () => $('#state').value;
const isOwn = () => currentState() !== 'thirdparty';
const activeRows = () => {
  if (currentState() === 'empty') return [];
  const rows = kind === 'followers' ? (currentState() === 'partial' ? [...followers, ...missing] : followers) : following;
  return currentState() === 'unknown' ? rows.map(x => ({...x, followers: null, following: null, followsMe: null})) : rows;
};
function matchesFilter(x) {
  if (filter === 'all') return true;
  if (filter === 'unknown') return x.followers === null;
  if (x.followers === null) return false;
  if (filter.startsWith('min:')) return x.followers >= +filter.slice(4);
  const b = buckets[+filter.slice(4)];
  return x.followers >= b.min && x.followers < b.max;
}
function compareNumbers(a, b, direction = -1) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}
const ratio = x => x.followers !== null && x.following > 0 ? x.followers / x.following : null;
function followerResults() {
  const q = $('#search').value.trim().toLowerCase();
  return activeRows().filter(matchesFilter).filter(x => `${x.name} @${x.handle}`.toLowerCase().includes(q))
    .sort((a,b) => compareNumbers(a.followers,b.followers,$('#sort').value==='asc'?1:-1) || a.id-b.id);
}
const attrDefinitions = [
  {id: 'large', label: '≥1万粉丝', match: x => x.followers !== null && x.followers >= 10000},
  {id: 'new', label: '注册未满90天', match: x => x.ageDays !== null && x.ageDays < 90},
  {id: 'small', label: '不足100粉丝', match: x => x.followers !== null && x.followers < 100},
];
function relationMatches(x, value = relation) {
  return !isOwn() || value === 'all' || (value === 'no' && x.followsMe === false) ||
    (value === 'yes' && x.followsMe === true) || (value === 'unknown' && x.followsMe === null);
}
function followingResults() {
  const q = $('#following-search').value.trim().toLowerCase();
  return activeRows().filter(x => relationMatches(x)).filter(x => attrDefinitions.every(a => !attributes.has(a.id) || a.match(x)))
    .filter(x => `${x.name} @${x.handle}`.toLowerCase().includes(q))
    .sort((a,b) => ($('#following-sort').value==='ratio' ? compareNumbers(ratio(a),ratio(b)) : compareNumbers(a.followers,b.followers)) || a.id-b.id);
}
function filterLabel() {
  if (filter === 'all') return '全部账号';
  if (filter === 'unknown') return '粉丝数未获取';
  if (filter.startsWith('min:')) return `粉丝数 ≥${{'3000':'3千','10000':'1万','30000':'3万'}[filter.slice(4)]}`;
  return buckets[+filter.slice(4)].label;
}
function pageInfo(selector, result, n, size) {
  $(selector).textContent = result.length ? `${n*size+1}–${Math.min((n+1)*size,result.length)} / ${result.length} 位` : '0 位';
}
function renderFollowers() {
  const rows = activeRows(), known = rows.filter(x => x.followers !== null), k = known.length;
  $('#stats').hidden = !k; $('#distribution').hidden = !k;
  $('#unknown-info').hidden = !!k;
  $('.workspace').classList.toggle('no-distribution', !k);
  $('#stats').innerHTML = [3000,10000,30000].map(min => {
    const count = known.filter(x => x.followers >= min).length;
    const selected = filter === `min:${min}`;
    const label = {3000:'3千',10000:'1万',30000:'3万'}[min];
    return `<button class="stat" data-min="${min}" aria-pressed="${selected}" aria-label="筛选粉丝数不少于${label}的账号，共${count}位"><span class="label">粉丝数 ≥${label}<span class="check">${selected?'✓':''}</span></span><span class="value"><strong class="num">${count}</strong><span class="small">位</span><span class="percent">占有资料账号的 ${(count/k*100).toFixed(1)}%</span></span></button>`;
  }).join('');
  const counts = buckets.map(b => known.filter(x => x.followers >= b.min && x.followers < b.max).length);
  const max = Math.max(1,...counts);
  $('#chart').innerHTML = buckets.map((b,i) => `<button class="bin" data-bin="${i}" aria-pressed="${filter===`bin:${i}`}"><span class="label">${filter===`bin:${i}`?'✓ ':''}${b.label}</span><span class="track"><span class="bar" style="width:${counts[i]/max*100}%"></span></span><span class="num">${counts[i]}</span><span class="num muted">${k?(counts[i]/k*100).toFixed(1):'—'}%</span></button>`).join('');
  $('#unknown-filter').hidden = rows.length === k;
  $('#unknown-filter').textContent = `粉丝数未获取 ${rows.length-k} 位`;
  $('#sample-note').textContent = `占比以${k}位有资料的账号为分母。已加载顺序并非随机，不能据此推算全部粉丝。`;
  const list = followerResults();
  page = Math.min(page, Math.max(0,Math.ceil(list.length/12)-1));
  $('#result-count').textContent = `${list.length} 位`;
  $('#filter-name').textContent = `${filter==='all'?'':'✓ '}${filterLabel()}`;
  $('#mobile-accounts').textContent = `查看符合条件的 ${list.length} 位账号 →`;
  $('#people').innerHTML = list.length ? list.slice(page*12,page*12+12).map(x => `<div class="person"><span class="avatar" aria-hidden="true">例</span><div class="identity"><strong>${x.name}</strong><span>@${x.handle}</span></div><span class="count">${fmt(x.followers)}</span></div>`).join('') : '<div class="empty no-results"><h3>没有符合条件的账号</h3><p class="small">更换分档或清除搜索后查看。</p><button class="secondary" data-reset>清除筛选</button></div>';
  pageInfo('#page-info',list,page,12); $('#prev').disabled=page===0; $('#next').disabled=(page+1)*12>=list.length;
  $('#follower-pagination').hidden=!list.length;
  $('#export').hidden=!list.length;
}
function renderFollowing() {
  const rows = activeRows(), own = isOwn();
  $('#following-intro').textContent = own ? '“未关注我”以当前登录账号 @demo_me 为准；关系未获取的账号单独列出。' : '正在查看他人的关注名单。这里不提供“未关注我”筛选，也不推断他人与这些账号的关注关系。';
  $('#relation-tabs').hidden = !own;
  $('#relation-tabs').innerHTML = [['all','全部'],['no','未关注我'],['yes','已关注我'],['unknown','关系未获取']].map(([id,label]) => `<button class="chip" data-relation="${id}" aria-pressed="${relation===id}"><span>${relation===id?'✓ ':''}${label}</span><strong>${rows.filter(x => relationMatches(x,id)).length}</strong></button>`).join('');
  $('#attribute-tabs').innerHTML = '<span>叠加筛选</span>'+attrDefinitions.map(a=>`<button class="chip" data-attribute="${a.id}" aria-pressed="${attributes.has(a.id)}"><span>${attributes.has(a.id)?'✓ ':''}${a.label}</span><strong>${rows.filter(x=>relationMatches(x)&&a.match(x)).length}</strong></button>`).join('');
  const list=followingResults();
  followPage=Math.min(followPage,Math.max(0,Math.ceil(list.length/12)-1));
  $('#following-count').textContent=`${list.length} 位`;
  const relationship = x => !own?'未提供':x.followsMe===true?'已关注我':x.followsMe===false?'未关注我':'未获取';
  $('#following-people').innerHTML=list.length?list.slice(followPage*12,followPage*12+12).map(x=>`<div class="following-row"><div class="user-cell"><span class="avatar">例</span><div class="identity"><strong>${x.name}</strong><span>@${x.handle}</span></div></div><span class="num">${fmt(x.followers)}</span><span class="num">${fmt(x.following)}</span><span class="num">${ratio(x)===null?'—':ratio(x).toFixed(1)}</span><div class="relationship"><span>${relationship(x)}</span></div><div class="mobile-meta">粉丝 ${fmt(x.followers)} · 关注 ${fmt(x.following)}<br>粉丝/关注比 ${ratio(x)===null?'—':ratio(x).toFixed(1)}</div></div>`).join(''):'<div class="empty"><h3>没有符合条件的账号</h3><p class="small">叠加条件会缩小结果范围。</p><button class="secondary" data-follow-reset>清除筛选</button></div>';
  $('.table-head span:last-child').textContent=own?'与我的关系':'关系信息';
  pageInfo('#following-page-info',list,followPage,12);$('#following-prev').disabled=followPage===0;$('#following-next').disabled=(followPage+1)*12>=list.length;$('#following-pagination').hidden=!list.length;$('#export').hidden=!list.length;
}
function render() {
  const rows=activeRows(),known=rows.filter(x=>x.followers!==null).length;
  const follower=kind==='followers';
  const title=follower?'粉丝构成':'关注分析';
  const handle=follower?'demo_author':isOwn()?'demo_me':'demo_other';
  $('#panel-title').textContent=title;
  $('#panel-subtitle').textContent=`${follower?'示例创作者':isOwn()?'我的账号（演示）':'他人账号（演示）'} · @${handle}`;
  $('#native-name').textContent=follower?'示例创作者':isOwn()?'我的账号（演示）':'他人账号（演示）';
  $('#native-handle').textContent=`@${handle}`;
  $('#loaded').textContent=`已记录 ${rows.length} / 总${follower?'粉丝 18,600':'关注 320'}`;
  $('#scope-title').textContent=$('#loaded').textContent;
  $('#scope-caption').textContent=`${known} 位有粉丝数资料${known<rows.length?` · ${rows.length-known} 位未获取`:''} · 仅为已加载样本`;
  $('#open').textContent=`查看${title}`;
  $('#empty').hidden=!!rows.length;
  $('#follower-panel').hidden=!follower||!rows.length;
  $('#following-panel').hidden=follower||!rows.length;
  $('#mobile-tabs').hidden=!follower||!rows.length;
  $('#modal-foot').hidden=!rows.length;
  $('#analysis').classList.toggle('following-view',!follower);
  if(follower)renderFollowers();else renderFollowing();
  $$('[data-kind]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.kind===kind)));
  $('#native-list').innerHTML=rows.slice(0,8).map(x=>`<article class="native-person"><span class="avatar">例</span><div><strong>${x.name}</strong><div class="muted small">@${x.handle} · ${fmt(x.followers)} 粉丝</div><p>用于检查布局与信息密度的合成账号。</p></div></article>`).join('');
}
function syncTop(){const top=$('#stage').getBoundingClientRect().top;$('#stage').style.setProperty('--stage-top',Math.max(0,top)+'px')}
function openPanel(){syncTop();returnFocus=$('#open');$('#overlay').hidden=false;$('#x-scene').inert=true;$('#open').setAttribute('aria-expanded','true');document.body.style.overflow='hidden';$('#close').focus();}
function closePanel(){const wasOpen=!$('#overlay').hidden;$('#overlay').hidden=true;$('#x-scene').inert=false;$('#open').setAttribute('aria-expanded','false');document.body.style.overflow='';if(wasOpen)returnFocus?.focus();}
function setMobile(view){$('#analysis').dataset.mobile=view;$$('[data-mobile-tab]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.mobileTab===view)));$('#body-scroll').scrollTop=0;}
function resetFollowers(){filter='all';page=0;$('#search').value='';render();}
function resetFollowing(){relation='all';attributes.clear();followPage=0;$('#following-search').value='';render();}
function setFilter(value, focusSelector){filter=filter===value?'all':value;page=0;render();if(focusSelector)$(focusSelector)?.focus({preventScroll:true});}
function sceneChanged(autoOpen=true){closePanel();const value=$('#scene').value;$('#settings').hidden=value!=='settings';$('#x-scene').hidden=value==='settings';$('#state').disabled=value==='settings';if(value!=='settings'){kind=value;filter='all';page=0;relation='all';attributes.clear();followPage=0;$('#search').value='';$('#following-search').value='';setMobile('overview');render();if(autoOpen)openPanel();}}
$('#open').onclick=openPanel;$('#close').onclick=closePanel;$('#continue').onclick=closePanel;$('#empty-continue').onclick=closePanel;
$('#scene').onchange=()=>sceneChanged();
$('#theme').onchange=()=>{$('#stage').dataset.theme=$('#theme').value;document.documentElement.dataset.theme=$('#theme').value==='light'?'light':'dark';$('#settings').style.colorScheme=$('#theme').value==='light'?'light':'dark'};
$('#gray').onchange=()=>$('#stage').classList.toggle('grayscale',$('#gray').checked);
$('#state').onchange=()=>{filter='all';page=0;relation='all';attributes.clear();followPage=0;$('#search').value='';$('#following-search').value='';setMobile('overview');render();};
$('#stats').onclick=e=>{const b=e.target.closest('[data-min]');if(b)setFilter(`min:${b.dataset.min}`,`[data-min="${b.dataset.min}"]`)};
$('#chart').onclick=e=>{const b=e.target.closest('[data-bin]');if(b)setFilter(`bin:${b.dataset.bin}`,`[data-bin="${b.dataset.bin}"]`)};
$('#unknown-filter').onclick=()=>{setFilter('unknown');if(innerWidth<=700)setMobile('list')};
$('#mobile-accounts').onclick=()=>{setMobile('list');$('[data-mobile-tab="list"]').focus()};
$$('[data-mobile-tab]').forEach(b=>b.onclick=()=>setMobile(b.dataset.mobileTab));
$('#reset').onclick=resetFollowers;$('#search').oninput=()=>{page=0;renderFollowers()};$('#sort').onchange=()=>{page=0;renderFollowers()};
$('#prev').onclick=()=>{page--;renderFollowers()};$('#next').onclick=()=>{page++;renderFollowers()};
$('#people').onclick=e=>{if(e.target.closest('[data-reset]'))resetFollowers()};
$('#relation-tabs').onclick=e=>{const b=e.target.closest('[data-relation]');if(!b)return;relation=b.dataset.relation;followPage=0;renderFollowing();$(`[data-relation="${relation}"]`).focus({preventScroll:true});};
$('#attribute-tabs').onclick=e=>{const b=e.target.closest('[data-attribute]');if(!b)return;const id=b.dataset.attribute;if(attributes.has(id))attributes.delete(id);else attributes.add(id);followPage=0;renderFollowing();$(`[data-attribute="${id}"]`).focus({preventScroll:true});};
$('#following-search').oninput=()=>{followPage=0;renderFollowing()};$('#following-sort').onchange=()=>{followPage=0;renderFollowing()};$('#following-reset').onclick=resetFollowing;
$('#following-prev').onclick=()=>{followPage--;renderFollowing();$('#following-people').scrollTop=0};$('#following-next').onclick=()=>{followPage++;renderFollowing();$('#following-people').scrollTop=0};
$('#following-people').onclick=e=>{if(e.target.closest('[data-follow-reset]'))resetFollowing()};
$$('[data-kind]').forEach(b=>b.onclick=()=>{$('#scene').value=b.dataset.kind;sceneChanged(false)});
$('#details-button').onclick=()=>{$('#settings-details').hidden=!$('#settings-details').hidden;$('#details-button').setAttribute('aria-expanded',String(!$('#settings-details').hidden))};
$('#record-toggle').onchange=()=>$('#setting-status').textContent=$('#record-toggle').checked?'已开启（仅演示）· 不实际保存':'尚未开启 · 仅本机记录';
$('#back-x').onclick=()=>{$('#scene').value='followers';sceneChanged(false)};
let toastTimer;function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2500)}
$('#export').onclick=()=>{
 const list=kind==='followers'?followerResults():followingResults();
 const target=kind==='followers'?'demo_author':isOwn()?'demo_me':'demo_other';
 const esc=v=>'"'+String(v??'').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"';
 const header=['数据说明','目标账号','名单类型','用户名','名字','粉丝数','关注数','粉丝/关注比','是否关注当前登录账号','观察时间'];
 const rows=list.map(x=>['合成演示',target,kind==='followers'?'粉丝':'关注',x.handle,x.name,x.followers,x.following,ratio(x)===null?null:ratio(x).toFixed(2),kind==='following'&&isOwn()?(x.followsMe===null?'未获取':x.followsMe?'是':'否'):'未提供','2026-11-11 09:42 +08:00']);
 const csv='\uFEFF'+[header,...rows].map(row=>row.map(esc).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`oh-my-x-${kind}-演示名单.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${list.length} 条合成演示记录`);
};
document.addEventListener('keydown',e=>{if($('#overlay').hidden)return;if(e.key==='Escape'){e.preventDefault();closePanel();return}if(e.key==='Tab'){const items=[...$('#analysis').querySelectorAll('button,input,select,a')].filter(x=>!x.disabled&&x.getClientRects().length);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus()}}});
$('#overlay').onclick=e=>{if(e.target===$('#overlay'))closePanel()};
window.addEventListener('resize',syncTop);window.addEventListener('scroll',syncTop,{passive:true});new ResizeObserver(syncTop).observe($('.review'));
const params=new URLSearchParams(location.search);if(['followers','following','settings'].includes(params.get('view')))$('#scene').value=params.get('view');
if(['light','dark','dim'].includes(params.get('theme'))){$('#theme').value=params.get('theme');$('#theme').onchange();}
sceneChanged(false);syncTop();if(params.get('panel')==='1'&&$('#scene').value!=='settings')openPanel();
