'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, MapPin, Building2, UserPlus, Users, QrCode } from 'lucide-react'
import { TableQRModal } from '@/components/tables/TableQRModal'
import { formatCurrency } from '@/lib/utils'
import AddBranchModal, { AddBranchFormData } from '@/components/branches/AddBranchModal'
import ManageWaitersModal from '@/components/waiters/ManageWaitersModal'
import { useI18n } from '@/lib/i18n'

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

export default function TablesClient({ menuBaseUrl = '' }: TablesClientProps) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string>('all')
    const [tables, setTables] = useState<TableData[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddBranch, setShowAddBranch] = useState(false)
    const [addingBranch, setAddingBranch] = useState(false)
    const [branchError, setBranchError] = useState('')
    const [waiters, setWaiters] = useState<Waiter[]>([])
    const [showManageWaiters, setShowManageWaiters] = useState(false)
    const [qrModalOpen, setQrModalOpen] = useState(false)
    const [qrTableNumber, setQrTableNumber] = useState<string | null>(null)

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
                setTables(data)
            }
        } catch { }
        finally { setLoading(false) }
    }, [selectedBranch])

    const fetchWaiters = useCallback(async () => {
        try {
            const res = await fetch('/api/employees?position=WAITER', { credentials: 'include' })
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

    const handleAddBranch = async (formData: AddBranchFormData) => {
        setBranchError('')
        setAddingBranch(true)
        try {
            const res = await fetch('/api/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    address: formData.address ?? null,
                    phone: formData.phone ?? null,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setBranchError(data.error || 'Failed to add branch')
                throw new Error(data.error)
            }
            setShowAddBranch(false)
            fetchBranches()
            setSelectedBranch(data.id)
        } catch (err) {
            if (err instanceof Error && err.message) return
            setBranchError('Failed to add branch')
        } finally {
            setAddingBranch(false)
        }
    }

    const stats = {
        total: tables.length,
        available: tables.filter((t) => t.status === 'AVAILABLE').length,
        occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
        reserved: tables.filter((t) => t.status === 'RESERVED').length,
    }

    const { t } = useI18n()

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t.tables_title}</h1>
                    <p className="text-slate-500 mt-1">{t.tables_subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Branch Dropdown */}
                    {branches.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                className="h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                    <Button variant="outline" size="sm" onClick={() => setShowAddBranch(true)}>
                        <MapPin className="h-4 w-4 mr-1" />
                        {branches.length === 0 ? t.tables_add_branch : t.tables_new_branch}
                    </Button>
                    <Button asChild>
                        <Link href="/tables/new">
                            <Plus className="mr-2 h-4 w-4" />
                            {t.tables_add_table}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Add Branch popup */}
            <AddBranchModal
                open={showAddBranch}
                onOpenChange={(open) => { setShowAddBranch(open); setBranchError('') }}
                onSubmit={handleAddBranch}
                loading={addingBranch}
                error={branchError || null}
            />

            {/* Manage Waiters popup */}
            <ManageWaitersModal
                open={showManageWaiters}
                onOpenChange={setShowManageWaiters}
                waiters={waiters}
                onRefresh={fetchWaiters}
            />

            {/* Manage Waiters card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-emerald-500" />
                        <CardTitle className="text-lg">{t.tables_waiters}</CardTitle>
                    </div>
                    <Button size="sm" onClick={() => setShowManageWaiters(true)}>
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
                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {tables.map((table) => {
                            const activeOrder = table.sales[0]
                            const orderTotal = activeOrder?.total || 0

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
                                    <Link href="/tables/new">
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t.tables_add_table}
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    )
}
