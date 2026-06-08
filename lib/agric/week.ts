export interface FarmWeek {
  year: number;
  week: number;
  startDate: string;
  endDate: string;
}

function localDate(date: string | Date): Date {
  if (date instanceof Date) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function iso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFarmWeek(value: string | Date, weekStartsOn = 0): FarmWeek {
  const date = localDate(value);
  const year = date.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const firstWeekEnd = new Date(yearStart);
  firstWeekEnd.setDate(firstWeekEnd.getDate() + ((weekStartsOn + 6 - yearStart.getDay() + 7) % 7));

  let week = 1;
  let start = new Date(yearStart);
  let end = new Date(firstWeekEnd);

  if (date > firstWeekEnd) {
    const daysAfterFirstWeek = Math.floor((date.getTime() - firstWeekEnd.getTime() - 1) / 86400000);
    week = Math.min(52, 2 + Math.floor(daysAfterFirstWeek / 7));
    start = new Date(firstWeekEnd);
    start.setDate(start.getDate() + 1 + (week - 2) * 7);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  }

  const yearEnd = new Date(year, 11, 31);
  if (week === 52 || end > yearEnd) end = yearEnd;
  return { year, week, startDate: iso(start), endDate: iso(end) };
}

export function getRecentFarmWeeks(value: string | Date, count: number, weekStartsOn = 0): FarmWeek[] {
  const current = getFarmWeek(value, weekStartsOn);
  return Array.from({ length: count }, (_, index) => {
    const date = localDate(current.startDate);
    date.setDate(date.getDate() - (count - 1 - index) * 7);
    return getFarmWeek(date, weekStartsOn);
  });
}
