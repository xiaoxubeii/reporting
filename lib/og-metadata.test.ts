import { describe, expect, it } from 'vitest'
import { ogMetadata } from './og-metadata'

describe('ogMetadata', () => {
  it('supports a platform-specific origin and brand without changing legacy defaults', () => {
    const metadata = ogMetadata({
      title: 'FundWorkspace',
      description: 'Investment intelligence for the whole fund.',
      baseUrl: 'https://fundworkspace.example',
      siteName: 'FundWorkspace',
      brand: 'FundWorkspace',
      siteLabel: 'fundworkspace.example',
    })

    expect(metadata.openGraph).toMatchObject({ siteName: 'FundWorkspace' })
    const images = metadata.openGraph && 'images' in metadata.openGraph
      ? metadata.openGraph.images
      : null
    const image = Array.isArray(images) ? images[0] : images
    const imageUrl = typeof image === 'object' && image && 'url' in image
      ? String(image.url)
      : ''
    expect(imageUrl).toContain('https://fundworkspace.example/api/og?')
    expect(imageUrl).toContain('brand=FundWorkspace')
    expect(imageUrl).toContain('site=fundworkspace.example')
  })
})
