/* Diagramas de sequência próprios: lê o texto no estilo do Mermaid (sequenceDiagram), calcula o layout e desenha um SVG em que cada
   seta, nota e bloco tem um identificador (data-step). Sem DOM: roda em Node e no navegador. O que não for suportado lança
   {code:'unsupported'} e o app volta para o Mermaid. */

/* ---------- leitura ---------- */
const ID='[\\w.$@-]+?',ARROWS='-->>|->>|--x|-x|--\\)|-\\)|-->|->';
const MSG=new RegExp(`^(${ID})\\s*(${ARROWS})\\s*([+-]?)\\s*(${ID})\\s*:\\s*(.*)$`);
const HEAD={'->>':['solid','arrow'],'-->>':['dashed','arrow'],'->':['solid','open'],'-->':['dashed','open'],'-x':['solid','cross'],'--x':['dashed','cross'],'-)':['solid','async'],'--)':['dashed','async']};
const GROUPS=new Set(['loop','alt','opt','par','critical','break']);
const UNSUPPORTED=/^(box|create|destroy|link|links|properties|details|rect|end\s+box)\b|^%%\{/i;
const fail=(code,line,detail='')=>Object.assign(new Error(`${code}:${line}`),{code,line,detail});

export const isSequenceSource=text=>/^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/.test(String(text||''));

/** texto -> {title,autonumber,participants:[{id,name,kind}],steps:[...]} */
export function parseSequence(text){
 const lines=String(text||'').replace(/\r\n/g,'\n').split('\n');
 const model={title:'',autonumber:false,participants:[],steps:[]};
 const byId=new Map(),stack=[];let seen=false;
 const ensure=(id,name,kind='participant')=>{
  if(!byId.has(id)){const p={id,name:name??id,kind};byId.set(id,p);model.participants.push(p);}
  else if(name!==undefined){const p=byId.get(id);p.name=name;if(kind==='actor')p.kind='actor';}
  return byId.get(id);
 };
 lines.forEach((raw,i)=>{
  const n=i+1,line=raw.trim();
  if(!line||line.startsWith('%%')&&!line.startsWith('%%{'))return;
  if(!seen){if(/^sequenceDiagram\b/.test(line)){seen=true;return;}throw fail('notSequence',n);}
  if(UNSUPPORTED.test(line))throw fail('unsupported',n,line.split(/\s/)[0]);
  let m;
  if(/^autonumber\b/.test(line)){model.autonumber=true;return;}
  if((m=/^title\s*:?\s*(.+)$/i.exec(line))){model.title=m[1].trim();return;}
  if((m=/^(participant|actor)\s+([\w.$@-]+)(?:\s+as\s+(.+))?$/i.exec(line))){ensure(m[2],m[3]?.trim(),m[1].toLowerCase());return;}
  if((m=/^(activate|deactivate)\s+([\w.$@-]+)$/i.exec(line))){ensure(m[2]);model.steps.push({type:m[1].toLowerCase(),actor:m[2],line:n});return;}
  if((m=/^note\s+(left of|right of|over)\s+([\w.$@-]+(?:\s*,\s*[\w.$@-]+)?)\s*:\s*(.*)$/i.exec(line))){
   const actors=m[2].split(',').map(s=>s.trim());actors.forEach(a=>ensure(a));
   model.steps.push({type:'note',position:m[1].toLowerCase().replace(' of',''),actors,text:m[3].trim(),line:n});return;
  }
  if((m=/^(loop|alt|opt|par|critical|break)\b\s*(.*)$/i.exec(line))&&GROUPS.has(m[1].toLowerCase())){
   stack.push({kind:m[1].toLowerCase(),line:n});model.steps.push({type:'group',kind:m[1].toLowerCase(),label:m[2].trim(),line:n});return;
  }
  if((m=/^(else|and|option)\b\s*(.*)$/i.exec(line))){
   if(!stack.length)throw fail('unexpectedElse',n);model.steps.push({type:'else',label:m[2].trim(),line:n});return;
  }
  if(/^end$/i.test(line)){if(!stack.length)throw fail('unexpectedEnd',n);stack.pop();model.steps.push({type:'end',line:n});return;}
  if((m=MSG.exec(line))){
   const [,from,arrow,flag,to,label]=m;ensure(from);ensure(to);
   const [style,head]=HEAD[arrow];
   model.steps.push({type:'message',from,to,text:label.trim(),style,head,activate:flag==='+'?'+':flag==='-'?'-':'',line:n});return;
  }
  if(/^[\w.$@-]+\s*[-.]*[>)x-]+/.test(line)&&!line.includes(':'))throw fail('missingColon',n);
  throw fail('syntax',n,line.slice(0,40));
 });
 if(!seen)throw fail('notSequence',1);
 if(stack.length)throw fail('noEnd',stack.at(-1).line);
 if(!model.participants.length)throw fail('empty',1);
 return model;
}

