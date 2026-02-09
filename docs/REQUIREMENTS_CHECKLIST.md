# Requirements Checklist (Aliya Babul)

Map of each requested feature to the codebase and implementation status.

---

## 4) Supplier data entry & restaurant recipe/cost linkage

### 4.1 Restaurant selects preferred supplier price for each ingredient

| Requirement | Status | Where |
|-------------|--------|--------|
| **Recipe line: ingredient + quantity + unit** | ✅ Done | `MenuItemIngredient`: `ingredientId`, `quantity`, `unit` in `prisma/schema.prisma`. Recipe form in `src/app/(dashboard)/menu/MenuForm.tsx` (ingredient + quantity; unit in payload). |
| **Supplier selection (dropdown) per line** | ❌ **Not implemented** | No UI in `MenuForm.tsx` to pick a supplier product per recipe line. API and DB support it: `supplierProductId` on `MenuItemIngredient` and in menu API payload. |
| **Unit cost from supplier (pack price / pack size)** | ⚠️ Partial | DB: `unitCostCached`, `currency`, `lastPricedAt` on `MenuItemIngredient`. API accepts them. **No UI** to show or compute unit cost from supplier product. |
| **DB: recipe_lines equivalent** | ✅ Done | `MenuItemIngredient`: `menu_item_id`, `ingredient_id`, `qty` (quantity), `unit`, `supplier_product_id` (nullable), `unit_cost_cached`, `currency`, `last_priced_at`. |
| **Cache unit_cost for audit; allow refresh** | ⚠️ Partial | Stored in DB and sent from form. **No “Refresh cost” button** in menu form to recompute from current supplier price. |
| **Acceptance: Changing supplier price does not rewrite historical COGS; “refresh cost” applies latest** | ⚠️ Partial | Versioned `SupplierPrice` (new row per change) keeps history. Refresh-cost flow not implemented in restaurant UI. |

**To complete 4.1:** Add in the menu recipe UI (e.g. in `MenuForm.tsx` Recipe tab):

- Per recipe line: **supplier dropdown** (list supplier products, e.g. filtered by ingredient or name).
- Show **unit cost** (from `unitCostCached` or from selected product’s active price / pack size).
- **“Refresh cost”** button per line (or per recipe) that: gets current active price for selected `supplier_product_id`, computes unit cost, updates `unitCostCached` / `currency` / `lastPricedAt` and saves).

---

## 5) Save / draft behavior (prevent data loss; partial saves)

### 5.1 Draft menu items

| Requirement | Status | Where |
|-------------|--------|--------|
| **Save with “basic info” only** | ✅ Done | Menu API allows save without recipe; validation no longer blocks on empty/incomplete recipe. `src/app/api/menu/route.ts`, `src/app/api/menu/[id]/route.ts`. |
| **menu_item_status: draft / active** | ✅ Done | `MenuItem.status` enum `DRAFT` \| `ACTIVE` in schema. Set on create/update. Form: “Publish (set active)” checkbox and `menuItemStatus` state in `MenuForm.tsx`. |
| **costing_status: incomplete / complete** | ✅ Done | `MenuItem.costingStatus` enum `INCOMPLETE` \| `COMPLETE`. API sets from recipe (complete when has lines with `unitCostCached`). |
| **No blocking save when recipe incomplete** | ✅ Done | `MenuForm.tsx` `handleSubmit`: only category required; recipe optional. Valid recipe lines sent when present. |
| **UI: clear badges and progress** | ✅ Done | `MenuForm.tsx`: badges “Draft/Active” and “Costing: Incomplete/Complete”; “Publish (set active)” checkbox. |

---

## 1) Supplier Portal

### 1.1 Supplier authentication + onboarding

| Requirement | Status | Where |
|-------------|--------|--------|
| **Supplier login (email + password)** | ✅ Done | `src/lib/auth.ts`: provider `supplier-credentials`; `src/app/supplier/login/page.tsx`. |
| **Supplier signup OR admin-created accounts** | ⚠️ Admin/seed only | No self-service signup UI. Accounts created via seed (`prisma/seed.ts`) or DB. Can add signup or admin UI later. |
| **Supplier profile: name, contact, location (address + lat/lng)** | ✅ Done (DB) | `Supplier`: name, email, phone, address, lat, lng. No dedicated “profile” edit page yet; can be added. |
| **DB: suppliers, supplier_users** | ✅ Done | `prisma/schema.prisma`: `Supplier`, `SupplierUser` (password_hash, last_login_at, etc.). |
| **Account status: pending/approved/suspended** | ✅ Done | `Supplier.status` enum `PENDING` \| `APPROVED` \| `SUSPENDED`. Auth rejects if suspended. |
| **Supplier sees only supplier dashboard after login** | ✅ Done | Dashboard layout redirects `type === 'supplier'` to `/supplier`. Supplier layout under `src/app/supplier/(portal)/`. |

