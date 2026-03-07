import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  formatSalesPdfPeriod,
  getCurrentSalesPdfPeriod,
  getMonthlySalesPdfRecords,
  upsertMonthlySalesPdfRecord,
} from '@/lib/monthly-sales-pdf'
import {
  extractMonthlySalesFromPdf,
  type ImportedMonthlySalesData,
  getCurrentMonthlySalesImport,
  getMonthlySalesImports,
  hasCurrentMonthlySalesImport,
  mergeMonthlySalesImports,
  upsertMonthlySalesImport,
} from '@/lib/monthly-sales-import'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf']

function getS3Client() {
  const region = process.env.AWS_S3_REGION
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKey || !secretKey) {
    throw new Error('AWS S3 is not configured')
  }
  return new S3Client({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })

    const settings = (restaurant?.settings as Record<string, unknown>) || {}
    const currentPeriod = getCurrentSalesPdfPeriod()
    const uploads = getMonthlySalesPdfRecords(settings)
    const imports = getMonthlySalesImports(settings)
    const currentImport = getCurrentMonthlySalesImport(settings)

    return NextResponse.json({
      currentPeriod: {
        ...currentPeriod,
        label: formatSalesPdfPeriod(currentPeriod.year, currentPeriod.month),
      },
      active: hasCurrentMonthlySalesImport(settings),
      uploads: uploads.map((item) => ({
        ...item,
        periodLabel: formatSalesPdfPeriod(item.year, item.month),
      })),
      imports: imports.map((item) => ({
        year: item.year,
        month: item.month,
        sourceFileName: item.sourceFileName,
        importedAt: item.importedAt,
        periodLabel: formatSalesPdfPeriod(item.year, item.month),
        summary: item.summary,
        data: item,
      })),
      currentImportSummary: currentImport?.summary || null,
    })
  } catch (error) {
    console.error('Failed to fetch monthly sales PDF status:', error)
    return NextResponse.json({ error: 'Failed to fetch monthly sales PDF status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.restaurantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('report') as File | null
    const previewOnly = formData.get('previewOnly') === 'true'
    const editedDataRaw = formData.get('editedData')
    if ((!file || !(file instanceof File)) && !(typeof editedDataRaw === 'string' && editedDataRaw.trim())) {
      return NextResponse.json({ error: 'No file provided. Use form field "report".' }, { status: 400 })
    }
    if (file && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 })
    }
    if (file && file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 })
    }

    const fallbackPeriod = getCurrentSalesPdfPeriod()
    const year = Number(formData.get('year') || fallbackPeriod.year)
    const month = Number(formData.get('month') || fallbackPeriod.month)
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month.' }, { status: 400 })
    }

    const importMode = formData.get('importMode') === 'append' ? 'append' : 'replace'
    const buffer = file ? Buffer.from(await file.arrayBuffer()) : null
    let parsedImport: ImportedMonthlySalesData
    if (typeof editedDataRaw === 'string' && editedDataRaw.trim()) {
      parsedImport = JSON.parse(editedDataRaw) as ImportedMonthlySalesData
      parsedImport = {
        ...parsedImport,
        year,
        month,
      }
    } else {
      parsedImport = await extractMonthlySalesFromPdf({
        fileName: file!.name,
        fileBase64: buffer!.toString('base64'),
        year,
        month,
      })
    }

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        preview: parsedImport,
      })
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { settings: true },
    })
    const currentSettings = (restaurant?.settings as Record<string, unknown>) || {}
    const existingImport = getMonthlySalesImports(currentSettings).find((item) => item.year === year && item.month === month) || null
    const importToSave = importMode === 'append' && existingImport
      ? mergeMonthlySalesImports(existingImport, parsedImport)
      : parsedImport

    let withPdfSettings = currentSettings
    let uploadedFileName = parsedImport.sourceFileName
    if (file) {
      const bucket = process.env.AWS_S3_BUCKET_NAME
      if (!bucket) {
        return NextResponse.json({ error: 'AWS_S3_BUCKET_NAME is not set' }, { status: 500 })
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120)
      const storageKey = `monthly-sales-pdfs/${session.user.restaurantId}/${year}-${String(month).padStart(2, '0')}/${Date.now()}-${safeName}`

      const client = getS3Client()

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: buffer!,
          ContentType: file.type,
        })
      )

      withPdfSettings = upsertMonthlySalesPdfRecord(currentSettings, {
        year,
        month,
        fileName: file.name,
        storageKey,
        uploadedAt: new Date().toISOString(),
      })
      uploadedFileName = file.name
    }

    const nextSettings = upsertMonthlySalesImport(withPdfSettings, importToSave)

    await prisma.restaurant.update({
      where: { id: session.user.restaurantId },
      data: { settings: nextSettings },
    })

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/analytics')
    revalidatePath('/dashboard/profit-loss')
    revalidatePath('/dashboard/menu')
    revalidatePath('/')

    return NextResponse.json({
      success: true,
      activeForCurrentMonth:
        year === fallbackPeriod.year && month === fallbackPeriod.month,
      upload: {
        year,
        month,
        fileName: uploadedFileName,
        uploadedAt: new Date().toISOString(),
        periodLabel: formatSalesPdfPeriod(year, month),
      },
      extracted: {
        summary: importToSave.summary,
        topSellingItems: importToSave.topSellingItems.length,
        dailyRows: importToSave.dailySales.length,
      },
    })
  } catch (error) {
    console.error('Failed to upload monthly sales PDF:', error)
    return NextResponse.json(
      {
        error: 'Failed to upload monthly sales PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
