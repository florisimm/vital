// ═══════════════════════════════════════════════════════
//  Kern Widget Loader  |  Scriptable
//  Universeel — werkt voor elk Kern-account
//
//  Eerste keer: voer je e-mail + wachtwoord in via de dialoog
//  Daarna: automatisch inloggen via opgeslagen tokens
//
//  Widget parameter = naam van de widget (bijv. "widget-groot")
// ═══════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://pzuhodpxqofgzdawoydq.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dWhvZHB4cW9mZ3pkYXdveWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDA3NDYsImV4cCI6MjA5NDE3Njc0Nn0.OfftFeuxTneIrXC8cNtpH_S_0LuvykdqYqD0QJXNYys'

const KEYCHAIN_EMAIL    = 'kern_email'
const KEYCHAIN_PASSWORD = 'kern_password'
const KEYCHAIN_ACCESS   = 'kern_access_token'
const KEYCHAIN_REFRESH  = 'kern_refresh_token'
const KEYCHAIN_EXPIRES  = 'kern_expires_at'

const widgetName = (args.widgetParameter || 'widget-groot').trim()
const fm    = FileManager.local()
const cache = fm.joinPath(fm.libraryDirectory(), `kern-${widgetName}.cached.js`)

// ─── Credential setup ───────────────────────────────────

async function askCredentials(prefillEmail = '') {
  const a = new Alert()
  a.title = 'Inloggen bij Kern'
  a.message = 'Voer je Kern-accountgegevens in. Ze worden veilig opgeslagen.'
  a.addTextField('E-mailadres', prefillEmail)
  a.addSecureTextField('Wachtwoord', '')
  a.addAction('Inloggen')
  a.addCancelAction('Annuleren')
  const idx = await a.presentAlert()
  if (idx === -1) return null
  return { email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) }
}

function savedEmail()    { return Keychain.contains(KEYCHAIN_EMAIL)    ? Keychain.get(KEYCHAIN_EMAIL)    : null }
function savedPassword() { return Keychain.contains(KEYCHAIN_PASSWORD) ? Keychain.get(KEYCHAIN_PASSWORD) : null }

function clearSavedCredentials() {
  for (const k of [KEYCHAIN_EMAIL, KEYCHAIN_PASSWORD, KEYCHAIN_ACCESS, KEYCHAIN_REFRESH, KEYCHAIN_EXPIRES]) {
    if (Keychain.contains(k)) Keychain.remove(k)
  }
}

// ─── Auth ───────────────────────────────────────────────

async function authPost(path, body) {
  const r = new Request(SUPABASE_URL + path)
  r.method = 'POST'
  r.headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON }
  r.body = JSON.stringify(body)
  try { return JSON.parse(await r.loadString()) } catch { return {} }
}

function saveTokens(data) {
  Keychain.set(KEYCHAIN_ACCESS,  data.access_token)
  Keychain.set(KEYCHAIN_REFRESH, data.refresh_token)
  Keychain.set(KEYCHAIN_EXPIRES, String(Date.now() + (data.expires_in ?? 3600) * 1000))
}

async function loginWithPassword(email, password) {
  const d = await authPost('/auth/v1/token?grant_type=password', { email, password })
  if (!d.access_token) throw new Error(d.error_description || d.error || 'Inloggen mislukt')
  Keychain.set(KEYCHAIN_EMAIL,    email)
  Keychain.set(KEYCHAIN_PASSWORD, password)
  saveTokens(d)
  return d.access_token
}

async function getValidToken() {
  // Geldig cached token?
  if (Keychain.contains(KEYCHAIN_ACCESS)) {
    const exp = Number(Keychain.get(KEYCHAIN_EXPIRES) || '0')
    if (Date.now() < exp - 60_000) return Keychain.get(KEYCHAIN_ACCESS)
  }

  // Refresh proberen
  if (Keychain.contains(KEYCHAIN_REFRESH)) {
    const d = await authPost('/auth/v1/token?grant_type=refresh_token',
      { refresh_token: Keychain.get(KEYCHAIN_REFRESH) })
    if (d.access_token) { saveTokens(d); return d.access_token }
  }

  // Inloggen met opgeslagen credentials
  const email    = savedEmail()
  const password = savedPassword()
  if (email && password) {
    return await loginWithPassword(email, password)
  }

  return null  // Geen credentials beschikbaar
}

// ─── Helpers ────────────────────────────────────────────

function errorWidget(msg) {
  const w = new ListWidget()
  w.backgroundColor = new Color('#0D0D0D')
  const t = w.addText(String(msg).slice(0, 200))
  t.textColor = new Color('#FF4757')
  t.font = Font.systemFont(11)
  t.minimumScaleFactor = 0.5
  Script.setWidget(w)
  Script.complete()
}

function saveCache(code) {
  const tmp = cache + '.tmp'
  fm.writeString(tmp, code)
  if (fm.fileExists(cache)) fm.remove(cache)
  fm.move(tmp, cache)
}

// ─── Main ───────────────────────────────────────────────

let token = null

// Haal bestaand token op
token = await getValidToken()

// Geen token? Vraag om credentials (maximaal 2 pogingen)
if (!token && config.runsInApp) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const creds = await askCredentials(savedEmail() || '')
    if (!creds) break  // Gebruiker klikte Annuleren

    try {
      token = await loginWithPassword(creds.email, creds.password)
      break
    } catch (e) {
      const retry = new Alert()
      retry.title = 'Inloggen mislukt'
      retry.message = e.message
      retry.addAction('Opnieuw proberen')
      retry.addCancelAction('Annuleren')
      const r = await retry.presentAlert()
      if (r === -1) break
    }
  }
}

// Geen token en geen cache → fout tonen
if (!token) {
  if (fm.fileExists(cache)) {
    // Draai op cache als widget niet in-app is (bijv. vanuit widget-scherm)
    token = SUPABASE_ANON
  } else {
    errorWidget('Voeg de widget toe aan je beginscherm en open de Scriptable-app om in te loggen.')
    return
  }
}

// Haal widget-code op uit Supabase
let code = null
try {
  const r = new Request(
    `${SUPABASE_URL}/rest/v1/widget_scripts?select=code&name=eq.${encodeURIComponent(widgetName)}&limit=1`
  )
  r.headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
  r.timeoutInterval = 10
  const rows = JSON.parse(await r.loadString())
  code = rows[0]?.code
  if (!code) throw new Error(`Widget "${widgetName}" niet gevonden`)
  saveCache(code)
} catch (e) {
  if (fm.fileExists(cache)) {
    code = fm.readString(cache)
  } else {
    errorWidget('Ophalen mislukt:\n' + e.message)
    return
  }
}

// Voer widget-code uit
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
try {
  await new AsyncFunction('__KERN_TOKEN', code)(token)
} catch (e) {
  errorWidget('Widget fout:\n' + e.message)
}