/** modelo -> texto (compatível com o Mermaid) */
export function stringifySequence(model){
 const out=['sequenceDiagram'];
 if(model.title)out.push(`  title ${model.title}`);
 if(model.autonumber)out.push('  autonumber');
 for(const p of model.participants)out.push(`  ${p.kind==='actor'?'actor':'participant'} ${p.id}${p.name&&p.name!==p.id?` as ${p.name}`:''}`);
 const arrow={solid:{arrow:'->>',open:'->',cross:'-x',async:'-)'},dashed:{arrow:'-->>',open:'-->',cross:'--x',async:'--)'}};
 let depth=0;
 for(const s of model.steps){
  if(s.type==='end')depth--;
  const pad='  '.repeat(depth+1);
  if(s.type==='message')out.push(`${pad}${s.from}${arrow[s.style][s.head]}${s.activate}${s.to}: ${s.text}`);
  else if(s.type==='note')out.push(`${pad}Note ${s.position==='over'?'over':`${s.position} of`} ${s.actors.join(',')}: ${s.text}`);
  else if(s.type==='activate'||s.type==='deactivate')out.push(`${pad}${s.type} ${s.actor}`);
  else if(s.type==='group'){out.push(`${pad}${s.kind}${s.label?` ${s.label}`:''}`);depth++;}
  else if(s.type==='else')out.push(`${'  '.repeat(depth)}${s.label?`else ${s.label}`:'else'}`);
  else if(s.type==='end')out.push(`${pad}end`);
 }
 return out.join('\n')+'\n';
}

/* ---------- layout ---------- */
const MARGIN=24,BOX_H=34,BOX_PAD=26,MIN_GAP=118,LINE_H=16,NOTE_MAX=210;
export const defaultMeasure=(text,bold=false)=>String(text).length*(bold?8:7.2);
const linesOf=text=>String(text).split(/<br\s*\/?>/i);
const widest=(text,measure,bold)=>Math.max(0,...linesOf(text).map(l=>measure(l,bold)));
function wrap(text,measure,max){
 const out=[];
 for(const para of linesOf(text)){
  let cur='';
  for(const word of para.split(/\s+/).filter(Boolean)){
   const next=cur?`${cur} ${word}`:word;
   if(cur&&measure(next)>max){out.push(cur);cur=word;}else cur=next;
  }
  out.push(cur);
 }
 return out.length?out:[''];
}

