# Restaurant Management System — Architecture Specification

## Overview

A unified restaurant management platform connecting financial tracking, inventory control, meal preparation, and order management into a single P&L-aware system.

---

## Core Modules

### 1. Expense Management
### 2. Inventory Management  
### 3. Meal Prep Management
### 4. Order Management
### 5. Profit & Loss Reporting

---

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   DELIVERY                    MEAL PREP                    ORDERS           │
│   ────────                    ─────────                    ──────           │
│   Supplier delivers    →      Cook uses ingredients   →    Customer orders  │
│   tomatoes ($50)              to prep dishes               dishes           │
│        │                           │                           │            │
│        ▼                           ▼                           ▼            │
│   ┌─────────┐              ┌─────────────┐              ┌───────────┐       │
│   │ +$50    │              │ Raw Inv -5kg│              │ Prepped   │       │
│   │ Expense │              │ Prepped +20 │              │ Dishes -1 │       │
│   │ (COGS)  │              │ dishes      │              │           │       │
│   └────┬────┘              └─────────────┘              └─────┬─────┘       │
│        │                                                      │             │
│        │              ┌─────────────────────┐                 │             │
│        └─────────────►│   PROFIT & LOSS     │◄────────────────┘             │
│                       │   ───────────────   │        +$18.50 Revenue        │
│                       │   Revenue - COGS    │                               │
│                       │   - Expenses        │                               │
│                       │   = Net Profit      │                               │
│                       └─────────────────────┘                               │
│                                 ▲                                           │
│                                 │                                           │
│                       ┌─────────┴─────────┐                                 │
│                       │ RECURRING EXPENSES│                                 │
│                       │ Rent, Utilities,  │                                 │
│                       │ Payroll, etc.     │                                 │
│                       └───────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Expense

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Expense description |
| amount | Decimal | Cost amount |
| type | Enum | `one-time` \| `recurring` |
| frequency | Enum | `daily` \| `weekly` \| `monthly` \| `yearly` (null if one-time) |
| category | Enum | `overhead` \| `utilities` \| `payroll` \| `marketing` \| `maintenance` \| `cogs` \| `other` |
| start_date | Date | When expense starts (or occurred for one-time) |
| end_date | Date | Optional end date for recurring expenses |
| is_active | Boolean | Whether recurring expense is still active |
| linked_delivery_id | UUID | Foreign key to Delivery (if auto-generated from delivery) |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### InventoryItem

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Item name (e.g., "Tomatoes") |
| unit | String | Unit of measure (kg, lbs, units, liters) |
| current_quantity | Decimal | Current stock level |
| reorder_threshold | Decimal | Alert when stock falls below this |
| average_cost_per_unit | Decimal | Weighted average cost |
| category | String | Optional grouping (produce, meat, dairy, dry goods) |
| is_active | Boolean | Whether item is still in use |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### Delivery

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| inventory_item_id | UUID | Foreign key to InventoryItem |
| supplier_name | String | Vendor name |
| quantity | Decimal | Amount delivered |
| unit_cost | Decimal | Cost per unit |
| total_cost | Decimal | Total delivery cost (auto-calculated or override) |
| delivery_date | Date | When delivery arrived |
| invoice_number | String | Optional supplier invoice reference |
| notes | Text | Optional notes |
| expense_id | UUID | Foreign key to auto-created Expense record |
| created_at | Timestamp | Record creation time |

### Dish

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Dish name |
| sale_price | Decimal | Menu price |
| category | String | Appetizer, Main, Dessert, Beverage, etc. |
| is_active | Boolean | Currently on menu |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### DishRecipe (Junction Table)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| dish_id | UUID | Foreign key to Dish |
| inventory_item_id | UUID | Foreign key to InventoryItem |
| quantity_required | Decimal | Amount of ingredient per dish |

### PrepSession

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| prep_date | Date | Date of prep |
| prepared_by | String/UUID | Cook name or user ID |
| notes | Text | Optional notes |
| created_at | Timestamp | Record creation time |

