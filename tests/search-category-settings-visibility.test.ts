import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('Search category Settings visibility', () => {
  it('keeps the advanced capability while hiding it from the standard Settings page', () => {
    const page = source('app/(app)/settings/page.tsx')
    const component = source('components/settings/search-category-settings.tsx')
    const route = source('app/api/settings/search-categories/route.ts')

    expect(page).not.toContain('SearchCategorySettings')
    expect(page).not.toContain("t('sections.searchCategories')")
    expect(component).toContain('export function SearchCategorySettings')
    expect(route).toContain(".update({ search_category_config:")
  })
})
