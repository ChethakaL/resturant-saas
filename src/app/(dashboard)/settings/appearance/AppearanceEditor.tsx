'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Code2,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  Monitor,
  MonitorSmartphone,
  Palette,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import {
  DEFAULT_MENU_DESIGN,
  MENU_TEMPLATE_MARKERS,
  designConfigToTheme,
  type MenuDesignConfig,
} from '@/lib/menu-design'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import CustomTemplateMenu from '@/components/customer/CustomTemplateMenu'
import SmartMenu from '@/components/customer/SmartMenu'
import { GoogleFontPicker } from '@/components/settings/GoogleFontPicker'

type PreviewItem = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  calories: number | null
  category: { id: string; name: string } | null
}

type Props = {
  restaurantName: string
  slug: string
  logo: string | null
  initialConfig: MenuDesignConfig
  initialPublishedConfig: MenuDesignConfig
  initialCustomHtml: string
  initialVersion: number
  initialPublishedAt: string | null
  menuItems: PreviewItem[]
  previewData?: any
}

const PRESETS: Array<{
  id: MenuDesignConfig['preset']
  label: string
  description: string
  config: Partial<MenuDesignConfig>
}> = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Familiar, clear and comfortable',
    config: { backgroundStyle: 'light', primaryColor: '#1c1c1e', accentColor: '#e8440a', cardStyle: 'comfortable', cornerStyle: 'soft' },
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Strong imagery and clean spacing',
    config: { backgroundStyle: 'light', primaryColor: '#12372a', accentColor: '#d45d2c', cardStyle: 'image-first', cornerStyle: 'rounded' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Quiet typography and compact rows',
    config: { backgroundStyle: 'light', primaryColor: '#242424', accentColor: '#356859', cardStyle: 'compact', cornerStyle: 'square' },
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High contrast for energetic brands',
    config: { backgroundStyle: 'dark', primaryColor: '#171717', accentColor: '#f0b429', chefPickColor: '#ef4444', cardStyle: 'image-first', cornerStyle: 'soft' },
  },
]

const SAMPLE_HTML = `<main class="menu-shell">
  <header class="menu-header">
    <p class="eyebrow">Our menu</p>
    <h1 data-iserve="restaurant-name"></h1>
  </header>
  <nav data-iserve="category-nav"></nav>
  <section data-iserve="featured-slider"></section>
  <section data-iserve="menu-items"></section>
  <aside data-iserve="cart"></aside>
</main>

<style>
  body { margin: 0; font-family: Arial, sans-serif; background: #fffaf5; color: #201510; }
  .menu-shell { max-width: 960px; margin: auto; padding: 32px 20px 120px; }
  .menu-header { padding: 32px 0; border-bottom: 2px solid #e8440a; }
  .eyebrow { color: #e8440a; font-weight: 700; text-transform: uppercase; }
  [data-iserve="category-nav"] { display: flex; gap: 8px; overflow: auto; padding: 20px 0; }
  .iserve-category { border: 1px solid #ddd; background: white; padding: 10px 14px; cursor: pointer; }
  .iserve-category.is-active { color: white; background: #e8440a; }
  .iserve-items { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .iserve-item { background: white; border: 1px solid #eadfd7; padding: 16px; }
  .iserve-item img { width: 100%; aspect-ratio: 4/3; object-fit: cover; }
  .iserve-add, .iserve-checkout { border: 0; background: #e8440a; color: white; padding: 10px 14px; cursor: pointer; }
  [data-iserve="cart"] { position: fixed; inset: auto 0 0; background: #201510; color: white; padding: 16px 24px; }
</style>`

