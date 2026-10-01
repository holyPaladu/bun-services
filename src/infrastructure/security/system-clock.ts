import type { Clock } from '@/application/ports/clock'

export const createSystemClock = (): Clock => ({ now: () => new Date() })
