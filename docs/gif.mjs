// Gerador de GIF animado sem dependências, usado por docs/demo.mjs (decodifica PNG, quantiza, comprime com LZW).
// Usa uma paleta global (mediana de cortes) e grava só a região que mudou em cada quadro.
import {inflateSync} from 'node:zlib';

/** PNG 8 bits (RGB ou RGBA, sem entrelaçamento) -> {width, height, rgba:Uint8Array} */
export function decodePng(buf){
 let pos=8,width=0,height=0,depth=0,type=0;const idat=[];
 while(pos<buf.length){
  const len=buf.readUInt32BE(pos),name=buf.toString('ascii',pos+4,pos+8),data=buf.subarray(pos+8,pos+8+len);
  if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];if(data[12]!==0)throw new Error('PNG entrelaçado não suportado');}
  else if(name==='IDAT')idat.push(data);
  else if(name==='IEND')break;
  pos+=12+len;
 }
 if(depth!==8||(type!==2&&type!==6))throw new Error(`PNG não suportado (profundidade ${depth}, tipo ${type})`);
 const bpp=type===6?4:3,stride=width*bpp,raw=inflateSync(Buffer.concat(idat)),out=new Uint8Array(width*height*4);
 let prev=new Uint8Array(stride),line=new Uint8Array(stride),p=0;
 for(let y=0;y<height;y++){
  const filter=raw[p++];
  for(let x=0;x<stride;x++){
   const cur=raw[p++],a=x>=bpp?line[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;
   let v;
   switch(filter){
    case 0:v=cur;break;case 1:v=cur+a;break;case 2:v=cur+b;break;case 3:v=cur+((a+b)>>1);break;
    default:{const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v=cur+(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
   }
   line[x]=v&255;
  }
  for(let x=0;x<width;x++){const o=(y*width+x)*4,s=x*bpp;out[o]=line[s];out[o+1]=line[s+1];out[o+2]=line[s+2];out[o+3]=bpp===4?line[s+3]:255;}
  [prev,line]=[line,prev];
 }
 return {width,height,rgba:out};
}

/** Paleta por mediana de cortes a partir de amostras de todos os quadros. */
function buildPalette(frames,size){
 const samples=[];
 for(const f of frames)for(let i=0;i<f.length;i+=4*9)samples.push([f[i],f[i+1],f[i+2]]);
 const boxes=[samples];
 while(boxes.length<size){
  let at=-1,widest=-1,axis=0;
  boxes.forEach((box,i)=>{
   if(box.length<2)return;
   for(let c=0;c<3;c++){let lo=255,hi=0;for(const px of box){lo=Math.min(lo,px[c]);hi=Math.max(hi,px[c]);}const range=(hi-lo)*Math.sqrt(box.length);if(range>widest){widest=range;at=i;axis=c;}}
  });
  if(at<0)break;
  const box=boxes[at].sort((a,b)=>a[axis]-b[axis]),mid=box.length>>1;
  boxes.splice(at,1,box.slice(0,mid),box.slice(mid));
 }
 return boxes.filter(b=>b.length).map(box=>{const s=[0,0,0];for(const px of box){s[0]+=px[0];s[1]+=px[1];s[2]+=px[2];}return s.map(v=>Math.round(v/box.length));});
}

function indexFrames(frames,palette){
 const cache=new Map(),near=(r,g,b)=>{
  const key=((r>>2)<<12)|((g>>2)<<6)|(b>>2);let hit=cache.get(key);
  if(hit!==undefined)return hit;
  let best=0,bestD=1e9;
  for(let i=0;i<palette.length;i++){const dr=r-palette[i][0],dg=g-palette[i][1],db=b-palette[i][2],d=dr*dr*2+dg*dg*4+db*db*3;if(d<bestD){bestD=d;best=i;}}
  cache.set(key,best);return best;
 };
 return frames.map(f=>{const out=new Uint8Array(f.length/4);for(let i=0,j=0;i<f.length;i+=4,j++)out[j]=near(f[i],f[i+1],f[i+2]);return out;});
}

function lzw(indices,minCode){ // mesma lógica do omggif: o tamanho do código cresce antes de gravar a nova entrada
 const clear=1<<minCode,eoi=clear+1,bytes=[];let bitBuf=0,bitCount=0,codeSize=minCode+1,next=eoi+1,dict=new Map();
 const emit=code=>{bitBuf|=code<<bitCount;bitCount+=codeSize;while(bitCount>=8){bytes.push(bitBuf&255);bitBuf>>>=8;bitCount-=8;}};
 emit(clear);
 let prefix=indices[0];
 for(let i=1;i<indices.length;i++){
  const k=indices[i],key=(prefix<<8)|k,found=dict.get(key);
  if(found!==undefined){prefix=found;continue;}
  emit(prefix);
  if(next===4096){emit(clear);dict=new Map();next=eoi+1;codeSize=minCode+1;}
  else{if(next>=(1<<codeSize))codeSize++;dict.set(key,next++);}
  prefix=k;
 }
 emit(prefix);emit(eoi);if(bitCount>0)bytes.push(bitBuf&255);
 return bytes;
}
const subBlocks=bytes=>{const out=[];for(let i=0;i<bytes.length;i+=255){const chunk=bytes.slice(i,i+255);out.push(chunk.length,...chunk);}out.push(0);return out;};
const u16=n=>[n&255,(n>>8)&255];

/** frames: [{rgba, delay (ms)}] (mesmo tamanho) -> Buffer .gif */
export function encodeGif({width,height,frames,colors=255,loop=0}){
 const palette=buildPalette(frames.map(f=>f.rgba),colors);
 const transparent=palette.length; // índice reservado para "sem mudança"
 const table=[...palette,[0,0,0]];while(table.length<256)table.push([0,0,0]);
 const idx=indexFrames(frames.map(f=>f.rgba),palette);
 const head=[...Buffer.from('GIF89a'),...u16(width),...u16(height),0xF7,0,0];
 for(const [r,g,b] of table)head.push(r,g,b);
 head.push(0x21,0xFF,0x0B,...Buffer.from('NETSCAPE2.0'),3,1,...u16(loop),0);
 const parts=[Buffer.from(head)];
 idx.forEach((pixels,n)=>{
  let x0=0,y0=0,x1=width-1,y1=height-1,data;
  if(n>0){ // só a região que mudou; o resto vira transparente (o quadro anterior continua visível)
   const prev=idx[n-1];x0=width;y0=height;x1=-1;y1=-1;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[y*width+x]!==prev[y*width+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
   if(x1<0){x0=0;y0=0;x1=0;y1=0;}
  }
  const w=x1-x0+1,h=y1-y0+1;data=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=pixels[(y0+y)*width+x0+x];data[y*w+x]=n>0&&v===idx[n-1][(y0+y)*width+x0+x]?transparent:v;}
  const delay=Math.max(2,Math.round(frames[n].delay/10));
  parts.push(Buffer.from([0x21,0xF9,4,n>0?0x05:0x04,...u16(delay),transparent,0])); // disposal 1 (mantém) + transparência
  parts.push(Buffer.from([0x2C,...u16(x0),...u16(y0),...u16(w),...u16(h),0,8]));
  parts.push(Buffer.from(subBlocks(lzw(data,8))));
 });
 parts.push(Buffer.from([0x3B]));
 return Buffer.concat(parts);
}
