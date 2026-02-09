# Supplier Portal – Demo Credentials & Seed

## Running the supplier seed

From the project root (with `DATABASE_URL` set, e.g. in `.env`):

```bash
npm run db:seed-supplier
```

Or directly:

```bash
npx tsx prisma/seed-supplier.ts
```

**Prerequisites:** Restaurants must already exist (run main seed first: `npm run db:seed` if needed).

The script is **re-runnable**: it upserts suppliers and users, and skips creating duplicate products/prices/links.

---

## Demo login (Supplier Portal)

Log in at: **`/supplier/login`**

| Supplier | Email | Password |
|----------|--------|----------|
| Baghdad Fresh Produce | `supplier1@demo.iq` | `password123` |
| Iraqi Dry Goods Co | `supplier2@demo.iq` | `password123` |
| Northern Dairy & Beverages | `supplier3@demo.iq` | `password123` |

After login you can:

- **Dashboard** – overview, quick actions
- **My Products** – catalog with prices (versioned; add/edit products)
- **Stock requests** – view and manage requests from restaurants
- **Restaurants** – list of restaurants using your products
- **Analytics** – recipe-based usage (menu items using your ingredients)
- **Map** – restaurants using your products (if they have lat/lng)

---

## What the seed creates

- **3 suppliers** (APPROVED) with name, email, phone, address, lat/lng, `deliveryAreas`
- **1 supplier user per supplier** (same email as supplier; password above)
- **15 supplier products** spread across the 3 suppliers, linked to **global ingredients** (Rice, Chicken, Tomato, etc.); each product has `packSize`, `packUnit`, `brand`, `sku`, `isActive`
- **2 price rows per product**: one past (with `effectiveTo` set), one current (active); mix of **IQD** and **USD**; some products have **minOrderQty**
- **Restaurant–supplier links** so every existing restaurant is linked to every supplier (for “Restaurants using your products” and map)

Global ingredients are created by name if they don’t exist, so the seed works even on a fresh DB after the main seed.