### 1.2 Supplier ingredient catalog (CRUD)

| Requirement | Status | Where |
|-------------|--------|--------|
| **“My Products” table view** | ✅ Done | `src/app/supplier/(portal)/products/page.tsx`. |
| **Ingredient name, category, unit, pack size, brand, SKU, availability** | ✅ Done | `SupplierProduct`: name, category, packSize, packUnit, brand, sku, isActive. Form in products page (add/edit modal). |
| **Add/Edit product modal** | ✅ Done | Same page: modal for create/edit, delete, set price. |
| **Global dictionary OR supplier-specific** | ✅ Done | `GlobalIngredient` (optional link); `SupplierProduct` has own name/category so supplier can add without global record. |
| **DB: ingredients (global), supplier_products** | ✅ Done | `GlobalIngredient`; `SupplierProduct` (supplier_id, global_ingredient_id optional, pack_size, pack_unit, brand, sku, is_active). |
| **Deactivate product; restaurants keep historical costs** | ✅ Done | `isActive` on product; recipe lines keep `supplierProductId` and cached cost; product can be set inactive. |

### 1.3 Supplier pricing management (versioned prices)

| Requirement | Status | Where |
|-------------|--------|--------|
| **Price per pack, currency, effective date (start); optional end date** | ✅ Done | `SupplierPrice`: price, currency, effective_from, effective_to (null = current). |
| **New price = new row (do not overwrite)** | ✅ Done | `POST /api/supplier/products/[id]/prices`: creates new row; optionally ends previous active price. |
| **Show price history** | ⚠️ API only | GET prices returns history. Products table shows “current” price only; no dedicated price-history UI on product. |
| **One active price per product (effective_from ≤ today, effective_to null)** | ✅ Done | Logic in price API; products list uses current active price. |
| **DB: supplier_prices** | ✅ Done | Schema and API. |

### 1.4 Restaurants using my products

| Requirement | Status | Where |
|-------------|--------|--------|
| **Definition: using = selected in recipe OR order** | ✅ Done (recipe) | Recipe: `MenuItemIngredient.supplierProductId`. Order-based not implemented (no supplier orders yet). |
| **Table: Restaurant name, City/area, # menu items impacted, Usage, Last order, Status** | ✅ Done (recipe columns) | `src/app/supplier/(portal)/restaurants/page.tsx` + `GET /api/supplier/restaurants`: restaurantName, city/address, menuItemsImpacted, status. “Last order” and order-based usage when ordering exists. |
| **DB: restaurant_supplier_links (optional)** | ✅ Done | `RestaurantSupplierLink` in schema. Currently derived from recipe usage in API; can be materialized for performance. |
| **Click restaurant for usage details (no sales totals)** | ❌ **Not implemented** | No detail panel/page yet; only table row. |

### 1.5 Analytics (recipe-based now; order-based when ordering exists)

| Requirement | Status | Where |
|-------------|--------|--------|
| **Metric A: # menu items using your ingredients, # restaurants** | ✅ Done | `GET /api/supplier/analytics`: `menuItemsUsingYourIngredients`, `restaurantsUsingYourIngredients`. Fixed: no longer uses invalid `count`+`distinct`. |
| **Top ingredients by recipe usage** | ✅ Done | Same API: `topIngredientsByRecipeUsage`. Supplier analytics page displays them. |
| **Filters: date range, restaurant** | ❌ **Not implemented** | Analytics is current snapshot only; no date or restaurant filters. |
| **Charts / orders over time (when ordering exists)** | ⏳ Placeholder | Recipe-based metrics only; order-based metrics when ordering module exists. |

### 1.6 Map of restaurants

