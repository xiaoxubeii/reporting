'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import {
  AssistantDragRegistry,
  activeContextsFromMessages,
  addAssistantContext,
  removeAssistantContext,
  tryNormalizeStoredAnalystMessages,
  type AnalystConversationMessage,
  type AssistantContextSnapshot,
  type AssistantContextAddResult,
} from '@/lib/analyst/context-snapshot'

/** Domains the Analyst can be scoped to that have no id of their own (unlike a company or deal). */
export type AnalystDomain = 'lps' | 'diligence'

interface AnalystModel {
  id: string
  name: string
  provider: string
}

export interface ConversationListItem {
  id: string
  title: string
  company_id: string | null
  deal_id: string | null
  scope?: string | null
  read_only?: boolean
  message_count: number
  created_at: string
  updated_at: string
}

interface AnalystContextValue {
  open: boolean
  openPanel: () => void
  toggleOpen: () => void
  close: () => void
  messages: AnalystConversationMessage[]
  setMessages: React.Dispatch<React.SetStateAction<AnalystConversationMessage[]>>
  activeContexts: readonly AssistantContextSnapshot[]
  addContext: (snapshot: AssistantContextSnapshot) => AssistantContextAddResult
  removeContext: (snapshot: AssistantContextSnapshot) => void
  clearContexts: () => void
  registerDragContext: (snapshot: AssistantContextSnapshot) => string
  consumeDragContext: (token: string) => AssistantContextAddResult | 'invalid'
  revokeDragContext: (token: string) => void
  scopeRevision: number
  getScopeRevision: () => number
  companyId: string | null
  setCompanyId: (id: string | null) => void
  dealId: string | null
  setDealId: (id: string | null) => void
  /** Accounting scope (portfolio_group) — set by the funds pages, null everywhere else. The
   *  server decides whether the user may actually have accounting; this only says where they are. */
  vehicle: string | null
  setVehicle: (group: string | null) => void
  /** Which section the user is in, for domains with no id of their own. Same deal: this reports
   *  where they are, it doesn't assert what they may see. */
  domain: AnalystDomain | null
  setDomain: (domain: AnalystDomain | null) => void
  diligenceDealId: string | null
  diligenceProjectName: string | null
  setDiligenceProject: (project: { id: string; name: string } | null) => void
  selectedModel: AnalystModel | null
  setSelectedModel: (model: AnalystModel | null) => void
  availableModels: AnalystModel[]
  fundName: string
  hasAIKey: boolean
  conversationId: string | null
  setConversationId: (id: string | null) => void
  readOnlyHistory: boolean
  conversations: ConversationListItem[]
  loadConversations: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  startNewConversation: () => void
  deleteConversation: (id: string) => Promise<void>
  showHistory: boolean
  setShowHistory: (show: boolean) => void
}

const AnalystContext = createContext<AnalystContextValue | null>(null)

