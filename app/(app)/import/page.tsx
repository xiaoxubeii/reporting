'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle2, AlertCircle, Upload, FileText, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AnalystToggleButton } from '@/components/analyst-button'
import { AnalystPanel } from '@/components/analyst-panel'
import { useFeatureVisibility } from '@/components/feature-visibility-context'

interface ImportResult {
  companiesCreated: number
  companiesMatched: number
  metricsCreated: number
  metricsMatched: number
  metricValuesCreated: number
  metricValuesSkipped: number
  sendersCreated: number
  errors: string[]
}

interface InvestmentImportResult {
  investmentsCreated: number
  proceedsCreated: number
  unrealizedCreated: number
  companiesMatched: number
  companiesCreated: number
  errors: string[]
}

interface CashFlowImportResult {
  created: number
  errors: string[]
}

interface FileMatch {
  file: File
  filename: string
  companyId: string | null
  companyName: string | null
  confidence: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: ImportUiError
  textOnly?: boolean
}

interface Company {
  id: string
  name: string
}

type ImportUiError =
  | string
  | { code: 'importFailed' | 'unexpected' | 'autoMatchingFailed' | 'fileTooLarge' | 'registrationFailed' | 'uploadFailed' | 'allUploadsFailed' }
  | { code: 'serverProcessingError'; status: number }
  | { code: 'serverResponseError'; status: number; detail: string }

class CatalogImportError extends Error {
  constructor(readonly uiError: ImportUiError) {
    super('Localized import error')
  }
}

const ACCEPTED_DOC_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.jpg,.jpeg,.png'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const TEXT_ONLY_THRESHOLD = 10 * 1024 * 1024 // 10 MB, files above this get text-only extraction

