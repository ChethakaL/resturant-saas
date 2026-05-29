'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Building2, Users, QrCode, Trash2, Loader2, HelpCircle } from 'lucide-react'
import { TableQRModal } from '@/components/tables/TableQRModal'
import { formatCurrency } from '@/lib/utils'
import ManageWaitersModal from '@/components/waiters/ManageWaitersModal'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/use-toast'

interface Branch {
    id: string
    name: string
    address?: string | null
    _count?: { tables: number; sales: number }
}

interface Waiter {
    id: string
    name: string
    email: string | null
    isActive: boolean
    branchId?: string | null
    branch?: { id: string; name: string } | null
}

interface TableData {
    id: string
    number: string
    capacity: number
    status: string
    branchId?: string | null
    sales: {
        id: string
        orderNumber: string
        total: number
        status: string
        waiter?: { name: string } | null
        items: { menuItem: { name: string } }[]
    }[]
}

function getStatusColor(status: string) {
    switch (status) {
        case 'AVAILABLE':
            return 'bg-green-100 text-green-800 border-green-300'
        case 'OCCUPIED':
            return 'bg-amber-100 text-amber-800 border-amber-300'
        case 'RESERVED':
            return 'bg-blue-100 text-blue-800 border-blue-300'
        case 'CLEANING':
            return 'bg-slate-100 text-slate-800 border-slate-300'
        default:
            return 'bg-slate-100 text-slate-800 border-slate-300'
    }
}

interface TablesClientProps {
    menuBaseUrl?: string
}

const tableNumberCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export default function TablesClient({ menuBaseUrl = '' }: TablesClientProps) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string>('all')
    const [tables, setTables] = useState<TableData[]>([])
    const [loading, setLoading] = useState(true)
    const [waiters, setWaiters] = useState<Waiter[]>([])
    const [showManageWaiters, setShowManageWaiters] = useState(false)
    const [qrModalOpen, setQrModalOpen] = useState(false)
    const [qrTableNumber, setQrTableNumber] = useState<string | null>(null)
    const [deletingTableId, setDeletingTableId] = useState<string | null>(null)
    const [deleteTableTarget, setDeleteTableTarget] = useState<TableData | null>(null)
    const [clearingTableId, setClearingTableId] = useState<string | null>(null)
    const { toast } = useToast()

    const fetchBranches = useCallback(async () => {
        try {
            const res = await fetch('/api/branches')
            if (res.ok) {
                const data = await res.json()
                setBranches(data)
            }
        } catch { }
    }, [])

    const fetchTables = useCallback(async () => {
        try {
            const url = selectedBranch && selectedBranch !== 'all'
                ? `/api/tables?branchId=${selectedBranch}`
                : '/api/tables'
            const res = await fetch(url)
            if (res.ok) {
                const data = await res.json()
                setTables([...data].sort((a, b) => tableNumberCollator.compare(a.number, b.number)))
            }
        } catch { }
        finally { setLoading(false) }
    }, [selectedBranch])

    const fetchWaiters = useCallback(async () => {
        try {
            const res = await fetch('/api/employees?position=WAITER&isActive=true', { credentials: 'include' })
            if (res.ok) {
                const data = await res.json()
                setWaiters(data)
            }
        } catch { }
    }, [])

    useEffect(() => {
        fetchBranches()
    }, [fetchBranches])

    useEffect(() => {
        fetchWaiters()
    }, [fetchWaiters])

    useEffect(() => {
        setLoading(true)
        fetchTables()
    }, [fetchTables])

    const stats = {
        total: tables.length,
        available: tables.filter((t) => t.status === 'AVAILABLE').length,
        occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
        reserved: tables.filter((t) => t.status === 'RESERVED').length,
    }

    const { t } = useI18n()

    const handleDeleteTable = async (table: TableData) => {
        setDeletingTableId(table.id)
        try {
            const res = await fetch(`/api/tables/${table.id}`, { method: 'DELETE' })
            const data = await res.json().catch(() => null)
            if (!res.ok) {
                toast({
                    title: 'Delete failed',
                    description: data?.error || 'Failed to delete table',
                    variant: 'destructive',
                })
                return
            }

            setTables((prev) => prev.filter((t) => t.id !== table.id))
            toast({
                title: 'Table deleted',
                description: `Table ${table.number} has been removed.`,
            })
        } catch {
            toast({
                title: 'Delete failed',
                description: 'Failed to delete table',
                variant: 'destructive',
            })
        } finally {
            setDeletingTableId(null)
            setDeleteTableTarget(null)
        }
    }

    const handleClearTable = async (table: TableData) => {
        setClearingTableId(table.id)
        try {
            const res = await fetch(`/api/tables/${table.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'AVAILABLE' }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) {
                toast({
                    title: 'Clear failed',
                    description: data?.error || 'Failed to clear table',
                    variant: 'destructive',
                })
                return
            }

            setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status: 'AVAILABLE' } : t)))
            void fetchTables()
            toast({
                title: 'Table cleared',
                description: `Table ${table.number} is now available.`,
            })
        } catch {
            toast({
                title: 'Clear failed',
                description: 'Failed to clear table',
                variant: 'destructive',
            })
        } finally {
            setClearingTableId(null)
        }
    }

    return (
        <div className="min-w-0 space-y-6">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="break-words text-3xl font-bold text-slate-900">{t.tables_title}</h1>
                    <p className="text-slate-500 mt-1">{t.tables_subtitle}</p>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:shrink-0 lg:items-center">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 lg:w-auto"
                        onClick={() => window.dispatchEvent(new Event('open-page-tour'))}
                        aria-label="Start interactive tour"
                    >
                        <HelpCircle className="h-4 w-4" />
                        Tour this page
                    </Button>
                    <div className="grid w-full grid-cols-1 gap-2 sm:contents lg:flex lg:w-auto lg:items-center lg:gap-3" data-tour="tables-header-actions">
                    {/* Branch Dropdown */}
                    {branches.length > 0 && (
                        <div className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-2" data-tour="tables-branch-filter">
                            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="all">{t.tables_all_branches}</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name} {b.address ? `(${b.address})` : ''}
                                    </option>
                                ))}
                                <option value="unassigned">{t.tables_unassigned}</option>
                            </select>
                        </div>
                    )}
                    <Button className="w-full lg:w-auto" asChild>
                        <Link href="/tables/new" data-tour="tables-add">
                            <Plus className="mr-2 h-4 w-4" />
                            {t.tables_add_table}
                        </Link>
                    </Button>
                    </div>
                </div>
            </div>

            {/* Manage Waiters popup */}
            <ManageWaitersModal
                open={showManageWaiters}
                onOpenChange={setShowManageWaiters}
                waiters={waiters}
                branches={branches}
                onRefresh={fetchWaiters}
            />

            {/* Manage Waiters card */}
            <Card data-tour="tables-waiters">
                <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-emerald-500" />
                        <CardTitle className="text-lg">{t.tables_waiters}</CardTitle>
                    </div>
                    <Button className="w-full sm:w-auto" size="sm" onClick={() => setShowManageWaiters(true)}>
                        <Users className="h-4 w-4 mr-1" />
                        {t.tables_manage_waiters ?? 'Manage Waiters'}
                    </Button>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-500">
                        {t.tables_waiters_description} {waiters.filter((w) => w.isActive).length > 0 && (
                            <span className="font-medium text-slate-700">
                                ({waiters.filter((w) => w.isActive).length} active)
                            </span>
                        )}
                    </p>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">{t.tables_total_tables}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600">{t.tables_available}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600">{t.tables_occupied}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{stats.occupied}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600">{t.tables_reserved}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{stats.reserved}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tables Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="text-slate-500">{t.tables_loading}</div>
                </div>
            ) : (
                <>
                    <TableQRModal
                        open={qrModalOpen}
                        onOpenChange={setQrModalOpen}
                        tableNumber={qrTableNumber ?? ''}
                        menuUrl={qrTableNumber ? `${menuBaseUrl}?table=${encodeURIComponent(qrTableNumber)}` : ''}
                    />
                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4" data-tour="tables-grid">
                        {tables.map((table) => {
                            const activeOrder = table.sales[0]
                            const orderTotal = activeOrder?.total || 0
                            const hasActiveOrder = Boolean(activeOrder)

                            return (
                                <div key={table.id} className="relative">
                                    <Link href={`/tables/${table.id}`}>
                                        <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 ${getStatusColor(table.status)}`}>
                                            <CardHeader className="pb-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <CardTitle className="text-lg">{t.tables_table_label} {table.number}</CardTitle>
                                                        <p className="text-sm text-slate-600 mt-1">{table.capacity} {t.tables_seats}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {menuBaseUrl && (
                                                            <button
                                                                type="button"
                                                                title="View QR code for table ordering"
                                                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    setQrTableNumber(table.number)
                                                                    setQrModalOpen(true)
                                                                }}
                                                            >
                                                                <QrCode className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {table.status === 'OCCUPIED' && (
                                                            <button
                                                                type="button"
                                                                title="Clear occupied table"
                                                                disabled={clearingTableId === table.id}
                                                                className="px-2 py-1 rounded-md bg-green-50 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:text-slate-300 disabled:bg-slate-50"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    void handleClearTable(table)
                                                                }}
                                                            >
                                                                {clearingTableId === table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Clear'}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            title={hasActiveOrder ? 'Cannot delete a table with active orders' : 'Delete table'}
                                                            disabled={deletingTableId === table.id || hasActiveOrder}
                                                            className="p-1.5 rounded-md hover:bg-slate-100 text-red-600 disabled:text-slate-300 disabled:hover:bg-transparent"
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                setDeleteTableTarget(table)
                                                            }}
                                                        >
                                                            {deletingTableId === table.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </button>
                                                        <span className="text-xs font-semibold px-2 py-1 rounded">
                                                            {table.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                        <CardContent>
                                            {activeOrder ? (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">{t.tables_order}:</span>
                                                        <span className="font-medium">{activeOrder.orderNumber}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">{t.tables_waiter}:</span>
                                                        <span className="font-medium">{activeOrder.waiter?.name || t.tables_na}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">{t.tables_total}:</span>
                                                        <span className="font-bold text-green-600">{formatCurrency(orderTotal)}</span>
                                                    </div>
                                                    <div className="mt-2 pt-2 border-t">
                                                        <span className={`text-xs px-2 py-1 rounded ${activeOrder.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                                            activeOrder.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' :
                                                                activeOrder.status === 'READY' ? 'bg-green-100 text-green-800' :
                                                                    'bg-slate-100 text-slate-800'
                                                            }`}>
                                                            {activeOrder.status === 'PENDING' ? t.tables_status_pending :
                                                                activeOrder.status === 'PREPARING' ? t.tables_status_preparing :
                                                                    activeOrder.status === 'READY' ? t.tables_status_ready :
                                                                        t.tables_status_completed}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center text-slate-400 py-4">
                                                    {t.tables_no_active_orders}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                    </Link>
                                </div>
                            )
                        })}
                    </div>

                    {tables.length === 0 && (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <p className="text-slate-500 mb-4">
                                    {selectedBranch !== 'all'
                                        ? t.tables_no_tables_branch
                                        : t.tables_no_tables}
                                </p>
                                <Button asChild>
                                    <Link href="/tables/new" data-tour="tables-add">
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t.tables_add_table}
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
            <Dialog open={Boolean(deleteTableTarget)} onOpenChange={(open) => !open && setDeleteTableTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete table {deleteTableTarget?.number}?</DialogTitle>
                        <DialogDescription>
                            This cannot be undone. If this table has printed QR codes, those QR codes will stop working and must be recreated for a new table.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDeleteTableTarget(null)} disabled={Boolean(deletingTableId)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => deleteTableTarget && void handleDeleteTable(deleteTableTarget)}
                            disabled={Boolean(deletingTableId)}
                        >
                            {deletingTableId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Delete table
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
