'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Trash } from 'lucide-react'
import { Category } from '@prisma/client'

interface CategoriesManagerProps {
  initialCategories: Category[]
}

export default function CategoriesManager({ initialCategories }: CategoriesManagerProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const { toast } = useToast()

  const handleAddCategory = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          displayOrder: categories.length,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create category')
      }

      const data = await response.json()
      setCategories((prev) => [...prev, data])
      setName('')
      setDescription('')
      toast({ title: 'Category added' })
    } catch (error) {
      console.error('Add category failed', error)
      toast({
        title: 'Could not add category',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Remove this category?')) {
      return
    }

    setDeletingIds((prev) => [...prev, categoryId])

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete category')
      }

      setCategories((prev) => prev.filter((category) => category.id !== categoryId))
      toast({ title: 'Category removed', variant: 'destructive' })
    } catch (error) {
      console.error('Delete category failed', error)
      toast({
        title: 'Could not remove category',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== categoryId))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Category</CardTitle>
          <CardDescription>Give your menu a new section</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., Main Courses"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional grouping hint for your front-of-house team."
              />
            </div>
          </div>
          <Button onClick={handleAddCategory} disabled={loading} className="self-start">
            {loading ? 'Saving…' : 'Create category'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Categories</CardTitle>
          <CardDescription>Reorder your menu by adding and deleting rows</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No categories yet.</p>
          ) : (
            categories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white/5 p-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{category.name}</p>
                  {category.description && (
                    <p className="text-sm text-slate-500">{category.description}</p>
                  )}
                  <div className="flex gap-2 text-[11px] text-slate-500">
                    <Badge variant="secondary">{`Order ${index + 1}`}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                    disabled={deletingIds.includes(category.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
