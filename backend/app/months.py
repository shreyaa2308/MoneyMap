"""Calendar-month helpers. Transactions use a date, not a timestamp."""

import re
from datetime import date

MONTH_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


def parse_month(value):
    """Return (year, month) for a YYYY-MM string."""
    match = MONTH_PATTERN.fullmatch(value or "")
    if match is None:
        raise ValueError("Month must be YYYY-MM")
    year = int(match.group(1))
    month = int(match.group(2))
    if month < 1 or month > 12:
        raise ValueError("Month must be YYYY-MM")
    return year, month


def format_month(year, month):
    return f"{year:04d}-{month:02d}"


def month_bounds(year, month):
    """Return the first day of the month and the first day of the next month."""
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


def months_ending_at(year, month, count=6):
    """Return `count` months in order, ending with the given month."""
    months = []
    cursor_year = year
    cursor_month = month
    for _ in range(count):
        months.append((cursor_year, cursor_month))
        cursor_month -= 1
        if cursor_month == 0:
            cursor_month = 12
            cursor_year -= 1
    months.reverse()
    return months
