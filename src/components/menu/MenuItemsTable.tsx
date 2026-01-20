'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { Edit } from 'lucide-react'

export interface MenuItemWithMetrics {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price: number
  cost: number
  profit: number
  margin: number
  available: boolean
  category: {
    name: string
  }
}

function getMarginColor(margin: number) {
  if (margin >= 60) return 'text-green-600'
  if (margin >= 40) return 'text-amber-600'
  if (margin >= 20) return 'text-yellow-600'
  if (margin >= 0) return 'text-red-600'
  return 'text-red-700'
}

export default function MenuItemsTable({
  menuItems,
}: {
  menuItems: MenuItemWithMetrics[]
}) {
  const [items, setItems] = useState(menuItems)
  const [updatingIds, setUpdatingIds] = useState<string[]>([])
  const itemsRef = useRef(items)

  useEffect(() => {
    setItems(menuItems)
  }, [menuItems])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const toggleAvailability = useCallback(
    async (id: string) => {
      if (updatingIds.includes(id)) return

      const target = itemsRef.current.find((item) => item.id === id)
      if (!target) return

      setUpdatingIds((prev) => [...prev, id])

      try {
        const response = await fetch(`/api/menu/${id}/availability`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ available: !target.available }),
        })

        if (!response.ok) {
          throw new Error('Availability update failed')
        }

        const updated = await response.json()

        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, available: updated.available } : item
          )
        )
      } catch (error) {
        console.error('Failed to update availability', error)
      } finally {
        setUpdatingIds((prev) => prev.filter((itemId) => itemId !== id))
      }
    },
    [updatingIds]
  )

  return (
    <div className="overflow-x-auto">
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">
            No menu items found. Add your first menu item to get started.
          </p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Image
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Item Name
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Category
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Price
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Cost
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Profit
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Margin
              </th>
              <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Status
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isUpdating = updatingIds.includes(item.id)
              return (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-3 px-4">
                    <div className="h-12 w-16 overflow-hidden rounded-md bg-slate-100">
                      <img
                        src={
                          item.imageUrl ||
                          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
                        }
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    {item.description && (
                      <div className="text-sm text-slate-500 line-clamp-1">
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {item.category.name}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium">
                    {formatCurrency(item.price)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {formatCurrency(item.cost)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-green-600 font-medium">
                    {formatCurrency(item.profit)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold ${getMarginColor(
                      item.margin
                    )}`}
                  >
                    {formatPercentage(item.margin)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => toggleAvailability(item.id)}
                      className={`inline-flex items-center justify-center min-w-[120px] rounded-full px-3 py-1 text-xs font-semibold transition ${
                        item.available
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                      } ${isUpdating ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {isUpdating
                        ? 'Saving...'
                        : item.available
                        ? 'Available'
                        : 'Sold Out'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link href={`/dashboard/menu/${item.id}`}>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
