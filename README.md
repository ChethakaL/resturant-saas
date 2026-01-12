# 🍽️ Restaurant SaaS - AI-Powered Management System

A comprehensive restaurant management system built with Next.js, featuring inventory tracking, menu management, sales analytics, and AI-powered insights.

## ✨ Features

### Core Functionality
- **📦 Inventory Management** - Track ingredients, costs, and stock levels with automatic alerts
- **🍕 Menu Management** - Create menu items with recipe-based costing
- **💰 Order Entry System** - Process orders with automatic inventory deduction
- **📊 Analytics Dashboard** - Real-time KPIs, revenue tracking, and profit analysis
- **🤖 AI Insights** - Demand forecasting and menu optimization recommendations
- **🌐 Public Menu** - Beautiful customer-facing menu with photos

### Advanced Features
- Multi-tenant architecture (SaaS-ready)
- Recipe-based cost calculation
- Automatic inventory deduction on sales
- Time-based analytics (hourly, daily, weekly patterns)
- Performance categorization (Rising Stars, Cash Cows, etc.)
- Iraqi restaurant context (IQD currency, cash payments, local cuisine)

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Edit `.env` with your database URL and API keys (optional):
   ```env
   DATABASE_URL="your_postgresql_connection_string"
   NEXTAUTH_SECRET="your-secret-key"
   ANTHROPIC_API_KEY="your-claude-api-key" # Optional for AI features
   ```

3. **Set up database:**
   ```bash
   npx prisma db push
   ```

4. **Seed demo data:**
   ```bash
   npm run db:seed
   ```

   This creates:
   - Al-Rafidain Restaurant (demo data)
   - 3 users (owner, manager, staff)
   - 42 authentic ingredients
   - 25 Iraqi/Middle Eastern menu items
   - 90 days of sales history (~3,500 orders)

5. **Start development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to `http://localhost:3000`

## 🔐 Demo Credentials

After seeding, login with:

- **Owner:** owner@alrafidain.iq / password123
- **Manager:** manager@alrafidain.iq / password123
- **Staff:** staff@alrafidain.iq / password123

## 📚 Documentation

### Important Files
- **[FORMULAS.txt](./FORMULAS.txt)** - Complete documentation of ALL calculations and formulas
- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Detailed implementation roadmap and status
- **[prisma/schema.prisma](./prisma/schema.prisma)** - Database schema

### Formula Documentation
Every calculation in the system is documented in `FORMULAS.txt` including:
- Inventory valuation and stock status
- Menu item costing (recipe-based)
- Profit margins and markup
- Revenue calculations (daily, MTD, YTD)
- Growth rates and comparisons
- AI forecasting algorithms
- Financial ratios

**Always refer to FORMULAS.txt when implementing calculations!**

## 🏗️ Tech Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Styling:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts
- **Authentication:** NextAuth.js
- **AI:** Claude API (Anthropic SDK)
- **Images:** Unsplash API

## 📊 Database Schema

### Core Models
- `Restaurant` - Multi-tenant restaurant profiles
- `User` - Authentication with roles
- `Ingredient` - Inventory tracking
- `MenuItem` - Menu items with pricing
- `MenuItemIngredient` - Recipe management
- `Sale` + `SaleItem` - Order tracking
- `StockAdjustment` - Inventory movement history
- `AIInsight` - AI-generated predictions
- `DailySummary` - Pre-calculated analytics

See [prisma/schema.prisma](./prisma/schema.prisma) for full schema.

## 🎯 Key Features Explained

### Recipe-Based Costing
Menu items are linked to ingredients through recipes:
```
Chicken Biryani =
  0.25kg Chicken @ 8,000 IQD/kg = 2,000 IQD
  + 0.25kg Rice @ 2,500 IQD/kg = 625 IQD
  + 0.05kg Spices @ 10,000 IQD/kg = 500 IQD
  = 3,125 IQD total cost

Selling Price: 13,000 IQD
Gross Margin: ((13,000 - 3,125) / 13,000) × 100 = 76%
```

### Automatic Inventory Deduction
When an order is placed:
1. System calculates required ingredients
2. Checks stock availability
3. Creates sale record
4. **Automatically deducts ingredients from inventory**
5. Creates audit trail in StockAdjustment table

Example: Order of 2× Chicken Biryani
- Chicken: -0.5kg (0.25kg × 2)
- Rice: -0.5kg (0.25kg × 2)
- Spices: -0.1kg (0.05kg × 2)

