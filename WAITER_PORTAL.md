# Waiter Portal Documentation

This document outlines the features and implementation of the new Waiter Portal.

## Overview
The Waiter Portal is a dedicated interface for restaurant staff to manage tables and orders from a tablet or mobile device. It is separate from the main administrative dashboard.

## Access
- **URL**: `/waiter/login`
- **Dashboard**: `/waiter/dashboard`

## Accounts
Authentication is handled via a custom provider. Currently, it supports a demo mode for the specific demo waiter account.

**Demo Credentials:**
- **Email**: `waiter@alrafidain.iq`
- **Password**: `waiter123`

## Features

### 1. Table Management
- **Visual Layout**: View all restaurant tables in a grid.
- **Status Indicators**:
  - 🟢 **Available**: Table is free.
  - 🔴 **Occupied**: Table has active orders.
  - 🟠 **Reserved**: Table is reserved (coming soon).
- **Seat Capacity**: Displays the number of seats for each table.

### 2. Order Management
- **Create Order**: Tap an available table to start a new order.
  - Browse menu by category.
  - Search for items.
  - Add items to cart with quantity adjustments.
  - Add customer name and notes.
- **Active Orders**: Tap an occupied table to view its current order(s).
  - View ordered items and total.
  - **Modify Order**: Remove items (if not yet completed) or add new items to an ongoing order.
  - **Update Status**: Move order through `Preparing` -> `Ready` -> `Delivered`.
  - **Cancel Order**: Cancel orders if needed.

### 3. "My Orders" Tab
- View a list of all active orders assigned to the logged-in waiter.
- Filter by status (Active, Delivered, All).

## Technical Implementation
- **Authentication**: Uses `next-auth` with a custom `waiter-credentials` provider.
- **API Routes**: Dedicated endpoints at `/api/waiter/*` to ensure separation of concerns and security.
- **Responsive Design**: optimized for iPad/Tablet dimensions but works on all devices.
- **State Management**: Real-time-like updates with periodic polling (every 30s) or manual refresh.

## Setup Instructions
1. Ensure the database is seeded (`npm run db:seed`).
2. The demo waiter account is automatically created when you attempt to log in for the first time.
