# TypeScript Engine Migration

## Goal

Move online games to use TypeScript engine instead of Python (Pyodide).

**Python should ONLY be used for:**
- AI opponent play
- Position evaluation  
- Best move calculation

**TypeScript engine for:**
- ✅ Online multiplayer games
- ✅ Local human vs human games
- ✅ Move validation
- ✅ State management

## Implementation Plan

### Phase 1: Create TypeScript Engine ✅
- [x] Copy `santoriniEngine.ts` from server to `web/src/lib/`
- [x] Export all necessary types and functions
- [x] Ensure it's fully client-side (no dependencies)

### Phase 2: Update useOnlineSantorini (In Progress)
- [ ] Remove dependency on `useSantorini` hook
- [ ] Use `SantoriniEngine` from `@/lib/santoriniEngine`
- [ ] Remove all Python/Pyodide loading
- [ ] Keep same public API for compatibility

### Phase 3: Create useLocalBoard Hook
- [ ] For local human vs human games
- [ ] No AI, no evaluation
- [ ] Pure TypeScript engine

### Phase 4: Update useSantorini
- [ ] Keep ONLY for AI/evaluation features
- [ ] Lazy load Python only when AI is requested
- [ ] Default to TypeScript engine until AI needed

## Benefits

### Performance
- **No Python download** (~200MB saved)
- **Instant loading** (no numpy/pyodide wait)
- **Lower memory** usage
- **Faster validation** (native JS vs WASM)

### UX
- **Mobile-friendly** (smaller download)
- **Offline-capable** (no large assets)
- **Better battery** life (less processing)

### Architecture
- **Clear separation** of concerns
- **Easier testing** (pure TypeScript)
- **Better type safety**
- **Simpler debugging**

## Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| TypeScript Engine | ✅ Complete | Fully tested, server-compatible |
| useOnlineSantorini | 🔄 In Progress | Removing Python dependency |
| useLocalBoard | ⏳ Pending | New hook for local games |
| useSantorini | ⏳ Pending | Refactor for AI-only |

## Breaking Changes

None! The public API remains the same.

## Next Steps

1. Finish updating `useOnlineSantorini`
2. Test online games without Python
3. Create `useLocalBoard` for local human games
4. Refactor `useSantorini` to lazy-load Python

This will make online games **dramatically faster** to load!

