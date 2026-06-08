# FoodClient Component-Extractie — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang alle inline type/config/fetcher/component-definities in `FoodClient.tsx` door imports vanuit de al bestaande modules zodat de geëxtraheerde componenten in `app/food/components/` daadwerkelijk actief worden.

**Architecture:** `FoodClient.tsx` krimpt tot uitsluitend page-level state, SWR-subscriptions en de root-render. Alle inline componenten worden vervangen door imports uit `app/food/components/`. Types komen uit `lib/types.ts`. Configuratie (MEAL_ORDER, enz.) komt uit `meal-config.ts`. Fetchers komen uit `fetchers.ts`.

**Tech Stack:** Next.js 15 App Router, SWR, TypeScript, Supabase, lucide-react

---

## Context — waarom dit nodig is

Na commit `4464c06` (refactor: split FoodClient) werden de componenten losgeknipt. De merge `add33d9` accepteerde de remote versie van `FoodClient.tsx` (monolithisch, pre-refactor), maar liet de nieuwe component-bestanden staan. Resultaat: alle `app/food/components/` bestanden zijn dode code.

De nieuwe componenten bevatten features die **nu ontbreken** in de live app:
- `/api/barcode-lookup` met Supabase-caching (nu: direct Open Food Facts)
- Server-side frequency sorting (nu: localStorage)
- Daily impact bars + Activity equivalents in ProductDetailView (nu: afwezig)
- Betere barcode foutmeldingen: `not_found` / `invalid` / `unreachable` (nu: één generieke melding)
- `cap()` — eerste letter hoofdletter van voedselnamen

---

## Bestandsoverzicht

| Bestand | Actie |
|---|---|
| `app/food/FoodClient.tsx` | **Herschrijven** — alle inline definities verwijderen |
| `app/food/components/AddFoodSheet.tsx` | Ongewijzigd — wordt actief via FoodClient import |
| `app/food/components/ProductDetailView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/components/MealSection.tsx` | Ongewijzigd — actief via FoodClient import |
| `app/food/components/MacroDrillSheet.tsx` | Ongewijzigd — actief via FoodClient import |
| `app/food/components/EditFoodSheet.tsx` | Ongewijzigd — actief via FoodClient import |
| `app/food/components/CustomFoodView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/components/CreateMealView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/components/MealConfirmView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/components/ScanResultView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/components/MealsListView.tsx` | Ongewijzigd — actief via AddFoodSheet |
| `app/food/fetchers.ts` | Ongewijzigd — wordt geïmporteerd door FoodClient |
| `app/food/meal-config.ts` | Ongewijzigd — wordt geïmporteerd door FoodClient |
| `lib/types.ts` | Ongewijzigd — wordt geïmporteerd door FoodClient |

---

## Props-analyse (wat FoodClient doorgeeft aan wie)

### `AddFoodSheet` (components/AddFoodSheet.tsx)
```
products:       Product[]
preselectedMeal: string
userId:         string
today:          string          ← selectedDate
totals:         { kcal, protein, carbs, fat: number }   ← NIEUW, was ontbrekend
targets:        Targets                                  ← NIEUW, was ontbrekend
onAdded:        (entry: FoodLogEntry) => void
onClose:        () => void
```

### `MacroDrillSheet` (components/MacroDrillSheet.tsx)
```
macro:   MacroKey           ← type uit meal-config.ts
log:     FoodLogEntry[]
onClose: () => void
```

### `EditFoodSheet` (components/EditFoodSheet.tsx)
```
entry:   FoodLogEntry
userId:  string
onSaved: (updated: FoodLogEntry) => void
onClose: () => void
```

### `MealSection` (components/MealSection.tsx)
```
meal:     string
icon:     string
label:    string
entries:  FoodLogEntry[]
onDelete: (id: string) => void
onEdit:   (entry: FoodLogEntry) => void
onAdd:    () => void
```

---

## State-analyse

### Blijft in FoodClient
| State | Type | Reden |
|---|---|---|
| `selectedDate` | `string` | pagina-level datumnavigatie |
| `slideDir` | `'left'\|'right'\|null` | swipe-animatie |
| `touchStartX` | `useRef<number\|null>` | swipe gesture |
| `showAddSheet` | `boolean` | AddFoodSheet zichtbaarheid |
| `preselectedMeal` | `string` | doorgestuurd naar AddFoodSheet |
| `macroDrill` | `MacroKey\|null` | MacroDrillSheet trigger |
| `editEntry` | `FoodLogEntry\|null` | EditFoodSheet trigger |

### Verhuisd naar AddFoodSheet (al aanwezig)
`view`, `search`, `selected`, `meal`, `showBarcodeScanner`, `barcodeLoading`, `barcodeError`, `localFreq`, `serverFreq`, `templates`, `newMealName`, `templateItems`, `savingTemplate`, `confirmTemplate`, `loggingTemplate`, `menuOpenId`

