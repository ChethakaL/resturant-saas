# Restaurant Management System - Quick Start Guide

## Access the System

**Login Credentials:**
- Email: `owner@alrafidain.iq`
- Password: `password123`

---

## Main Features Overview

### 1. DASHBOARD (/)
**What you'll see:**
- Today's revenue, orders, customers, tables in use
- This week's revenue and busiest hour
- This month's profit, margin %, food cost %
- Top 5 selling items (this week)
- Top 5 waiters by sales (this month)
- Inventory alerts (low stock and critical stock)

**Quick Actions:**
- All metrics update automatically based on completed orders
- Click on any section to navigate to detailed views

---

### 2. TABLES (/tables)
**What you can do:**
- View all tables with their current status
- See active orders on occupied tables
- Click any table to view details and history
- Create new tables (Add Table button)

**Table Statuses:**
- 🟢 AVAILABLE - Ready for customers
- 🟠 OCCUPIED - Currently serving customers
- 🔵 RESERVED - Reserved for future use
- ⚪ CLEANING - Being cleaned

**Workflow:**
1. Table starts as AVAILABLE
2. When order is created → OCCUPIED
3. When order is completed (paid) → AVAILABLE again

---

### 3. ORDERS (/orders)
**Order Status Flow:**
```
PENDING → PREPARING → READY → COMPLETED
```

**Create New Order:**
1. Click "New Order"
2. Select table (optional but recommended)
3. Select waiter
4. Add menu items
5. Status starts as PENDING

**Order Lifecycle:**
- **PENDING** (Yellow) - Order received, not started
- **PREPARING** (Blue) - Kitchen is cooking (inventory auto-deducted)
- **READY** (Green) - Food is ready to serve
- **COMPLETED** (Gray) - Customer paid, order closed

**Key Features:**
- Add items to existing pending orders
- Inventory automatically deducted when status → PREPARING
- Mark as complete to record payment and free up table

---

### 4. MENU (/menu)
**What you can do:**
- View all menu items with categories
- Create new menu items with recipe builder
- Edit existing items
- Set prices and see profit margins

**Recipe Builder:**
- Add ingredients to each menu item
- Specify quantity of each ingredient
- System calculates cost automatically
- See profit margin in real-time

**Cost Calculation:**
- Item Cost = Σ(Ingredient Quantity × Cost Per Unit)
- Margin % = ((Price - Cost) / Price) × 100

---

### 5. INVENTORY (/inventory)
**What you'll see:**
- All ingredients with current stock levels
- Color-coded alerts:
  - 🟢 OK - Stock above minimum
  - 🟠 LOW - Stock below minimum
  - 🔴 CRITICAL - Stock < 25% of minimum

**Inventory Management:**
- Add new ingredients
- Update stock levels
- Set minimum stock levels for alerts
- Track supplier information

**Stock Deduction:**
- Automatic when order status → PREPARING
- Creates stock adjustment records
- Validates sufficient stock before deduction

---

### 6. HR & STAFF (/hr/employees)
**Employee Positions:**
- WAITER - Serve customers, assigned to orders
- CHEF - Kitchen management
- KITCHEN_STAFF - Kitchen support
- CASHIER - Payment processing
- MANAGER - Restaurant management
- CLEANER - Cleaning services

**Add Employee:**
1. Click "Add Employee"
2. Enter name, position, contact info
3. Set salary and salary type (Monthly/Daily/Hourly)
4. Set hire date
5. Save

**Employee Stats:**
- Orders served (for waiters)
- Shifts worked
- Payroll history

---

### 7. PAYROLL (/hr/payroll)
**Generate Payroll:**
1. Click "Generate Payroll"
2. Select period (month/year)
3. Choose employee or generate for all
4. Add bonuses (optional)
5. Add deductions (optional)
6. System calculates: Total = Base + Bonuses - Deductions

**Payroll Status:**
- 🟡 PENDING - Not yet paid
- 🟢 PAID - Payment completed
- 🔴 CANCELLED - Cancelled payroll

**Mark as Paid:**
- Click on payroll record
- Update status to PAID
- System records payment date

---

### 8. SHIFTS (/hr/shifts)
**Schedule a Shift:**
1. Click "Schedule Shift"
2. Select employee
3. Choose date
4. Set start time (e.g., 09:00)
5. Set end time (e.g., 17:00)
6. System calculates hours automatically (8.0 hours)
7. Add notes if needed

