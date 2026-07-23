import { randomBytes } from 'crypto'
import { createTranslator } from 'next-intl'
import { type NextRequest } from 'next/server'
import { loadMessages } from '@/i18n/messages'
import { LOCALE_COOKIE_NAME, resolveLocale, type Locale } from '@/i18n/locales'

export const dynamic = 'force-dynamic'

interface ExpertResponseCopy {
  locale: Locale
  metadataTitle: string
  heading: string
  loadingInvitation: string
  question: string
  context: string
  yourResponse: string
  submitResponse: string
  invalidInvitation: string
  alreadySubmitted: string
  invitedByPrefix: string
  answerPrompt: string
  deadlinePrefix: string
  requestFailed: string
  enterResponse: string
  submitted: string
  languageLabel: string
  english: string
  simplifiedChinese: string
  languageChangeError: string
}

export async function GET(request: NextRequest) {
  const locale = resolveLocale({
    cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get('accept-language'),
  })
  const messages = await loadMessages(locale)
  const t = createTranslator({ locale, messages, namespace: 'ExpertResponse' })
  const tLanguage = createTranslator({ locale, messages, namespace: 'Language' })
  const copy: ExpertResponseCopy = {
    locale,
    metadataTitle: t('metadataTitle'),
    heading: t('heading'),
    loadingInvitation: t('loadingInvitation'),
    question: t('question'),
    context: t('context'),
    yourResponse: t('yourResponse'),
    submitResponse: t('submitResponse'),
    invalidInvitation: t('invalidInvitation'),
    alreadySubmitted: t('alreadySubmitted'),
    invitedByPrefix: t('invitedByPrefix'),
    answerPrompt: t('answerPrompt'),
    deadlinePrefix: t('deadlinePrefix'),
    requestFailed: t('requestFailed'),
    enterResponse: t('enterResponse'),
    submitted: t('submitted'),
    languageLabel: tLanguage('label'),
    english: tLanguage('english'),
    simplifiedChinese: tLanguage('simplifiedChinese'),
    languageChangeError: tLanguage('changeError'),
  }
  const nonce = randomBytes(18).toString('base64')
  const html = renderPage(nonce, copy)
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Content-Security-Policy': `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'`,
    },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderPage(nonce: string, copy: ExpertResponseCopy): string {
  const inlineCopy = JSON.stringify(copy).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="${copy.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.metadataTitle)}</title>
<style nonce="${nonce}">:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#111827;color:#e5e7eb;font:16px/1.5 system-ui,sans-serif}.languages{display:flex;justify-content:flex-end;gap:6px;width:min(720px,calc(100% - 32px));margin:16px auto -32px}.languages button{margin:0;padding:7px 10px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;font-weight:600}.languages button[aria-pressed="true"]{border-color:#60a5fa;color:#93c5fd}.card{width:min(720px,calc(100% - 32px));margin:48px auto;padding:28px;border:1px solid #374151;border-radius:14px;background:#1f2937}h1{font-size:24px;margin:0 0 8px}.muted{color:#9ca3af}.box{padding:16px;margin:18px 0;background:#111827;border-radius:8px;white-space:pre-wrap}textarea{width:100%;min-height:220px;padding:14px;border:1px solid #4b5563;border-radius:8px;background:#111827;color:#fff;font:inherit}button{margin-top:12px;padding:11px 18px;border:0;border-radius:7px;background:#60a5fa;color:#08111f;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.error{color:#fca5a5}</style></head><body><nav class="languages" aria-label="${escapeHtml(copy.languageLabel)}"><button type="button" data-locale="en" aria-pressed="${copy.locale === 'en'}">${escapeHtml(copy.english)}</button><button type="button" data-locale="zh-CN" aria-pressed="${copy.locale === 'zh-CN'}">${escapeHtml(copy.simplifiedChinese)}</button></nav><main class="card"><h1>${escapeHtml(copy.heading)}</h1><p id="status" class="muted">${escapeHtml(copy.loadingInvitation)}</p><section id="content" hidden><p id="party"></p><p class="muted" id="deadline"></p><h2>${escapeHtml(copy.question)}</h2><div class="box" id="question"></div><h2>${escapeHtml(copy.context)}</h2><div class="box" id="context"></div><p class="muted" id="instructions"></p><label for="answer"><strong>${escapeHtml(copy.yourResponse)}</strong></label><textarea id="answer" maxlength="50000"></textarea><button id="submit" type="button">${escapeHtml(copy.submitResponse)}</button></section></main>
<script nonce="${nonce}">(()=>{'use strict';const copy=${inlineCopy};const hash=location.hash;history.replaceState(null,'',location.pathname+location.search);const params=new URLSearchParams(hash.startsWith('#')?hash.slice(1):hash);const token=params.get('token');const status=document.getElementById('status');const content=document.getElementById('content');const setText=(id,value)=>{document.getElementById(id).textContent=value||''};document.querySelectorAll('[data-locale]').forEach(button=>button.addEventListener('click',async()=>{const locale=button.dataset.locale;if(locale===copy.locale)return;button.disabled=true;try{const response=await fetch('/api/locale',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale}),cache:'no-store',credentials:'same-origin',redirect:'error'});if(!response.ok)throw new Error(copy.languageChangeError);const result=await response.json();if(!result||result.locale!==locale)throw new Error(copy.languageChangeError);if(token)location.hash='token='+encodeURIComponent(token);location.reload()}catch{status.textContent=copy.languageChangeError;status.className='error';button.disabled=false}}));if(!token){status.textContent=copy.invalidInvitation;status.className='error';return}const post=async(path,body,errorMessage)=>{let r;try{r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit'})}catch{throw new Error(errorMessage)}const j=await r.json();if(!r.ok)throw new Error(errorMessage);return j};post('/api/public/expert-response/resolve',{token},copy.invalidInvitation).then(({invitation:i})=>{if(i.submittedAt){status.textContent=copy.alreadySubmitted;return}status.textContent=copy.invitedByPrefix+i.invitationParty;setText('party',copy.answerPrompt);setText('deadline',copy.deadlinePrefix+new Intl.DateTimeFormat(copy.locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(i.deadline)));setText('question',i.question);setText('context',i.contextSnapshot);setText('instructions',i.responseInstructions);content.hidden=false}).catch(e=>{status.textContent=e&&typeof e.message==='string'?e.message:copy.requestFailed;status.className='error'});document.getElementById('submit').addEventListener('click',async()=>{const answer=document.getElementById('answer');const button=document.getElementById('submit');if(!answer.value.trim()){status.textContent=copy.enterResponse;status.className='error';return}button.disabled=true;try{await post('/api/public/expert-response/submit',{token,response_markdown:answer.value},copy.requestFailed);answer.value='';answer.disabled=true;content.hidden=true;status.textContent=copy.submitted;status.className='muted'}catch(e){status.textContent=e&&typeof e.message==='string'?e.message:copy.requestFailed;status.className='error';button.disabled=false}})})();</script></body></html>`
}
