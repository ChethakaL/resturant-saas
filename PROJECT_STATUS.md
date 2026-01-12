# Restaurant SaaS MVP - Project Status

## ✅ COMPLETED

### 1. Project Foundation
- ✅ **Next.js 14** project initialized with TypeScript
- ✅ **Tailwind CSS** configured with shadcn/ui components
- ✅ **PostgreSQL** database configured at remote server
- ✅ **Prisma ORM** schema designed and pushed to database

### 2. Database Schema (COMPLETE)
✅ **Multi-tenant ready architecture** with the following models:
- `Restaurant` - Restaurant profile and settings
- `User` - Authentication with roles (OWNER, MANAGER, STAFF)
- `Ingredient` - Inventory items with stock tracking
- `Category` - Menu organization
- `MenuItem` - Menu items with pricing
- `MenuItemIngredient` - Recipe management (links ingredients to menu items)
- `Sale` - Order tracking
- `SaleItem` - Individual items in orders
- `StockAdjustment` - Inventory movement history
- `AIInsight` - AI-generated predictions and alerts
- `DailySummary` - Pre-calculated analytics for performance

### 3. Formula Documentation (COMPLETE)
✅ **FORMULAS.txt** - Comprehensive documentation of ALL calculations:
- Inventory management formulas
- Menu item costing (recipe-based)
- Profit margin calculations
- Sales analytics (revenue, COGS, profit)
- Dashboard KPI formulas (today, MTD, YTD with growth %)
- Inventory deduction logic
- Time-based analytics (hourly, daily, weekly)
- Menu item performance tracking
- Category analytics
- AI forecasting formulas
- Financial ratios (Food Cost %, Gross Margin, etc.)
- Comparison calculations (period-over-period)

Every formula is documented with:
- Clear formula definition
- Real-world examples with Iraqi Dinar (IQD)
- SQL implementation snippets
- Validation rules

### 4. Seed Data (IN PROGRESS - Running)
✅ **Comprehensive seed script** created with:
- Al-Rafidain Restaurant (demo restaurant)
- 3 users (owner, manager, staff) - password: `password123`
- 42 authentic Iraqi/Middle Eastern ingredients
- 7 menu categories
- 25 menu items with Unsplash images
- Full recipe definitions (ingredient quantities for each menu item)
- 90 days of realistic sales history (~3,500 orders)
- Peak hour patterns (lunch 12-2pm, dinner 7-9pm)
- 5 AI insights

**Login credentials:**
- owner@alrafidain.iq / password123
- manager@alrafidain.iq / password123
- staff@alrafidain.iq / password123

### 5. Core Management Features (COMPLETE)
- ✅ **Inventory management** (list, create, edit) with CRUD API routes
- ✅ **Menu management** (list, create, edit) with recipe builder + CRUD API routes
- ✅ **Orders system** (new order, list, details) with inventory deduction and cancel/restore logic
- ✅ **Analytics dashboard** (30-day trends, category revenue, top items)
- ✅ **shadcn/ui components** for Select + Textarea

---

## 🚧 TODO - Implementation Roadmap

### Phase 1: Authentication & Layout (Priority: CRITICAL)
**Estimated: 2-3 hours**

1. **NextAuth Setup**
   - Create `/src/app/api/auth/[...nextauth]/route.ts`
   - Configure credentials provider with bcrypt
   - Add session handling

2. **Layout Components**
   - Create dashboard layout with sidebar
   - Navigation menu with icons (Dashboard, Inventory, Menu, Orders, Analytics, Settings)
   - Header with user info and logout
   - Responsive design (mobile-friendly sidebar)

3. **Login Page**
   - `/src/app/login/page.tsx`
   - Form with email/password
   - Error handling
   - Redirect to dashboard after login

**Files to create:**
```
src/
├── app/
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── page.tsx (dashboard home)
│   └── layout.tsx (root layout)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── DashboardLayout.tsx
│   └── auth/
│       └── LoginForm.tsx
└── lib/
    ├── auth.ts
    └── prisma.ts
```

### Phase 2: Dashboard (Priority: HIGH)
**Estimated: 4-5 hours**

Create `/src/app/(dashboard)/page.tsx` with:

1. **KPI Cards Row** (Top of page)
   - Today's Revenue (with YTD comparison %)
   - Gross Margin %
   - Orders Today
   - Low Stock Alerts (count with badge)

2. **Charts Section**
   - Revenue Trend (last 30 days) - Line chart using Recharts
   - Sales by Hour (today) - Bar chart
   - Top 5 Menu Items table - sortable by revenue/profit

