// cURL <-> request: leitura de comandos colados (incluindo o "Copy as cURL" do navegador) e geração de curl/fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize,parseCurl,toCurl,toFetch} from '../curl.js';

test('tokenize: quotes, line continuations and $\'…\' escapes', () => {
 assert.deepEqual(tokenize(`curl 'https://x.dev/a?b=1' -H "Accept: a b" \\\n  -d plain`),['curl','https://x.dev/a?b=1','-H','Accept: a b','-d','plain']);
 assert.deepEqual(tokenize(`a 'it'\\''s' "q\\"uote" $'x\\ny\\u00e9\\'z'`),['a',"it's",'q"uote',"x\nyé'z"]);
 assert.deepEqual(tokenize('  '),[]);assert.deepEqual(tokenize("a '' b"),['a','','b']);
});
test('parseCurl: browser "Copy as cURL (bash)" with headers and a JSON body', () => {
 const m=parseCurl(`curl 'https://api.example.com/v1/users?page=2' \\
  -H 'accept: application/json' \\
  -H 'authorization: Bearer abc.def' \\
  -H 'content-type: application/json' \\
  --data-raw $'{"name":"Ana","note":"line\\\\nbreak"}' \\
  --compressed`);
 assert.equal(m.method,'post');assert.equal(m.url,'https://api.example.com/v1/users?page=2');
 assert.deepEqual(m.headers.map(h=>[h.name,h.value]),[['accept','application/json'],['authorization','Bearer abc.def'],['content-type','application/json']]);
 assert.equal(m.bodyMode,'json');assert.deepEqual(JSON.parse(m.body.json),{name:'Ana',note:'line\nbreak'});assert.equal(m.authMode,'none');
});
test('parseCurl: method, attached flags, basic auth, cookies and ignored flags', () => {
 const m=parseCurl(`curl -sSL -XPUT -uana:s3cr:et -b 'a=1; b=2' -A 'agent/1' --url "https://x.dev/r" -k`);
 assert.equal(m.method,'put');assert.equal(m.url,'https://x.dev/r');
 assert.deepEqual(m.basic,{username:'ana',password:'s3cr:et'});assert.equal(m.authMode,'basic');
 assert.deepEqual(m.headers.map(h=>h.name),['Cookie','User-Agent']);assert.equal(m.bodyMode,'none');
 assert.equal(parseCurl('curl -I https://x.dev').method,'head');assert.equal(parseCurl('curl --request=delete https://x.dev').method,'delete');
});
test('parseCurl: form data, urlencode, GET with data and --json', () => {
 const form=parseCurl(`curl https://x.dev/login -d 'user=ana&pass=a%26b' -d 'remember=1'`);
 assert.equal(form.method,'post');assert.equal(form.bodyMode,'formUrlEncoded');
 assert.deepEqual(form.formUrlEncoded.map(e=>[e.name,e.value]),[['user','ana'],['pass','a&b'],['remember','1']]);
 const enc=parseCurl(`curl https://x.dev/s --data-urlencode 'q=a b&c' --data-urlencode 'lang=pt'`);
 assert.deepEqual(enc.formUrlEncoded.map(e=>[e.name,e.value]),[['q','a b&c'],['lang','pt']]);
 const get=parseCurl(`curl -G https://x.dev/search -d 'q=ana' -d 'page=2'`);
 assert.equal(get.method,'get');assert.equal(get.url,'https://x.dev/search?q=ana&page=2');assert.equal(get.bodyMode,'none');
 const json=parseCurl(`curl https://x.dev/p --json '{"a":1}'`);
 assert.equal(json.method,'post');assert.equal(json.bodyMode,'json');assert.equal(headerValue(json,'content-type'),'application/json');assert.equal(headerValue(json,'accept'),'application/json');
 const xml=parseCurl(`curl https://x.dev/p -H 'Content-Type: text/xml' -d '<a/>'`);assert.equal(xml.bodyMode,'xml');assert.equal(xml.body.xml,'<a/>');
 const text=parseCurl(`curl https://x.dev/p -d 'just some text'`);assert.equal(text.bodyMode,'text');
 assert.deepEqual(parseCurl(`curl https://x.dev/up -F 'file=@a.png'`).notes,['multipart']);
});
const headerValue=(m,name)=>m.headers.find(h=>h.name.toLowerCase()===name)?.value;
test('parseCurl: not curl, or nothing to call', () => {
 assert.equal(parseCurl('https://x.dev'),null);assert.equal(parseCurl('wget https://x.dev'),null);assert.equal(parseCurl('curl -X POST'),null);assert.equal(parseCurl(''),null);
 assert.ok(parseCurl('curl.exe https://x.dev'));
});
test('toCurl and toFetch', () => {
 const req={method:'POST',url:"https://x.dev/a?b=it's",headers:[{name:'Content-Type',value:'application/json'},{name:'X-Id',value:'1'}],body:'{"a":1}'};
 const curl=toCurl(req);
 assert.equal(curl,"curl -X POST 'https://x.dev/a?b=it'\\''s' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Id: 1' \\\n  --data-raw '{\"a\":1}'");
 assert.equal(toCurl({method:'GET',url:'https://x.dev',headers:[]}),"curl 'https://x.dev'");
 assert.equal(toCurl({method:'HEAD',url:'https://x.dev',headers:[]}),"curl -I 'https://x.dev'");
 const back=parseCurl(curl);assert.equal(back.url,req.url);assert.equal(back.method,'post');assert.equal(back.body.json,'{"a":1}');assert.equal(back.headers.length,2);
 assert.equal(toFetch({method:'GET',url:'https://x.dev',headers:[]}),'fetch("https://x.dev");');
 const f=toFetch(req);assert.match(f,/^fetch\("https:\/\/x\.dev\/a\?b=it's", \{/);assert.match(f,/method: "POST"/);assert.match(f,/"Content-Type": "application\/json"/);assert.match(f,/body: JSON\.stringify\(\{\n\s+"a": 1\n\s+\}\)/);
 assert.match(toFetch({method:'POST',url:'u',headers:[],body:'plain'}),/body: "plain"/);
});