### Performance Categorization
Menu items are automatically categorized:
- **Rising Star** 🌟 - Growth ≥ 30%
- **Cash Cow** 💰 - High revenue + high margin
- **Declining** ⚠️ - Sales dropping > 20%
- **New Item** ❓ - Insufficient data

### AI Insights
Powered by Claude AI:
- Revenue forecasting
- Demand prediction
- Inventory restock alerts
- Menu optimization suggestions
- Peak time analysis

## 🛠️ Development

### Useful Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database and re-seed
npx prisma migrate reset --force

# Run seed script only
npm run db:seed

# Type checking
npm run lint
```

### Project Structure

```
restaurant-saas/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data script
├── src/
│   ├── app/               # Next.js app router
│   │   ├── (auth)/        # Authentication pages
│   │   ├── (dashboard)/   # Protected dashboard routes
│   │   ├── api/           # API routes
│   │   └── layout.tsx     # Root layout
│   ├── components/
│   │   └── ui/            # shadcn/ui components
│   └── lib/
│       └── utils.ts       # Utility functions
├── FORMULAS.txt           # Formula documentation
├── PROJECT_STATUS.md      # Implementation roadmap
└── .env                   # Environment variables
```

## 🎨 UI Design Principles

Based on the Dreuss dashboard style:
- Clean, minimal interface
- Card-based layouts
- Color-coded status indicators:
  - 🟢 Green: Good performance, sufficient stock
  - 🟡 Amber: Warnings, low stock, declining
  - 🔴 Red: Critical issues, losses
- Consistent typography (Slate color palette)
- Responsive design (mobile-friendly)
- Hover states and transitions
- Right-aligned numeric columns in tables

## 📈 Analytics & Reporting

### Dashboard KPIs
- Today's Revenue (with growth %)
- Gross Profit Margin
- Active Orders
- Low Stock Alerts
- Top Selling Items
- Revenue Trends (7/30/90 days)

### Advanced Analytics
- Sales by hour heatmap
- Category performance
- Item profitability analysis
- Weekday vs weekend comparison
- Cost of Goods Sold tracking
- Food cost percentage

All formulas documented in `FORMULAS.txt`!

## 🌍 Iraqi Restaurant Context

This system is designed for the Iraqi market:
- **Currency:** Iraqi Dinar (IQD) with no decimal display
- **Weekend:** Friday-Saturday (not Saturday-Sunday)
- **Peak Hours:** Lunch 12-2pm, Dinner 7-9pm
- **Payment:** Cash-only (no card processing needed)
- **Cuisine:** Middle Eastern / Iraqi menu items
- **Language:** English UI (Arabic can be added later)

## 🔒 Security & Best Practices

- Passwords hashed with bcrypt
- Session-based authentication
- Role-based access control (Owner, Manager, Staff)
- SQL injection protection (Prisma)
- Input validation with Zod
- Environment variables for sensitive data
- CSRF protection (Next.js built-in)

## 🚧 Current Status

**✅ Completed:**
- Database schema and models
- Seed data with realistic scenarios
- Formula documentation
- Project foundation (Next.js, Tailwind, Prisma)

**🚧 In Progress:**
- Database seed running (90 days of sales data)

**📋 TODO:**
- Authentication setup (NextAuth)
- Dashboard implementation
- Inventory Management (CRUD)
- Menu Management (CRUD + recipes)
- **Order Entry System** (CRITICAL!)
- Analytics page
- Public menu page
- Settings page
- AI integration

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed roadmap.

## 🤝 Contributing

This is a private project, but contributions are welcome!

1. Fork the repository
2. Create your feature branch
3. Implement with tests
4. Ensure all formulas match `FORMULAS.txt`
5. Submit a pull request

## 📄 License

Proprietary - All rights reserved

## 🆘 Support

For questions or issues:
1. Check [PROJECT_STATUS.md](./PROJECT_STATUS.md) for implementation guidance
2. Refer to [FORMULAS.txt](./FORMULAS.txt) for calculation questions
3. Review [prisma/schema.prisma](./prisma/schema.prisma) for data model questions

## 🎯 Next Steps

1. **Wait for seed to complete** (running in background)
2. **Implement authentication** (Phase 1)
3. **Build dashboard** (Phase 2)
4. **Create inventory management** (Phase 3)
5. **Build menu management** (Phase 4)
6. **Implement order entry system** (Phase 5) ← MOST CRITICAL

Refer to PROJECT_STATUS.md for detailed implementation steps!

---

Built with ❤️ for Iraqi restaurants
