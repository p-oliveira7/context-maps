// Apresentação de exemplo: um checkout de e-commerce com um diagrama de sequência complexo, todas as chamadas ligadas a requests
// com mocks (nenhuma API real é chamada). Uso: node examples/checkout-demo.mjs [http://127.0.0.1:4173]
// Cria (ou recria) a coleção "checkout-demo" e a apresentação "checkout-demo". O servidor precisa estar rodando.
import {renderSequence} from '../sequence.js';

const base=(process.argv[2]||'http://127.0.0.1:4173').replace(/\/$/,'');
const H={'x-context-maps':'1','content-type':'application/json'};
async function call(method,route,body,{raw=false}={}){
 const r=await fetch(`${base}/api${route}`,{method,headers:raw?{'x-context-maps':'1'}:H,body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 if(!r.ok&&!(method==='DELETE'&&r.status===404))throw new Error(`${method} ${route} -> ${r.status} ${await r.text()}`);
 return r.status===204?null:r.json().catch(()=>null);
}
const COLL='checkout-demo';

/* ---------- coleção ---------- */
await call('DELETE',`/collections/${COLL}`);
await call('POST','/collections',{name:'Checkout Demo'});
await call('PUT',`/collections/${COLL}/environments/local`,{vars:[{name:'host',value:'https://api.loja.example',enabled:true}]});
const folders={};
for(const name of ['Auth','Pedidos','Pagamentos']){folders[name]=(await call('POST',`/collections/${COLL}/items`,{type:'folder',name})).path;}

const ok=(status,body,name,delayMs=250)=>({id:`s${status}`,name,kind:'response',status,headers:[{name:'content-type',value:'application/json'}],body:JSON.stringify(body,null,2),delayMs});
const REQUESTS=[
 {key:'login',folder:'Auth',name:'Login',method:'post',url:'{{host}}/auth/login',json:{email:'ana@loja.com',password:'••••••'},
  varsPost:[{name:'token',value:'res.body.token'}],expect:200,
  scenarios:[ok(200,{token:'eyJhbGciOi.demo.token',user:{name:'Ana'}},'Login válido'),ok(401,{error:'invalid_credentials'},'Credenciais inválidas')]},
 {key:'order',folder:'Pedidos',name:'Criar pedido',method:'post',url:'{{host}}/orders',json:{items:[{sku:'TEN-42',qty:1}]},auth:true,
  varsPost:[{name:'orderId',value:'res.body.orderId'}],expect:201,
  scenarios:[ok(201,{orderId:'A-1001',status:'created'},'Pedido criado'),ok(422,{error:'cart_empty'},'Carrinho vazio')]},
 {key:'stock',folder:'Pedidos',name:'Reservar estoque',method:'post',url:'{{host}}/stock/reserve',json:{orderId:'{{orderId}}'},auth:true,expect:200,
  scenarios:[ok(200,{reserved:true,sku:'TEN-42'},'Reservado',400),ok(409,{error:'out_of_stock',sku:'TEN-42'},'Sem estoque',400)]},
 {key:'fraud',folder:'Pagamentos',name:'Análise antifraude',method:'post',url:'{{host}}/fraud/check',json:{orderId:'{{orderId}}'},auth:true,expect:200,
  scenarios:[ok(200,{score:12,decision:'approve'},'Aprovado',500),ok(403,{score:91,decision:'reject'},'Suspeita de fraude',500)]},
 {key:'payment',folder:'Pagamentos',name:'Cobrar cartão',method:'post',url:'{{host}}/payments',json:{orderId:'{{orderId}}',card:'**** 4242'},auth:true,expect:201,
  scenarios:[ok(201,{paid:true,authorization:'AUTH-77'},'Pago',700),ok(402,{error:'card_declined'},'Cartão recusado',700),ok(504,{error:'gateway_timeout'},'Timeout do gateway',2200)]},
 {key:'notify',folder:'Pedidos',name:'Notificar cliente',method:'post',url:'{{host}}/notifications',json:{orderId:'{{orderId}}',channel:'email'},auth:true,expect:202,
  scenarios:[ok(202,{queued:true},'Enfileirada',250),ok(500,{error:'smtp_down'},'Falha no envio',250)]},
 {key:'status',folder:'Pedidos',name:'Consultar pedido',method:'get',url:'{{host}}/orders/{{orderId}}',auth:true,expect:200,
  scenarios:[ok(200,{orderId:'{{orderId}}',status:'confirmed'},'Confirmado',300),ok(404,{error:'not_found'},'Não encontrado',300)]}
];
const mocks={version:1,requests:{}},pathOf={};
for(const r of REQUESTS){
 const made=await call('POST',`/collections/${COLL}/items`,{type:'request',parent:folders[r.folder],name:r.name,method:r.method,url:r.url});
 pathOf[r.key]=made.path;
 const model=await call('GET',`/collections/${COLL}/request?path=${encodeURIComponent(made.path)}`);
 await call('PUT',`/collections/${COLL}/request?path=${encodeURIComponent(made.path)}`,{...model,
  headers:r.auth?[{name:'Authorization',value:'Bearer {{token}}',enabled:true}]:[],
  ...(r.json?{bodyMode:'json',body:{json:JSON.stringify(r.json,null,2)}}:{}),
  varsPost:(r.varsPost||[]).map(v=>({...v,enabled:true})),
  assertions:[{name:'res.status',value:`eq ${r.expect}`,enabled:true}]});
 mocks.requests[made.path]={mode:'on',active:r.scenarios[0].id,scenarios:r.scenarios};
}
await call('PUT',`/collections/${COLL}/mocks`,mocks);

/* ---------- diagrama ---------- */
const bind=key=>`%% @step ${key} ${JSON.stringify({collection:COLL,request:pathOf[{s1:'login',s2:'order',s3:'stock',s4:'fraud',s5:'payment',s6:'notify',s7:'status'}[key]],rules:[]})}`;
const SRC=`sequenceDiagram
  title Checkout e-commerce
  autonumber
  actor Cliente
  participant App as App web
  participant GW as API Gateway
  participant Auth
  participant Ped as Pedidos
  participant Est as Estoque
  participant Fra as Antifraude
  participant Pag as Pagamentos
  participant Not as Notificações
  Cliente->>App: Entrar com e-mail e senha
  ${bind('s1')}
  App->>GW: POST /auth/login
  GW->>Auth: validar credenciais
  alt 200 login válido
    Auth-->>GW: 200 OK + token
    GW-->>App: 200 OK
    Note over Auth,GW: JWT válido por 15 min
    Cliente->>App: Finalizar compra
    ${bind('s2')}
    App->>GW: POST /orders
    GW->>Ped: criar pedido
    alt 201 pedido criado
      Ped-->>GW: 201 Created
      ${bind('s3')}
      Ped->>Est: POST /stock/reserve
      alt 200 estoque reservado
        Est-->>Ped: 200 Reservado
        ${bind('s4')}
        Ped->>Fra: POST /fraud/check
        alt 200 aprovado pelo antifraude
          Fra-->>Ped: 200 Aprovado
          Note over Fra,Pag: score abaixo de 70 aprova
          ${bind('s5')}
          Ped->>Pag: POST /payments
          alt 201 pagamento autorizado
            Pag-->>Ped: 201 Pago
            ${bind('s6')}
            Ped->>Not: POST /notifications
            alt 202 notificação enfileirada
              Not-->>Ped: 202 Accepted
            else 500 falha no envio
              Not-->>Ped: 500 Erro no envio
              Note right of Ped: o pedido segue confirmado
            end
            Ped-->>GW: 201 Created
            GW-->>App: 201 Created
            App-->>Cliente: Pedido confirmado
            loop até confirmar
              ${bind('s7')}
              App->>GW: GET /orders/:id
              alt 200 confirmado
                GW-->>App: 200 confirmed
              else 404 não encontrado
                GW-->>App: 404 Not found
              end
            end
          else 402 cartão recusado
            Pag-->>Ped: 402 Payment required
            Ped-->>GW: 402 Payment required
            GW-->>App: 402 Payment required
            App-->>Cliente: Pagamento recusado
          else 504 gateway sem resposta
            Pag-->>Ped: 504 Gateway timeout
            Ped-->>GW: 504 Gateway timeout
            GW-->>App: 504 Gateway timeout
            App-->>Cliente: Tente novamente
          end
        else 403 suspeita de fraude
          Fra-->>Ped: 403 Rejeitado
          Ped-->>GW: 403 Forbidden
          GW-->>App: 403 Forbidden
          App-->>Cliente: Compra bloqueada
        end
      else 409 sem estoque
        Est-->>Ped: 409 Conflict
        Ped-->>GW: 409 Conflict
        GW-->>App: 409 Conflict
        App-->>Cliente: Produto indisponível
      end
    else 422 carrinho vazio
      Ped-->>GW: 422 Unprocessable
      GW-->>App: 422 Unprocessable
      App-->>Cliente: Carrinho vazio
    end
  else 401 credenciais inválidas
    Auth-->>GW: 401 Unauthorized
    GW-->>App: 401 Unauthorized
    App-->>Cliente: E-mail ou senha incorretos
  end
`;
const {svg}=renderSequence(SRC,{});

/* ---------- apresentação ---------- */
const pres='checkout-demo';
await call('DELETE',`/presentations/${pres}`);
await call('POST','/presentations',{title:'Checkout demo'});
const leaf=(id,title)=>({id,title,children:[]});
const doc={id:pres,title:'Checkout e-commerce',roots:[{id:'root',title:'Checkout e-commerce',children:[
 {id:'flow',title:'Fluxo de compra ao vivo',color:'#7fb59a',children:[],apis:[{collection:COLL,path:'',name:'Checkout Demo'}]},
 {id:'overview',title:'Etapas do checkout',color:'#6fa3d6',children:[leaf('o1','Entrar e obter o token'),leaf('o2','Criar o pedido e reservar o estoque'),leaf('o3','Antifraude e cobrança do cartão'),leaf('o4','Notificar e acompanhar o pedido')]},
 {id:'scenarios',title:'Cenários para mostrar',color:'#d98757',children:[leaf('c1','Cartão recusado (402)'),leaf('c2','Sem estoque (409)'),leaf('c3','Suspeita de fraude (403)'),leaf('c4','Timeout do gateway (504)')]}
]}]};
await call('PUT',`/presentations/${pres}`,doc);
const asset=await call('POST',`/presentations/${pres}/assets?name=checkout-flow.svg`,svg,{raw:true});
doc.roots[0].children[0].images=[{src:asset.src,alt:'Diagrama de sequência do checkout',kind:'diagram',source:SRC,engine:'sequence'}];
await call('PUT',`/presentations/${pres}`,doc);
console.log(`Pronto: ${base}/?p=${pres}\nColeção: ${COLL} (${REQUESTS.length} requests, todas com mock ligado)`);
