# GAME-REFERENCE.md — v0.00

## Version
v0.00 — "The Seed"

## Game Mechanics
- Arena survivor (Vampire Survivors style)
- Move with WASD/arrow keys or mobile virtual joystick
- Auto-attack: player fires at nearest enemy within range
- Enemies spawn from arena edges, move toward player
- Kill enemies to drop XP gems
- XP gems are magnetically pulled toward the player when nearby
- Collect XP to level up; each level presents 3 random upgrades to choose from
- Invincibility frames (0.8s) on taking damage
- Health regeneration (if upgraded)
- Difficulty ramps over time: faster spawns, faster enemies, more HP on enemies
- Game over when HP reaches 0; high score saved to localStorage

## Enemy Types
| Type | Size | HP | Speed | Color | Notes |
|------|------|----|-------|-------|-------|
| basic | 18 | 1 + floor(gameTime/30) | 80 + gameTime*0.5 | #d0d0d0 | Standard enemy, HP scales over time |
| fast | 16 | 1 + floor(gameTime/30) | 128 (80*1.6) | #ff6b6b | Smaller, faster, spawn chance increases over time (15% → 50%) |

## Upgrade Pool
| Name | Description | Effect |
|------|-------------|--------|
| +20% Speed | Move faster to dodge enemies | speed *= 1.2 |
| +50% Damage | Hit harder | dmg *= 1.5 |
| +30% Fire Rate | Shoot more often | atkRate *= 0.7 |
| +1 Projectile | Fire an additional shot | projCount += 1 |
| +30% Range | Projectiles travel further | range *= 1.3 |
| +2 Max HP | More health to survive | maxHp += 2, hp += 2 |
| +0.5 HP/s Regen | Slowly heal over time | regen += 0.5 |
| +25% Proj Speed | Faster projectiles | projSpeed *= 1.25 |

## Configuration Constants (CFG)
```
W: 800, H: 600
Arena: AX=10, AY=72, AW=780, AH=518
Player: P_SIZE=22, P_SPEED=200, P_HP=5
Combat: ATTACK_RATE=0.45, PROJ_SPEED=350, PROJ_SIZE=5, PROJ_DMG=1, PROJ_RANGE=380
Enemies: E_SPAWN_INIT=1.8, E_SPAWN_MIN=0.25, E_SPEED_BASE=80, E_SIZE=18
Difficulty: RAMP_TIME=45
XP: XP_PER_KILL=10, XP_BASE=50, XP_SCALE=1.4
Invincibility: IFRAMES=0.8
DexScreener: TOKEN_CA='PLACEHOLDER_CA', MC_INTERVAL=30000
```

## Player Default Stats
```
x: 400, y: 300 (center of 800x600)
size: 22, hp: 5, maxHp: 5
level: 1, xp: 0, xpNext: 50
speed: 200, atkRate: 0.45
projSpeed: 350, dmg: 1, projCount: 1, range: 380
regen: 0
```

## Sketch/Doodle Art Style
- All visuals drawn procedurally via Canvas 2D API
- Hand-drawn "wobbly" aesthetic using wobbleCache system
- Helper functions: sketchCircle, sketchBlob, sketchTriangle, sketchRect, sketchLine
- Each entity gets a wobbleId via nextWobbleId() for consistent wobble
- Background doodles: 30 random decorative shapes in the arena

## Audio
- Web Audio API — all sounds synthesized procedurally
- sfx(startFreq, endFreq, oscType, duration, volume) helper for one-shot sounds
- Named sound functions: playShootSound, playHitSound, playKillSound, playXPSound, playLevelUpSound, playDamageSound, playGameOverSound
- Background music via playMusic() / stopMusic()
- Mute button in UI toggles all audio

## Market Cap / Growth System
- DexScreener API integration (fetches token market cap every 30s)
- TOKEN_CA: placeholder contract address
- GROWTH_TIERS array:
  - seed: $0+ (168h)
  - sprouting: $50K+ (96h)
  - growing: $250K+ (48h)
  - thriving: $1M+ (24h)
  - erupting: $5M+ (12h)
- Growth panel displays: plant visual, tier name, MC bar, next milestone

## Module Sizes (approximate line counts)
| Module | Lines |
|--------|-------|
| HTML/CSS | ~1010 |
| CONFIG | ~33 |
| SKETCH_HELPERS | ~88 |
| CANVAS | ~4 |
| STATE | ~74 |
| INPUT | ~61 |
| UPGRADES | ~42 |
| PLAYER_UPDATE | ~42 |
| ENEMIES | ~76 |
| PROJECTILES | ~62 |
| KILL/XP | ~58 |
| PARTICLES | ~31 |
| DRAW | ~157 |
| HUD | ~21 |
| GAME_OVER | ~26 |
| AUDIO | ~127 |
| DEXSCREENER+GROWTH | ~70 |
| GAME_LOOP | ~23 |
| START/RESTART | ~24 |
| INIT | ~7 |
| **Total** | **~2044** |
