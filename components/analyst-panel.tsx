'use client'

import { useState, useRef, useEffect, type DragEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Sparkles, Send, X, Save, Clock, Plus, Trash2, ArrowLeft, Paperclip } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAnalystContext, type AnalystDomain } from '@/components/analyst-context'
import { MobileDrawerPanel } from '@/components/mobile-drawer-panel'
import { AnalystProposals, type Proposal } from '@/components/analyst-proposals'
import { AnalystPendingActions, type StagedAction } from '@/components/analyst-pending-actions'
import {
  ASSISTANT_CONTEXT_MIME,
  prepareAnalystMessagesForRequest,
  type AnalystConversationMessage,
} from '@/lib/analyst/context-snapshot'

interface Scope {
  dealId: string | null
  companyId: string | null
  vehicle: string | null
  domain: AnalystDomain | null
}

export function AnalystPanel() {
  const locale = useLocale()
  const t = useTranslations('Analyst')
  const {
    open,
    close,
    messages,
    setMessages,
    activeContexts,
    removeContext,
    clearContexts,
    consumeDragContext,
    companyId,
    dealId,
    vehicle,
    domain,
    selectedModel,
    setSelectedModel,
    availableModels,
    conversationId,
    setConversationId,
    conversations,
    loadConversations,
    loadConversation,
    startNewConversation,
    deleteConversation,
    showHistory,
    setShowHistory,
    scopeRevision,
    getScopeRevision,
  } = useAnalystContext()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)
  // Drafted entries for a given assistant message, by its index in `messages`. Deliberately not
  // persisted with the conversation — a stale draft from a reloaded thread shouldn't be
  // applicable against books that have moved on since.
  const [proposals, setProposals] = useState<Record<number, Proposal[]>>({})
  const [stagedActions, setStagedActions] = useState<Record<number, StagedAction[]>>({})
  const [dragActive, setDragActive] = useState(false)
  // An attached source document (accounting scope only) — a capital-call notice, invoice, or wire
  // confirmation the Analyst drafts an entry from. It stays attached until removed, so follow-ups
  // ("now attribute it to Cranmore") still see it; the server re-extracts it each turn.
  const [doc, setDoc] = useState<{ name: string; format: string; base64: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  const fileReadIdRef = useRef(0)

  useEffect(() => {
    fileReadIdRef.current += 1
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    setInput('')
    setDoc(null)
    setError(null)
    setLoading(false)
    setSavingIdx(null)
    setProposals({})
    setStagedActions({})
    setDragActive(false)
  }, [scopeRevision])

  useEffect(() => () => requestControllerRef.current?.abort(), [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setError(null)
  }, [locale])

  // The thread was reset (new conversation, or a scope change cleared it) — the drafts that went
  // with those messages go too, since they're keyed by message index.
  useEffect(() => {
    if (messages.length === 0) {
      setProposals({})
      setStagedActions({})
    }
  }, [messages.length])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading, error])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fileReadId = fileReadIdRef.current + 1
    fileReadIdRef.current = fileReadId
    const fileScopeRevision = getScopeRevision()
    setError(null)
    const format = file.name.split('.').pop()?.toLowerCase() ?? ''
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (fileReadIdRef.current !== fileReadId || getScopeRevision() !== fileScopeRevision) return
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      setDoc({ name: file.name, format, base64: btoa(binary) })
    } catch {
      if (fileReadIdRef.current !== fileReadId || getScopeRevision() !== fileScopeRevision) return
      setError(t('errors.readFile'))
    }
  }

  async function handleSend() {
    // With a document attached, "record this" is implied — no typing required.
    if ((!input.trim() && !doc) || loading) return
    const userMessage = {
      role: 'user' as const,
      content: input.trim() || t('documentDraftPrompt', {
        document: doc?.name ?? t('attachedDocument'),
      }),
      ...(activeContexts.length > 0 ? { contexts: activeContexts } : {}),
    }
    let newMessages: AnalystConversationMessage[]
    try {
      newMessages = [...prepareAnalystMessagesForRequest([...messages, userMessage])]
    } catch {
      setError(t('errors.messageTooLong'))
      return
    }
    setMessages(newMessages)
    setInput('')
    setError(null)
    setLoading(true)
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    const requestRevision = getScopeRevision()
    requestControllerRef.current = controller

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          messages: newMessages,
          companyId: companyId ?? undefined,
          dealId: dealId ?? undefined,
          vehicle: vehicle ?? undefined,
          domain: domain ?? undefined,
          document: doc ?? undefined,
          model: selectedModel ? { id: selectedModel.id, provider: selectedModel.provider } : undefined,
          conversationId: conversationId ?? undefined,
        }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (controller.signal.aborted || getScopeRevision() !== requestRevision) return
      if (!res.ok) {
        setMessages(messages)
        setInput(userMessage.content)
        setError(data.error ?? t('errors.requestFailed'))
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (Array.isArray(data.proposals) && data.proposals.length > 0) {
        setProposals(prev => ({ ...prev, [newMessages.length]: data.proposals }))
      }
      if (Array.isArray(data.stagedActions) && data.stagedActions.length > 0) {
        setStagedActions(prev => ({ ...prev, [newMessages.length]: data.stagedActions }))
      }
      // Capture conversationId from response
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId)
      }
    } catch (requestError) {
      if (controller.signal.aborted || getScopeRevision() !== requestRevision) return
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setMessages(messages)
      setInput(userMessage.content)
      setError(t('errors.network'))
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setLoading(false)
      }
    }
  }

  async function handleSaveAsSummary(idx: number) {
    const msg = messages[idx]
    if (!msg || msg.role !== 'assistant' || !companyId) return
    setSavingIdx(idx)
    try {
      const res = await fetch(`/api/companies/${companyId}/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_text: msg.content }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t('errors.saveSummary'))
      }
    } catch {
      setError(t('errors.saveSummary'))
    } finally {
      setSavingIdx(null)
    }
  }

  function handleShowHistory() {
    loadConversations()
    setShowHistory(true)
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return t('today')
    if (diffDays === 1) return t('yesterday')
    if (diffDays < 7) return t('daysAgo', { count: diffDays })
    return d.toLocaleDateString(locale)
  }

  const modelKey = selectedModel ? `${selectedModel.provider}:${selectedModel.id}` : 'auto'
  const inputValidationError = error === t('errors.messageTooLong')
  const scope: Scope = { dealId, companyId, vehicle, domain }
  const emptyStateText = scope.dealId
    ? t('empty.deal')
    : scope.companyId
      ? t('empty.company')
      : scope.vehicle
        ? t('empty.vehicle', { vehicle: scope.vehicle })
        : scope.domain === 'lps'
          ? t('empty.lps')
          : scope.domain === 'diligence'
            ? t('empty.diligence')
            : t('empty.portfolio')
  const inputPlaceholderText = scope.dealId
    ? t('placeholder.deal')
    : scope.companyId
      ? t('placeholder.company')
      : scope.vehicle
        ? t('placeholder.vehicle', { vehicle: scope.vehicle })
        : scope.domain === 'lps'
          ? t('placeholder.lps')
          : scope.domain === 'diligence'
            ? t('placeholder.diligence')
            : t('placeholder.portfolio')

  function hasContextToken(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes(ASSISTANT_CONTEXT_MIME)
  }

  function handleDragOver(event: DragEvent) {
    if (!hasContextToken(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDrop(event: DragEvent) {
    if (!hasContextToken(event)) return
    event.preventDefault()
    setDragActive(false)
    const result = consumeDragContext(event.dataTransfer.getData(ASSISTANT_CONTEXT_MIME))
    if (result === 'limit') setError(t('context.limit'))
  }

  return (
    <MobileDrawerPanel
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) close() }}
      desktopMode="docked"
      dialogTitle={t('title')}
      dialogDescription={t('storageNotice')}
      resizeLabel={t('resizePanel')}
    >
    <div
      data-testid="assistant-panel"
      className="flex h-full min-h-0 flex-col"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
      }}
      onDrop={handleDrop}
    >
    <div className={`flex min-h-0 flex-1 flex-col bg-card transition-colors ${dragActive ? 'ring-2 ring-inset ring-primary/30' : ''}`}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
            {t('title')}
          </h2>
          {availableModels.length > 0 && !showHistory && (
            <Select
              value={modelKey}
              onValueChange={(val) => {
                if (val === 'auto') {
                  setSelectedModel(null)
                } else {
                  const model = availableModels.find(m => `${m.provider}:${m.id}` === val)
                  if (model) setSelectedModel(model)
                }
              }}
            >
              <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('auto')}</SelectItem>
                {availableModels.map((m) => (
                  <SelectItem key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button
              onClick={handleShowHistory}
              title={t('conversationHistory')}
              aria-label={t('conversationHistory')}
              className="grid min-h-9 min-w-9 place-items-center rounded hover:bg-muted md:min-h-0 md:min-w-0 md:p-1"
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={startNewConversation}
              title={t('newConversation')}
              aria-label={t('newConversation')}
              className="grid min-h-9 min-w-9 place-items-center rounded hover:bg-muted md:min-h-0 md:min-w-0 md:p-1"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            <button onClick={close} aria-label={t('closePanel')} className="hidden min-h-9 min-w-9 place-items-center rounded hover:bg-muted xl:grid xl:min-h-0 xl:min-w-0 xl:p-1">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>

        {showHistory ? (
          /* History view */
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setShowHistory(false)}
                aria-label={t('backToConversation')}
                className="grid min-h-9 min-w-9 place-items-center rounded hover:bg-muted md:min-h-0 md:min-w-0 md:p-1"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <span className="text-xs font-medium text-muted-foreground">{t('conversationHistory')}</span>
            </div>
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('noPreviousConversations')}</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-start gap-2 rounded-md hover:bg-muted ${
                      conv.id === conversationId ? 'bg-muted' : ''
                    }`}
                  >
                    <button type="button" className="min-w-0 flex-1 px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => loadConversation(conv.id)}>
                      <p className="text-sm truncate">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t('messageCount', { count: conv.message_count })} &middot; {formatDate(conv.updated_at)}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteConversation(conv.id)}
                      className="m-1 grid min-h-9 min-w-9 place-items-center rounded opacity-100 hover:bg-destructive/10 focus:opacity-100 md:min-h-0 md:min-w-0 md:p-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label={t('deleteConversation')}
                      title={t('deleteConversation')}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
              {messages.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground">
                  {emptyStateText}
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">
                      {msg.role === 'user' ? t('you') : t('title')}
                    </span>
                  </div>
                  {msg.role === 'assistant' ? (
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-pre:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.contexts && msg.contexts.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1" aria-label={t('context.sentLabel')}>
                          {msg.contexts.map(context => (
                            <span key={`${context.kind}:${context.id}`} className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {context.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {msg.role === 'assistant' && proposals[i] && (
                    <AnalystProposals proposals={proposals[i]} vehicle={vehicle} />
                  )}
                  {msg.role === 'assistant' && stagedActions[i] && (
                    <AnalystPendingActions actions={stagedActions[i]} />
                  )}
                  {msg.role === 'assistant' && companyId && (
                    <button
                      onClick={() => handleSaveAsSummary(i)}
                      disabled={savingIdx === i}
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <Save className="h-3 w-3" />
                      {savingIdx === i ? t('saving') : t('saveAsSummary')}
                    </button>
                  )}
                </div>
              ))}
              {loading && (
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{t('title')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('thinking')}</p>
                </div>
              )}
              {error && (
                <p id="assistant-input-error" role="alert" className="text-xs text-destructive">{error}</p>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3">
              {dragActive && (
                <p className="mb-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-2 text-xs font-medium text-primary">
                  {t('context.dropToAdd')}
                </p>
              )}
              {activeContexts.length > 0 && (
                <div data-testid="assistant-active-contexts" className="mb-2" aria-label={t('context.activeLabel')}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('context.activeCount', { count: activeContexts.length })}
                    </span>
                    <button type="button" onClick={clearContexts} className="min-h-9 rounded px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground md:min-h-0 md:px-1">
                      {t('context.clear')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeContexts.map(context => (
                      <span key={`${context.kind}:${context.id}`} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-1 text-[11px]">
                        <span className="max-w-[230px] truncate" title={context.title}>{context.title}</span>
                        <button type="button" className="grid min-h-9 min-w-9 place-items-center rounded hover:bg-muted md:min-h-0 md:min-w-0" onClick={() => removeContext(context)} aria-label={t('context.remove', { title: context.title })}>
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Attaching a document only means something where entries can be drafted from it. */}
              {vehicle && (
                <div className="mb-2">
                  {doc ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded border bg-accent/50 px-2 py-1 text-[11px]">
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{doc.name}</span>
                      <button onClick={() => setDoc(null)} className="text-muted-foreground hover:text-foreground" aria-label={t('removeDocument')}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">
                      <Paperclip className="h-3 w-3" />
                      {t('attachDocument')}
                      <input type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.txt,.csv" onChange={handleFile} className="hidden" />
                    </label>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  aria-invalid={inputValidationError}
                  aria-describedby={inputValidationError ? 'assistant-input-error' : undefined}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={inputPlaceholderText}
                  rows={2}
                  className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={(!input.trim() && !doc) || loading}
                  aria-label={t('sendMessage')}
                  className="h-auto self-end px-2 py-2"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60 text-center mt-3 px-4 shrink-0">
        {t('storageNotice')}
      </p>
    </div>
    </MobileDrawerPanel>
  )
}