### PrepItem

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| prep_session_id | UUID | Foreign key to PrepSession |
| dish_id | UUID | Foreign key to Dish |
| quantity_prepped | Integer | Number of portions prepared |
| created_at | Timestamp | Record creation time |

### PrepInventoryUsage

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| prep_session_id | UUID | Foreign key to PrepSession |
| inventory_item_id | UUID | Foreign key to InventoryItem |
| quantity_used | Decimal | Amount consumed |
| created_at | Timestamp | Record creation time |

### PreppedDishStock

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| dish_id | UUID | Foreign key to Dish |
| available_quantity | Integer | Current prepped count ready to serve |
| last_updated | Timestamp | Last modification time |

### Order

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| order_number | String | Display reference (e.g., "ORD-001") |
| order_date | Timestamp | When order was placed |
| status | Enum | `pending` \| `preparing` \| `completed` \| `cancelled` |
| subtotal | Decimal | Sum of line items |
| tax | Decimal | Tax amount |
| total | Decimal | Final amount |
| payment_method | String | Cash, Card, etc. |
| notes | Text | Special instructions |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### OrderItem

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| order_id | UUID | Foreign key to Order |
| dish_id | UUID | Foreign key to Dish |
| quantity | Integer | Number ordered |
| unit_price | Decimal | Price at time of order |
| line_total | Decimal | quantity × unit_price |
| created_at | Timestamp | Record creation time |

---

## Module Specifications

### Module 1: Expense Management

#### Features

1. **Add One-Time Expense**
   - Input: name, amount, category, date
   - Creates single expense record

2. **Add Recurring Expense**
   - Input: name, amount, category, frequency, start_date, optional end_date
   - System auto-calculates monthly/period totals for P&L

3. **View Expenses**
   - List view with filters: date range, category, type (one-time/recurring)
   - Sort by date, amount, category

4. **Edit/Delete Expense**
   - Modify any field
   - Soft delete (mark inactive) for audit trail

5. **Recurring Expense Calculator**
   - For any date range, calculate total recurring expense burden
   - Daily × days in period
   - Weekly × weeks in period
   - Monthly × months in period

#### Business Rules

- Expenses with `category = 'cogs'` are auto-created by the Delivery flow and should be read-only
- Recurring expenses without end_date continue indefinitely
- Deleting a recurring expense should prompt: delete all future, or mark end_date as today

---

### Module 2: Inventory Management

#### Features

1. **Add Inventory Item**
   - Input: name, unit, category, reorder_threshold
   - Initial quantity = 0 (populated via deliveries)

2. **Record Delivery**
   - Input: inventory_item, quantity, total_cost, supplier, date, invoice_number
   - **Side Effects:**
     - Increase `inventory_item.current_quantity` by delivery quantity
     - Update `average_cost_per_unit` using weighted average formula
     - Auto-create Expense record with category = 'cogs'

3. **View Current Stock**
   - List all items with current quantities
   - Highlight items below reorder threshold
   - Show average cost per unit

4. **View Delivery History**
   - Filter by item, date range, supplier
   - Shows linked expense record

5. **Manual Stock Adjustment**
   - For waste, spillage, corrections
   - Input: item, quantity (+/-), reason
   - Does NOT create expense (waste tracking separate)

#### Business Rules

- Inventory can never go negative (validation required)
- Weighted average cost formula:
  ```
  new_avg = ((current_qty × current_avg) + (delivery_qty × delivery_unit_cost)) / (current_qty + delivery_qty)
  ```
- Low stock alerts when `current_quantity <= reorder_threshold`

---

### Module 3: Meal Prep Management

#### Features

1. **Create Prep Session**
   - Input: date, prepared_by (cook name)
   - Container for all prep activities in one session

2. **Record Dish Prep**
   - Input: dish, quantity_to_prep
   - **Side Effects:**
     - Look up dish recipe (DishRecipe entries)
     - Calculate total ingredients needed: `recipe_qty × prep_quantity`
     - Validate sufficient inventory exists
     - Deduct from each InventoryItem.current_quantity
     - Create PrepInventoryUsage records
     - Create PrepItem record
     - Increase PreppedDishStock.available_quantity