/** modelo -> geometria absoluta (sem DOM). measure(texto,negrito) devolve a largura em px. */
export function layoutSequence(model,{measure=defaultMeasure}={}){
 const P=model.participants,idx=new Map(P.map((p,i)=>[p.id,i]));
 const boxW=P.map(p=>Math.max(84,measure(p.name,true)+BOX_PAD*2));
 const gap=P.slice(1).map((_,i)=>Math.max(MIN_GAP,(boxW[i]+boxW[i+1])/2+22));
 const labelOf=(s,n)=>`${model.autonumber?`${n}. `:''}${s.text}`;
 // 1) espaço lateral que os rótulos pedem entre as linhas de vida (as mais curtas primeiro)
 let num=0;const needs=[];let rightExtra=0,leftExtra=0;
 for(const s of model.steps){
  if(s.type==='message'){
   num++;const w=widest(labelOf(s,num),measure)+44,a=idx.get(s.from),b=idx.get(s.to);
   if(a===b){if(a<P.length-1)needs.push({from:a,to:a+1,w:w+36});else rightExtra=Math.max(rightExtra,w+36);}
   else needs.push({from:Math.min(a,b),to:Math.max(a,b),w});
  }else if(s.type==='note'){
   const lines=wrap(s.text,measure,NOTE_MAX),w=Math.max(...lines.map(l=>measure(l)))+24;
   if(s.position==='over'&&s.actors.length===2){const a=idx.get(s.actors[0]),b=idx.get(s.actors[1]);needs.push({from:Math.min(a,b),to:Math.max(a,b),w:w+30});}
  }
 }
 needs.sort((x,y)=>(x.to-x.from)-(y.to-y.from));
 for(const n of needs){
  const span=gap.slice(n.from,n.to).reduce((a,b)=>a+b,0);
  if(span<n.w){const extra=(n.w-span)/(n.to-n.from);for(let k=n.from;k<n.to;k++)gap[k]+=extra;}
 }
 const x=[];let cur=MARGIN+boxW[0]/2;
 P.forEach((_,i)=>{x.push(cur);cur+=gap[i]??0;});
 // notas à esquerda/direita: abrem espaço nas bordas
 for(const s of model.steps)if(s.type==='note'&&s.position!=='over'){
  const w=Math.max(...wrap(s.text,measure,NOTE_MAX).map(l=>measure(l)))+24,i=idx.get(s.actors[0]);
  if(s.position==='left')leftExtra=Math.max(leftExtra,w+14-(x[i]-boxW[i]/2-MARGIN));
  else rightExtra=Math.max(rightExtra,w+14);
 }
 const shift=Math.max(0,Math.ceil(leftExtra));if(shift)for(let i=0;i<x.length;i++)x[i]+=shift;
 // 2) alturas
 const top=MARGIN+(model.title?26:0),headY=top,bodyY=headY+BOX_H+22;
 let y=bodyY;const items=[],open=[],active=P.map(()=>[]),bars=[];let n2=0,maxRight=0;
 const touch=(i)=>{open.forEach(g=>{g.min=Math.min(g.min,i);g.max=Math.max(g.max,i);});};
 model.steps.forEach((s,k)=>{
  if(s.type==='message'){
   n2++;const a=idx.get(s.from),b=idx.get(s.to),label=labelOf(s,n2),ls=linesOf(label),labelH=ls.length*LINE_H;
   touch(a);touch(b);
   if(a===b){
    const ay=y+labelH/2+8,w=widest(label,measure);
    items.push({kind:'message',step:k,self:true,x1:x[a],x2:x[a]+34,y:ay,y2:ay+22,from:a,to:b,lines:ls,tx:x[a]+42,ty:ay-(ls.length-1)*LINE_H/2+4,style:s.style,head:s.head,num:model.autonumber?n2:0});
    maxRight=Math.max(maxRight,x[a]+42+w);y+=Math.max(labelH+8,30)+26;
    if(s.activate==='+')active[b].push(ay+22);if(s.activate==='-'&&active[a].length)bars.push({i:a,y1:active[a].pop(),y2:ay,depth:active[a].length});
   }else{
    const ay=y+labelH+10;
    items.push({kind:'message',step:k,x1:x[a],x2:x[b],y:ay,from:a,to:b,lines:ls,tx:(x[a]+x[b])/2,ty:y+LINE_H-4,style:s.style,head:s.head,num:model.autonumber?n2:0});
    y=ay+16;
    if(s.activate==='+')active[b].push(ay);if(s.activate==='-'&&active[a].length)bars.push({i:a,y1:active[a].pop(),y2:ay,depth:active[a].length});
   }
  }else if(s.type==='note'){
   const lines=wrap(s.text,measure,NOTE_MAX),w=Math.max(...lines.map(l=>measure(l)))+24,h=lines.length*LINE_H+14;
   const a=idx.get(s.actors[0]),b=idx.get(s.actors.at(-1));s.actors.forEach(id=>touch(idx.get(id)));
   let nx;
   if(s.position==='left')nx=x[a]-w-14;else if(s.position==='right')nx=x[a]+14;else{const c=(x[a]+x[b])/2,ww=Math.max(w,Math.abs(x[b]-x[a])+30);nx=c-ww/2;items.push({kind:'note',step:k,x:nx,y:y+6,w:ww,h,lines,tx:c});y+=h+18;maxRight=Math.max(maxRight,nx+ww);return;}
   items.push({kind:'note',step:k,x:nx,y:y+6,w,h,lines,tx:nx+w/2});y+=h+18;maxRight=Math.max(maxRight,nx+w);
  }else if(s.type==='activate'){active[idx.get(s.actor)].push(y);}
  else if(s.type==='deactivate'){const i=idx.get(s.actor);if(active[i].length)bars.push({i,y1:active[i].pop(),y2:y,depth:active[i].length});}
  else if(s.type==='group'){const g={step:k,gkind:s.kind,label:s.label,y1:y+4,min:99,max:-1,dividers:[]};open.push(g);items.push({...g,kind:'group',ref:g});y+=30;}
  else if(s.type==='else'){const g=open.at(-1);g.dividers.push({step:k,y:y+2,label:s.label});y+=24;}
  else if(s.type==='end'){const g=open.pop();g.y2=y+2;y+=18;}
 });
 const bottom=y+10;
 active.forEach((st,i)=>st.forEach(y1=>bars.push({i,y1,y2:bottom-8,depth:0})));
 for(const it of items)if(it.kind==='group'){
  const g=it.ref;if(g.max<0){g.min=0;g.max=P.length-1;}
  it.x1=Math.min(x[g.min]-boxW[g.min]/2,x[g.min]-34)-8;it.x2=Math.max(x[g.max]+boxW[g.max]/2,x[g.max]+34)+8;it.y1=g.y1;it.y2=g.y2??bottom-6;it.dividers=g.dividers;delete it.ref;
  maxRight=Math.max(maxRight,it.x2);
 }
 const lastX=x.at(-1)+boxW.at(-1)/2;
 const width=Math.ceil(Math.max(lastX+rightExtra,maxRight)+MARGIN);
 return {width,height:Math.ceil(bottom+MARGIN/2),title:model.title,headY,bodyY,bottom,
  participants:P.map((p,i)=>({...p,x:x[i],w:boxW[i],h:BOX_H,y:headY})),items,bars,autonumber:model.autonumber};
}