---

## Task 1 — FoodClient.tsx herschrijven

**Files:**
- Modify: `app/food/FoodClient.tsx`

- [ ] **Stap 1.1: Schrijf de nieuwe FoodClient.tsx**

Vervang de volledige inhoud van `app/food/FoodClient.tsx` met:

```tsx
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react'
import { Card, SectionHeader, NutritionProgressBar } from '@/components/ui'
import { createClient } from '@/lib/supabase'
import type { FoodLogEntry } from '@/lib/types'
import { fetchFoodData, fetchProducts } from './fetchers'
import {
  getMealForHour, formatDayLabel,
  MEAL_ORDER, MEAL_ICONS, MEAL_LABELS,
  type MacroKey,
} from './meal-config'
import { AddFoodSheet }    from './components/AddFoodSheet'
import { MacroDrillSheet } from './components/MacroDrillSheet'
import { EditFoodSheet }   from './components/EditFoodSheet'
import { MealSection }     from './components/MealSection'

export function FoodClient() {
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef<number | null>(null)

  const { data, mutate, error, isLoading } = useSWR(
    `food-log-${selectedDate}`,
    () => fetchFoodData(selectedDate),
    { revalidateOnFocus: false, dedupingInterval: 10_000 }
  )
  const { data: products = [] } = useSWR('products', fetchProducts, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const [showAddSheet, setShowAddSheet]       = useState(false)
  const [preselectedMeal, setPreselectedMeal] = useState(getMealForHour)
  const [macroDrill, setMacroDrill]           = useState<MacroKey | null>(null)
  const [editEntry, setEditEntry]             = useState<FoodLogEntry | null>(null)

  useEffect(() => {
    const open = showAddSheet || !!editEntry
    document.body.style.overflow = open ? 'hidden' : ''
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => {
      document.body.style.overflow = ''
      const nav2 = document.querySelector('[data-bottom-nav]') as HTMLElement | null
      if (nav2) nav2.style.display = ''
    }
  }, [showAddSheet, editEntry])

  function navigate(dir: 'left' | 'right') {
    setSlideDir(dir)
    setTimeout(() => {
      setSelectedDate(d => {
        const date = new Date(d)
        date.setDate(date.getDate() + (dir === 'left' ? 1 : -1))
        return date.toISOString().split('T')[0]
      })
      setSlideDir(null)
    }, 180)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) navigate(diff > 0 ? 'left' : 'right')
    touchStartX.current = null
  }

  const log     = data?.foodLog ?? []
  const targets = data?.targets ?? { kcal: 2500, protein: 180, carbs: 250, fat: 80 }
  const userId  = data?.userId  ?? ''

  const totals = useMemo(() => ({
    kcal:    log.reduce((s, f) => s + Number(f.kcal    ?? 0), 0),
    protein: log.reduce((s, f) => s + Number(f.protein ?? 0), 0),
    carbs:   log.reduce((s, f) => s + Number(f.carbs   ?? 0), 0),
    fat:     log.reduce((s, f) => s + Number(f.fat     ?? 0), 0),
  }), [log])

  async function deleteEntry(id: string) {
    mutate(prev => prev ? { ...prev, foodLog: prev.foodLog.filter(f => f.id !== id) } : prev, false)
    const supabase = createClient()
    await supabase.from('food_log').delete().eq('id', id)
  }

  function onAdded(entry: FoodLogEntry) {
    mutate(prev => prev ? { ...prev, foodLog: [...prev.foodLog, entry] } : prev, false)
    setShowAddSheet(false)
  }

  function onEdited(updated: FoodLogEntry) {
    mutate(prev => prev ? {
      ...prev,
      foodLog: prev.foodLog.map(f => f.id === updated.id ? updated : f),
    } : prev, false)
    setEditEntry(null)
  }

  const mealMap = useMemo(() => {
    const map: Record<string, FoodLogEntry[]> = {}
    MEAL_ORDER.forEach(m => { map[m] = [] })
    log.forEach(f => {
      const key = f.meal_category
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    return map
  }, [log])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-white/40 text-[15px] text-center">Kon data niet laden</p>
        <p className="text-white/20 text-[12px] text-center">{String(error)}</p>
        <button onClick={() => mutate()} className="text-teal-400 text-[15px] font-medium">
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        {[180, 90, 56, 56, 56].map((h, i) => (
          <div key={i} className="animate-pulse rounded-3xl"
            style={{ height: h, background: 'rgba(255,255,255,0.10)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[22px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Datumnavigatie */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('right')}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={18} className="text-white/70" />
        </button>
        <span className="text-[17px] font-semibold text-white">{formatDayLabel(selectedDate)}</span>
        <button onClick={() => navigate('left')}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronRight size={18} className="text-white/70" />
        </button>
      </div>

      <div
        key={selectedDate}
        style={{
          animation: slideDir === 'left'
            ? 'slideOutLeft 180ms ease-in forwards'
            : slideDir === 'right'
            ? 'slideOutRight 180ms ease-in forwards'
            : 'slideIn 220ms ease-out',
        }}
        className="flex flex-col gap-[22px]"
      >
        <Card>
          <div className="flex flex-col gap-[18px]">
            <SectionHeader title="Macros" />
            {([
              { key: 'kcal'    as const, label: 'Calorieën',    unit: 'kcal', tint: 'bg-orange-400' },
              { key: 'protein' as const, label: 'Eiwit',        unit: 'g',    tint: 'bg-teal-400'   },
              { key: 'carbs'   as const, label: 'Koolhydraten', unit: 'g',    tint: 'bg-yellow-400' },
              { key: 'fat'     as const, label: 'Vet',          unit: 'g',    tint: 'bg-indigo-400' },
            ]).map(({ key, label, unit, tint }) => (
              <button key={key}
                className="w-full text-left active:opacity-60 transition-opacity"
                onClick={() => setMacroDrill(key)}>
                <NutritionProgressBar
                  label={label} current={totals[key]} target={targets[key]} unit={unit} tint={tint} />
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-3.5">
          <SectionHeader title="Today's Meals" />
          {MEAL_ORDER.filter(meal => (mealMap[meal] ?? []).length > 0).map(meal => (
            <MealSection
              key={meal}
              meal={meal}
              icon={MEAL_ICONS[meal] ?? '🍽️'}
              label={MEAL_LABELS[meal] ?? meal}
              entries={mealMap[meal] ?? []}
              onDelete={deleteEntry}
              onEdit={setEditEntry}
              onAdd={() => { setPreselectedMeal(meal); setShowAddSheet(true) }}
            />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(var(--slide-from, 40px)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(40px); }
        }
      `}</style>

      <button
        onClick={() => { setPreselectedMeal(getMealForHour()); setShowAddSheet(true) }}
        className="fixed bottom-[88px] right-5 z-40 w-[56px] h-[56px] rounded-full flex items-center justify-center border border-white/20 shadow-xl"
        style={{ background: 'rgba(255,255,255,0.12)' }}
        aria-label="Voeding toevoegen"
      >
        <Plus size={24} className="text-white" strokeWidth={2.2} />
      </button>

      {showAddSheet && (
        <AddFoodSheet
          products={products}
          preselectedMeal={preselectedMeal}
          userId={userId}
          today={selectedDate}
          totals={totals}
          targets={targets}
          onAdded={onAdded}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {macroDrill && (
        <MacroDrillSheet macro={macroDrill} log={log} onClose={() => setMacroDrill(null)} />
      )}

      {editEntry && (
        <EditFoodSheet
          entry={editEntry}
          userId={userId}
          onSaved={onEdited}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Stap 1.2: Build draaien**

```
npm run build
```

Verwacht: exitcode 0. Bij fouten: zie Task 2.

- [ ] **Stap 1.3: Verifieer dat inline-definities verdwenen zijn**

Controleer dat `app/food/FoodClient.tsx` NIET meer bevat (grep):
- `type FoodLogEntry` (lokale definitie — nu uit lib/types)
- `type Product` (lokale definitie)
- `type Targets` (lokale definitie)
- `type MealTemplate` (lokale definitie)
- `type TemplateFoodItem` (lokale definitie)
- `function getMealForHour` (inline — nu uit meal-config)
- `const MEAL_ORDER` (inline — nu uit meal-config)
- `function MacroDrillSheet` (inline — nu component import)
- `function EditFoodSheet` (inline)
- `function MealSection` (inline)
- `function CustomFoodView` (inline)
- `function CreateMealView` (inline)
- `function AddFoodSheet` (inline)
- `async function fetchFoodData` (inline — nu uit fetchers)
- `async function fetchProducts` (inline)
- `async function fetchMealTemplates` (inline)
- `Camera` (ongebruikte import uit lucide-react)

- [ ] **Stap 1.4: Verifieer dat alle nieuwe componenten actief worden geïmporteerd**

Controleer dat FoodClient.tsx WEL bevat:
- `import { AddFoodSheet }    from './components/AddFoodSheet'`
- `import { MacroDrillSheet } from './components/MacroDrillSheet'`
- `import { EditFoodSheet }   from './components/EditFoodSheet'`
- `import { MealSection }     from './components/MealSection'`
- `import { fetchFoodData, fetchProducts } from './fetchers'`
- `import { getMealForHour, formatDayLabel, MEAL_ORDER, MEAL_ICONS, MEAL_LABELS, type MacroKey } from './meal-config'`
- `import type { FoodLogEntry } from '@/lib/types'`

- [ ] **Stap 1.5: Commit**

```bash
git add app/food/FoodClient.tsx
git commit -m "refactor(food): wire FoodClient to extracted components, fetchers, meal-config"
```

---

## Task 2 — TypeScript-fouten oplossen (indien aanwezig)

**Files:** Afhankelijk van de foutmeldingen

Mogelijke fouten en exacte oplossingen:

**Fout A: `MacroKey` niet assignable**
```
Type '"kcal"' is not assignable to parameter of type 'MacroKey'
```
Oplossing: zorg dat de `as const` op elk `key` in de macro-array aanwezig is, zodat TypeScript het literal type afleidt:
```tsx
{ key: 'kcal' as const, ... }
```

**Fout B: `targets` type incompatibel met `Targets`**
```
Argument of type '{ kcal: number; protein: number; carbs: number; fat: number }'
is not assignable to parameter of type 'Targets'
```
`Targets` in `fetchers.ts` is `{ kcal: number; protein: number; carbs: number; fat: number }` — structureel identiek. Dit zou niet moeten optreden. Als het toch optreedt, voeg toe:
```tsx
import type { Targets } from './fetchers'
// en cast de fallback:
const targets: Targets = data?.targets ?? { kcal: 2500, protein: 180, carbs: 250, fat: 80 }
```

**Fout C: `jsx` attribute niet herkend in `<style jsx global>`**
Dit was al aanwezig in de originele FoodClient.tsx en werkte. Als de build nieuw klaagt, voeg toe aan `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["styled-jsx"]
  }
}
```

**Fout D: `totals` prop structuur-mismatch in AddFoodSheet**

AddFoodSheet verwacht:
```ts
totals: { kcal: number; protein: number; carbs: number; fat: number }
```
FoodClient levert:
```ts
const totals = useMemo(() => ({
  kcal: ..., protein: ..., carbs: ..., fat: ...,
}), [log])
```
Dit is exact hetzelfde structureel. Bij een mismatch: controleer of AddFoodSheet.tsx de `totals` prop met een exact type annotatieheeft — zo ja, importeer dat type en gebruik het als type-annotatie voor `totals`.

- [ ] **Los gevonden fouten op**
- [ ] **Draai build opnieuw:**

```
npm run build
```

Verwacht: exitcode 0.

- [ ] **Commit (alleen indien er wijzigingen waren):**

```bash
git add app/food/FoodClient.tsx
git commit -m "fix(food): resolve TypeScript errors after component extraction"
```

---

## Spec-coverage check

| Eis | Gedekt door |
|---|---|
| AddFoodSheet actief | Task 1 — directe import + alle props incl. `totals` en `targets` |
| ProductDetailView actief | Via AddFoodSheet (daily impact, activity equivalents) |
| MealSection actief | Task 1 — directe import |
| MacroDrillSheet actief | Task 1 — directe import |
| EditFoodSheet actief | Task 1 — directe import |
| CustomFoodView actief | Via AddFoodSheet |
| CreateMealView actief | Via AddFoodSheet |
| MealConfirmView actief | Via AddFoodSheet |
| ScanResultView actief | Via AddFoodSheet |
| MealsListView actief | Via AddFoodSheet |
| Types uit lib/types.ts | `FoodLogEntry` geïmporteerd |
| Fetchers uit fetchers.ts | `fetchFoodData`, `fetchProducts` geïmporteerd |
| Meal-config als enige bron | `MEAL_ORDER`, `MEAL_ICONS`, `MEAL_LABELS`, `getMealForHour`, `formatDayLabel`, `MacroKey` geïmporteerd |
| Geen functionaliteit verwijderd | State/callbacks identiek; componenten bevatten meer features dan inline versies |
| `Camera` unused import weg | Niet aanwezig in nieuwe imports |

## Bekende gedragsverschillen (geen regressies — verbeteringen)

| Oud gedrag | Nieuw gedrag |
|---|---|
| Barcode → direct Open Food Facts | Barcode → `/api/barcode-lookup` (Supabase-cache eerst) |
| Frequentie in `localStorage` (by productId) | Frequentie uit Supabase 90-dagenvenster (by naam) |
| ProductDetailView: alleen gram-stepper | ProductDetailView: gram-stepper + daily impact bars + activity equivalents |
| Barcode niet gevonden: generieke melding | `not_found` / `invalid` / `unreachable` elk eigen UI |
| Voedselnamen zonder kapitalisatie | `cap()` — eerste letter hoofdletter |