3. **Record Direct Ingredient Usage** (non-recipe)
   - For when cooks use ingredients outside of recipe tracking
   - Input: inventory_item, quantity_used
   - Deducts from inventory without creating prepped dishes

4. **View Prepped Dish Stock**
   - Current count of each dish ready to serve
   - Highlight dishes with low/zero prep
   - Shows when last prepped

5. **View Prep History**
   - By date, by cook, by dish
   - Shows ingredients consumed per session

#### Business Rules

- Cannot prep if insufficient raw inventory (show which items are short)
- Prepped dishes have shelf life consideration (future enhancement: expiry tracking)
- Prep session should be finalized/locked after completion

---

### Module 4: Order Management

#### Features

1. **Create Order**
   - Add dishes from menu
   - **Validation:** Check PreppedDishStock has sufficient quantity
   - Show "OUT OF STOCK" for dishes with zero prep

2. **Add Items to Order**
   - Input: dish, quantity
   - Auto-calculate line_total
   - **Side Effect on completion:** Deduct from PreppedDishStock

3. **Complete Order**
   - Mark status = 'completed'
   - **Side Effects:**
     - Deduct ordered quantities from PreppedDishStock
     - Record revenue transaction for P&L

4. **Cancel Order**
   - Mark status = 'cancelled'
   - If items were already deducted, restore to PreppedDishStock

5. **View Orders**
   - Filter by date, status
   - Daily sales summary

6. **Sales Transactions View**
   - List of all completed orders
   - Revenue by day, week, month
   - Revenue by dish (best sellers)

#### Business Rules

- Order cannot be completed if prepped stock insufficient
- Partial fulfillment: allow completing order with reduced quantity (alerts user)
- Cancelled orders do not count toward revenue

---

### Module 5: Profit & Loss Reporting

#### Features

1. **P&L Statement Generator**
   - Input: date range (day, week, month, custom)
   - Output structured report (see format below)

2. **Dashboard Summary**
   - Today's revenue, expenses, profit
   - Month-to-date figures
   - Comparison to prior period

3. **Breakdown Views**
   - Revenue by dish
   - Expenses by category
   - COGS detail (all deliveries)

#### P&L Calculation Logic

```
REVENUE
  Total Sales (sum of completed orders)                    $X,XXX.XX
─────────────────────────────────────────────────────────────────────
COST OF GOODS SOLD (COGS)
  Total Deliveries/Inventory Purchases                     $X,XXX.XX
─────────────────────────────────────────────────────────────────────
GROSS PROFIT (Revenue - COGS)                              $X,XXX.XX
─────────────────────────────────────────────────────────────────────
OPERATING EXPENSES
  Overhead                                                 $X,XXX.XX
  Utilities                                                $X,XXX.XX
  Payroll                                                  $X,XXX.XX
  Marketing                                                $X,XXX.XX
  Maintenance                                              $X,XXX.XX
  Other                                                    $X,XXX.XX
  ───────────────────────────────────────────────────────
  Total Operating Expenses                                 $X,XXX.XX
─────────────────────────────────────────────────────────────────────
NET PROFIT (Gross Profit - Operating Expenses)             $X,XXX.XX
─────────────────────────────────────────────────────────────────────
PROFIT MARGIN (Net Profit / Revenue × 100)                      XX.X%
```

#### Recurring Expense Calculation for Period

```javascript
function calculateRecurringExpenseForPeriod(expense, startDate, endDate) {
  const daysInPeriod = daysBetween(startDate, endDate);
  
  switch (expense.frequency) {
    case 'daily':
      return expense.amount * daysInPeriod;
    case 'weekly':
      return expense.amount * (daysInPeriod / 7);
    case 'monthly':
      return expense.amount * (daysInPeriod / 30);
    case 'yearly':
      return expense.amount * (daysInPeriod / 365);
  }
}
```

---

## Key User Flows

### Flow 1: Delivery → Inventory → Expense

