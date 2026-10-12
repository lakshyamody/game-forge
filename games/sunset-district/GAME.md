# Sunset District

> Drive a living city at golden hour — pick up fares, beat the clock.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
A GTA-style city sandbox and the showcase for the realistic-rendering kit: a 4×4-block downtown with traffic, 30 pedestrians (realistic Rocketbox people with mocap), and a day → golden hour → night cycle. Walk the streets, take the yellow cab, and drive fares across town before the meter runs out.

## Core loop
- **Verbs:** walk / run, get in the taxi (E), drive (handbrake slides), honk.
- **Fares:** green column = pick-up (stop inside it). Then a yellow drop-off with a timer: fare = base + distance; tip = time left × 0.4, −$4 per crash. Out of time → the passenger walks off.
- **City life:** traffic follows lanes, turns at intersections, queues and brakes for anything in front (including you); pedestrians walk sidewalk loops, stop to idle / take calls, and step aside from a fast car.
- **Time of day:** 6 minutes per 24 h, starting 16:36. Sun position, shadows, sky light, haze colour, street lamps, shop and window lights and the taxi's headlights all follow the clock.

## Controls
WASD walk/drive · Shift run · mouse look · E get in/out · Space handbrake · H horn · M mute

## Code map
- `config.ts` — car, walking, camera, world, fare tuning (`?tune`)
- `life.ts` — traffic (`spawnTraffic`/`updateTraffic`) and pedestrians (`spawnPeople`/`updatePeople`)
- `main.ts` — boot (realism + city), player on foot / in car, fares, camera (with wall collision), HUD, minimap
- Built on kit: `kit/three/realism.ts` (sky, sun shadows, AO, bloom, AgX, grade), `kit/three/city.ts` (procedural downtown), `kit/three/cars.ts` (procedural cars), `loadClips` (Rocketbox clip libraries)

## Debug
`?hour=19.5` · `?drive` · `?freelook` · `?tune`. `window.__debug = { C, F, city, bots, peds, fx, setHour, fare, newFare }`.

## Verified (headless, Apple M2)
- Loads in ~7 s; 53–60 fps with 16 cars, 30 pedestrians, AO + bloom + 4k shadows.
- Scripted play: walk, get in, drive with real keys, turn, brake, complete a fare (+$46). Traffic moves 7–11 m/s and queues; no runtime errors.
- Day, golden hour, sunset, dusk and night all checked in screenshots.

## Assets used
Microsoft Rocketbox people (MIT) + Rocketbox mocap clip libraries; Poly Haven `street_lamp_01` and (when imported) `jacaranda_tree`, `fire_hydrant`, `modular_street_seating`, `concrete_road_barrier`; Poly Haven / ambientCG PBR textures (`asphalt_02`, `concrete_floor_02`, brick / plaster / concrete facades). Cars, towers, storefronts and skyline are procedural.

## Status
- [x] City, traffic, pedestrians, taxi driving, fares, day/night, HUD, minimap
- [ ] Kid check — 5 staged fixes in FIXES.md (not applied)
- [ ] Not verified by a human: driving feel with a real keyboard/mouse

## Ideas / next
- Police that chase you when you crash into cars (wanted stars)
- Traffic lights at intersections; pedestrians crossing at crosswalks
- Radio stations; rain + wet-road reflections
- Bigger city with streamed blocks
