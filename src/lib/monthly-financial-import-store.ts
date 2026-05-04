import { prisma } from '@/lib/prisma'
import type { ImportedMonthlySalesData } from '@/lib/monthly-sales-import'

function toImportedShape(row: {
  year: number
  month: number
  sourceFileName: string
  restaurantName: string | null
  branchName: string | null
  reportType: string | null
  currency: string
  totalSales: number
  totalExpenses: number
  totalOrders: number
  avgOrderValue: number
  taxCollected: number
  discounts: number
  netSales: number
  details: unknown
  createdAt: Date
}): ImportedMonthlySalesData {
  const details = (row.details && typeof row.details === 'object' ? row.details : {}) as {
    topSellingItems?: ImportedMonthlySalesData['topSellingItems']
    expenseLines?: ImportedMonthlySalesData['expenseLines']
    dailySales?: ImportedMonthlySalesData['dailySales']
    weeklySales?: ImportedMonthlySalesData['weeklySales']
  }
  return {
    year: row.year,
    month: row.month,
    restaurantName: row.restaurantName,
    branchName: row.branchName,
    reportType: row.reportType,
    sourceFileName: row.sourceFileName,
    importedAt: row.createdAt.toISOString(),
    summary: {
      currency: row.currency,
      totalSales: row.totalSales,
      totalExpenses: row.totalExpenses,
      totalOrders: row.totalOrders,
      avgOrderValue: row.avgOrderValue,
      taxCollected: row.taxCollected,
      discounts: row.discounts,
      netSales: row.netSales,
    },
    topSellingItems: Array.isArray(details.topSellingItems) ? details.topSellingItems : [],
    expenseLines: Array.isArray(details.expenseLines) ? details.expenseLines : [],
    dailySales: Array.isArray(details.dailySales) ? details.dailySales : [],
    weeklySales: Array.isArray(details.weeklySales) ? details.weeklySales : [],
  }
}

export async function listMonthlyFinancialImports(restaurantId: string) {
  const rows = await prisma.monthlyFinancialImport.findMany({
    where: { restaurantId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(toImportedShape)
}

export async function getCurrentMonthlyFinancialImport(restaurantId: string, date = new Date()) {
  const row = await prisma.monthlyFinancialImport.findUnique({
    where: {
      restaurantId_year_month: {
        restaurantId,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      },
    },
  })
  return row ? toImportedShape(row) : null
}

export async function upsertMonthlyFinancialImport(
  restaurantId: string,
  data: ImportedMonthlySalesData
) {
  return prisma.monthlyFinancialImport.upsert({
    where: {
      restaurantId_year_month: {
        restaurantId,
        year: data.year,
        month: data.month,
      },
    },
    create: {
      restaurantId,
      year: data.year,
      month: data.month,
      sourceFileName: data.sourceFileName,
      restaurantName: data.restaurantName,
      branchName: data.branchName,
      reportType: data.reportType,
      currency: data.summary.currency,
      totalSales: data.summary.totalSales,
      totalExpenses: data.summary.totalExpenses,
      totalOrders: data.summary.totalOrders,
      avgOrderValue: data.summary.avgOrderValue,
      taxCollected: data.summary.taxCollected,
      discounts: data.summary.discounts,
      netSales: data.summary.netSales,
      details: {
        topSellingItems: data.topSellingItems,
        expenseLines: data.expenseLines || [],
        dailySales: data.dailySales,
        weeklySales: data.weeklySales,
      },
    },
    update: {
      sourceFileName: data.sourceFileName,
      restaurantName: data.restaurantName,
      branchName: data.branchName,
      reportType: data.reportType,
      currency: data.summary.currency,
      totalSales: data.summary.totalSales,
      totalExpenses: data.summary.totalExpenses,
      totalOrders: data.summary.totalOrders,
      avgOrderValue: data.summary.avgOrderValue,
      taxCollected: data.summary.taxCollected,
      discounts: data.summary.discounts,
      netSales: data.summary.netSales,
      details: {
        topSellingItems: data.topSellingItems,
        expenseLines: data.expenseLines || [],
        dailySales: data.dailySales,
        weeklySales: data.weeklySales,
      },
    },
  })
}