```
1. Manager navigates to Inventory → Record Delivery
2. Selects "Tomatoes" from inventory items
3. Enters:
   - Quantity: 25 kg
   - Total Cost: $62.50
   - Supplier: "Fresh Farms"
   - Date: Today
4. System:
   a. Increases Tomatoes.current_quantity by 25
   b. Recalculates average_cost_per_unit
   c. Creates Delivery record
   d. Auto-creates Expense: 
      - name: "Delivery: Tomatoes (Fresh Farms)"
      - amount: $62.50
      - category: "cogs"
      - type: "one-time"
5. User sees success confirmation
6. P&L now reflects $62.50 in COGS
```

### Flow 2: Meal Prep → Inventory Deduction → Prepped Stock

```
1. Cook navigates to Meal Prep → New Session
2. Creates session for today
3. Selects "Chicken Pasta" dish, enters quantity: 20
4. System looks up recipe:
   - 0.3 kg Chicken per dish
   - 0.2 kg Pasta per dish
   - 0.1 kg Tomatoes per dish
5. System calculates needs:
   - Chicken: 6 kg needed, 15 kg available ✓
   - Pasta: 4 kg needed, 20 kg available ✓
   - Tomatoes: 2 kg needed, 25 kg available ✓
6. Cook confirms prep
7. System:
   a. Deducts from each inventory item
   b. Creates PrepItem record (20 Chicken Pasta)
   c. Creates PrepInventoryUsage records
   d. Updates PreppedDishStock: Chicken Pasta = +20
8. Available prepped dishes now shows 20 Chicken Pasta
```

### Flow 3: Order → Prepped Stock Deduction → Revenue

```
1. Server creates new order
2. Adds: 2x Chicken Pasta ($18.50 each)
3. System validates: 20 available, 2 requested ✓
4. Order subtotal: $37.00
5. Server completes order
6. System:
   a. Deducts PreppedDishStock: Chicken Pasta = 18 (was 20)
   b. Creates Order with status: completed
   c. Creates OrderItems
   d. Records $37.00 revenue
7. P&L revenue increases by $37.00
```

### Flow 4: Stock Depletion Alert

```
1. Order placed for 5x Tomato Soup
2. System checks: PreppedDishStock for Tomato Soup = 3
3. Alert shown: "Only 3 Tomato Soup available (5 requested)"
4. Options:
   a. Reduce to 3 and complete
   b. Cancel item
   c. Rush prep more (navigate to prep)
```

---

## API Endpoints (Suggested)

### Expenses
```
GET    /api/expenses                    - List expenses (with filters)
POST   /api/expenses                    - Create expense
GET    /api/expenses/:id                - Get single expense
PUT    /api/expenses/:id                - Update expense
DELETE /api/expenses/:id                - Delete/deactivate expense
GET    /api/expenses/summary            - Get totals by category/period
```

### Inventory
```
GET    /api/inventory                   - List all items with stock levels
POST   /api/inventory                   - Add new item
PUT    /api/inventory/:id               - Update item details
POST   /api/inventory/:id/adjust        - Manual stock adjustment
GET    /api/inventory/low-stock         - Items below reorder threshold
```

### Deliveries
```
GET    /api/deliveries                  - List deliveries (with filters)
POST   /api/deliveries                  - Record delivery (triggers inventory + expense)
GET    /api/deliveries/:id              - Get delivery details
```

### Dishes
```
GET    /api/dishes                      - List all dishes
POST   /api/dishes                      - Create dish
PUT    /api/dishes/:id                  - Update dish
GET    /api/dishes/:id/recipe           - Get recipe ingredients
PUT    /api/dishes/:id/recipe           - Update recipe
```

### Prep
```
POST   /api/prep/sessions               - Start prep session
GET    /api/prep/sessions               - List sessions
POST   /api/prep/sessions/:id/items     - Add prepped dish to session
POST   /api/prep/sessions/:id/usage     - Record direct ingredient usage
GET    /api/prep/stock                  - Current prepped dish availability
```

### Orders
```
GET    /api/orders                      - List orders (with filters)
POST   /api/orders                      - Create order
GET    /api/orders/:id                  - Get order details
PUT    /api/orders/:id                  - Update order
POST   /api/orders/:id/complete         - Complete order (triggers stock deduction)
POST   /api/orders/:id/cancel           - Cancel order
GET    /api/orders/sales-summary        - Sales aggregates
```

