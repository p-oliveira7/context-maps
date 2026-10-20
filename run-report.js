/* Relatório interativo da execução de uma pasta: barra de progresso (um trecho por request), números, filtros e detalhes de cada request.
   Não conhece o painel: recebe `run` (estado vivo) e as ações; `update()` redesenha só o que mudou. */
import {summarize,checksOf} from './runner.js?v=1';

const ICON={passed:'✓',failed:'✗',error:'!',skipped:'–',pending:'·',running:'↻'};
const FILTERS=['all','failed','error','passed'];

export function createRunReport({h,t,fmtSize}){
 const matchesFilter=(item,filter)=>filter==='all'||item.status===filter;
 const prettyBody=out=>{
  if(out.binary)return t('apiBinary',fmtSize(out.size||0));
  const text=out.bodyText||'';
  if(/^\s*[\[{]/.test(text)){try{return JSON.stringify(JSON.parse(text),null,2);}catch{}}
  return text;
 };

 function mount(container,run,act){
  const view=run.view,refs={};
  const tile=(key,cls='')=>{const num=h('strong',{},'0');refs[`tile_${key}`]=num;return h('div',{class:`api-run-tile ${cls}`},num,h('span',{},t(`apiRunTile_${key}`)));};
  refs.title=h('h3',{class:'api-run-title'});
  refs.meta=h('p',{class:'api-run-meta'});
  refs.live=h('span',{class:'sr-only',role:'status'});
  refs.stop=h('button',{type:'button',class:'api-btn danger',onClick:()=>act.stop()},t('apiRunStop'));
  refs.again=h('button',{type:'button',class:'api-btn',onClick:()=>act.again()},t('apiRunAgain'));
  refs.failedOnly=h('button',{type:'button',class:'api-btn',onClick:()=>act.againFailed()},t('apiRunFailedOnly'));
  refs.export=h('button',{type:'button',class:'api-btn',onClick:()=>act.exportJson()},t('apiRunExport'));
  refs.copy=h('button',{type:'button',class:'api-btn',onClick:async e=>{const b=e.currentTarget;if(await act.copy()){const old=b.textContent;b.textContent=t('apiCopied');setTimeout(()=>{b.textContent=old;},1200);}}},t('apiRunCopy'));
  refs.close=h('button',{type:'button',class:'api-icon-btn',title:t('apiRunClose'),'aria-label':t('apiRunClose'),onClick:()=>act.close()},'×');
  refs.bar=h('div',{class:'api-run-bar',role:'group','aria-label':t('apiRunProgress')});
  refs.stopOnFail=h('input',{type:'checkbox',checked:run.options.stopOnFail,onChange:e=>{run.options.stopOnFail=e.target.checked;act.options();}});
  refs.delay=h('input',{type:'number',min:'0',max:'60000',step:'100',value:String(run.options.delayMs),'aria-label':t('apiRunDelay'),onChange:e=>{run.options.delayMs=Math.min(60000,Math.max(0,Number(e.target.value)||0));e.target.value=String(run.options.delayMs);act.options();}});
  refs.chips=FILTERS.map(f=>{const count=h('span',{class:'api-run-chip-count'},'0');const b=h('button',{type:'button',class:`api-run-chip is-${f}`,'aria-pressed':String(view.filter===f),onClick:()=>{view.filter=f;update();}},t(`apiRunFilter_${f}`),count);b._count=count;b._filter=f;return b;});
  refs.search=h('input',{type:'search',class:'api-filter',placeholder:t('apiRunSearch'),'aria-label':t('apiRunSearch'),value:view.q,onInput:e=>{view.q=e.target.value;renderList();}});
  refs.list=h('ul',{class:'api-run-list'});
  refs.scroll=h('div',{class:'api-run-scroll'},refs.list);

  const root=h('section',{class:'api-run','aria-label':t('apiRunReport')},
   h('header',{class:'api-run-head'},h('div',{class:'api-run-heading'},refs.title,refs.meta,refs.live),
    h('div',{class:'api-run-actions'},refs.stop,refs.again,refs.failedOnly,refs.copy,refs.export,refs.close)),
   refs.bar,
   h('div',{class:'api-run-tiles'},tile('passed','is-passed'),tile('failed','is-failed'),tile('errors','is-error'),tile('checks'),tile('time')),
   h('div',{class:'api-run-options'},h('label',{},refs.stopOnFail,h('span',{},t('apiRunStopOnFail'))),h('label',{},h('span',{},t('apiRunDelay')),refs.delay,h('span',{},'ms'))),
   h('div',{class:'api-run-filters'},...refs.chips,refs.search),
   refs.scroll);
  container.replaceChildren(root);

  const segTitle=item=>`${String(item.method).toUpperCase()} ${item.name} — ${t(`apiRunSt_${item.status}`)}`;
  function renderBar(){
   refs.bar.replaceChildren(...run.items.map(item=>h('button',{type:'button',class:`api-run-seg is-${item.status}`,title:segTitle(item),'aria-label':segTitle(item),onClick:()=>reveal(item.path)})));
  }
  function reveal(path){
   view.open.add(path);view.filter='all';view.q='';refs.search.value='';update();
   const row=refs.list.querySelector(`[data-path="${CSS.escape(path)}"]`);
   row?.scrollIntoView({block:'center'});row?.querySelector('.api-run-item-main')?.focus({preventScroll:true});
  }

  function detail(item){
   const out=item.out,box=h('div',{class:'api-run-detail'});
   if(!out){box.append(h('p',{class:'api-hint'},t(`apiRunSt_${item.status}`)));return box;}
   if(out.sent)box.append(h('pre',{class:'api-pre api-run-sent'},`${out.sent.method} ${out.sent.url}`));
   if(out.error){
    const text=out.error==='cancelled'?t('apiCancelled'):out.error==='timeout'?t('apiTimeout',out.detail):`${t('apiFailed')}: ${out.detail||out.error}`;
    box.append(h('p',{class:'api-run-error',role:'alert'},text));
   }
   const checks=checksOf(out);
   if(checks.length)box.append(h('ul',{class:'api-run-checks'},...checks.map(c=>h('li',{class:c.passed?'is-pass':'is-fail'},h('span',{class:'api-mark','aria-hidden':'true'},c.passed?'✓':'✗'),h('span',{},c.name||`${c.expression} ${c.assertion}`),c.error?h('small',{},c.error):null))));
   else if(!out.error)box.append(h('p',{class:'api-hint'},t('apiNoTests')));
   if(!out.error){
    box.append(h('details',{},h('summary',{},`${t('apiRespBody')} · ${fmtSize(out.size||0)}`),h('pre',{class:'api-pre api-resp-body',tabindex:'0'},prettyBody(out))),
     h('details',{},h('summary',{},t('apiRespHeaders')),h('pre',{class:'api-pre',tabindex:'0'},(out.headers||[]).map(([k,v])=>`${k}: ${v}`).join('\n'))));
   }
   const lines=[...(out.extra?.errors||[]).map(e=>({level:'error',text:`${t('apiScriptError')} (${e.where}): ${e.message}`})),...(out.extra?.logs||[]).map(l=>({level:l.level,text:`[${l.where}] ${l.text}`}))];
   if(lines.length)box.append(h('div',{class:'api-console',role:'log'},...lines.map(l=>h('div',{class:`api-log is-${l.level}`},l.text))));
   box.append(h('div',{class:'api-run-detail-actions'},
    h('button',{type:'button',class:'api-btn',onClick:()=>act.openRequest(item.path)},t('apiRunOpenRequest')),
    h('button',{type:'button',class:'api-btn',disabled:run.status==='running'||null,onClick:()=>act.rerunOne(item.path)},t('apiRunRerunOne'))));
   return box;
  }

  function renderList(){
   const keep=refs.scroll.scrollTop,focused=document.activeElement?.closest?.('.api-run-item')?.dataset.path;
   const q=view.q.trim().toLowerCase(),shown=run.items.filter(i=>matchesFilter(i,view.filter)&&(!q||i.name.toLowerCase().includes(q)||i.path.toLowerCase().includes(q)));
   const maxTime=Math.max(1,...run.items.map(i=>i.out?.timeMs||0)),rows=[];
   const grouped=new Set(run.items.map(i=>i.group)).size>1||run.items.some(i=>i.group);
   let lastGroup=null;
   for(const item of shown){
    if(grouped&&item.group!==lastGroup){lastGroup=item.group;rows.push(h('li',{class:'api-run-group',role:'presentation'},item.group?`📁 ${item.group}`:`🗂 ${run.title}`));}
    const open=view.open.has(item.path),out=item.out,checks=checksOf(out),passedChecks=checks.filter(c=>c.passed).length;
    const kind=out?.status>=500?'is-error':out?.status>=400?'is-warn':out?.status>=300?'is-redirect':'is-ok';
    rows.push(h('li',{class:`api-run-item is-${item.status}${open?' is-open':''}`,dataset:{path:item.path}},
     h('button',{type:'button',class:'api-run-item-main','aria-expanded':String(open),onClick:()=>{open?view.open.delete(item.path):view.open.add(item.path);renderList();}},
      h('span',{class:'api-run-icon','aria-hidden':'true'},ICON[item.status]),
      h('span',{class:'sr-only'},t(`apiRunSt_${item.status}`)),
      h('span',{class:`api-method api-m-${item.method}`},String(item.method).toUpperCase().slice(0,7)),
      h('span',{class:'api-run-item-name'},item.name),
      out&&out.status?h('span',{class:`api-run-http ${kind}`},String(out.status)):null,
      checks.length?h('span',{class:`api-run-checks-count${passedChecks<checks.length?' is-bad':''}`,title:t('apiRunChecks')},`${passedChecks}/${checks.length}`):null,
      out?h('span',{class:'api-run-time'},h('i',{style:`width:${Math.max(4,Math.round((out.timeMs||0)/maxTime*100))}%`}),h('em',{},`${out.timeMs||0} ms`)):null),
     open?detail(item):null));
   }
   if(!rows.length)rows.push(h('li',{class:'api-empty-small',role:'presentation'},t('apiRunNothing')));
   refs.list.replaceChildren(...rows);
   refs.scroll.scrollTop=keep;
   if(focused)refs.list.querySelector(`[data-path="${CSS.escape(focused)}"] .api-run-item-main`)?.focus({preventScroll:true});
  }

  let lastStatus=run.status;
  function update(){
   const s=summarize(run.items),running=run.status==='running',done=s.total-s.pending;
   refs.title.textContent=run.title;
   refs.meta.textContent=[run.env?t('apiRunEnv',run.env):t('apiRunNoEnv'),run.recursive?t('apiRunRecursive'):t('apiRunThisFolder'),running?t('apiRunProgressText',done,s.total):t(`apiRunDone_${run.status}`)].join(' · ');
   root.classList.toggle('is-running',running);
   root.classList.toggle('is-bad',!running&&(s.failed+s.errors>0||run.status!=='done'));
   root.classList.toggle('is-ok',!running&&s.failed+s.errors===0&&run.status==='done');
   refs.tile_passed.textContent=`${s.passed}/${s.total}`;refs.tile_failed.textContent=String(s.failed);refs.tile_errors.textContent=String(s.errors);
   refs.tile_checks.textContent=s.checksTotal?`${s.checksPassed}/${s.checksTotal}`:'–';refs.tile_time.textContent=s.timeMs>=1000?`${(s.timeMs/1000).toFixed(1)} s`:`${s.timeMs} ms`;
   refs.stop.hidden=!running;refs.again.hidden=running;refs.failedOnly.hidden=running||s.failed+s.errors===0;
   refs.export.disabled=running;refs.copy.disabled=running;refs.delay.disabled=running;refs.stopOnFail.disabled=running;
   const counts={all:s.total,failed:s.failed,error:s.errors,passed:s.passed};
   for(const chip of refs.chips){chip._count.textContent=String(counts[chip._filter]);chip.setAttribute('aria-pressed',String(view.filter===chip._filter));chip.disabled=chip._filter!=='all'&&!counts[chip._filter]&&view.filter!==chip._filter;}
   renderBar();renderList();
   if(lastStatus==='running'&&!running)refs.live.textContent=`${t(`apiRunDone_${run.status}`)}: ${t('apiRunSummaryLine',s.passed,s.total,s.failed,s.errors)}`;
   lastStatus=run.status;
  }
  update();
  return {update,focusFirst:()=>refs.again.hidden?refs.stop.focus():refs.again.focus()};
 }
 return {mount};
}
