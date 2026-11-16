import { router, json, error, requireAuth, db } from '@appdeploy/sdk';

type ProductInput = { name: string; sku?: string; category?: string; stock: number; price: number; cost?: number; threshold?: number };
type Product = { id: string; name: string; sku: string; category: string; stock: number; price: number; cost: number; threshold: number };
type Membership = { id: string; businessId: string; role: string; userId: string };
type BusinessRecord = { id: string; name: string; type: string; currency: string; ownerId: string; plan: string; subscriptionStatus: string; createdAt: string };

function safeKey(value: string) { return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80); }
function membershipsTable(userId: string) { return 'memberships_' + safeKey(userId); }
function membersTable(businessId: string) { return 'members_' + safeKey(businessId); }
function productsTable(businessId: string) { return 'products_' + safeKey(businessId); }
function salesTable(businessId: string) { return 'sales_' + safeKey(businessId); }
async function membership(userId: string, businessId: string) {
  const [row] = await db.get<Membership>(membershipsTable(userId), [businessId]);
  return row;
}
async function requireMember(userId: string, businessId: string) {
  if (!businessId || businessId.length > 120) throw new Error('A valid business account is required');
  const row = await membership(userId, businessId);
  if (!row || row.businessId !== businessId || row.userId !== userId) throw new Error('You do not have access to this business');
  return row;
}
function asError(err: unknown) { return err instanceof Error ? err.message : 'Request could not be completed'; }

export const handler = router({
  'GET /api/workspace': [requireAuth(), async (ctx) => {
    try {
      const page = await db.list<Membership>(membershipsTable(ctx.user!.userId), { limit: 50 });
      const ids = page.items.map(m => m.businessId).filter(Boolean);
      const records = ids.length ? await db.get<BusinessRecord>('businesses', ids) : [];
      const businesses = records.filter((b): b is BusinessRecord => !!b).map(b => ({
        id: b.id, name: b.name, type: b.type, currency: b.currency, plan: b.plan,
        subscriptionStatus: b.subscriptionStatus,
        role: page.items.find(m => m.businessId === b.id)?.role || 'staff'
      }));
      return json({ businesses });
    } catch (err) { console.error('workspace_load_failed', err); return error(asError(err), 500); }
  }],
  'POST /api/businesses': [requireAuth(), async (ctx) => {
    try {
      const body = (ctx.body || {}) as { name?: string; type?: string };
      const name = String(body.name || '').trim();
      const type = String(body.type || 'Supermarket').trim();
      if (!name || name.length > 100) return error('Enter a business name of 1 to 100 characters', 400);
      const userId = ctx.user!.userId;
      const businessId = 'biz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      const record: BusinessRecord = { id: businessId, name, type, currency: 'NGN', ownerId: userId, plan: 'Starter', subscriptionStatus: 'setup', createdAt: new Date().toISOString() };
      const [savedBusiness] = await db.tx.add('businesses', [record]);
      if (!savedBusiness) return error('Could not create the business account', 500);
      const [savedMembership] = await db.tx.add(membershipsTable(userId), [{ id: businessId, businessId, userId, role: 'owner', createdAt: record.createdAt }]);
      if (!savedMembership) { console.error('business_membership_create_failed', businessId); return error('Business was created but owner access could not be initialized. Contact support.', 500); }
      const [savedMember] = await db.tx.add(membersTable(businessId), [{ id: userId, userId, role: 'owner', createdAt: record.createdAt }]);
      if (!savedMember) console.error('business_member_index_create_failed', businessId);
      return json({ business: { ...record, role: 'owner' } }, 201);
    } catch (err) { console.error('business_create_failed', err); return error(asError(err), 500); }
  }],
  'GET /api/business-data': [requireAuth(), async (ctx) => {
    try {
      const businessId = ctx.query.businessId || '';
      await requireMember(ctx.user!.userId, businessId);
      const [productPage, salesPage] = await Promise.all([
        db.list(productsTable(businessId), { limit: 100 }),
        db.list(salesTable(businessId), { limit: 100 })
      ]);
      return json({ products: productPage.items, sales: salesPage.items });
    } catch (err) { console.error('business_data_load_failed', err); return error(asError(err), 403); }
  }],
  'POST /api/products': [requireAuth(), async (ctx) => {
    try {
      const body = (ctx.body || {}) as ProductInput & { businessId?: string };
      const businessId = String(body.businessId || '');
      await requireMember(ctx.user!.userId, businessId);
      const name = String(body.name || '').trim();
      const price = Number(body.price), stock = Number(body.stock), cost = Number(body.cost || 0), threshold = Number(body.threshold || 5);
      if (!name || name.length > 160 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0 || !Number.isFinite(cost) || cost < 0 || !Number.isInteger(threshold) || threshold < 0) return error('Check product name, price, stock and minimum level', 400);
      const [id] = await db.add(productsTable(businessId), [{ name, sku: String(body.sku || '').trim().slice(0, 80), category: String(body.category || 'Other').slice(0, 50), stock, price, cost, threshold, createdAt: new Date().toISOString() }]);
      if (!id) return error('Product could not be saved', 500);
      const [product] = await db.get(productsTable(businessId), [id]);
      return json({ product: { ...product, id } }, 201);
    } catch (err) { console.error('product_create_failed', err); return error(asError(err), 500); }
  }],
  'POST /api/sales': [requireAuth(), async (ctx) => {
    try {
      const body = (ctx.body || {}) as { businessId?: string; productId?: string; quantity?: number; payment?: string };
      const businessId = String(body.businessId || '');
      await requireMember(ctx.user!.userId, businessId);
      const productId = String(body.productId || '');
      const quantity = Number(body.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1) return error('Enter a valid product and quantity', 400);
      const [product] = await db.get<Product>(productsTable(businessId), [productId], { consistent: true });
      if (!product) return error('Product not found', 404);
      if (quantity > product.stock) return error('Not enough stock available', 409);
      const updatedProduct = { ...product, stock: product.stock - quantity };
      const sale = { productId, productName: product.name, quantity, total: product.price * quantity, profit: (product.price - product.cost) * quantity, payment: ['Cash', 'POS', 'Transfer'].includes(String(body.payment)) ? String(body.payment) : 'Cash', createdAt: new Date().toISOString() };
      const [updated] = await db.update(productsTable(businessId), [{ id: productId, record: updatedProduct }]);
      if (!updated) return error('Stock changed before this sale could be saved. Refresh and retry.', 409);
      const [saleId] = await db.add(salesTable(businessId), [sale]);
      if (!saleId) {
        const [current] = await db.get<Product>(productsTable(businessId), [productId], { consistent: true });
        if (current) await db.update(productsTable(businessId), [{ id: productId, record: { ...current, stock: current.stock + quantity } }]);
        return error('Sale was not saved. Inventory was restored; please retry.', 500);
      }
      return json({ product: { ...updatedProduct, id: productId }, sale: { ...sale, id: saleId } }, 201);
    } catch (err) { console.error('sale_create_failed', err); return error(asError(err), 500); }
  }]
});
