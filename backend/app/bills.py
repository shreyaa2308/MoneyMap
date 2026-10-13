"""Due dates for recurring bills."""

import calendar
from datetime import timedelta


def add_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def advance_due(value, frequency):
    if frequency == "weekly":
        return value + timedelta(days=7)
    if frequency == "yearly":
        return add_months(value, 12)
    if frequency == "monthly":
        return add_months(value, 1)
    raise ValueError("Frequency must be weekly, monthly, or yearly")


def bill_status(next_due_on, today):
    if next_due_on < today:
        return "overdue"
    return "upcoming"
