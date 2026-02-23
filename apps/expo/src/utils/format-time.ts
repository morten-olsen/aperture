const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatRelativeTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) {
    const absDiff = -diff;
    if (absDiff < MINUTE) return 'in a moment';
    if (absDiff < HOUR) {
      const mins = Math.floor(absDiff / MINUTE);
      return `in ${mins} min`;
    }
    if (absDiff < DAY) {
      const hrs = Math.floor(absDiff / HOUR);
      return `in ${hrs} hr`;
    }
    if (absDiff < WEEK) return DAY_NAMES[date.getDay()] ?? '';
    return `${MONTH_NAMES[date.getMonth()] ?? ''} ${date.getDate()}`;
  }

  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} min ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} hr ago`;
  }
  if (diff < WEEK) return DAY_NAMES[date.getDay()] ?? '';
  return `${MONTH_NAMES[date.getMonth()] ?? ''} ${date.getDate()}`;
};

export { formatRelativeTime };
