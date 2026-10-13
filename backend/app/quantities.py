"""Whole-number quantity math.

A quantity is stored as an integer scaled by 10,000, so 1.5 shares is 15000.
Prices stay in integer cents. Current value is quantity times price, using
integer division so no floating-point money is stored.
"""

import re

SCALE = 10000


def parse_quantity(value):
    text = str(value).strip()
    if not re.fullmatch(r"\d+(\.\d{1,4})?", text):
        raise ValueError("Quantity must be a positive number with up to 4 decimal places")
    whole, _, fraction = text.partition(".")
    scaled = int(whole) * SCALE + int(fraction.ljust(4, "0"))
    if scaled <= 0:
        raise ValueError("Quantity must be greater than zero")
    if scaled > 1_000_000_000:
        raise ValueError("Quantity is too large")
    return scaled


def format_quantity(scaled):
    whole, fraction = divmod(int(scaled), SCALE)
    if fraction == 0:
        return str(whole)
    return f"{whole}.{fraction:04d}".rstrip("0")


def value_cents(quantity_scaled, price_cents):
    return (int(quantity_scaled) * int(price_cents)) // SCALE
