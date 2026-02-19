'use client'

import { useState } from 'react'

export interface SubGroupTab {
  id: string
  label: string
  itemIds: string[]
}

interface CategorySubGroupsProps {
  subGroups: SubGroupTab[]
  renderItems: (itemIds: string[]) => React.ReactNode
  defaultLabel?: string
}

export function CategorySubGroups({
  subGroups,
  renderItems,
  defaultLabel = 'All',
}: CategorySubGroupsProps) {
  const [activeId, setActiveId] = useState<string>(subGroups[0]?.id ?? 'default')
  const active = subGroups.find((g) => g.id === activeId) ?? subGroups[0]

  if (subGroups.length <= 1) {
    return <>{subGroups[0] ? renderItems(subGroups[0].itemIds) : null}</>
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-2 px-2 scrollbar-hide">
        {subGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveId(g.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeId === g.id ? 'bg-[var(--menu-accent,#f59e0b)] text-white' : 'bg-white/10 text-white/90 hover:bg-white/20'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      {active ? renderItems(active.itemIds) : null}
    </div>
  )
}
