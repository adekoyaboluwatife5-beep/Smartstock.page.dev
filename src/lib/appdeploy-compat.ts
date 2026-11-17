import { supabase } from './supabase';

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the app environment.');
  return supabase;
};
type Row = Record<string, any>;
const mapBusiness = (b: Row, role = 'owner') => ({ id:b.id, name:b.name, type:b.type, currency:b.currency, role, plan:b.plan, subscriptionStatus:b.subscription_status });
const mapProduct = (p: Row) => ({ id:p.id, name:p.name, sku:p.sku, category:p.category, stock:p.stock, price:Number(p.price), cost:Number(p.cost), threshold:p.threshold });
const mapSale = (s: Row) => ({ id:s.id, productId:s.product_id, productName:s.product_name, quantity:s.quantity, total:Number(s.total), profit:Number(s.profit), createdAt:s.created_at, payment:s.payment });

export const auth = {
  async getUser() {
    const {data,error}=await client().auth.getUser();
    if(error && !error.message.includes('Auth session missing')) throw error;
    const u=data.user;
    return u ? {userId:u.id,email:u.email,name:u.user_metadata?.full_name || u.user_metadata?.name || [u.user_metadata?.first_name,u.user_metadata?.last_name].filter(Boolean).join(' ')} : null;
  },
  async signUp(email: string, password: string, metadata: Row) {
    const {data,error}=await client().auth.signUp({email,password,options:{emailRedirectTo:window.location.origin,data:metadata}});
    if(error) throw error;
    return data;
  },
  async signInWithPassword(email: string, password: string) {
    const {error}=await client().auth.signInWithPassword({email,password});
    if(error) throw error;
  },
  async signOut() { const {error}=await client().auth.signOut(); if(error) throw error; }
};

export const api = {
  async get(path: string) {
    const db=client();
    if(path==='/api/workspace') {
      const {data:memberships,error:me}=await db.from('memberships').select('business_id,role');
      if(me) throw me;
      const ids=(memberships||[]).map((m:Row)=>m.business_id);
      if(!ids.length) return {data:{businesses:[]}};
      const {data,error}=await db.from('businesses').select('id,name,type,currency,plan,subscription_status').in('id',ids);
      if(error) throw error;
      const roles=new Map((memberships||[]).map((m:Row)=>[m.business_id,m.role]));
      return {data:{businesses:(data||[]).map((b:Row)=>mapBusiness(b,String(roles.get(b.id)||'staff')))}};
    }
    if(path.startsWith('/api/business-data')) {
      const id=new URLSearchParams(path.split('?')[1]||'').get('businessId');
      if(!id) throw new Error('A business account is required.');
      const [p,s]=await Promise.all([
        db.from('products').select('*').eq('business_id',id).order('created_at',{ascending:false}),
        db.from('sales').select('*').eq('business_id',id).order('created_at',{ascending:false})
      ]);
      if(p.error) throw p.error; if(s.error) throw s.error;
      return {data:{products:(p.data||[]).map(mapProduct),sales:(s.data||[]).map(mapSale)}};
    }
    throw new Error('Unknown SmartStock data request.');
  },
  async post(path: string, body: Row) {
    const db=client();
    if(path==='/api/businesses') {
      const {data:ud,error:ue}=await db.auth.getUser(); if(ue) throw ue;
      if(!ud.user) throw new Error('Please sign in again.');
      const {data:b,error}=await db.from('businesses').insert({name:String(body.name||'').trim(),type:body.type||'Supermarket',owner_id:ud.user.id}).select('id').single();
      if(error) throw error;
      const {error:me}=await db.from('memberships').insert({business_id:b.id,user_id:ud.user.id,role:'owner'});
      if(me) throw me;
      const {data:created,error:se}=await db.from('businesses').select('id,name,type,currency,plan,subscription_status').eq('id',b.id).single();
      if(se) throw se;
      return {data:{business:mapBusiness(created,'owner')}};
    }
    if(path==='/api/products') {
      const {data,error}=await db.from('products').insert({business_id:body.businessId,name:body.name,sku:body.sku||'',category:body.category||'Other',stock:body.stock,price:body.price,cost:body.cost||0,threshold:body.threshold??5}).select().single();
      if(error) throw error; return {data:{product:mapProduct(data)}};
    }
    if(path==='/api/sales') {
      const {data,error}=await db.rpc('record_sale',{p_business_id:body.businessId,p_product_id:body.productId,p_quantity:body.quantity,p_payment:body.payment||'Cash'});
      if(error) throw error; return {data:{product:mapProduct(data.product),sale:mapSale(data.sale)}};
    }
    throw new Error('Unknown SmartStock data request.');
  }
};
