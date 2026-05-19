import { describe, expect, it } from 'vitest'
import { previousCalendarWeekRange, thisCalendarWeekRange, weekRangeFromMonday } from './weekDateRange'

describe('weekDateRange', () => {
  it('semana lun–dom tiene 7 días de diferencia', () => {
    const w = weekRangeFromMonday(new Date(2026, 4, 18))
    expect(w.startDate).toBe('2026-05-18')
    expect(w.endDate).toBe('2026-05-24')
  })

  it('this y previous no se solapan', () => {
    const ref = new Date(2026, 4, 20)
    const cur = thisCalendarWeekRange(ref)
    const prev = previousCalendarWeekRange(ref)
    expect(cur.endDate < prev.startDate || prev.endDate < cur.startDate).toBe(true)
  })
})
