import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAccountingAccess } from '../../guard'
import { resolveVehicleParam } from '../resolve'
import { FundSubpageChrome } from '@/components/fund-subpage-chrome'
import { OpeningBalancesView } from '../../opening-balances/view'
import { SnapshotCutover } from '../../opening-balances/snapshot-cutover'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Funds.pages.openingBalances')
  return { title: t('title') }
}

export default async function OpeningBalancesPage({ params }: { params: { id: string } }) {
  const { fundId } = await requireAccountingAccess()
  const { vehicle, vehicleId } = await resolveVehicleParam(fundId, params.id)
  const t = await getTranslations('Funds.pages.openingBalances')
  return (
    <div className="pt-4 md:pt-8 pb-8 w-full">
      <FundSubpageChrome
        title={t('title')}
        description={t('description')}
        vehicle={vehicle}
        vehicleId={vehicleId}
      >
        {/* The bulk route in: copy an existing LP snapshot into every vehicle at once, rather
            than typing each LP's balance by hand below. Fund-wide, so it sits above the
            vehicle-scoped form. */}
        <div className="mb-8">
          <SnapshotCutover />
        </div>
        <OpeningBalancesView />
      </FundSubpageChrome>
    </div>
  )
}
