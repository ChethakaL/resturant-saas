export function getPrivateMediaAssetPreviewUrl(mediaAssetId: string) {
  return `/api/media-assets/${mediaAssetId}/image`
}

export function getPublicMediaAssetUrl(mediaAssetId: string) {
  return `/api/public/media-assets/${mediaAssetId}/image`
}
