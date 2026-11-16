import { useEffect, useMemo, useState } from 'react';
import { auth, api } from '@appdeploy/client';
import {
  Activity, AlertTriangle, Boxes, Building2, Check, ChevronDown, CircleDollarSign,
  ClipboardList, CreditCard, LayoutDashboard, LogOut, Menu, Package, Plus,
  Search, Settings, ShoppingCart, Store, TrendingUp, Users, X
} from 'lucide-react';

type User = { userId: string; email?: string; name?: string };
type Business = { id: string; name: string; type: string; currency: string; role: string; plan: string; subscriptionStatus: string };
type Product = { id: string; name: string; sku: string; category: string; stock: number; price: number; cost: number; threshold: number };
type Sale = { id: string; productId: string; productName: string; quantity: number; total: number; profit: number; createdAt: string; payment: string };
const money = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');
const categories = ['Groceries', 'Beverages', 'Dairy', 'Household', 'Personal care', 'Snacks', 'Other'];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [page, setPage] = useState('Dashboard');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [businessForm, setBusinessForm] = useState({ name: '', type: 'Supermarket' });
  const [productForm, setProductForm] = useState({ name: '', sku: '', category: 'Groceries', stock: '0', price: '', cost: '', threshold: '5' });
  const [saleForm, setSaleForm] = useState({ productId: '', quantity: '1', payment: 'Cash' });

  useEffect(() => {
    let active = true;
    auth.getUser().then(async (restored) => {
      if (!active) return;
      setUser(restored);
      setAuthReady(true);
      if (restored) await loadWorkspace();
    }).catch(() => {
      if (active) { setAuthReady(true); setErrorMessage('We could not restore your session. Please try signing in again.'); }
    });
    return () => { active = false; };
  }, []);

  async function loadWorkspace() {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await api.get('/api/workspace');
      const data = response.data;
      setBusinesses(data.businesses || []);
      const selected = (data.businesses || [])[0] || null;
      setBusiness(selected);
      if (selected) await loadBusiness(selected.id);
      else setShowBusinessForm(true);
    } catch (err) {      setErrorMessage(messageOf(err, 'Could not load your business data.'));
    } finally { setLoading(false); }
  }

  async function loadBusiness(businessId: string) {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await api.get('/api/business-data?businessId=' + encodeURIComponent(businessId));
      setProducts(response.data.products || []);
      setSales(response.data.sales || []);
      const selected = businesses.find(b => b.id === businessId) || business;
      if (selected) setBusiness(selected);
    } catch (err) { setErrorMessage(messageOf(err, 'Could not load this business workspace.')); }
    finally { setLoading(false); }
  }

  async function signIn() {
    setErrorMessage('');
    try { await auth.signInWithRedirect(); }
    catch (err) { setErrorMessage(messageOf(err, 'Sign-in could not start. Check browser storage and try again.')); }
  }
  async function signOut() {
    await auth.signOut();
    setUser(null); setBusiness(null); setBusinesses([]); setProducts([]); setSales([]);
  }
  function messageOf(err: unknown, fallback: string) {
    if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message;
    return fallback;
  }
  async function createBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!businessForm.name.trim()) return;
    setLoading(true); setErrorMessage('');
    try {
      const response = await api.post('/api/businesses', businessForm);
      const created = response.data.business as Business;
      setBusinesses([created, ...businesses]); setBusiness(created);
      setProducts([]); setSales([]); setShowBusinessForm(false);
      setNotice('Business account created');
    } catch (err) { setErrorMessage(messageOf(err, 'Could not create the business account.')); }
    finally { setLoading(false); }
  }
  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!business || !productForm.name.trim() || Number(productForm.price) <= 0 || Number(productForm.stock) < 0) return;
    setLoading(true); setErrorMessage('');
    try {
      const response = await api.post('/api/products', { businessId: business.id, ...productForm,
        stock: Number(productForm.stock), price: Number(productForm.price), cost: Number(productForm.cost) || 0,
        threshold: Number(productForm.threshold) || 5 });
      setProducts([response.data.product, ...products]);
      setProductForm({ name: '', sku: '', category: 'Groceries', stock: '0', price: '', cost: '', threshold: '5' });
      setShowProductForm(false); setNotice('Product saved to cloud inventory');
    } catch (err) { setErrorMessage(messageOf(err, 'Could not save this product.')); }
    finally { setLoading(false); }
  }
  async function recordSale(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;    const product = products.find(p => p.id === saleForm.productId);
    const quantity = Number(saleForm.quantity);
    if (!product || quantity < 1 || quantity > product.stock) { setErrorMessage('Enter a valid quantity available in stock.'); return; }
    setLoading(true); setErrorMessage('');
    try {
      const response = await api.post('/api/sales', { businessId: business.id, productId: product.id, quantity, payment: saleForm.payment });
      setProducts(products.map(p => p.id === product.id ? response.data.product : p));
      setSales([response.data.sale, ...sales]);
      setShowSaleForm(false); setNotice('Sale saved and stock updated');
    } catch (err) { setErrorMessage(messageOf(err, 'Could not complete this sale. Refresh and try again.')); }
    finally { setLoading(false); }
  }

  const lowStock = products.filter(p => p.stock <= p.threshold);
  const stockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const salesTotal = sales.reduce((sum, s) => sum + s.total, 0);
  const filtered = useMemo(() => products.filter(p => (p.name + p.sku + p.category).toLowerCase().includes(query.toLowerCase())), [products, query]);

  if (!authReady) return <div className="center-screen"><div className="brand-mark"><Boxes size={24}/></div><p>Securing your SmartStock session…</p></div>;
  if (!user) return <div className="auth-screen"><div className="auth-panel"><div className="brand-lockup"><div className="brand-mark"><Boxes size={24}/></div><div><b>SmartStock</b><span>BUSINESS MANAGER</span></div></div><div className="auth-art"><div className="auth-orbit orbit-one"/><div className="auth-orbit orbit-two"/><div className="auth-icon"><Store size={38}/></div></div><p className="eyebrow">INVENTORY THAT WORKS FOR YOU</p><h1>Run your store with confidence.</h1><p className="muted-copy">Manage products, monitor stock and record sales for your supermarket or provision store — securely from anywhere.</p><button className="primary full" onClick={signIn}>Sign in or create account <TrendingUp size={17}/></button><p className="fine-print">Secure sign-in powered by AppDeploy. Your business data is private to your account.</p>{errorMessage && <div className="alert error">{errorMessage}</div>}</div></div>;

  if (!business && showBusinessForm) return <div className="setup-screen"><div className="setup-card"><div className="brand-lockup"><div className="brand-mark"><Boxes size={24}/></div><b>SmartStock</b></div><span className="eyebrow">BUSINESS SETUP</span><h1>Set up your store</h1><p className="muted-copy">Create your business workspace. You can invite staff and manage subscriptions as your store grows.</p><form onSubmit={createBusiness}><label>Business name<input required value={businessForm.name} onChange={e => setBusinessForm({...businessForm, name:e.target.value})} placeholder="e.g. Ade Stores"/></label><label>Business type<select value={businessForm.type} onChange={e => setBusinessForm({...businessForm, type:e.target.value})}><option>Supermarket</option><option>Provision store</option><option>Mini mart</option><option>Retail shop</option></select></label><button className="primary full" disabled={loading}>{loading ? 'Creating workspace…' : 'Create business account'}</button></form>{errorMessage && <div className="alert error">{errorMessage}</div>}</div></div>;

  return <div className="app-shell">
    <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
      <div className="brand-lockup"><div className="brand-mark"><Boxes size={22}/></div><div><b>SmartStock</b><span>BUSINESS MANAGER</span></div><button className="icon-btn mobile-only" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="business-switch"><div className="business-avatar">{business?.name.slice(0,1).toUpperCase()}</div><div className="business-copy"><b>{business?.name}</b><span>{business?.type}</span></div><ChevronDown size={15}/></div>
      <p className="nav-label">WORKSPACE</p>
      {([{name:'Dashboard',icon:LayoutDashboard},{name:'Products',icon:Package},{name:'Inventory',icon:Boxes},{name:'Sales & POS',icon:ShoppingCart},{name:'Reports',icon:ClipboardList},{name:'Team & access',icon:Users},{name:'Subscription',icon:CreditCard},{name:'Settings',icon:Settings}] as const).map(item => <button key={item.name} className={'nav-item '+(page===item.name?'active':'')} onClick={() => {setPage(item.name);setMobileNav(false);}}><item.icon size={18}/>{item.name}{item.name==='Inventory' && lowStock.length>0 && <span className="nav-badge">{lowStock.length}</span>}</button>)}
      <div className="sidebar-bottom"><div className="plan-card"><div className="plan-line"><CreditCard size={15}/> SUBSCRIPTION</div><b>{business?.plan || 'Starter'} plan</b><span>{business?.subscriptionStatus || 'Trial setup'} · Billing ready</span><button onClick={() => setPage('Subscription')}>View plan <span>→</span></button></div><div className="user-row"><div className="user-avatar">{(user.name || user.email || 'U').slice(0,1).toUpperCase()}</div><div className="user-copy"><b>{user.name || 'Store owner'}</b><span>{user.email || 'Signed in'}</span></div><button className="icon-btn" onClick={signOut} title="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-content">
      <header className="topbar"><button className="icon-btn mobile-only" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div><span className="breadcrumb">SMARTSTOCK /</span> <b>{page}</b></div><div className="topbar-right"><span className="secure-pill"><span/> Cloud synced</span><div className="top-avatar">{(user.name || user.email || 'U').slice(0,1).toUpperCase()}</div></div></header>
      <div className="content">
        {errorMessage && <div className="alert error"><AlertTriangle size={16}/>{errorMessage}<button onClick={() => setErrorMessage('')}><X size={15}/></button></div>}
        {notice && <div className="alert success"><Check size={16}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
        {loading && <div className="sync-line"><span/> Syncing secure business data…</div>}
        {page==='Dashboard' && <><div className="page-heading"><div><span className="eyebrow">STORE OVERVIEW</span><h1>Good business starts here.</h1><p>Here’s what’s happening at {business?.name}.</p></div><button className="primary" onClick={() => setShowSaleForm(true)}><Plus size={17}/> Record a sale</button></div><div className="metric-grid"><Metric icon={CircleDollarSign} label="Sales recorded" value={money(salesTotal)} note="Saved transactions"/><Metric icon={Package} label="Products" value={products.length.toLocaleString()} note="In your catalogue"/><Metric icon={Boxes} label="Stock value" value={money(stockValue)} note="Based on cost price"/><Metric icon={AlertTriangle} label="Low stock items" value={lowStock.length.toString()} note="Need restocking" warning={lowStock.length>0}/></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Recent sales</h2><p>Latest transactions saved to your cloud workspace</p></div><button className="text-btn" onClick={() => setPage('Sales & POS')}>View all</button></div>{sales.length===0?<Empty text="No sales recorded yet. Record your first sale to see it here."/>:<div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Payment</th><th>Total</th></tr></thead><tbody>{sales.slice(0,6).map(s=><tr key={s.id}><td><b>{s.productName}</b><small>{new Date(s.createdAt).toLocaleString()}</small></td><td>{s.quantity}</td><td>{s.payment}</td><td className="amount">{money(s.total)}</td></tr>)}</tbody></table></div>}</section><section className="panel"><div className="panel-head"><div><h2>Restock reminders</h2><p>Products at or below their minimum level</p></div><span className="count-pill">{lowStock.length}</span></div>{lowStock.length===0?<Empty text="All products are above their restock levels."/>:lowStock.slice(0,6).map(p=><div className="stock-row" key={p.id}><div className="product-avatar"><Package size={17}/></div><div className="stock-copy"><b>{p.name}</b><span>{p.sku || 'No SKU'}</span></div><span className="low-pill">{p.stock} left</span></div>)}</section></div></>}
        {page==='Products' && <><div className="page-heading"><div><span className="eyebrow">CATALOGUE</span><h1>Products</h1><p>Manage the items your store sells.</p></div><button className="primary" onClick={() => setShowProductForm(true)}><Plus size={17}/> Add product</button></div><div className="panel"><div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, SKU or category"/></div><span className="muted-copy">{filtered.length} products</span></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Cost</th><th>Selling price</th><th>Status</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.sku}</small></td><td>{p.category}</td><td>{p.stock}</td><td>{money(p.cost)}</td><td className="amount">{money(p.price)}</td><td><span className={p.stock<=p.threshold?'low-pill':'ok-pill'}>{p.stock<=p.threshold?'Restock':'In stock'}</span></td></tr>)}</tbody></table>{filtered.length===0&&<Empty text="No matching products. Add your first product to begin."/ >}</div></div></>}
        {page==='Inventory' && <><div className="page-heading"><div><span className="eyebrow">STOCK CONTROL</span><h1>Inventory</h1><p>Keep an eye on stock levels and restock early.</p></div><button className="primary" onClick={()=>setShowProductForm(true)}><Plus size={17}/> Add stock item</button></div><div className="metric-grid compact"><Metric icon={Boxes} label="Total units" value={products.reduce((n,p)=>n+p.stock,0).toLocaleString()} note="Across all products"/><Metric icon={AlertTriangle} label="Need restocking" value={lowStock.length.toString()} note="At minimum level" warning={lowStock.length>0}/></div><div className="panel"><div className="panel-head"><div><h2>Stock levels</h2><p>Current quantities and reorder thresholds</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Available</th><th>Minimum level</th><th>Status</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.sku}</small></td><td>{p.stock}</td><td>{p.threshold}</td><td><span className={p.stock<=p.threshold?'low-pill':'ok-pill'}>{p.stock<=p.threshold?'Low stock':'Healthy'}</span></td></tr>)}</tbody></table></div></div></>}
        {page==='Sales & POS' && <><div className="page-heading"><div><span className="eyebrow">POINT OF SALE</span><h1>Sales</h1><p>Record transactions and automatically update inventory.</p></div><button className="primary" onClick={()=>setShowSaleForm(true)}><Plus size={17}/> Record sale</button></div><div className="panel"><div className="panel-head"><div><h2>Sales history</h2><p>{sales.length} transactions · {money(salesTotal)} recorded</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Quantity</th><th>Payment</th><th>Date</th><th>Total</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td><b>{s.productName}</b></td><td>{s.quantity}</td><td>{s.payment}</td><td>{new Date(s.createdAt).toLocaleString()}</td><td className="amount">{money(s.total)}</td></tr>)}</tbody></table>{sales.length===0&&<Empty text="Your completed sales will appear here."/ >}</div></div></>}
        {page==='Reports' && <><div className="page-heading"><div><span className="eyebrow">BUSINESS INSIGHTS</span><h1>Reports</h1><p>A simple view of recorded store activity.</p></div></div><div className="metric-grid"><Metric icon={CircleDollarSign} label="Recorded sales" value={money(salesTotal)} note="All loaded transactions"/><Metric icon={TrendingUp} label="Estimated gross profit" value={money(sales.reduce((n,s)=>n+s.profit,0))} note="Based on recorded cost prices"/><Metric icon={Boxes} label="Stock value" value={money(stockValue)} note="Current inventory cost"/></div></>}
        {page==='Team & access' && <><div className="page-heading"><div><span className="eyebrow">BUSINESS ACCESS</span><h1>Team & access</h1><p>Business ownership and role-based access foundations.</p></div></div><div className="panel info-panel"><Users size={25}/><h2>Business owner</h2><p>{user.email || user.name || 'Your signed-in account'} has owner access to {business?.name}. Staff invitations and role management can be enabled next without changing the business data model.</p><span className="ok-pill">Owner role active</span></div></>}
        {page==='Subscription' && <><div className="page-heading"><div><span className="eyebrow">BILLING</span><h1>Subscription</h1><p>Choose a SmartStock plan that fits the size of your retail business.</p></div></div><div className="panel plan-highlight"><span className="eyebrow">YOUR CURRENT ACCOUNT</span><h2>{business?.plan || 'Starter'} plan</h2><p>{business?.subscriptionStatus || 'Trial setup'} · Payment setup pending</p><span className="ok-pill">Account active · Billing not connected</span></div><div className="pricing-grid"><div className="panel pricing-card"><span className="eyebrow">FOR SMALL SHOPS</span><h2>Starter</h2><div className="price">₦5,000 <small>/ month</small></div><p className="muted-copy">₦50,000 when billed annually</p><div className="plan-feature"><Check size={16}/> Product catalogue</div><div className="plan-feature"><Check size={16}/> Inventory and stock tracking</div><div className="plan-feature"><Check size={16}/> Sales recording</div><div className="plan-feature"><Check size={16}/> Business dashboard</div><span className="coming-soon">Payment activation pending</span></div><div className="panel pricing-card recommended-plan"><span className="eyebrow">FOR GROWING RETAILERS</span><h2>Business</h2><div className="price">₦10,000 <small>/ month</small></div><p className="muted-copy">₦100,000 when billed annually</p><div className="plan-feature"><Check size={16}/> Core Starter features</div><div className="plan-feature"><Check size={16}/> Sales and stock reports</div><div className="plan-feature"><Check size={16}/> Low-stock monitoring</div><div className="plan-feature"><Check size={16}/> Business workspace access</div><span className="coming-soon">Payment activation pending</span></div><div className="panel pricing-card"><span className="eyebrow">FOR LARGER STORES</span><h2>Premium</h2><div className="price">₦20,000 <small>/ month</small></div><p className="muted-copy">₦200,000 when billed annually</p><div className="plan-feature"><Check size={16}/> Core Business features</div><div className="plan-feature"><Check size={16}/> Larger retail operation support</div><div className="plan-feature"><Check size={16}/> Priority support (planned)</div><div className="plan-feature"><Check size={16}/> Advanced features as released</div><span className="coming-soon">Payment activation pending</span></div></div><div className="panel billing-notice"><h2>Payments are not active yet</h2><p className="muted-copy">These are the approved subscription prices. SmartStock is not collecting payments or renewing subscriptions automatically yet. We will enable checkout after Paystack is connected and test payments are verified. No customer will be charged from this page today.</p></div></>}
        {page==='Settings' && <><div className="page-heading"><div><span className="eyebrow">PREFERENCES</span><h1>Business settings</h1><p>Account and workspace information.</p></div></div><div className="panel settings-list"><div><span>Business name</span><b>{business?.name}</b></div><div><span>Business type</span><b>{business?.type}</b></div><div><span>Currency</span><b>Nigerian Naira (NGN)</b></div><div><span>Signed-in owner</span><b>{user.email || user.name}</b></div><div><span>Data storage</span><b>Encrypted cloud-backed app database</b></div></div></>}
      </div>
    </main>
    {showProductForm && <Modal title="Add a product" onClose={()=>setShowProductForm(false)}><form onSubmit={addProduct} className="form-grid"><label className="wide">Product name<input required value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="e.g. Golden Penny Spaghetti"/></label><label>SKU / barcode<input value={productForm.sku} onChange={e=>setProductForm({...productForm,sku:e.target.value})} placeholder="Optional"/></label><label>Category<select value={productForm.category} onChange={e=>setProductForm({...productForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Opening stock<input required type="number" min="0" value={productForm.stock} onChange={e=>setProductForm({...productForm,stock:e.target.value})}/></label><label>Minimum stock<input type="number" min="0" value={productForm.threshold} onChange={e=>setProductForm({...productForm,threshold:e.target.value})}/></label><label>Cost price (₦)<input type="number" min="0" value={productForm.cost} onChange={e=>setProductForm({...productForm,cost:e.target.value})}/></label><label>Selling price (₦)<input required type="number" min="1" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})}/></label><button className="primary wide" disabled={loading}>{loading?'Saving…':'Save product to cloud'}</button></form></Modal>}
    {showSaleForm && <Modal title="Record a sale" onClose={()=>setShowSaleForm(false)}><form onSubmit={recordSale} className="form-grid"><label className="wide">Product<select required value={saleForm.productId} onChange={e=>setSaleForm({...saleForm,productId:e.target.value})}><option value="">Select product</option>{products.filter(p=>p.stock>0).map(p=><option key={p.id} value={p.id}>{p.name} · {p.stock} available · {money(p.price)}</option>)}</select></label><label>Quantity<input required type="number" min="1" value={saleForm.quantity} onChange={e=>setSaleForm({...saleForm,quantity:e.target.value})}/></label><label>Payment method<select value={saleForm.payment} onChange={e=>setSaleForm({...saleForm,payment:e.target.value})}><option>Cash</option><option>POS</option><option>Transfer</option></select></label><button className="primary wide" disabled={loading || products.every(p=>p.stock===0)}>{loading?'Saving…':'Complete sale'}</button></form></Modal>}
  </div>;
}

function Metric({icon:Icon,label,value,note,warning=false}:any){return <div className="metric-card"><div className="metric-icon"><Icon size={18}/></div><span>{label}</span><strong>{value}</strong><small className={warning?'warning-text':''}>{note}</small></div>}
function Empty({text}:{text:string}){return <div className="empty-state"><Package size={23}/><p>{text}</p></div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>}
export default App;