3. **Menu Item Performance Cards**
   - Rising Stars (growth > 30%)
   - Cash Cows (high revenue + high margin)
   - Declining Items (growth < -20%)
   - With pagination (4 items per section)

**Required API routes:**
```
src/app/api/
├── dashboard/
│   ├── kpis/route.ts
│   ├── revenue-trend/route.ts
│   ├── sales-by-hour/route.ts
│   └── top-items/route.ts
```

**Reference FORMULAS.txt** for all calculations!

### Phase 3: Inventory Management (Priority: CRITICAL)
**Status: PARTIAL - Core CRUD complete**

✅ **Completed**
- List page `/src/app/(dashboard)/inventory/page.tsx` with stock status + totals
- Create/Edit forms with validation
- CRUD API routes (`/src/app/api/inventory`)

⏳ **Remaining**
- Stock adjustment modal + `/src/app/api/inventory/adjust` route

### Phase 4: Menu Management (Priority: CRITICAL)
**Status: COMPLETE**

✅ List page, create/edit form with recipe builder, real-time cost + margin

✅ CRUD API routes under `/src/app/api/menu`

### Phase 5: Order Entry System (Priority: CRITICAL)
**Status: COMPLETE**

This is the MOST IMPORTANT feature for daily operations!

✅ **New Order Page** `/src/app/(dashboard)/orders/new/page.tsx`
   - Menu item selection (searchable dropdown or grid)
   - Quantity input
   - Show line total for each item
   - Order summary card (subtotal → total)
   - Customer name (optional)
   - Table number (optional)
   - Notes field
   - Payment method (Cash selected by default)
   - **SUBMIT ORDER button**

✅ **Order Processing (CRITICAL LOGIC):**
   ```typescript
   When order is submitted:
   1. Validate all items available
   2. Check ingredient stock sufficiency for EACH item × quantity
   3. Calculate order total
   4. Create Sale record
   5. Create SaleItem records (with price & cost snapshots)
   6. **DEDUCT INVENTORY** for each ingredient used:
      For each sale item:
        For each ingredient in recipe:
          UPDATE ingredient
          SET stock_quantity = stock_quantity - (recipe_qty × order_qty)
   7. Create StockAdjustment records (reason: "sale_deduction")
   8. Show success message with order number
   9. Option to print receipt (browser print dialog)
   ```

✅ **Orders List** `/src/app/(dashboard)/orders/page.tsx`
   - Table with: Order#, Time, Total, Items count, Status
   - Filter by date, status
   - Click to view details
   - Cancel order button (restores inventory!)

✅ **Order Details** `/src/app/(dashboard)/orders/[id]`
   - Items, totals, timestamps, cancel/restore

✅ **API routes:** `/src/app/api/orders` (create/list/details + cancel/restore)

### Phase 6: Analytics Page (Priority: MEDIUM)
**Status: COMPLETE**

✅ `/src/app/(dashboard)/analytics/page.tsx` with:

1. **Time Range Selector** (7/30/90 days)
2. **Charts:**
   - Revenue vs Cost trend (dual line chart)
   - Sales by category (bar chart - % of total)
   - Margin by menu item (horizontal bar chart)
   - Hourly sales heatmap (7-day view)
3. **Tables:**
   - Top 10 items by revenue
   - Top 10 items by profit
   - Lowest margin items (alert if < 20%)

### Phase 7: Public Menu Page (Priority: MEDIUM)
**Estimated: 2-3 hours**

Create `/src/app/menu/[restaurantSlug]/page.tsx`:

1. **Design:**
   - Beautiful hero section with restaurant name
   - Category tabs/pills for filtering
   - Grid of menu item cards with images
   - Each card: image, name, description, price, dietary icons
   - Search bar
   - Mobile-friendly

2. **Functionality:**
   - Filter by category
   - Search by name
   - Show "Sold Out" badge if not available
   - Click card to view full details modal
   - NO ordering - just display

### Phase 8: Settings Page (Priority: LOW)
**Estimated: 1-2 hours**

Create `/src/app/(dashboard)/settings/page.tsx`:

1. **Restaurant Settings:**
   - Name, email, phone, address
   - Operating hours
   - Number of tables
   - Logo upload (optional)

2. **User Management:**
   - Add/remove users
   - Change roles
   - Reset passwords

### Phase 9: AI Forecasting Integration (Priority: LOW - Optional)
**Estimated: 3-4 hours**

