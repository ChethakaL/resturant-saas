import MediaLibraryClient from './MediaLibraryClient'

export default function MediaLibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Media Library</h1>
        <p className="text-sm text-slate-500">
          Upload, tag, reuse, and manage your restaurant photos in one place.
        </p>
      </div>
      <MediaLibraryClient />
    </div>
  )
}