export default function AppearanceEditor({
  restaurantName,
  slug,
  logo,
  initialConfig,
  initialPublishedConfig,
  initialCustomHtml,
  initialVersion,
  initialPublishedAt,
  menuItems,
  previewData,
}: Props) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [config, setConfig] = useState<MenuDesignConfig>({ ...DEFAULT_MENU_DESIGN, ...initialConfig })
  const [publishedConfig, setPublishedConfig] = useState<MenuDesignConfig>({ ...DEFAULT_MENU_DESIGN, ...initialPublishedConfig })
  const [customHtml, setCustomHtml] = useState(initialCustomHtml)
  const [version, setVersion] = useState(initialVersion)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [busyAction, setBusyAction] = useState<'draft' | 'publish' | 'reset' | null>(null)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [previewLoading, setPreviewLoading] = useState(true)

  useEffect(() => {
    setPreviewLoading(true)
  }, [config, previewMode, slug])

  const update = <K extends keyof MenuDesignConfig>(key: K, value: MenuDesignConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  const hasChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(publishedConfig) ||
      (config.mode === 'custom' && customHtml !== initialCustomHtml),
    [config, customHtml, initialCustomHtml, publishedConfig],
  )

  const missingMarkers = useMemo(
    () => MENU_TEMPLATE_MARKERS.filter((marker) =>
      !new RegExp(`data-iserve\\s*=\\s*["']${marker}["']`, 'i').test(customHtml),
    ),
    [customHtml],
  )

  const save = async (action: 'save-draft' | 'publish') => {
    setBusyAction(action === 'publish' ? 'publish' : 'draft')
    try {
      const response = await fetch('/api/settings/menu-design', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, config, customHtml: config.mode === 'custom' ? customHtml : null }),
      })
      const data = await response.json()
      if (!response.ok) {
        const detail = Array.isArray(data.details) ? data.details.join(' ') : ''
        throw new Error([data.error, detail].filter(Boolean).join(': '))
      }
      setVersion(data.version)
      setPublishedAt(data.publishedAt)
      if (action === 'publish') setPublishedConfig(config)
      toast({
        title: action === 'publish' ? 'Smart Menu published' : 'Draft saved',
        description: action === 'publish'
          ? `Version ${data.version} is now live.`
          : 'Your live menu was not changed.',
      })
    } catch (error) {
      toast({
        title: 'Could not save design',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusyAction(null)
    }
  }

  const reset = async () => {
    setBusyAction('reset')
    try {
      const response = await fetch('/api/settings/menu-design', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      if (!response.ok) throw new Error('Reset failed')
      setConfig({ ...DEFAULT_MENU_DESIGN })
      setCustomHtml('')
      toast({ title: 'Draft reset', description: 'The published menu is unchanged.' })
    } catch {
      toast({ title: 'Could not reset draft', variant: 'destructive' })
    } finally {
      setBusyAction(null)
    }
  }

  const uploadHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.html') || file.size > 200_000) {
      toast({ title: 'Choose an HTML file smaller than 200 KB', variant: 'destructive' })
      event.target.value = ''
      return
    }
    setCustomHtml(await file.text())
    update('mode', 'custom')
    event.target.value = ''
  }

  return (
    <div className="min-h-full bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="outline" size="icon" title="Back to Restaurant DNA">
              <Link href="/settings"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-slate-950">Smart Menu Appearance</h1>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">v{version}</span>
              </div>
              <p className="text-sm text-slate-500" suppressHydrationWarning>
                {hasChanges ? 'Unpublished changes' : publishedAt ? `Published ${new Date(publishedAt).toLocaleString()}` : 'Using Restaurant DNA settings'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <a href={`/${slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />View live
              </a>
            </Button>
            <Button variant="outline" onClick={() => save('save-draft')} disabled={busyAction !== null}>
              {busyAction === 'draft' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save draft
            </Button>
            <Button onClick={() => save('publish')} disabled={busyAction !== null || (config.mode === 'custom' && missingMarkers.length > 0)}>
              {busyAction === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Publish
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)]">
        <section className="border-r border-slate-200 bg-white p-5 xl:min-h-[calc(100vh-81px)] xl:overflow-y-auto">
          <div className="mb-5 grid grid-cols-2 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => update('mode', 'standard')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium ${config.mode === 'standard' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
              <Palette className="h-4 w-4" />Standard
            </button>
            <button
              type="button"
              onClick={() => update('mode', 'custom')}
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium ${config.mode === 'custom' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
            >
              <Code2 className="h-4 w-4" />Custom HTML
            </button>
          </div>

          {config.mode === 'standard' ? (
            <Tabs defaultValue="template">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="template">Template</TabsTrigger>
                <TabsTrigger value="style">Style</TabsTrigger>
                <TabsTrigger value="format">Format</TabsTrigger>
              </TabsList>

              <TabsContent value="template" className="space-y-3 pt-4">
                {PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => setConfig((current) => ({ ...current, ...preset.config, preset: preset.id }))}
                    className={`w-full border p-4 text-left transition-colors ${config.preset === preset.id ? 'border-slate-950 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}
                    style={{ borderRadius: 6 }}
                  >
                    <span className="flex items-start justify-between gap-4">
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{preset.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">{preset.description}</span>
                      </span>
                      <span className="flex gap-1">
                        <span className="h-5 w-5 border border-black/10" style={{ background: preset.config.primaryColor }} />
                        <span className="h-5 w-5 border border-black/10" style={{ background: preset.config.accentColor }} />
                      </span>
                    </span>
                  </button>
                ))}
              </TabsContent>

              <TabsContent value="style" className="space-y-5 pt-4">
                <ColorField label="Primary color" value={config.primaryColor} onChange={(value) => update('primaryColor', value)} />
                <ColorField label="Accent color" value={config.accentColor} onChange={(value) => update('accentColor', value)} />
                <ColorField label="Chef pick color" value={config.chefPickColor} onChange={(value) => update('chefPickColor', value)} />
                <ColorField label="Border color" value={config.borderColor} onChange={(value) => update('borderColor', value)} />
                <div className="space-y-2">
                  <Label>Background</Label>
                  <Segmented value={config.backgroundStyle} values={[
                    ['light', 'Light'], ['dark', 'Dark'], ['gradient', 'Soft'],
                  ]} onChange={(value) => update('backgroundStyle', value as MenuDesignConfig['backgroundStyle'])} />
                </div>
                <div className="space-y-2">
                  <Label>Menu font</Label>
                  <GoogleFontPicker value={config.fontFamily} onChange={(value) => update('fontFamily', value)} />
                </div>
                <div className="space-y-2">
                  <Label>Corner style</Label>
                  <Segmented value={config.cornerStyle} values={[
                    ['square', 'Square'], ['soft', 'Soft'], ['rounded', 'Rounded'],
                  ]} onChange={(value) => update('cornerStyle', value as MenuDesignConfig['cornerStyle'])} />
                </div>
              </TabsContent>

              <TabsContent value="format" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label>Menu layout</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ChoiceButton active={config.menuLayout === 'list'} onClick={() => update('menuLayout', 'list')} icon={List} label="List" />
                    <ChoiceButton active={config.menuLayout === 'grid'} onClick={() => update('menuLayout', 'grid')} icon={LayoutGrid} label="Grid" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Item format</Label>
                  <Segmented value={config.cardStyle} values={[
                    ['compact', 'Compact'], ['comfortable', 'Standard'], ['image-first', 'Visual'],
                  ]} onChange={(value) => update('cardStyle', value as MenuDesignConfig['cardStyle'])} />
                </div>
                <div className="space-y-2">
                  <Label>Featured items</Label>
                  <Segmented value={config.menuCarouselStyle} values={[
                    ['sliding', 'Slider'], ['static', 'Static'],
                  ]} onChange={(value) => update('menuCarouselStyle', value as MenuDesignConfig['menuCarouselStyle'])} />
                </div>
                <Toggle label="Show item images" checked={config.showItemImages} onChange={(value) => update('showItemImages', value)} />
                <Toggle label="Show descriptions" checked={config.showDescriptions} onChange={(value) => update('showDescriptions', value)} />
                <Toggle label="Show calories" checked={config.showCalories} onChange={(value) => update('showCalories', value)} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Developer template</h2>
                <p className="mt-1 text-sm text-slate-500">Upload one HTML file. iServe supplies all menu data and ordering behavior.</p>
              </div>
              <input ref={fileRef} type="file" accept=".html,text/html" className="hidden" onChange={uploadHtml} />
              <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />Upload HTML
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setCustomHtml(SAMPLE_HTML)}>
                Use starter template
              </Button>
              <textarea
                value={customHtml}
                onChange={(event) => setCustomHtml(event.target.value)}
                className="min-h-[360px] w-full resize-y rounded-md border border-slate-300 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100"
                spellCheck={false}
                placeholder={SAMPLE_HTML}
              />
              <div className={`border p-3 text-sm ${missingMarkers.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                {missingMarkers.length ? (
                  <>
                    <p className="font-medium">Required markers missing:</p>
                    <p className="mt-1 font-mono text-xs">{missingMarkers.map((marker) => `data-iserve="${marker}"`).join(', ')}</p>
                  </>
                ) : (
                  <p className="flex items-center gap-2 font-medium"><Check className="h-4 w-4" />All required markers are present</p>
                )}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    <Code2 className="h-4 w-4" />
                    <span>Open template coding guide</span>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                      <Code2 className="h-5 w-5 text-emerald-600" />
                      Custom HTML Template Coding Guide
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-500">
                      Learn how to write custom HTML templates for your menu. iServe injects dynamic live data using special <code className="bg-slate-100 px-1.5 py-0.5 rounded text-emerald-700 font-mono text-xs">data-iserve</code> attributes.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 pt-3 text-sm text-slate-700">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-slate-900 text-base">Required HTML Markers</h4>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                        <div className="p-3">
                          <code className="font-mono text-xs font-bold text-emerald-700">data-iserve="restaurant-name"</code>
                          <p className="mt-1 text-xs text-slate-600">Displays your restaurant name dynamically.</p>
                        </div>
                        <div className="p-3">
                          <code className="font-mono text-xs font-bold text-emerald-700">data-iserve="category-nav"</code>
                          <p className="mt-1 text-xs text-slate-600">Container for category navigation tabs. Active categories receive the <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[11px]">.is-active</code> CSS class.</p>
                        </div>
                        <div className="p-3">
                          <code className="font-mono text-xs font-bold text-emerald-700">data-iserve="featured-slider"</code>
                          <p className="mt-1 text-xs text-slate-600">Renders top chef recommendations and promotional hero carousels.</p>
                        </div>
                        <div className="p-3">
                          <code className="font-mono text-xs font-bold text-emerald-700">data-iserve="menu-items"</code>
                          <p className="mt-1 text-xs text-slate-600">Renders dishes grouped under their category headers with prices and images.</p>
                        </div>
                        <div className="p-3">
                          <code className="font-mono text-xs font-bold text-emerald-700">data-iserve="cart"</code>
                          <p className="mt-1 text-xs text-slate-600">Floating ordering cart button and slide-out checkout panel.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold text-slate-900 text-base">CSS Styling Variables</h4>
                      <p className="text-xs text-slate-600">Your custom HTML template can reference theme CSS variables that update automatically:</p>
                      <pre className="rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-emerald-400 overflow-x-auto">
{`:root {
  --primary-color: #1c1c1e;
  --accent-color: #e8440a;
  --font-family: 'DM Sans', sans-serif;
}`}
                      </pre>
                    </div>

                    <div className="flex items-center justify-between border-t pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCustomHtml(SAMPLE_HTML)
                        }}
                        className="text-xs"
                      >
                        Insert Starter Template
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className="mt-8 border-t border-slate-200 pt-5">
            <Button variant="outline" className="w-full" onClick={reset} disabled={busyAction !== null}>
              {busyAction === 'reset' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reset draft
            </Button>
          </div>
        </section>

        <section className="flex min-h-[760px] flex-col bg-slate-200/60 p-4 sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MonitorSmartphone className="h-4 w-4" />Live draft preview
            </div>
            <div className="flex items-center rounded-md bg-slate-300/70 p-1">
              <button
                type="button"
                onClick={() => setPreviewMode('desktop')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${previewMode === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                <Monitor className="h-3.5 w-3.5" />Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('mobile')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${previewMode === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                <MonitorSmartphone className="h-3.5 w-3.5" />Mobile
              </button>
            </div>
          </div>
          <div
            className={`relative mx-auto w-full overflow-hidden bg-slate-950 shadow-2xl ${previewMode === 'mobile' ? 'max-w-[430px] border-[8px] border-slate-900' : 'max-w-[1100px] border border-slate-300'}`}
            style={{ borderRadius: previewMode === 'mobile' ? 30 : 8 }}
          >
            <div className="h-[720px] overflow-y-auto bg-white">
              {config.mode === 'custom' ? (
                customHtml ? (
                  <CustomTemplateMenu
                    restaurantId="preview"
                    restaurantName={restaurantName}
                    restaurantLogo={logo}
                    menuItems={previewData?.menuItems || menuItems}
                    showcases={previewData?.showcases}
                    customHtml={customHtml}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">Upload HTML or use the starter template to preview it.</div>
                )
              ) : previewData ? (
                <SmartMenu
                  key={JSON.stringify(config)}
                  restaurantId={previewData.restaurant.id}
                  menuItems={previewData.menuItems}
                  initialLanguage={previewData.initialLanguage}
                  initialTranslationCache={previewData.initialTranslationCache}
                  showcases={previewData.showcases}
                  categories={previewData.categories}
                  theme={{ ...previewData.theme, ...designConfigToTheme(config) } as any}
                  restaurantName={restaurantName}
                  restaurantLogo={logo}
                  engineMode={previewData.engineMode}
                  bundles={previewData.bundles}
                  moods={previewData.moods}
                  upsellMap={previewData.upsellMap}
                  categoryOrder={previewData.categoryOrder}
                  menuTimezone={previewData.menuTimezone}
                  slotTimes={previewData.slotTimes}
                  categoryAnchorBundle={previewData.categoryAnchorBundle}
                  maxInitialItemsPerCategory={previewData.maxInitialItemsPerCategory}
                  tables={previewData.tables}
                  tableOrderingEnabled={previewData.tableOrderingEnabled}
                  smartSearchFeelingContext={previewData.smartSearchFeelingContext}
                  snowfallSettings={previewData.snowfallSettings}
                  forceShowImages={config.showItemImages}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
                  Loading the restaurant&apos;s real menu preview…
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer border border-slate-300 bg-white p-1" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className="font-mono" />
      </div>
    </div>
  )
}

function Segmented({ value, values, onChange }: { value: string; values: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="grid rounded-md bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)} className={`px-2 py-2 text-xs font-medium ${value === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>{label}</button>
      ))}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-slate-100 py-3 text-sm font-medium text-slate-800">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-slate-900" />
    </label>
  )
}

function ChoiceButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-20 flex-col items-center justify-center gap-2 border text-sm font-medium ${active ? 'border-slate-950 bg-slate-50 text-slate-950' : 'border-slate-200 text-slate-600'}`}>
      <Icon className="h-5 w-5" />{label}
    </button>
  )
}
