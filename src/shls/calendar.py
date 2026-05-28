from __future__ import annotations

from datetime import date, timedelta


def second_thursday(year: int, month: int) -> date:
    first = date(year, month, 1)
    offset = (3 - first.weekday()) % 7
    first_thursday = first + timedelta(days=offset)
    return first_thursday + timedelta(days=7)


def next_stock_futures_expiry(today: date) -> date:
    # KRX single stock futures commonly trade quarterly serials; this is a
    # holiday-unadjusted planning date, not an exchange calendar substitute.
    months = [3, 6, 9, 12]
    for year in [today.year, today.year + 1]:
        for month in months:
            expiry = second_thursday(year, month)
            if expiry >= today:
                return expiry
    return second_thursday(today.year + 1, 12)


def business_days_until(start: date, end: date) -> int:
    if end < start:
        return 0
    days = 0
    cur = start
    while cur < end:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            days += 1
    return days