1. **Cron Job or Manual Trigger**
   - Button: "Generate AI Insights"
   - Fetches last 30 days of data
   - Sends to Claude API with context
   - Stores insights in `AIInsight` table

2. **Dashboard Sidebar Widget**
   - Show latest AI insights
   - Priority-based ordering (CRITICAL first)
   - Dismiss button

3. **Insights Types:**
   - Revenue forecast for today
   - Demand prediction (busy periods)
   - Inventory alerts (restock recommendations)
   - Menu optimization (items to promote/remove)
   - Pricing suggestions

**API route:**
```
src/app/api/ai/
└── generate-insights/route.ts
```

---

## 📊 FORMULA VERIFICATION CHECKLIST

Before launch, verify these calculations match FORMULAS.txt:

Dashboard KPIs:
- [ ] Today's Revenue = SUM(order totals) for today
- [ ] YTD Growth % = ((current - previous) / previous) × 100
- [ ] Gross Margin % = (Revenue - COGS) / Revenue × 100
- [ ] Orders Today = COUNT(orders) for today
- [ ] Low Stock Count = COUNT where stock < min_stock_level

Menu Item Cost:
- [ ] Cost = SUM(ingredient qty in recipe × ingredient cost per unit)
- [ ] Margin % = ((price - cost) / price) × 100
- [ ] Profit = price - cost

Order Total:
- [ ] Order Total = SUM(item price × quantity) for all items in order

Inventory Deduction:
- [ ] New Stock = Current Stock - (Recipe Qty × Order Qty) for EACH ingredient

---

## 🗄️ DATABASE CONNECTION

**Connection Details:**
```
DATABASE_URL="postgresql://workflow_app:WORKFLOW_PASSWORD@54.169.179.180:5432/restaurant_saas?schema=public"
```

**Prisma Commands:**
```bash
# View database in Prisma Studio
npx prisma studio

# Reset database and re-seed
npx prisma migrate reset --force
npm run db:seed

# Just re-seed without reset
npm run db:seed
```

---

## 🎨 UI/UX DESIGN NOTES (Match Dreuss Style)

### Color Palette:
```css
Primary: Slate (slate-900, slate-700, slate-500)
Success: Green-600 (high margin, growth)
Warning: Amber-600 (low stock, declining)
Danger: Red-600 (critical, losses)
Info: Blue-600 (insights)
```

### KPI Card Pattern:
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
    <DollarSign className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">2,450,000 IQD</div>
    <p className="text-xs text-muted-foreground">
      <span className="text-green-600">+12.3%</span> vs yesterday
    </p>
  </CardContent>
</Card>
```

### Table Pattern:
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Item</TableHead>
      <TableHead className="text-right">Price</TableHead>
      <TableHead className="text-right">Margin</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id} className="hover:bg-slate-50 cursor-pointer">
        <TableCell>{item.name}</TableCell>
        <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
        <TableCell className="text-right">
          <span className={item.margin >= 60 ? 'text-green-600' : 'text-amber-600'}>
            {formatPercentage(item.margin)}
          </span>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Chart Config (Recharts):
```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

---

## 🚀 NEXT STEPS TO COMPLETE MVP

### Immediate (Phase 1):
1. Set up NextAuth authentication
2. Create login page
3. Build dashboard layout with sidebar

### Core Features (Phases 2-5):
1. Implement Dashboard with KPIs and charts
2. Build Inventory Management (full CRUD)
3. Build Menu Management (full CRUD + recipes)
4. **BUILD ORDER ENTRY SYSTEM** ← MOST CRITICAL!

### Polish (Phases 6-9):
1. Analytics page
2. Public menu page
3. Settings page
4. AI insights (optional)

---

## ✅ TESTING CHECKLIST

Before considering MVP complete:

**Authentication:**
- [ ] Can login with all 3 user types
- [ ] Session persists across page refreshes
- [ ] Logout works
- [ ] Protected routes redirect to login

**Inventory:**
- [ ] Can create new ingredient
- [ ] Can edit ingredient
- [ ] Can delete ingredient (if not used in recipes)
- [ ] Stock levels update correctly
- [ ] Low stock alerts show correctly
- [ ] Stock adjustments create history records

**Menu:**
- [ ] Can create menu item
- [ ] Can add ingredients to recipe
- [ ] Cost calculates correctly from recipe
- [ ] Margin displays correctly
- [ ] Can edit menu item (preserves recipe)
- [ ] Can delete menu item
- [ ] Image URLs display properly