/* ---------- desenho ---------- */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const PALETTE={ink:'#e8ecef',muted:'#9aa4ad',line:'#aeb8c0',box:'#1d2b26',boxStroke:'#4f9d7a',actorBox:'#232a35',actorStroke:'#6f8fc7',note:'#33301f',noteStroke:'#b99a3d',group:'#7a848c',tab:'#262b2f',bar:'#2c3a35',ok:'#4f9d7a',fail:'#e06c75',skip:'#6b747b'};
export const FONT='ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

export function renderSequenceSvg(layout,{summary=''}={}){
 const C=PALETTE,out=[];
 out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" font-family='${FONT}' font-size="13">`);
 out.push(`<title>${esc(layout.title||'Sequence diagram')}</title><desc>${esc(summary)}</desc>`);
 out.push(`<defs>
<marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 1L10 5L0 9z" fill="${C.line}"/></marker>
<marker id="seq-async" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="${C.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="seq-cross" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M2 2L9 8M9 2L2 8" fill="none" stroke="${C.line}" stroke-width="1.6" stroke-linecap="round"/></marker>
</defs>`);
 out.push(`<style>.seq-text{fill:${C.ink}}.seq-muted{fill:${C.muted}}.seq-line{stroke:${C.line};stroke-width:1.5;fill:none}.seq-dashed{stroke-dasharray:6 4}</style>`);
 if(layout.title)out.push(`<text class="seq-text" x="${layout.width/2}" y="22" text-anchor="middle" font-size="15" font-weight="600">${esc(layout.title)}</text>`);
 // blocos (atrás de tudo)
 for(const g of layout.items.filter(i=>i.kind==='group')){
  out.push(`<g class="seq-step seq-group" data-step="${g.step}"><rect x="${g.x1}" y="${g.y1}" width="${g.x2-g.x1}" height="${g.y2-g.y1}" rx="4" fill="none" stroke="${C.group}" stroke-width="1"/>`);
  const tab=g.gkind.length*7.4+22;out.push(`<path d="M${g.x1} ${g.y1}h${tab}v14l-8 8H${g.x1}z" fill="${C.tab}" stroke="${C.group}"/><text class="seq-text" x="${g.x1+8}" y="${g.y1+15}" font-size="11" font-weight="600">${esc(g.gkind)}</text>`);
  if(g.label)out.push(`<text class="seq-muted" x="${g.x1+tab+8}" y="${g.y1+16}">[${esc(g.label)}]</text>`);
  for(const d of g.dividers){out.push(`<g data-step="${d.step}"><line x1="${g.x1}" x2="${g.x2}" y1="${d.y}" y2="${d.y}" stroke="${C.group}" stroke-dasharray="5 4"/>${d.label?`<text class="seq-muted" x="${g.x1+8}" y="${d.y+15}">[${esc(d.label)}]</text>`:''}</g>`);}
  out.push('</g>');
 }
 // linhas de vida e participantes
 for(const p of layout.participants){
  out.push(`<g class="seq-actor" data-actor="${esc(p.id)}"><line x1="${p.x}" x2="${p.x}" y1="${p.y+p.h}" y2="${layout.bottom}" stroke="${C.muted}" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>`);
  const actor=p.kind==='actor';
  out.push(`<rect x="${p.x-p.w/2}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${actor?17:6}" fill="${actor?C.actorBox:C.box}" stroke="${actor?C.actorStroke:C.boxStroke}" stroke-width="1.2"/><text class="seq-text" x="${p.x}" y="${p.y+p.h/2+4.5}" text-anchor="middle" font-weight="600">${esc(p.name)}</text></g>`);
 }
 for(const b of layout.bars){const px=layout.participants[b.i].x+b.depth*4-5;out.push(`<rect class="seq-bar" x="${px}" y="${b.y1}" width="10" height="${Math.max(6,b.y2-b.y1)}" rx="2" fill="${C.bar}" stroke="${C.boxStroke}" stroke-width="1"/>`);}
 // mensagens e notas
 for(const it of layout.items){
  if(it.kind==='message'){
   const dashed=it.style==='dashed'?' seq-dashed':'',marker=it.head==='open'?'':` marker-end="url(#seq-${it.head==='arrow'?'arrow':it.head})"`;
   out.push(`<g class="seq-step seq-msg" data-step="${it.step}" data-from="${esc(layout.participants[it.from].id)}" data-to="${esc(layout.participants[it.to].id)}">`);
   if(it.self)out.push(`<path class="seq-line${dashed}" d="M${it.x1} ${it.y}h${it.x2-it.x1}v${it.y2-it.y}h-${it.x2-it.x1-3}"${marker}/>`);
   else{const dir=it.x2>it.x1?1:-1;out.push(`<line class="seq-line${dashed}" x1="${it.x1+dir*(layout.bars.some(b=>b.i===it.from&&b.y1<=it.y&&b.y2>=it.y)?5:0)}" x2="${it.x2-dir*(layout.bars.some(b=>b.i===it.to&&b.y1<=it.y&&b.y2>=it.y)?5:1)}" y1="${it.y}" y2="${it.y}"${marker}/>`);}
   it.lines.forEach((l,i)=>out.push(`<text class="seq-text seq-label" x="${it.tx}" y="${it.ty+i*16}" text-anchor="${it.self?'start':'middle'}">${esc(l)}</text>`));
   out.push('</g>');
  }else if(it.kind==='note'){
   out.push(`<g class="seq-step seq-note" data-step="${it.step}"><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="3" fill="${C.note}" stroke="${C.noteStroke}"/>`);
   it.lines.forEach((l,i)=>out.push(`<text class="seq-text" x="${it.tx}" y="${it.y+18+i*16}" text-anchor="middle" font-size="12">${esc(l)}</text>`));
   out.push('</g>');
  }
 }
 out.push('</svg>');
 return out.join('');
}

/** texto -> {svg,model,layout}. Lança {code,line,detail}. */
export function renderSequence(text,options={}){
 const model=parseSequence(text),layout=layoutSequence(model,options);
 const names=new Map(model.participants.map(p=>[p.id,p.name]));
 const summary=model.steps.filter(s=>s.type==='message').slice(0,14).map(s=>`${names.get(s.from)} to ${names.get(s.to)}: ${s.text}`).join('. ');
 return {svg:renderSequenceSvg(layout,{summary}),model,layout};
}
