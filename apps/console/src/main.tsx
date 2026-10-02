import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, Check, Circle, Download, Layers, LayoutDashboard, Package, Plus, RefreshCw, Search, ShieldCheck, Truck, X, Zap, LogOut } from 'lucide-react';
import { api, Dashboard, Order, initializeAuth, signedIn, login, logout, isDemo, downloadReport } from './api';
import './styles.css';
import {useDialog} from './useDialog';

const money = (n:number) => new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const date = (s:string) => new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
function App() {
  const [ready,setReady] = useState(false), [authenticated,setAuthenticated] = useState(false);
  const [orders,setOrders] = useState<Order[]>([]), [stats,setStats] = useState<Dashboard>({total:0,queued:0,dispatched:0,volume:0});
  const [error,setError] = useState(''), [loading,setLoading] = useState(false), [modal,setModal] = useState(false), [selected,setSelected] = useState<Order|null>(null);
  const [query,setQuery] = useState(''), [filter,setFilter] = useState('all'), [view,setView] = useState('overview'), [lastUpdate,setLastUpdate] = useState<Date|null>(null);
  useDialog(selected!==null,()=>setSelected(null));
  useEffect(() => { initializeAuth().then(async () => { setAuthenticated(await signedIn()); setReady(true); }).catch(e => { setError(e.message); setReady(true); }); },[]);
  async function refresh(manual = false) {
    if (manual) setLoading(true);
    try { const [list,dashboard] = await Promise.all([api<Order[]>('/orders'),api<Dashboard>('/dashboard')]); setOrders(list);setStats(dashboard);setLastUpdate(new Date());setError(''); }
    catch(e) {setError((e as Error).message); if (!(await signedIn())) setAuthenticated(false);}
    finally {setLoading(false);}
  }
  useEffect(() => { if (!authenticated) return; void refresh(true); const timer = setInterval(() => void refresh(), 5000);return () => clearInterval(timer); },[authenticated]);
  const visible = orders.filter(o => (filter === 'all' || o.status === filter) && `${o.customer} ${o.destination} ${o.trackingCode || ''} ${o.id}`.toLowerCase().includes(query.toLowerCase()));
  if (!ready) return <div className="welcome"><Layers size={44}/><p>Cargando consola…</p></div>;
  if (!authenticated) return <div className="welcome"><div className="brandmark"><Layers/></div><p className="eyebrow">CLOUD DISPATCH</p><h1>Tus operaciones,<br/>en un solo lugar.</h1><p>Accede a la consola de pedidos y trazabilidad.</p>{error && <p role="alert">{error}</p>}<button className="primary" onClick={() => void login()}>Iniciar sesión <ArrowRight size={18}/></button></div>;
  return <div className="shell">
    <aside className="sidebar"><a className="brand" href="/"><div className="brandmark"><Layers size={21}/></div><span>cloud<span className="brand-light">dispatch</span><small>OPERATIONS PLATFORM</small></span></a>
      <div className="workspace"><span className="workspace-icon">CD</span><div>Operations workspace<small>Gestión de envíos</small></div><ShieldCheck size={16}/></div>
      <p className="nav-label">WORKSPACE</p><nav><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}><LayoutDashboard size={18}/>Resumen</button><button className={view==='orders'?'active':''} onClick={()=>setView('orders')}><Package size={18}/>Pedidos<span className="nav-count">{stats.total}</span></button></nav>
      <div className="sidebar-bottom"><div className="system-state"><span className={error?'dot warn':'dot'}/>{error?'Conexión pendiente':'Consola conectada'}</div><div className="operator"><span className="avatar">OP</span><div>Operador<small>{isDemo()?'Entorno local':'Sesión autenticada'}</small></div>{!isDemo()&&<button title="Cerrar sesión" onClick={()=>void logout()}><LogOut size={17}/></button>}</div></div>
    </aside>
    <main><header><span>Workspace <span className="slash">/</span> <strong>{view==='overview'?'Resumen':'Pedidos'}</strong></span><div className="header-right"><span className="environment"><Circle size={8} fill="currentColor"/>{isDemo()?'LOCAL':'CLOUD'}</span><span className="avatar light">OP</span></div></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">CONTROL DE OPERACIONES</p><h1>{view==='overview'?'Todo en movimiento.':'Cada pedido, bajo control.'}</h1><p>Gestiona pedidos, sigue su estado y consulta la trazabilidad.</p></div><button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>Nuevo pedido</button></div>
      {error && <div className="error" role="alert">{error}<button onClick={()=>void refresh(true)}>Reintentar</button></div>}
      <section className="stats" aria-label="Indicadores"><Stat label="Pedidos totales" value={String(stats.total)} icon={<Package size={19}/>} note="Actividad acumulada"/><Stat label="En procesamiento" value={String(stats.queued)} icon={<RefreshCw size={19}/>} note="Pendientes de despacho"/><Stat label="Despachados" value={String(stats.dispatched)} icon={<Truck size={19}/>} note="Con trazabilidad disponible"/><Stat label="Volumen de pedidos" value={money(stats.volume)} icon={<ArrowUpRight size={19}/>} note="Valor total registrado"/></section>
      {view==='overview' && <section className="flow-card"><div><span className="flow-icon"><Zap size={19}/></span><div><h2>Un flujo conectado de principio a fin</h2><p>Cada pedido avanza automáticamente hacia su despacho.</p></div></div><div className="flow-steps"><span><span className="step-check"><Check size={13}/></span>Registro</span><ArrowRight size={16}/><span><span className="step-check"><Check size={13}/></span>Procesamiento</span><ArrowRight size={16}/><span><span className="step-check"><Check size={13}/></span>Trazabilidad</span></div></section>}
      <section className="orders-panel"><div className="panel-heading"><div><h2>Pedidos recientes <span>{orders.length}</span></h2><p>Los últimos 100 pedidos de tu espacio de trabajo.</p></div><button className="icon-button" aria-label="Actualizar pedidos" disabled={loading} onClick={()=>void refresh(true)}><RefreshCw size={17} className={loading?'spin':''}/></button></div>
        <div className="toolbar"><div className="tabs" aria-label="Filtrar estado">{[['all','Todos'],['queued','En proceso'],['dispatched','Despachados']].map(([value,label])=><button key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><label className="search"><Search size={16}/><input aria-label="Buscar pedidos" placeholder="Buscar pedido…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
        <div className="table-scroll"><table><thead><tr><th>PEDIDO / CLIENTE</th><th>DESTINO</th><th>PRIORIDAD</th><th>IMPORTE</th><th>ESTADO</th><th aria-label="Detalle"/></tr></thead><tbody>{visible.map(o=><tr key={o.id}><td><button className="order-link" onClick={()=>setSelected(o)}>{o.customer}</button><small className="order-id">#{o.id.slice(0,8).toUpperCase()}</small></td><td>{o.destination}</td><td><span className={o.priority==='express'?'priority express':'priority'}>{o.priority==='express'?<Zap size={12}/>:<Package size={12}/>} {o.priority==='express'?'Express':'Estándar'}</span></td><td className="amount">{money(o.amount)}</td><td><span className={`status ${o.status}`}><span className="dot"/>{o.status==='dispatched'?'Despachado':'En proceso'}</span></td><td><button className="icon-button" aria-label={`Ver pedido de ${o.customer}`} onClick={()=>setSelected(o)}><ArrowUpRight size={18}/></button></td></tr>)}</tbody></table></div>
        {!visible.length && <div className="empty"><div><Package size={30}/></div><h3>{orders.length?'Sin resultados':'Tu próximo envío empieza aquí'}</h3><p>{orders.length?'Prueba otra búsqueda o estado.':'Crea el primer pedido para activar el flujo de despacho.'}</p>{!orders.length&&<button className="secondary" onClick={()=>setModal(true)}>Crear primer pedido <ArrowRight size={16}/></button>}</div>}
        <div className="panel-footer"><span>{visible.length} pedidos visibles</span><span>Actualización automática · {lastUpdate?lastUpdate.toLocaleTimeString('es-EC'):'Conectando…'}</span></div>
      </section><footer>Cloud Dispatch <span>Operaciones con trazabilidad.</span><span className="footer-right"><ShieldCheck size={14}/> Espacio de trabajo privado</span></footer></div>
    </main>
    {modal && <NewOrder onClose={()=>setModal(false)} onCreated={()=>{setModal(false);void refresh(true);}}/>}
    {selected && <div className="overlay" onClick={()=>setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()}><button className="close" aria-label="Cerrar detalle" onClick={()=>setSelected(null)}><X/></button><p className="eyebrow">TRAZABILIDAD</p><h2 id="detail-title">{selected.customer}</h2><dl>{[['Pedido',selected.id],['Destino',selected.destination],['Registrado',date(selected.createdAt)],['Estado',selected.status==='dispatched'?'Despachado':'En proceso'],['Tracking',selected.trackingCode||'Pendiente'],['Importe',money(selected.amount)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{selected.reportKey&&<button className="primary" onClick={()=>void downloadReport(selected).catch(e=>setError(e.message))}><Download size={17}/>Descargar reporte</button>}</section></div>}
  </div>;
}
function Stat({label,value,icon,note}:{label:string;value:string;icon:React.ReactNode;note:string}) {return <article className="stat"><div><p>{label}</p><span>{icon}</span></div><strong>{value}</strong><small>{note}</small></article>;}
function NewOrder({onClose,onCreated}:{onClose:()=>void;onCreated:()=>void}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [customer,setCustomer]=useState(''),[destination,setDestination]=useState(''),[priority,setPriority]=useState('standard'),[amount,setAmount]=useState('');
  const [retry,setRetry]=useState<{payload:string;key:string}|null>(null);
  useDialog(true,()=>{if(!busy)onClose();});
  async function submit(e:React.FormEvent) {
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    const payload=JSON.stringify({customer:customer.trim(),destination:destination.trim(),priority,amount:Number(amount)});
    const key=retry?.payload===payload?retry.key:crypto.randomUUID();setRetry({payload,key});
    try {await api<Order>('/orders',{method:'POST',headers:{'Idempotency-Key':key},body:payload});onCreated();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-title"><button className="close" disabled={busy} aria-label="Cerrar formulario" onClick={onClose}><X/></button><p className="eyebrow">NUEVO DESPACHO</p><h2 id="new-title">Registrar pedido</h2><p>El procesamiento comienza después del registro.</p><form onSubmit={submit}><label>Cliente<input autoFocus required maxLength={120} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nombre del cliente"/></label><label>Destino<input required maxLength={120} value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Ciudad o dirección de entrega"/></label><div className="form-row"><label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="standard">Estándar</option><option value="express">Express</option></select></label><label>Importe (USD)<input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label></div>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Registrando…':'Registrar pedido'}<ArrowRight size={17}/></button></div></form></section></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
