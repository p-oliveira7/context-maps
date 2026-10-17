// ZIP mínimo sem dependências (usa o zlib do Node): grava pacotes de apresentação e lê pacotes de outras origens.
// Sem ZIP64, sem criptografia. Na leitura há limites de entradas e de tamanho descompactado (proteção contra "zip bomb").
import {deflateRawSync,inflateRawSync} from 'node:zlib';

const TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(buf){let c=0xFFFFFFFF;for(let i=0;i<buf.length;i++)c=TABLE[(c^buf[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}

const dosTime=d=>((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF;
const dosDate=d=>(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;

/** entries: [{name: 'pasta/arquivo.ext', data: Buffer}] -> Buffer (.zip) */
export function writeZip(entries){
 const now=new Date(),time=dosTime(now),date=dosDate(now),locals=[],centrals=[];
 let offset=0;
 for(const {name,data} of entries){
  const nameBuf=Buffer.from(name,'utf8'),crc=crc32(data);
  const packed=data.length>64?deflateRawSync(data):data,method=packed===data?0:8;
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(method,8);
  local.writeUInt16LE(time,10);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
  locals.push(local,nameBuf,packed);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(method,10);
  central.writeUInt16LE(time,12);central.writeUInt16LE(date,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(offset,42);
  centrals.push(central,nameBuf);
  offset+=30+nameBuf.length+packed.length;
 }
 const centralSize=centrals.reduce((a,b)=>a+b.length,0),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...centrals,end]);
}

/** Buffer (.zip) -> [{name, data}] (só arquivos; nomes normalizados, sem "..", sem caminho absoluto). Lança Error se inválido. */
export function readZip(buf,{maxEntries=2000,maxTotal=200*1024*1024}={}){
 let eocd=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-22-65535);i--)if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw new Error('zip inválido');
 const count=buf.readUInt16LE(eocd+10);let pos=buf.readUInt32LE(eocd+16);
 if(count===0xFFFF||pos===0xFFFFFFFF)throw new Error('zip64 não suportado');
 if(count>maxEntries)throw new Error('zip com arquivos demais');
 const out=[];let total=0;
 for(let n=0;n<count;n++){
  if(buf.readUInt32LE(pos)!==0x02014b50)throw new Error('zip corrompido');
  const flags=buf.readUInt16LE(pos+8),method=buf.readUInt16LE(pos+10),csize=buf.readUInt32LE(pos+20),usize=buf.readUInt32LE(pos+24);
  const nlen=buf.readUInt16LE(pos+28),elen=buf.readUInt16LE(pos+30),clen=buf.readUInt16LE(pos+32),local=buf.readUInt32LE(pos+42);
  const raw=buf.toString(flags&0x0800?'utf8':'latin1',pos+46,pos+46+nlen).replace(/\\/g,'/');
  pos+=46+nlen+elen+clen;
  if(raw.endsWith('/'))continue; // pasta
  if(flags&1)throw new Error('zip criptografado');
  const parts=raw.split('/').filter(p=>p&&p!=='.');
  if(!parts.length||parts.includes('..')||/^[a-z]:/i.test(parts[0]))continue; // ignora caminhos suspeitos
  total+=usize;if(total>maxTotal)throw new Error('zip grande demais');
  if(buf.readUInt32LE(local)!==0x04034b50)throw new Error('zip corrompido');
  const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),slice=buf.subarray(start,start+csize);
  let data;
  if(method===0)data=Buffer.from(slice);
  else if(method===8)data=inflateRawSync(slice,{maxOutputLength:Math.max(usize,1)});
  else throw new Error('método de compressão não suportado');
  out.push({name:parts.join('/'),data});
 }
 return out;
}
