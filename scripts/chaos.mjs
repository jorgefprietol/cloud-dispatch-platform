import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const docker=process.platform==='win32'?'docker.exe':'docker';
const compose=(...args)=>execFileSync(docker,['compose',...args],{stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:90000});
const base=process.env.BASE_URL || 'http://127.0.0.1:18140';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const current=id=>fetch(`${base}/api/orders/${id}`).then(r=>r.json());
let id;
try{
  compose('stop','worker');
  const response=await fetch(`${base}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({customer:'Recovery verification',destination:'Cuenca',priority:'standard',amount:80.25})});
  assert.equal(response.status,201);id=(await response.json()).id;
  await pause(3000);assert.equal((await current(id)).status,'queued');
  assert.equal((await fetch(`${base}/api/orders/${id}/report`)).status,404);
}finally{compose('start','worker');}
let completed;
for(let i=0;i<60;i++){const order=await current(id);if(order.status==='dispatched'){completed=order;break;}await pause(2000);}
assert.ok(completed,'Backlog did not recover after worker restart');
const report=await(await fetch(`${base}/api/orders/${id}/report`)).json();
// Re-deliver the same accepted event to exercise real SQS/S3/callback idempotency.
const event={version:1,eventId:report.eventId,orderId:id,destination:'Cuenca',priority:'standard',amount:80.25};
compose('exec','-T','localstack','awslocal','sqs','send-message','--queue-url','http://localstack:4566/000000000000/dispatch','--message-body',JSON.stringify(event));
await pause(15000);const replay=await current(id);assert.equal(replay.trackingCode,completed.trackingCode);
assert.deepEqual(await(await fetch(`${base}/api/orders/${id}/report`)).json(),report);
console.log(JSON.stringify({result:'passed',checks:['worker-outage-backlog','restart-recovery','event-replay'],orderId:id}));
