/**
 * POST /api/inventory/normalize-units
 *
 * Scans all inventory ingredients for non-standard units and returns a plan
 * (or applies the conversion when confirm=true).
 *
 * Body: { confirm?: boolean }
 * Response: { plan: ConversionPlanItem[], applied: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeConversion, isAllowedUnit, canonicalise } from '@/lib/unit-converter'

export interface ConversionPlanItem {
  id: string
  name: string
  oldUnit: string
  newUnit: string
  oldCostPerUnit: number
  newCostPerUnit: number
  canConvert: boolean
  /** Human-readable note for the user */
  note: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.restaurantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { confirm = false } = (await req.json().catch(() => ({}))) as { confirm?: boolean }

  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId: session.user.restaurantId },
    select: { id: true, name: true, unit: true, costPerUnit: true },
  })

  const plan: ConversionPlanItem[] = []

  for (const ing of ingredients) {
    const canonical = canonicalise(ing.unit)
    if (isAllowedUnit(canonical)) continue // already fine

    const conversion = computeConversion(ing.unit, ing.name)
    if (conversion) {
      const newCost = ing.costPerUnit * conversion.costFactor
      plan.push({
        id: ing.id,
        name: ing.name,
        oldUnit: ing.unit,
        newUnit: conversion.targetUnit,
        oldCostPerUnit: ing.costPerUnit,
        newCostPerUnit: Math.round(newCost * 100) / 100,
        canConvert: true,
        note: `${ing.unit} → ${conversion.targetUnit} (cost: ${ing.costPerUnit} → ${Math.round(newCost)} per ${conversion.targetUnit})`,
      })
    } else {
      plan.push({
        id: ing.id,
        name: ing.name,
        oldUnit: ing.unit,
        newUnit: 'g', // fallback suggestion
        oldCostPerUnit: ing.costPerUnit,
        newCostPerUnit: ing.costPerUnit,
        canConvert: false,
        note: `Unit "${ing.unit}" could not be auto-converted. Please update manually.`,
      })
    }
  }

  let applied = 0
  if (confirm) {
    for (const item of plan.filter((p) => p.canConvert)) {
      await prisma.ingredient.update({
        where: { id: item.id },
        data: { unit: item.newUnit, costPerUnit: item.newCostPerUnit },
      })
      applied++
    }
  }

  return NextResponse.json({ plan, applied })
}
