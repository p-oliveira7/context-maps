import test from 'node:test';
import assert from 'node:assert/strict';
import {findJwt,decodeJwt,jwtStatus} from '../jwt.js';

const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const make=(payload,header={alg:'HS256',typ:'JWT'})=>`${b64(header)}.${b64(payload)}.c2lnbmF0dXJl`;

test('findJwt reconhece tokens (e "Bearer …") e recusa o resto', () => {
 const tk=make({sub:'ana',exp:2000000000});
 assert.equal(findJwt(tk),tk);
 assert.equal(findJwt(`Bearer ${tk}`),tk);
 assert.equal(findJwt(`  ${tk}  `),tk);
 assert.equal(findJwt('abc.def.ghi'),null);
 assert.equal(findJwt('not a token'),null);
 assert.equal(findJwt(`${b64({typ:'x'})}.${b64({a:1})}.sig`),null); // cabeçalho sem alg
 assert.equal(findJwt(`${b64({alg:'none'})}.${b64({a:1})}.`),`${b64({alg:'none'})}.${b64({a:1})}.`); // sem assinatura também vale
 assert.equal(findJwt('1.2.3'),null);
 assert.equal(findJwt(null),null);
});

test('decodeJwt lê cabeçalho, payload (UTF-8) e datas', () => {
 const tk=make({sub:'joão',iat:1700000000,exp:1700003600,roles:['admin']});
 const d=decodeJwt(tk);
 assert.equal(d.header.alg,'HS256');assert.equal(d.payload.sub,'joão');assert.deepEqual(d.payload.roles,['admin']);
 assert.equal(d.times.exp.getTime(),1700003600000);assert.equal(d.times.iat.getTime(),1700000000000);
 assert.equal(d.signature,'c2lnbmF0dXJl');
});

test('jwtStatus: válido, expirado, ainda não vale e sem exp', () => {
 const now=1700000000000;
 assert.deepEqual(jwtStatus({exp:new Date(now+60000)},now),{state:'valid',ms:60000});
 assert.deepEqual(jwtStatus({exp:new Date(now-1000)},now),{state:'expired',ms:1000});
 assert.equal(jwtStatus({nbf:new Date(now+5000),exp:new Date(now+60000)},now).state,'notYet');
 assert.equal(jwtStatus({},now).state,'noExp');
});
