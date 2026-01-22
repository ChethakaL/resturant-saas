'use client'

import { ChangeEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('Unable to read file'))
      }
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })

export default function ImageEnhancer() {
  const [preview, setPreview] = useState<string | null>(null)
  const [enhanced, setEnhanced] = useState<string | null>(null)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { toast } = useToast()

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setPreview(dataUrl)
      setEnhanced(null)
    } catch (error) {
      toast({
        title: 'File error',
        description: 'Unable to read the selected file.',
        variant: 'destructive',
      })
    }
  }

  const handleEnhance = async () => {
    if (!preview) {
      toast({
        title: 'Pick an image first',
        description: 'Choose a photo to let the AI enhance it.',
        variant: 'destructive',
      })
      return
    }

    setIsEnhancing(true)
    try {
      const response = await fetch('/api/menu/enhance-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: preview,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Image enhancement failed')
      }

      if (data?.imageUrl) {
        setEnhanced(data.imageUrl)
        toast({
          title: 'Enhanced image ready',
          description: 'Download or paste the URL when updating the menu item.',
        })
      } else {
        throw new Error('No image returned')
      }
    } catch (error) {
      toast({
        title: 'Enhancement failed',
        description:
          error instanceof Error
            ? error.message
            : 'Unable to enhance the photo right now.',
        variant: 'destructive',
      })
    } finally {
      setIsEnhancing(false)
    }
  }

  return (
    <Card className="border border-white/10 bg-slate-900/70">
      <CardHeader>
        <CardTitle className="text-lg text-white">Image Enhancer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-white/70">
          Upload a quick phone photo and let the AI polish it for your menu cards.
          Once the AI returns the enhanced shot, copy the download link into the menu item editor.
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1">
            <div className="h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-white/5">
              {preview ? (
                <img
                  src={preview}
                  alt="Selected preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.3em] text-white/60">
                  Original
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
              {enhanced ? (
                <img
                  src={enhanced}
                  alt="Enhanced preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.3em] text-white/60">
                  Enhanced
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Select food photo
          </Button>
          <Button
            onClick={handleEnhance}
            disabled={!preview || isEnhancing}
          >
            {isEnhancing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enhancing...
              </>
            ) : (
              'Enhance & download'
            )}
          </Button>
          {enhanced && (
            <Button variant="ghost" asChild>
              <a href={enhanced} target="_blank" rel="noreferrer">
                View/Download result
              </a>
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </CardContent>
    </Card>
  )
}