### P&L
```
GET    /api/reports/pnl                 - Generate P&L (query: start_date, end_date)
GET    /api/reports/dashboard           - Dashboard summary stats
GET    /api/reports/revenue-by-dish     - Revenue breakdown by dish
GET    /api/reports/expenses-by-category - Expense breakdown
```

---

## Database Relationships Diagram

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│    Expense      │       │  InventoryItem   │       │     Dish        │
├─────────────────┤       ├──────────────────┤       ├─────────────────┤
│ id              │       │ id               │       │ id              │
│ name            │       │ name             │       │ name            │
│ amount          │       │ current_quantity │       │ sale_price      │
│ type            │       │ average_cost     │       │ category        │
│ frequency       │◄──┐   │ unit             │   ┌──►│                 │
│ category        │   │   │                  │   │   └────────┬────────┘
│ linked_delivery │   │   └────────┬─────────┘   │            │
└─────────────────┘   │            │             │            │
                      │            │             │            │
                      │   ┌────────▼─────────┐   │   ┌────────▼────────┐
                      │   │    Delivery      │   │   │   DishRecipe    │
                      │   ├──────────────────┤   │   ├─────────────────┤
                      │   │ id               │   │   │ dish_id     ────┼──►
                      └───┼─expense_id       │   │   │ inventory_id────┼──►
                          │ inventory_id ────┼───┘   │ quantity_req    │
                          │ quantity         │       └─────────────────┘
                          │ total_cost       │
                          └──────────────────┘

┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  PrepSession    │       │    PrepItem      │       │PreppedDishStock │
├─────────────────┤       ├──────────────────┤       ├─────────────────┤
│ id              │◄──────┤ prep_session_id  │       │ dish_id     ────┼──►
│ prep_date       │       │ dish_id      ────┼──────►│ available_qty   │
│ prepared_by     │       │ quantity_prepped │       └─────────────────┘
└────────┬────────┘       └──────────────────┘
         │
         │                ┌──────────────────┐
         │                │PrepInventoryUsage│
         │                ├──────────────────┤
         └───────────────►│ prep_session_id  │
                          │ inventory_id ────┼──────────────────────────►
                          │ quantity_used    │
                          └──────────────────┘

┌─────────────────┐       ┌──────────────────┐
│     Order       │       │   OrderItem      │
├─────────────────┤       ├──────────────────┤
│ id              │◄──────┤ order_id         │
│ order_number    │       │ dish_id      ────┼──────────────────────────►
│ status          │       │ quantity         │
│ total           │       │ unit_price       │
└─────────────────┘       └──────────────────┘
```

---

## Validation Rules Summary

| Action | Validation Required |
|--------|---------------------|
| Record Delivery | quantity > 0, total_cost > 0, valid inventory_item |
| Prep Dish | sufficient inventory for all recipe ingredients |
| Complete Order | sufficient prepped stock for all order items |
| Manual Stock Adjustment | resulting quantity >= 0 |
| Delete Recurring Expense | prompt for end behavior |

---

## Future Enhancement Considerations

1. **Waste Tracking** — separate module for spoilage/waste with cost impact
2. **Expiry Management** — track shelf life of prepped dishes and raw inventory
3. **Multi-location** — support for multiple restaurant locations
4. **User Roles** — Manager, Cook, Server with different permissions
5. **Supplier Management** — supplier database with contact info, pricing history
6. **Purchase Orders** — create POs before deliveries arrive
7. **Menu Engineering** — profitability analysis per dish (food cost %)
8. **Forecasting** — predict inventory needs based on historical orders
9. **Integration** — POS system integration for automatic order capture

---

## Glossary

| Term | Definition |
|------|------------|
| COGS | Cost of Goods Sold — direct costs of inventory/ingredients |
| Prep Session | A batch of meal preparation work by a cook |
| Prepped Stock | Ready-to-serve portions of a dish |
| Recurring Expense | Ongoing cost that repeats at a set frequency |
| Weighted Average Cost | Running average cost per unit across multiple deliveries |
