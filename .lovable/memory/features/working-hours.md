---
name: Working Hours & VIP Overrides
description: Barber working hours schedule (Tue-Sat, 9am-12pm + 1pm-5pm with lunch break) and VIP hour overrides (7-9am, 5-7pm)
type: feature
---
## Regular Hours
- **Days**: Tuesday through Saturday (day_of_week 2–6)
- **Morning block**: 9:00 AM – 12:00 PM
- **Lunch break**: 12:00 PM – 1:00 PM (closed)
- **Afternoon block**: 1:00 PM – 5:00 PM
- **Closed**: Sunday and Monday

## Barbers
- Charlie, Hector, Joseph share the same schedule
- Yvette does NOT take appointments — no working hours

## VIP Hour Overrides
VIP services can override the regular schedule:
- **Early VIP**: 7:00 AM – 9:00 AM
- **Late VIP**: 5:00 PM – 7:00 PM
These extend the day beyond regular hours for VIP-category services only.

## Database
- `working_hours` table: stores per-barber blocks (multiple rows per day allowed)
- `shop_hours` table: stores shop-level blocks (same structure)
- Unique constraint removed to allow 2 blocks per day (morning + afternoon)