**Weekly View:**
- See all shifts for current week
- Today is highlighted
- View by day
- See employee name, position, hours

---

### 9. ANALYTICS (/analytics)
**What you'll see:**
- Revenue trends (daily, weekly, monthly)
- Top selling items
- Category performance
- Peak hours analysis
- Profit margins
- Food cost analysis

---

## Common Workflows

### Daily Restaurant Operations:

**Opening:**
1. Check Dashboard for today's prep needs
2. Review low stock items in Inventory
3. Check Shifts to see who's working today

**During Service:**
1. Customers arrive → Create Order (assign Table + Waiter)
2. Take order → Add items
3. Send to kitchen → Update status to PREPARING
4. Food ready → Update to READY
5. Customer pays → Mark as COMPLETED

**Closing:**
1. Review Dashboard for day's performance
2. Check all tables are AVAILABLE
3. Review completed orders
4. Plan next day's inventory needs

### End of Month:

**Payroll Processing:**
1. Go to Payroll
2. Click "Generate Payroll"
3. Review each employee
4. Add bonuses for top performers
5. Add deductions if applicable
6. Mark as PAID when processed

**Performance Review:**
1. Check Dashboard for month's stats
2. Review Top Waiters ranking
3. Analyze profit margin and food cost %
4. Review Top Selling Items
5. Plan menu updates based on data

### Weekly Planning:

**Shift Scheduling:**
1. Go to Shifts
2. Schedule each employee for next week
3. Balance coverage across busy hours
4. Account for employee availability
5. Save and share schedule

---

## Key Metrics Explained

**Today's Revenue:**
- Total sales from completed orders today
- Growth % vs yesterday

**Profit Margin %:**
- (Revenue - Cost) / Revenue × 100
- Target: 65-72%
- Green if above 60%, amber if below

**Food Cost %:**
- Cost / Revenue × 100
- Target: < 35%
- Green if below 35%, red if above

**Tables in Use:**
- Count of tables with status OCCUPIED
- Updates automatically with orders

**Average Order Value:**
- Total Revenue / Number of Orders
- Higher is better

---

## Tips & Best Practices

**Inventory Management:**
- Set realistic minimum stock levels
- Reorder when items hit LOW status
- Don't wait for CRITICAL
- Review FORMULAS.txt for calculation details

**Order Management:**
- Always assign a waiter to track performance
- Use table numbers for dine-in orders
- Update status promptly (kitchen gets PREPARING immediately)
- Mark COMPLETED only after payment received

**Staff Management:**
- Keep employee records updated
- Process payroll on time
- Schedule shifts in advance
- Use notes field for special instructions

**Menu Optimization:**
- Review Top Selling Items weekly
- Focus on high-margin items
- Remove low-performing items
- Update prices if margin too low

**Dashboard Usage:**
- Check daily for quick overview
- Monitor alerts (low stock, pending payrolls)
- Use top performers data for incentives
- Track trends over time

---

## Troubleshooting

**Order won't move to PREPARING:**
- Check if sufficient ingredient stock
- Error message will show which ingredient is low
- Restock ingredient first, then retry

**Table still OCCUPIED after payment:**
- Verify order status is COMPLETED
- Check if other orders exist for same table
- Table only becomes AVAILABLE when all orders completed

**Inventory deduction not happening:**
- Inventory only deducts when status → PREPARING
- PENDING orders don't deduct stock
- This prevents premature deduction

**Can't delete employee:**
- System uses soft delete (sets isActive = false)
- Employee record preserved for historical data
- Use "Deactivate" instead of delete

---

## Support & Documentation

**Full Documentation:**
- See `IMPLEMENTATION_SUMMARY.md` for complete technical details
- See `FORMULAS.txt` for all calculation formulas
- See `prisma/schema.prisma` for database structure

**Key Files:**
- Dashboard: `/src/app/(dashboard)/page.tsx`
- API Routes: `/src/app/api/*`
- Database: `prisma/schema.prisma`

---

**System Version:** 1.0.0
**Last Updated:** January 2026
**Built with:** Next.js, Prisma, PostgreSQL, TypeScript