| Requirement | Status | Where |
|-------------|--------|--------|
| **Map view (Google Maps / Mapbox)** | ❌ **Not implemented** | `src/app/supplier/(portal)/map/page.tsx` is a **placeholder** (text list of restaurants with/without coords). No map component. |
| **Pins: restaurant name, # products, last seen, last order** | ⏳ Data ready | API returns lat/lng and menuItemsImpacted; pin tooltip and detail panel not built. |
| **Restaurants: lat, lng, city** | ✅ Done | `Restaurant` has city, lat, lng. Geocode-on-save not implemented. |

### 1.7 Stock requests (restaurant → supplier)

| Requirement | Status | Where |
|-------------|--------|--------|
| **Inventory page: Supplier column** | ✅ Done | `src/app/(dashboard)/inventory/page.tsx` + `InventoryTable.tsx`: column shows preferred supplier or text supplier. |
| **Inventory page: Request stock / Request more button** | ✅ Done | `InventoryTable.tsx`: "Request more" button per row; opens modal when preferred supplier set. |
| **API: restaurant create/list stock requests** | ✅ Done | `GET/POST /api/stock-requests`, `GET /api/supplier-products?supplierId=…`. |
| **Supplier portal: Stock requests page** | ✅ Done | `src/app/supplier/(portal)/stock-requests/page.tsx`. |
| **Supplier portal: Dashboard section** | ✅ Done | `src/app/supplier/(portal)/page.tsx`: Pending requests card + Stock requests link. |
| **API: supplier list/update stock requests** | ✅ Done | `GET /api/supplier/stock-requests`, `PATCH /api/supplier/stock-requests/[id]`. |
| **Seed: restaurant lat/lng, link recipe lines, create requests** | ✅ Done | `prisma/seed.ts`: restaurant lat/lng; preferredSupplierId; MenuItemIngredient→supplier products; 2 StockRequests. |

---

## Summary: what’s missing or partial

1. **Restaurant menu (recipe) UI for costing (4.1)**  
   - Supplier dropdown per recipe line.  
   - Show unit cost (from supplier product).  
   - “Refresh cost” button and API/flow to update `unit_cost_cached` from current supplier price.

2. **Supplier portal**  
   - Price history UI on product (optional).  
   - Restaurant usage detail panel (click row) (optional).  
   - Analytics: date range and restaurant filters (optional).  
   - Map: integrate Google Maps/Mapbox and pins (placeholder only).  
   - Supplier profile edit page (optional).  
   - Supplier signup flow or admin UI to create supplier accounts (optional).

3. **Analytics API**  
   - Fixed: supplier analytics no longer uses unsupported `distinct` on `count()`; uses `findMany` + unique count in code.

---

## File reference

| Area | Main files |
|------|------------|
| Supplier auth | `src/lib/auth.ts`, `src/app/supplier/login/page.tsx`, `src/types/next-auth.d.ts` |
| Supplier portal layout | `src/app/supplier/layout.tsx`, `src/app/supplier/(portal)/layout.tsx`, `SupplierSidebar` |
| My Products | `src/app/supplier/(portal)/products/page.tsx`, `src/app/api/supplier/products/`, `.../products/[id]/prices/` |
| Restaurants using | `src/app/supplier/(portal)/restaurants/page.tsx`, `src/app/api/supplier/restaurants/route.ts` |
| Analytics | `src/app/supplier/(portal)/analytics/page.tsx`, `src/app/api/supplier/analytics/route.ts` |
| Map | `src/app/supplier/(portal)/map/page.tsx` (placeholder) |
| Stock requests (restaurant) | `src/app/(dashboard)/inventory/page.tsx`, `InventoryTable.tsx`, `GET/POST /api/stock-requests`, `GET /api/supplier-products` |
| Stock requests (supplier) | `src/app/supplier/(portal)/stock-requests/page.tsx`, `src/app/supplier/(portal)/page.tsx`, `GET/PATCH /api/supplier/stock-requests` |
| Menu draft/costing | `src/app/(dashboard)/menu/MenuForm.tsx`, `src/app/api/menu/route.ts`, `src/app/api/menu/[id]/route.ts` |
| Schema | `prisma/schema.prisma` (Supplier, SupplierUser, SupplierProduct, SupplierPrice, RestaurantSupplierLink, StockRequest, StockRequestLine, Ingredient.preferredSupplierId, MenuItemIngredient.supplierProductId/unitCostCached/…) |