**Orders:**
- [ ] Can create new order
- [ ] Can add multiple items
- [ ] Order total calculates correctly
- [ ] **Inventory deducts correctly** ← CRITICAL TEST!
- [ ] Can view order history
- [ ] Can view order details
- [ ] Can cancel order (inventory restores)
- [ ] Low stock prevents order if insufficient

**Dashboard:**
- [ ] KPIs display correct values
- [ ] Charts render properly
- [ ] Time filters work
- [ ] All formulas match FORMULAS.txt

**Calculations (verify against FORMULAS.txt):**
- [ ] Menu item cost = sum of (ingredient qty × cost)
- [ ] Gross margin % = ((price - cost) / price) × 100
- [ ] Order total = sum of (item price × qty)
- [ ] Revenue growth % formula correct
- [ ] Inventory deduction formula correct

---

## 📁 PROJECT STRUCTURE (Final)

```
restaurant-saas/
├── prisma/
│   ├── schema.prisma ✅
│   └── seed.ts ✅
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx (dashboard)
│   │   │   ├── inventory/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── menu/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── orders/
│   │   │   │   ├── page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── menu/[slug]/page.tsx (public)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── dashboard/
│   │   │   ├── inventory/
│   │   │   ├── menu/
│   │   │   ├── orders/
│   │   │   └── ai/
│   │   ├── globals.css ✅
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/ ✅ (button, card, input, label)
│   │   ├── layout/
│   │   ├── dashboard/
│   │   ├── inventory/
│   │   ├── menu/
│   │   └── orders/
│   └── lib/
│       ├── utils.ts ✅
│       ├── prisma.ts
│       └── auth.ts
├── .env ✅
├── FORMULAS.txt ✅ (COMPLETE DOCUMENTATION)
├── PROJECT_STATUS.md ✅ (THIS FILE)
├── package.json ✅
├── tailwind.config.ts ✅
├── tsconfig.json ✅
└── next.config.mjs ✅
```

---

## 💡 IMPORTANT REMINDERS

1. **ALL calculations MUST match FORMULAS.txt** - This is your source of truth!

2. **Inventory deduction is CRITICAL** - Test thoroughly:
   - Order 2× Chicken Biryani
   - Check that chicken stock decreased by (0.25kg × 2 = 0.5kg)
   - Check that rice decreased by (0.25kg × 2 = 0.5kg)
   - Verify all recipe ingredients deducted correctly

3. **Cash-only payments** - No Stripe, no payment processing needed

4. **Multi-tenant ready** - Schema supports multiple restaurants, but MVP focuses on single restaurant

5. **Iraqi cultural context:**
   - Currency: IQD (no decimals in display)
   - Weekend: Friday-Saturday
   - Peak times: Lunch 12-2pm, Dinner 7-9pm
   - Cash-based society

6. **Use utility functions:**
   ```typescript
   formatCurrency(amount) // e.g., "2,450,000 IQD"
   formatPercentage(value, decimals) // e.g., "66.7%"
   formatNumber(value) // e.g., "1,234"
   ```

7. **Color-code everything:**
   - Green: Good (high margin, sufficient stock, growth)
   - Amber: Warning (low stock, declining, medium margin)
   - Red: Critical (no stock, losses, very low margin)

---

## 🎯 SUCCESS CRITERIA

The MVP is complete when:

✅ Restaurant staff can:
1. Login to the system
2. View current inventory levels
3. Add/edit ingredients
4. Create menu items with recipes
5. **Take customer orders**
6. **Inventory automatically deducts**
7. View sales history
8. See daily revenue and margins on dashboard
9. Identify low-stock items
10. View which menu items are most profitable

✅ Customers can:
1. View public menu page with photos and prices

✅ All formulas in FORMULAS.txt are correctly implemented

✅ Demo works with realistic seed data

---

## 🔮 FUTURE ENHANCEMENTS (Post-MVP)

- Mobile app (React Native)
- Multi-location support (multiple restaurants per account)
- Table management and reservations
- Employee shift scheduling
- Supplier management and purchase orders
- Customer loyalty program
- Email/SMS notifications
- Advanced reporting (PDF exports)
- Recipe costing history (track ingredient price changes)
- Waste tracking and reporting
- Integration with POS hardware
- Offline mode support

---

**Good luck completing the MVP! You have a solid foundation to build on.** 🚀

For any questions about formulas or calculations, always refer to FORMULAS.txt first!
