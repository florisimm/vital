import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline'
import { Extract } from 'unzip-stream'
import { createClient } from '@supabase/supabase-js'

const DATASETS = [
  {
    source: 'foundation',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip',
  },
  {
    source: 'sr_legacy',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
  },
]

const NUTRIENTS = {
  kcal: new Set(['1008', '2047', '2048']),
  protein: new Set(['1003']),
  fat: new Set(['1004']),
  carbs: new Set(['1005', '1050', '2039']),
}

const BATCH_SIZE = 1000
const root = join(process.cwd(), '.cache', 'fooddata-central')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, '').trim()
  }
}

function parseCsvLine(line) {
  const out = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      out.push(current)
      current = ''
    } else {
      current += char
    }
  }

  out.push(current)
  return out
}

async function* readCsv(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let headers = null

  for await (const line of rl) {
    const cells = parseCsvLine(line)
    if (!headers) {
      headers = cells
      continue
    }

    const row = {}
    for (let i = 0; i < headers.length; i += 1) row[headers[i]] = cells[i] ?? ''
    yield row
  }
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

async function downloadAndExtract(dataset) {
  const dir = join(root, dataset.source)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  console.log(`Downloading ${dataset.source}...`)
  const response = await fetch(dataset.url)
  if (!response.ok || !response.body) throw new Error(`Download failed for ${dataset.source}: ${response.status}`)

  await pipeline(response.body, Extract({ path: dir }))

  const [folder] = await readdir(dir)
  return join(dir, folder)
}

async function loadFoods(datasetDir, source) {
  const foods = new Map()
  for await (const row of readCsv(join(datasetDir, 'food.csv'))) {
    const fdcId = Number(row.fdc_id)
    if (!fdcId || !row.description) continue
    foods.set(fdcId, {
      fdc_id: fdcId,
      source,
      name: row.description,
      search_name: normalizeText(row.description),
      brand: null,
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      serving_label: null,
      serving_amount_g: null,
      publication_date: row.publication_date || null,
    })
  }
  return foods
}

async function loadNutrients(datasetDir, foods) {
  for await (const row of readCsv(join(datasetDir, 'food_nutrient.csv'))) {
    const fdcId = Number(row.fdc_id)
    const food = foods.get(fdcId)
    if (!food) continue

    const nutrientId = row.nutrient_id
    const amount = numberOrNull(row.amount)
    if (amount === null) continue

    if (NUTRIENTS.kcal.has(nutrientId) && food.kcal === null) food.kcal = amount
    else if (NUTRIENTS.protein.has(nutrientId)) food.protein = amount
    else if (NUTRIENTS.carbs.has(nutrientId) && food.carbs === null) food.carbs = amount
    else if (NUTRIENTS.fat.has(nutrientId)) food.fat = amount
  }
}

async function loadPortions(datasetDir, foods) {
  const portionPath = join(datasetDir, 'food_portion.csv')
  if (!existsSync(portionPath)) return

  for await (const row of readCsv(portionPath)) {
    const fdcId = Number(row.fdc_id)
    const food = foods.get(fdcId)
    if (!food || food.serving_amount_g) continue

    const grams = numberOrNull(row.gram_weight)
    if (!grams || grams <= 0) continue
    const amount = numberOrNull(row.amount)
    const label = row.portion_description || row.modifier || (amount ? `${amount} serving` : '1 serving')

    food.serving_label = label
    food.serving_amount_g = grams
  }
}

async function upsertFoods(supabase, foods) {
  const rows = [...foods.values()].filter(food => food.kcal !== null && food.name && food.search_name)
  let imported = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('food_index').upsert(batch, { onConflict: 'fdc_id' })
    if (error) throw error
    imported += batch.length
    console.log(`Imported ${imported}/${rows.length}`)
  }

  return rows.length
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  await mkdir(root, { recursive: true })
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let total = 0
  for (const dataset of DATASETS) {
    const datasetDir = await downloadAndExtract(dataset)
    console.log(`Parsing ${dataset.source} from ${basename(datasetDir)}...`)
    const foods = await loadFoods(datasetDir, dataset.source)
    await loadNutrients(datasetDir, foods)
    await loadPortions(datasetDir, foods)
    total += await upsertFoods(supabase, foods)
  }

  console.log(`Done. Imported ${total} foods into food_index.`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
