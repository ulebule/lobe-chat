c# 🚀 Tips za Pospešitev `bun run dev`

## ✅ Optimizacije Ki So Že Implementirane

### 1. **Turbopack** ✅

- Next.js uporablja Turbopack (najhitrejši bundler)
- Komanda: `next dev --turbopack`

### 2. **Optimizirane Nastavitve**

- Disabled HMR refresh logging
- Optimized webVitals (samo v production)
- Memory optimizations enabled

### 3. **Skip Disabled Providers** ✅ **NEW!**

- V dev mode se preskočijo disabled providerji pri startup-u
- **Izboljšava**: 20-30 sekund → **2-5 sekund** za global config! 🚀
- V terminalu boš videl: `⚡ [Dev] Skipping X disabled providers for faster startup`

## 🎯 Kako Uporabiti

### Opcija 1: Fast Dev (Priporočeno)

```bash
bun run dev:fast
```

To počisti cache in zažene z optimizacijami.

### Opcija 2: Navaden Dev

```bash
bun run dev
```

Standardni dev server.

## 🔧 Dodatni Nasveti za Hitrost

### 1. **Počisti Cache Občasno**

```bash
# Počisti .next cache
rm -rf .next

# Ali z novo komando:
bun run dev:fast
```

### 2. **Zmanjšaj Scope Kompajliranih File-ov**

Če delaš na določenem delu aplikacije, lahko začasno komentiraš nepomembne module:

```typescript
// Temporarily disable unused features
// import { SomeHeavyFeature } from '@/features/heavy';
```

### 3. **Upravljaj z Node Memory**

```bash
# Povečaj memory limit (če imaš RAM)
NODE_OPTIONS=--max-old-space-size=6144 bun run dev

# Ali uporabi fast script:
bun run dev:fast
```

### 4. **Windows Performance Tips**

**Disable Windows Defender za dev folder:**

```powershell
# Dodaj exception za projekt folder
# Windows Security > Virus & threat protection > Manage settings > Exclusions
```

**Upgrade na SSD** (če še nimaš) - to naredi največjo razliko!

### 5. **Bun Optimizacije**

```bash
# Preveri Bun version (najnovejša je najhitrejša)
bun --version

# Update Bun:
bun upgrade
```

### 6. **Next.js Turbopack Flags**

```bash
# Dodatni Turbopack optimizacije
next dev --turbopack --experimental-https
```

### 7. **Zmanjšaj Watch Scope**

V `next.config.ts` lahko dodaš:

```typescript
experimental: {
  turbo: {
    resolveExtensions: ['.js', '.jsx', '.ts', '.tsx'], // Only watch these
  },
}
```

## ⚡ Quick Wins

### Največji Učinek (v tem vrstnem redu):

1. **🔥 SSD Disk** - 10x hitrejše kot HDD
2. **🔥 Bun Upgrade** - Vedno najnovejša verzija
3. **🔥 Clear Cache** - `rm -rf .next` pred dev
4. **🔥 dev:fast Script** - `bun run dev:fast`
5. **🔥 Windows Defender** - Disable za dev folder
6. **🔥 Memory Limit** - Povečaj NODE_OPTIONS

## 📊 Benchmarking

Za testiranje hitrosti:

```bash
# Time the dev server startup
time bun run dev

# Primerjaj z fast version:
time bun run dev:fast
```

## 🐛 Troubleshooting

### Problem: Dev server se ne zažene

```bash
# 1. Clear vse cache
rm -rf .next
rm -rf node_modules/.cache

# 2. Restart
bun run dev:fast
```

### Problem: Sporadično počasi

```bash
# Clear TypeScript cache
rm -rf .next/cache

# Restart
bun run dev:fast
```

### Problem: Memory Issues

```bash
# Povečaj memory limit
NODE_OPTIONS=--max-old-space-size=8192 bun run dev
```

## 🎯 Pričakovane Hitrosti

### Next.js Server Startup (Normalno):

- **Server Ready**: **4-8 sekund** ✅
  - Vidiš: `✓ Ready in 4.3s`
  - Server je pripravljen za requeste

### Prvi Request na /chat (ON-DEMAND COMPILATION):

⚠️ **VAŽNO**: Next.js kompajlira route ob prvem requestu, ne ob startup!

- **Route Compilation**: **30-45 sekund** ⚠️ (prvič - normalno!)
  - `○ Compiling /[variants]/chat ...`
  - `✓ Compiled /[variants]/chat in 35.4s`
- **Global Config**: **2-14ms** ✅ (z optimizacijo)
- **Market Plugin Fetch**: **0s** ✅ (če disabled)
- **Total prvi request**: **35-50 sekund** ⚠️

### Naslednji Requesti (Route že kompajliran):

- **Route Compilation**: **0 sekund** ✅
- **Global Config**: **2-14ms** ✅
- **Total**: **2-5 sekund** 🚀

### Hot Reload (spremembe v kodi):

- **Hot Reload**: < 1 sekunda (spremembe v komponentah)
- **Full Reload**: 5-10 sekund (spremembe v config)

### Minimal Chat (samo OpenAI):

- **Server Ready**: **4-8 sekund** ✅
- **Prvi request**: **35-45 sekund** ⚠️ (route compilation - normalno!)
- **Naslednji requesti**: **2-5 sekund** 🚀

## 📝 Checklist za Optimalno Performance

- [ ] Uporabljaš **bun run dev:fast** namesto navadnega dev
- [ ] Imaš **SSD disk** (najpomembneje!)
- [ ] **Bun je updated** (`bun upgrade`)
- [ ] **Windows Defender disabled** za projekt folder
- [ ] **NODE_OPTIONS memory limit** povečan
- [ ] **Cache počistim občasno** (`rm -rf .next`)
- [ ] **Manj dependency-jev** v projektu = hitreje

---

**Pro Tip**: Največja razlika bo vidna z SSD diskom. Če še nimaš SSD, to je #1 prioriteta! 🚀
