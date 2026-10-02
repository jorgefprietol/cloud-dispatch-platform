import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base = process.env.BASE_URL || 'http://127.0.0.1:18140';
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
for(let i=0;i<90;i++){try{const r=await fetch(`${base}/health/ready`);if(r.ok)break;if(i===89)throw new Error('Not ready');}catch(e){if(i===89)throw e;}await pause(2000);}
async function create(body,key){return fetch(`${base}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});}
const payload={customer:'Smoke '+randomUUID().slice(0,8),destination:'Guayaquil',priority:'express',amount:149.75};
const key=randomUUID();const first=await create(payload,key);assert.equal(first.status,201);const order=await first.json();
const retry=await create(payload,key);assert.equal(retry.status,200);assert.equal((await retry.json()).id,order.id);
assert.equal((await create({...payload,amount:150},key)).status,409);
assert.equal((await create({...payload,amount:-1},randomUUID())).status,400);
assert.equal((await fetch(`${base}/internal/orders/${order.id}/fulfill`,{method:'POST'})).status,404);
let completed;
for(let i=0;i<60;i++){const current=await (await fetch(`${base}/api/orders/${order.id}`)).json();if(current.status==='dispatched'){completed=current;break;}await pause(2000);}
assert.ok(completed,'Java worker did not dispatch the order');
assert.match(completed.trackingCode,/^CD-[0-9A-F]{12}$/);
const report=await fetch(`${base}/api/orders/${order.id}/report`);assert.equal(report.status,200);const document=await report.json();
assert.equal(document.orderId,order.id);assert.equal(document.route,'priority-network');assert.equal(document.amount,149.75);
const dashboard=await (await fetch(`${base}/api/dashboard`)).json();assert.ok(dashboard.dispatched>=1);
console.log(JSON.stringify({result:'passed',checks:8,orderId:order.id,trackingCode:completed.trackingCode}));