export function AnalystProvider({
  hasAIKey,
  configuredProviders,
  fundName,
  children,
}: {
  hasAIKey: boolean
  configuredProviders: string[]
  defaultAIProvider: string
  fundName: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AnalystConversationMessage[]>([])
  const [activeContexts, setActiveContexts] = useState<readonly AssistantContextSnapshot[]>(Object.freeze([]))
  const activeContextsRef = useRef<readonly AssistantContextSnapshot[]>(Object.freeze([]))
  const dragRegistry = useRef(new AssistantDragRegistry())
  const conversationLoadId = useRef(0)
  const [scopeRevision, setScopeRevision] = useState(0)
  const scopeRevisionRef = useRef(0)
  const [companyId, setCompanyIdState] = useState<string | null>(null)
  const companyIdRef = useRef<string | null>(null)
  const [dealId, setDealIdState] = useState<string | null>(null)
  const dealIdRef = useRef<string | null>(null)
  const [vehicle, setVehicleState] = useState<string | null>(null)
  const vehicleRef = useRef<string | null>(null)
  const [domain, setDomainState] = useState<AnalystDomain | null>(null)
  const domainRef = useRef<AnalystDomain | null>(null)
  const [diligenceDealId, setDiligenceDealId] = useState<string | null>(null)
  const diligenceDealIdRef = useRef<string | null>(null)
  const [diligenceProjectName, setDiligenceProjectName] = useState<string | null>(null)
  const diligenceProjectNameRef = useRef<string | null>(null)
  const [availableModels, setAvailableModels] = useState<AnalystModel[]>([])
  const [selectedModel, setSelectedModel] = useState<AnalystModel | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [readOnlyHistory, setReadOnlyHistory] = useState(false)
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const toggleOpen = useCallback(() => setOpen(prev => !prev), [])
  const openPanel = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  const addContext = useCallback((snapshot: AssistantContextSnapshot) => {
    try {
      const current = activeContextsRef.current
      const next = addAssistantContext(current, snapshot)
      if (next === current) return 'duplicate'
      activeContextsRef.current = next
      setActiveContexts(next)
      return 'added'
    } catch {
      return 'limit'
    }
  }, [])
  const removeContext = useCallback((snapshot: AssistantContextSnapshot) => {
    const next = removeAssistantContext(activeContextsRef.current, snapshot)
    activeContextsRef.current = next
    setActiveContexts(next)
  }, [])
  const clearContexts = useCallback(() => {
    const empty = Object.freeze([]) as readonly AssistantContextSnapshot[]
    activeContextsRef.current = empty
    setActiveContexts(empty)
  }, [])
  const registerDragContext = useCallback((snapshot: AssistantContextSnapshot) => (
    dragRegistry.current.issue(snapshot)
  ), [])
  const consumeDragContext = useCallback((token: string) => {
    const snapshot = dragRegistry.current.consume(token)
    if (!snapshot) return 'invalid'
    return addContext(snapshot)
  }, [addContext])
  const revokeDragContext = useCallback((token: string) => dragRegistry.current.revoke(token), [])

  const resetEphemeralConversationState = useCallback(() => {
    const empty = Object.freeze([]) as readonly AssistantContextSnapshot[]
    activeContextsRef.current = empty
    setActiveContexts(empty)
    dragRegistry.current.clear()
    conversationLoadId.current += 1
    scopeRevisionRef.current += 1
    setScopeRevision(scopeRevisionRef.current)
    setReadOnlyHistory(false)
  }, [])

  const getScopeRevision = useCallback(() => scopeRevisionRef.current, [])

  // Reset conversation state when companyId changes
  const setCompanyId = useCallback((id: string | null) => {
    if (companyIdRef.current === id) return
    companyIdRef.current = id
    setCompanyIdState(id)
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    setConversations([])
    resetEphemeralConversationState()
    // Switching to/from a company scope clears any deal scope.
    dealIdRef.current = null
    setDealIdState(null)
  }, [resetEphemeralConversationState])

  // Reset conversation state when dealId changes
  const setDealId = useCallback((id: string | null) => {
    if (dealIdRef.current === id) return
    dealIdRef.current = id
    setDealIdState(id)
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    setConversations([])
    resetEphemeralConversationState()
    // Switching into a deal scope clears any company scope.
    if (id) {
      companyIdRef.current = null
      setCompanyIdState(null)
    }
  }, [resetEphemeralConversationState])

  // Switching vehicles switches which books the Analyst is looking at, so the thread starts over.
  const setVehicle = useCallback((group: string | null) => {
    if (vehicleRef.current === group) return
    vehicleRef.current = group
    setVehicleState(group)
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    setConversations([])
    resetEphemeralConversationState()
  }, [resetEphemeralConversationState])

  // Likewise moving between domains — an LP thread and a diligence thread are different threads.
  const setDomain = useCallback((next: AnalystDomain | null) => {
    if (domainRef.current === next) return
    domainRef.current = next
    setDomainState(next)
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    setConversations([])
    resetEphemeralConversationState()
  }, [resetEphemeralConversationState])

  // A diligence project is one trusted scope unit. Keep its domain, project id, and display name
  // in one callback so consumers never observe a reset between three independent setters.
  const setDiligenceProject = useCallback((project: { id: string; name: string } | null) => {
    const nextId = project?.id ?? null
    const nextName = project?.name ?? null
    const nextDomain: AnalystDomain | null = project ? 'diligence' : null
    if (
      diligenceDealIdRef.current === nextId
      && diligenceProjectNameRef.current === nextName
      && domainRef.current === nextDomain
    ) return

    diligenceDealIdRef.current = nextId
    diligenceProjectNameRef.current = nextName
    domainRef.current = nextDomain
    setDiligenceDealId(nextId)
    setDiligenceProjectName(nextName)
    setDomainState(nextDomain)

    if (project) {
      // Diligence ids belong to diligence_deals, never analyst_conversations.deal_id (inbound_deals).
      companyIdRef.current = null
      dealIdRef.current = null
      vehicleRef.current = null
      setCompanyIdState(null)
      setDealIdState(null)
      setVehicleState(null)
    }

    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    setConversations([])
    resetEphemeralConversationState()
  }, [resetEphemeralConversationState])

  const conversationQueryParams = useCallback(() => {
    const params = new URLSearchParams()
    if (domain === 'diligence' && diligenceDealId) {
      params.set('portfolio', 'true')
      params.set('scope', `diligence:${diligenceDealId}`)
    } else if (dealId) {
      params.set('dealId', dealId)
    } else if (companyId) {
      params.set('companyId', companyId)
    } else {
      params.set('portfolio', 'true')
      // Mirrors the scope key the server stores (see /api/analyst). A user who turns out not to be
      // entitled to the domain simply has no threads under it.
      const scope = vehicle ? `accounting:${vehicle}` : domain
      if (scope) params.set('scope', scope)
    }
    return params
  }, [companyId, dealId, vehicle, domain, diligenceDealId])

  const loadConversations = useCallback(async () => {
    const requestId = conversationLoadId.current + 1
    conversationLoadId.current = requestId
    const params = conversationQueryParams()
    try {
      const res = await fetch(`/api/analyst/conversations?${params}`)
      if (res.ok && conversationLoadId.current === requestId) {
        const data = await res.json()
        if (conversationLoadId.current !== requestId) return
        setConversations(data.conversations ?? [])
      }
    } catch {
      // Silently fail
    }
  }, [conversationQueryParams])

  const loadConversation = useCallback(async (id: string) => {
    setMessages([])
    setConversationId(null)
    resetEphemeralConversationState()
    const requestId = conversationLoadId.current + 1
    conversationLoadId.current = requestId
    try {
      const params = conversationQueryParams()
      const res = await fetch(`/api/analyst/conversations/${id}?${params}`)
      if (res.ok && conversationLoadId.current === requestId) {
        const data = await res.json()
        if (conversationLoadId.current !== requestId) return
        const conv = data.conversation
        setConversationId(conv.read_only === true ? null : conv.id)
        setReadOnlyHistory(conv.read_only === true)
        const storedMessages = [...tryNormalizeStoredAnalystMessages(conv.messages)]
        setMessages(storedMessages)
        const restoredContexts = activeContextsFromMessages(storedMessages)
        activeContextsRef.current = restoredContexts
        setActiveContexts(restoredContexts)
        setShowHistory(false)
      }
    } catch {
      // Silently fail
    }
  }, [conversationQueryParams, resetEphemeralConversationState])

  const startNewConversation = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setShowHistory(false)
    resetEphemeralConversationState()
  }, [resetEphemeralConversationState])

  const deleteConversation = useCallback(async (id: string) => {
    if (id.startsWith('legacy-diligence:')) return
    try {
      const res = await fetch(`/api/analyst/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id))
        if (conversationId === id) {
          setMessages([])
          setConversationId(null)
          resetEphemeralConversationState()
        }
      }
    } catch {
      // Silently fail
    }
  }, [conversationId, resetEphemeralConversationState])

  // Fetch models lazily — only when the analyst panel is first opened
  const modelsFetched = useCallback(() => availableModels.length > 0, [availableModels])

  useEffect(() => {
    if (!open || !hasAIKey || modelsFetched()) return

    const fetchModels = async () => {
      const providerEndpoints: { provider: string; url: string }[] = [
        { provider: 'anthropic', url: '/api/claude-models' },
        { provider: 'openai', url: '/api/openai-models' },
        { provider: 'gemini', url: '/api/gemini-models' },
        { provider: 'ollama', url: '/api/ollama-models' },
      ].filter(p => configuredProviders.includes(p.provider))

      const results = await Promise.allSettled(
        providerEndpoints.map(p => fetch(p.url).then(r => r.json()))
      )

      const models: AnalystModel[] = []
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value.models)) {
          for (const m of res.value.models) {
            models.push({ id: m.id, name: m.name, provider: providerEndpoints[i].provider })
          }
        }
      })

      setAvailableModels(models)
    }

    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasAIKey])

  return (
    <AnalystContext.Provider value={{
      open,
      openPanel,
      toggleOpen,
      close,
      messages,
      setMessages,
      activeContexts,
      addContext,
      removeContext,
      clearContexts,
      registerDragContext,
      consumeDragContext,
      revokeDragContext,
      scopeRevision,
      getScopeRevision,
      companyId,
      setCompanyId,
      dealId,
      setDealId,
      vehicle,
      setVehicle,
      domain,
      setDomain,
      diligenceDealId,
      diligenceProjectName,
      setDiligenceProject,
      selectedModel,
      setSelectedModel,
      availableModels,
      fundName,
      hasAIKey,
      conversationId,
      setConversationId,
      readOnlyHistory,
      conversations,
      loadConversations,
      loadConversation,
      startNewConversation,
      deleteConversation,
      showHistory,
      setShowHistory,
    }}>
      {children}
    </AnalystContext.Provider>
  )
}

export function useAnalystContext() {
  const ctx = useContext(AnalystContext)
  if (!ctx) throw new Error('useAnalystContext must be used within AnalystProvider')
  return ctx
}

export function useOptionalAnalystContext() {
  return useContext(AnalystContext)
}
