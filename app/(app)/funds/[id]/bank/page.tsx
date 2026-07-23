import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAccountingAccess } from '../../guard'
import { resolveVehicleParam } from '../resolve'
import { FundSubpageChrome } from '@/components/fund-subpage-chrome'
import { BankView } from '../../bank/view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Funds.pages.bank')
  return { title: t('title') }
}

export default async function BankPage({ params }: { params: { id: string } }) {
  const { fundId } = await requireAccountingAccess()
  const { vehicle, vehicleId } = await resolveVehicleParam(fundId, params.id)
  const t = await getTranslations('Funds.pages.bank')
  return (
    <div className="pt-4 md:pt-8 pb-8 w-full">
      <FundSubpageChrome
        title={t('title')}
        description={t('description')}
        vehicle={vehicle}
        vehicleId={vehicleId}
      >
        <BankView />
      </FundSubpageChrome>
    </div>
  )
}
