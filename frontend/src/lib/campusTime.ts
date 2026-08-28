export const CAMPUS_TIME_ZONE = 'Africa/Dar_es_Salaam'

export function campusHour(date: Date) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone:CAMPUS_TIME_ZONE,
    hour:'2-digit',
    hourCycle:'h23',
  }).format(date))
}

export function campusGreeting(date: Date) {
  const hour = campusHour(date)
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function formatCampusDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    timeZone:CAMPUS_TIME_ZONE,
    weekday:'long',
    month:'long',
    day:'numeric',
  })
}

export function formatCampusTime(value: Date | string | number) {
  return new Date(value).toLocaleTimeString([], {
    timeZone:CAMPUS_TIME_ZONE,
    hour:'2-digit',
    minute:'2-digit',
  })
}