export default function ImportPage() {
  const t = useTranslations('Import')
  const fv = useFeatureVisibility()
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<ImportUiError | null>(null)

  // Document upload state
  const [docFiles, setDocFiles] = useState<FileMatch[]>([])
  const [matching, setMatching] = useState(false)
  const [uploadingAll, setUploadingAll] = useState(false)
  const [docError, setDocError] = useState<ImportUiError | null>(null)
  const [docSuccess, setDocSuccess] = useState<{ successCount: number; errorCount: number } | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [fundId, setFundId] = useState<string | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Investment import state
  const [investmentText, setInvestmentText] = useState('')
  const [investmentImporting, setInvestmentImporting] = useState(false)
  const [investmentResult, setInvestmentResult] = useState<InvestmentImportResult | null>(null)
  const [investmentError, setInvestmentError] = useState<ImportUiError | null>(null)

  // Fund cash flow import state
  const [cashFlowText, setCashFlowText] = useState('')
  const [cashFlowImporting, setCashFlowImporting] = useState(false)
  const [cashFlowResult, setCashFlowResult] = useState<CashFlowImportResult | null>(null)
  const [cashFlowError, setCashFlowError] = useState<ImportUiError | null>(null)

  function renderUiError(message: ImportUiError): string {
    if (typeof message === 'string') return message

    switch (message.code) {
      case 'importFailed':
        return t('errors.importFailed')
      case 'unexpected':
        return t('errors.unexpected')
      case 'autoMatchingFailed':
        return t('errors.autoMatchingFailed')
      case 'fileTooLarge':
        return t('errors.fileTooLarge')
      case 'registrationFailed':
        return t('errors.registrationFailed')
      case 'uploadFailed':
        return t('errors.uploadFailed')
      case 'allUploadsFailed':
        return t('errors.allUploadsFailed')
      case 'serverProcessingError':
        return t('errors.serverProcessingError', { status: message.status })
      case 'serverResponseError':
        return t('errors.serverResponseError', { status: message.status, detail: message.detail })
    }
  }

  // Load companies for the dropdown and get fund_id
  useEffect(() => {
    async function loadCompanies() {
      try {
        const res = await fetch('/api/companies')
        if (res.ok) {
          const data = await res.json()
          const list = data.companies ?? data ?? []
          setCompanies(list)
        }
      } catch { /* ignore */ }
    }
    async function loadFundId() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('fund_members')
          .select('fund_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle() as { data: { fund_id: string } | null }
        if (data) setFundId(data.fund_id)
      } catch { /* ignore */ }
    }
    loadCompanies()
    loadFundId()
  }, [])

  async function handleImport() {
    if (!text.trim()) return
    setImporting(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : { code: 'importFailed' })
        return
      }

      setResult(data)
    } catch {
      setError({ code: 'unexpected' })
    } finally {
      setImporting(false)
    }
  }

  async function handleDocFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setDocError(null)
    setDocSuccess(null)

    const fileList = Array.from(files)

    const initialMatches: FileMatch[] = fileList.map(f => ({
      file: f,
      filename: f.name,
      companyId: null,
      companyName: null,
      confidence: 'pending',
      status: 'pending',
    }))
    setDocFiles(initialMatches)

    // Auto-match using Claude
    setMatching(true)
    try {
      const res = await fetch('/api/import/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: fileList.map(f => f.name) }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.fundId) setFundId(data.fundId)
        const matchMap = new Map<string, { companyId: string | null; companyName: string | null; confidence: string }>()
        for (const m of data.matches ?? []) {
          matchMap.set(m.filename, { companyId: m.companyId, companyName: m.companyName, confidence: m.confidence })
        }

        setDocFiles(prev => prev.map(f => {
          const match = matchMap.get(f.filename)
          if (match) {
            return { ...f, companyId: match.companyId, companyName: match.companyName, confidence: match.confidence }
          }
          return f
        }))
      } else {
        const data = await res.json()
        setDocError(typeof data.error === 'string' ? data.error : { code: 'autoMatchingFailed' })
      }
    } catch {
      setDocError({ code: 'autoMatchingFailed' })
    } finally {
      setMatching(false)
    }

    // Reset input
    if (docInputRef.current) docInputRef.current.value = ''
  }

  function updateFileCompany(filename: string, companyId: string) {
    const company = companies.find(c => c.id === companyId)
    setDocFiles(prev => prev.map(f =>
      f.filename === filename
        ? { ...f, companyId, companyName: company?.name ?? null, confidence: 'manual' }
        : f
    ))
  }

  async function handleUploadAll() {
    const filesToUpload = docFiles.filter(f => f.companyId && f.status !== 'done')
    if (filesToUpload.length === 0) return

    setUploadingAll(true)
    setDocError(null)
    setDocSuccess(null)

    const supabase = createClient()
    let successCount = 0
    let errorCount = 0

    for (const fileMatch of filesToUpload) {
      setDocFiles(prev => prev.map(f =>
        f.filename === fileMatch.filename ? { ...f, status: 'uploading' } : f
      ))

      try {
        if (fileMatch.file.size > MAX_FILE_SIZE) {
          throw new CatalogImportError({ code: 'fileTooLarge' })
        }
        const isOversized = fileMatch.file.size > TEXT_ONLY_THRESHOLD
        const storagePath = `${fundId}/${fileMatch.companyId}/${crypto.randomUUID()}-${fileMatch.filename}`

        // Upload to Storage
        const { error: uploadError } = await supabase
          .storage
          .from('company-documents')
          .upload(storagePath, fileMatch.file)

        if (uploadError) throw new CatalogImportError(uploadError.message)

        // Register via API
        const res = await fetch(`/api/companies/${fileMatch.companyId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath,
            filename: fileMatch.filename,
            fileType: fileMatch.file.type || `application/${fileMatch.filename.split('.').pop()}`,
            fileSize: fileMatch.file.size,
            ...(isOversized ? { textOnly: true } : {}),
          }),
        })

        if (!res.ok) {
          let errorMessage: ImportUiError = { code: 'registrationFailed' }
          try {
            const data = await res.json()
            if (typeof data.error === 'string') errorMessage = data.error
          } catch {
            errorMessage = { code: 'serverProcessingError', status: res.status }
          }
          throw new CatalogImportError(errorMessage)
        }

        let result: { textOnly?: boolean } = {}
        try {
          result = await res.json()
        } catch {
          // Non-JSON response — treat as success since status was ok
        }

        setDocFiles(prev => prev.map(f =>
          f.filename === fileMatch.filename
            ? { ...f, status: 'done', textOnly: isOversized && result.textOnly }
            : f
        ))
        successCount++
      } catch (err) {
        const message: ImportUiError = err instanceof CatalogImportError
          ? err.uiError
          : { code: 'uploadFailed' }
        setDocFiles(prev => prev.map(f =>
          f.filename === fileMatch.filename ? { ...f, status: 'error', error: message } : f
        ))
        errorCount++
      }
    }

    setUploadingAll(false)
    if (successCount > 0) {
      setDocSuccess({ successCount, errorCount })
    }
    if (errorCount > 0 && successCount === 0) {
      setDocError({ code: 'allUploadsFailed' })
    }
  }

  async function handleInvestmentImport() {
    if (!investmentText.trim()) return
    setInvestmentImporting(true)
    setInvestmentResult(null)
    setInvestmentError(null)

    try {
      const res = await fetch('/api/import/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: investmentText }),
      })

      const data = await res.json()
      if (!res.ok) {
        setInvestmentError(typeof data.error === 'string' ? data.error : { code: 'importFailed' })
        return
      }

      setInvestmentResult(data)
    } catch {
      setInvestmentError({ code: 'unexpected' })
    } finally {
      setInvestmentImporting(false)
    }
  }

  async function handleCashFlowImport() {
    if (!cashFlowText.trim()) return
    setCashFlowImporting(true)
    setCashFlowResult(null)
    setCashFlowError(null)

    try {
      const res = await fetch('/api/import/fund-cash-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cashFlowText }),
      })

      let data: CashFlowImportResult & { error?: string }
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        data = await res.json()
      } else {
        const text = await res.text()
        setCashFlowError({ code: 'serverResponseError', status: res.status, detail: text.slice(0, 200) })
        return
      }

      if (!res.ok) {
        setCashFlowError(typeof data.error === 'string' ? data.error : { code: 'importFailed' })
        return
      }

      setCashFlowResult(data)
    } catch {
      setCashFlowError({ code: 'unexpected' })
    } finally {
      setCashFlowImporting(false)
    }
  }

  const matchedCount = docFiles.filter(f => f.companyId).length
  const unmatchedCount = docFiles.filter(f => !f.companyId).length

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">{fv.imports === 'admin' && <Lock className="h-4 w-4 text-amber-500" />}{t('title')}</h1>
          <AnalystToggleButton />
        </div>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 max-w-3xl w-full">
      {/* Document Upload Section */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-2">{t('document.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('document.description')}
        </p>

        {docError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{renderUiError(docError)}</AlertDescription>
          </Alert>
        )}

        {docSuccess && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {docSuccess.errorCount > 0
                ? t('document.uploadSuccessWithFailures', docSuccess)
                : t('document.uploadSuccess', docSuccess)}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <input
              ref={docInputRef}
              type="file"
              multiple
              accept={ACCEPTED_DOC_TYPES}
              onChange={handleDocFilesSelected}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => docInputRef.current?.click()}
              disabled={matching || uploadingAll}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('document.selectFiles')}
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">{t('document.sizeHint')}</p>
          </div>

          {matching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('document.matching')}
            </div>
          )}

          {docFiles.length > 0 && !matching && (
            <>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">{t('document.filename')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('document.matchedCompany')}</th>
                      <th className="text-left px-3 py-2 font-medium w-20">{t('document.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docFiles.map((f, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{f.filename}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={f.companyId ?? 'unmatched'}
                            onValueChange={(val) => updateFileCompany(f.filename, val)}
                          >
                            <SelectTrigger className="h-8 text-xs w-48">
                              <SelectValue placeholder={t('document.selectCompany')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unmatched">
                                <span className="text-muted-foreground">{t('document.noMatch')}</span>
                              </SelectItem>
                              {companies.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {f.status === 'pending' && f.companyId && (
                            <span className="text-xs text-muted-foreground">{t('document.ready')}</span>
                          )}
                          {f.status === 'pending' && !f.companyId && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {f.status === 'uploading' && (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                              <span className="sr-only">{t('document.uploadingStatus')}</span>
                            </>
                          )}
                          {f.status === 'done' && !f.textOnly && (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                              <span className="sr-only">{t('document.uploadedStatus')}</span>
                            </>
                          )}
                          {f.status === 'done' && f.textOnly && (
                            <span className="text-xs text-amber-600" title={t('document.textOnlyTitle')}>{t('document.textOnly')}</span>
                          )}
                          {f.status === 'error' && (
                            <span className="text-xs text-destructive" title={f.error ? renderUiError(f.error) : undefined}>{t('document.failed')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {unmatchedCount > 0
                    ? t('document.matchedWithUnmatched', { matched: matchedCount, unmatched: unmatchedCount })
                    : t('document.matchedOnly', { matched: matchedCount })}
                </p>
                <Button
                  onClick={handleUploadAll}
                  disabled={uploadingAll || matchedCount === 0}
                >
                  {uploadingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {uploadingAll ? t('document.uploading') : t('document.uploadFiles', { count: matchedCount })}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Paste Data Section */}
      <div className="mt-12 pt-8 border-t">
        <h2 className="text-xl font-semibold tracking-tight mb-2">{t('metrics.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('metrics.description')}
        </p>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{renderUiError(error)}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t('common.importComplete')}</p>
                <ul className="text-sm space-y-0.5">
                  <li>{t('metrics.companiesCreated', { count: result.companiesCreated })}{result.companiesMatched > 0 ? `, ${t('metrics.matchedExisting', { count: result.companiesMatched })}` : ''}</li>
                  <li>{t('metrics.metricsCreated', { count: result.metricsCreated })}{result.metricsMatched > 0 ? `, ${t('metrics.matchedExisting', { count: result.metricsMatched })}` : ''}</li>
                  <li>{t('metrics.metricValuesImported', { count: result.metricValuesCreated })}{result.metricValuesSkipped > 0 ? `, ${t('metrics.metricValuesSkipped', { count: result.metricValuesSkipped })}` : ''}</li>
                  {result.sendersCreated > 0 && (
                    <li>{t('metrics.sendersAdded', { count: result.sendersCreated })}</li>
                  )}
                </ul>
                {result.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-destructive">{t('common.issues')}</p>
                    <ul className="text-sm text-destructive space-y-0.5">
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Textarea
            placeholder={t('metrics.placeholder')}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t('metrics.hint')}
            </p>
            <Button onClick={handleImport} disabled={importing || !text.trim()}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {importing ? t('common.importing') : t('metrics.importButton')}
            </Button>
          </div>
        </div>
      </div>

      {/* Investment Data Section */}
      <div className="mt-12 pt-8 border-t">
        <h2 className="text-xl font-semibold tracking-tight mb-2">{t('investments.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('investments.description')}
        </p>

        {investmentError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{renderUiError(investmentError)}</AlertDescription>
          </Alert>
        )}

        {investmentResult && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t('common.importComplete')}</p>
                <ul className="text-sm space-y-0.5">
                  {investmentResult.investmentsCreated > 0 && (
                    <li>{t('investments.transactionsCreated', { count: investmentResult.investmentsCreated })}</li>
                  )}
                  {investmentResult.proceedsCreated > 0 && (
                    <li>{t('investments.proceedsCreated', { count: investmentResult.proceedsCreated })}</li>
                  )}
                  {investmentResult.unrealizedCreated > 0 && (
                    <li>{t('investments.unrealizedCreated', { count: investmentResult.unrealizedCreated })}</li>
                  )}
                  <li>{t('investments.companiesMatched', { count: investmentResult.companiesMatched })}</li>
                  {investmentResult.companiesCreated > 0 && (
                    <li>{t('investments.companiesCreated', { count: investmentResult.companiesCreated })}</li>
                  )}
                </ul>
                {investmentResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-destructive">{t('common.issues')}</p>
                    <ul className="text-sm text-destructive space-y-0.5">
                      {investmentResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Textarea
            placeholder={t('investments.placeholder')}
            value={investmentText}
            onChange={e => setInvestmentText(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t('investments.hint')}
            </p>
            <Button onClick={handleInvestmentImport} disabled={investmentImporting || !investmentText.trim()}>
              {investmentImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {investmentImporting ? t('common.importing') : t('investments.importButton')}
            </Button>
          </div>
        </div>
      </div>

      {/* Fund Cash Flows Section */}
      <div className="mt-12 pt-8 border-t">
        <h2 className="text-xl font-semibold tracking-tight mb-2">{t('cashFlows.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('cashFlows.description')}
        </p>

        {cashFlowError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{renderUiError(cashFlowError)}</AlertDescription>
          </Alert>
        )}

        {cashFlowResult && (
          <Alert className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">{t('common.importComplete')}</p>
                <p className="text-sm">{t('cashFlows.created', { count: cashFlowResult.created })}</p>
                {cashFlowResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-destructive">{t('common.issues')}</p>
                    <ul className="text-sm text-destructive space-y-0.5">
                      {cashFlowResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Textarea
            placeholder={t('cashFlows.placeholder')}
            value={cashFlowText}
            onChange={e => setCashFlowText(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t('cashFlows.hint')}
            </p>
            <Button onClick={handleCashFlowImport} disabled={cashFlowImporting || !cashFlowText.trim()}>
              {cashFlowImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {cashFlowImporting ? t('common.importing') : t('cashFlows.importButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
    <AnalystPanel />
    </div>
    </div>
  )
}
