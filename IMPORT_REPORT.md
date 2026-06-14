# IMPORT_REPORT.md — CSV Import Anomalies & Actions Taken

This report was produced by our app's ingestion engine when parsing the CSV file `sample-data/expenses_import_sample.csv`.

## Summary of Ingestion
- **Total Rows:** 42
- **Imported Rows:** 39
- **Skipped Rows:** 3
- **Total Anomalies Detected:** 7

## Detailed Row-by-Row Log

| Row | Description | Status | Anomalies / Actions Taken |
|---|---|---|---|
| 1 | February rent | **Imported** | — |
| 2 | Groceries BigBasket | **Imported** | — |
| 3 | Wifi bill Feb | **Imported** | — |
| 4 | Dinner at Marina Bites (Dev visiting for the weekend) | **Imported** | — |
| 5 | dinner - marina bites | **Imported** | — |
| 6 | Electricity Feb | **Imported** | — |
| 7 | Maid salary Feb | **Imported** | — |
| 8 | Movie night snacks (Meera skipped) | **Imported** | — |
| 9 | Cylinder refill | **Imported** | — |
| 10 | Groceries DMart | **Imported** | — |
| 11 | Aisha birthday cake (Aisha not charged obviously) | **Imported** | — |
| 12 | House cleaning supplies | *Skipped* | `missing_field` (skipped): Missing required field(s): paid_by. |
| 13 | Rohan paid Aisha back (this is a settlement not an expense??) | **Imported** | `invalid_split_type` (defaulted): split_type "" is not recognized (expected equal/unequal/percentage/shares); defaulted to "equal". |
| 14 | Pizza Friday (percentages might be off) | **Imported** | `percentage_normalized` (corrected): Percentages summed to 110.0%, not 100%; values were normalized proportionally. |
| 15 | March rent | **Imported** | — |
| 16 | Groceries BigBasket | **Imported** | — |
| 17 | Wifi bill Mar | **Imported** | — |
| 18 | Goa flights (trip starts!) | **Imported** | — |
| 19 | Goa villa booking (booked on intl site) | **Imported** | — |
| 20 | Beach shack lunch | **Imported** | — |
| 21 | Scooter rentals (Rohan and Dev took the bigger ones) | **Imported** | — |
| 22 | Parasailing (Kabir joined for the day) | **Imported** | — |
| 23 | Dinner at Thalassa | **Imported** | — |
| 24 | Thalassa dinner (Aisha also logged this I think hers is wrong) | **Imported** | — |
| 25 | Parasailing refund | *Skipped* | `invalid_amount` (skipped): Amount "-30" is not a positive number. |
| 26 | Airport cab | **Imported** | — |
| 27 | Groceries DMart (forgot to set currency) | **Imported** | `unsupported_currency` (defaulted): Currency is missing; defaulted to INR. |
| 28 | Electricity Mar | **Imported** | — |
| 29 | Maid salary Mar | **Imported** | — |
| 30 | Dinner order Swiggy | *Skipped* | `invalid_amount` (skipped): Amount "0" is not a positive number. |
| 31 | Weekend brunch | **Imported** | `percentage_normalized` (corrected): Percentages summed to 110.0%, not 100%; values were normalized proportionally. |
| 32 | Meera farewell dinner (Meera moving out Sunday :() | **Imported** | — |
| 33 | Deep cleaning service (is this April 5 or May 4? format is a mess) | **Imported** | — |
| 34 | April rent (Aisha took Meera's room too) | **Imported** | — |
| 35 | Groceries BigBasket (oops Meera still in the group list) | **Imported** | — |
| 36 | Wifi bill Apr | **Imported** | — |
| 37 | Sam deposit share (Sam moving in! paid Aisha his deposit) | **Imported** | — |
| 38 | Housewarming drinks | **Imported** | — |
| 39 | Electricity Apr | **Imported** | — |
| 40 | Groceries DMart | **Imported** | — |
| 41 | Furniture for common room (split_type says equal but someone added shares anyway) | **Imported** | — |
| 42 | Maid salary Apr | **Imported** | — |
