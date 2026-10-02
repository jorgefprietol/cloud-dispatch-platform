const base=process.env.BASE_URL || 'http://127.0.0.1:18140';
const config=await(await fetch(`${base}/config.json`)).json();
if(config.authMode!=='demo')throw new Error('Synthetic fixtures are only allowed in the local development environment.');
const fixtures=[['Andes Supply','Quito','express',1850.75],['Pacífico Logistics','Guayaquil','standard',940.50],['Sierra Industrial','Cuenca','express',3200],['Nexo Distribución','Ambato','standard',675.25],['Costa Retail','Manta','standard',1280],['Altura Commerce','Loja','express',460.90]];
for(const [customer,destination,priority,amount] of fixtures){const response=await fetch(`${base}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`synthetic-v1-${customer}`},body:JSON.stringify({customer,destination,priority,amount})});if(!response.ok)throw new Error(`Fixture failed: ${response.status}`);}
console.log('Six synthetic development orders created idempotently.');
