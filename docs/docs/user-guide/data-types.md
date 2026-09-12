# Data Types

## PostgreSQL's Data Types

PostgreSQL requires that every table column has a predefined data type. These types serve to keep your data clean by ensuring that (for example) arbitrary text doesn't somehow end up in a column designated for numbers. This type system is quite powerful, but it can be complex. See the [PostgreSQL docs](https://www.postgresql.org/docs/current/datatype.html). There are a _lot_ of different types to choose from, and you can even define your own custom types.

## Mathesar's Data Types {:#ui-types}

Mathesar tames PostgreSQL's type system by grouping its types into a small number of **families**, such as Text, Number, and Time. When you add a column, or change a column's type in the column inspector, you choose a family, and then, in families with more than one, a **kind** of it: a Number column, for instance, can be a Decimal, an Integer, a Float, or Money, and a Time column a Date & Time, a Date, a Time of Day, a Duration, and so on.

Every PostgreSQL type belongs to exactly one family and kind, and a kind can cover several PostgreSQL types: the Integer kind covers `smallint`, `integer`, and `bigint`. Mathesar creates a new column with the kind's default PostgreSQL type, which you can change afterwards in the column inspector, along with the type's options.

| Family | Kinds | PostgreSQL types |
|---|---|---|
| [Text](#text) | Text, Email, URI | `text`, `varchar`, `char`, `name`, `mathesar_types.email`, `mathesar_types.uri` |
| [Number](#number) | Decimal, Integer, Float, Money | the numeric types, `money`, `mathesar_types.mathesar_money`, `mathesar_types.multicurrency_money` |
| [Time](#time) | Date & Time, Date, Time of Day, Duration, Created At, Updated At | `timestamp`, `date`, `time`, `interval` |
| [Boolean](#boolean) | | `boolean` |
| [UUID](#uuid) | | `uuid` |
| [File](#file) | | `mathesar_types.file` |
| [Choice](#choice) | | enums |
| [Composite](#composite) | | composite types |
| [JSON](#json) | JSON, JSON List, Map | `json`, `jsonb`, `mathesar_types.mathesar_json_array`, `mathesar_types.mathesar_json_object` |
| [XML](#xml) | | `xml` |
| [Binary](#binary) | Bytes, Bits | `bytea`, `bit`, `bit varying` |
| [IP](#ip) | IP Address, IP Network, MAC Address | `inet`, `cidr`, `macaddr`, `macaddr8` |
| [2D](#2d) | Point, Line, Segment, Rectangle, Path, Polygon, Circle | `point`, `line`, `lseg`, `box`, `path`, `polygon`, `circle` |
| [Database Table](#database-table) | | `regclass` |

### Ranges and arrays

Having chosen a kind, you can also choose for the column to hold **ranges** of its values, **arrays** of them, or both:

- **Range**: a range of values, such as from 1 to 10, as a PostgreSQL [range](https://www.postgresql.org/docs/17/rangetypes.html). Integer, Decimal, Date & Time, and Date columns can hold ranges, as `int4range` or `int8range`, `numrange`, `tsrange` or `tstzrange`, and `daterange`. Ranges are shown and edited as PostgreSQL writes them (e.g. `[1,10)`).
- **Array**: a list of values, as a PostgreSQL [array](https://www.postgresql.org/docs/17/arrays.html) of the kind's type, such as `integer[]`. An array's values are shown and edited as text, separated by the column's **delimiter**, a comma by default, which you can change under Formatting in the column inspector. A backslash escapes the delimiter within a value, as it does a backslash, and a value written as `\N` is NULL. So with the default delimiter, `red,two\, and a half,\N` is three values, the second holding a comma and the third NULL.

    The values of a Boolean, Choice, File, or Composite array can't be written as text, so its cells show each value as a cell of the type of the array's items — a checkbox, a file, and so on — with a **…** button that opens the column's values in the **Cell** section of the inspector. There each value is a cell of its own to change, remove, or add to, files included, which you upload as you would into a File column. The changes are saved together, and the Cell section edits the values of any array that way, whichever its kind.
- **Range** and **Array**: any number of ranges that don't overlap, as a PostgreSQL multirange, such as `int4multirange`.

Mathesar can change a column of values to ranges of them (each value becoming the range of just it), and between ranges and multiranges: a multirange becomes a range only if it has no gaps. It can't change columns to or from arrays.

A column of a [domain](#domains) is treated as a column of the type the domain is defined over. Types belonging to no family, such as `tsvector`, are shown as **Other**.

Many kinds have **formatting** options, stored as [metadata](./databases.md#metadata).

### Text

- **Text**: [`text`](https://www.postgresql.org/docs/17/datatype-character.html) **(default)**, [`varchar`](https://www.postgresql.org/docs/17/datatype-character.html), and [`char`](https://www.postgresql.org/docs/17/datatype-character.html).
- **Email**: valid email addresses, as `mathesar_types.email`, a custom PostgreSQL type implemented by Mathesar: a [domain](https://www.postgresql.org/docs/17/sql-createdomain.html) over `text` with additional logic to validate that the input is a valid email address.
- **URI**: valid URIs, as `mathesar_types.uri`, a domain over `text` with additional logic to validate that the input is a valid URI.

### Number

- **Decimal**: [`numeric`](https://www.postgresql.org/docs/17/datatype-numeric.html), with optional maximum digits and decimal places.
- **Integer**: [`integer`](https://www.postgresql.org/docs/17/datatype-numeric.html) **(default)**, `bigint`, and `smallint`, chosen by the integer data size.
- **Float**: [`double precision`](https://www.postgresql.org/docs/17/datatype-numeric.html) **(default)** and `real`.

Decimal, Integer, and Float columns have the same formatting: the number of decimal places displayed (e.g. 1.2 vs 1.20), the digit grouping (e.g. 1,000 vs 1000), and the locale (e.g. 1.000,00 vs 1,000.00).

- **Money**: `mathesar_types.money` **(default)**, a custom PostgreSQL type implemented by Mathesar as a [domain](https://www.postgresql.org/docs/17/sql-createdomain.html) over [`numeric`](https://www.postgresql.org/docs/17/datatype-numeric.html), and PostgreSQL's [`money`](https://www.postgresql.org/docs/current/datatype-money.html).
    - Formatting: as for Decimal, plus the currency symbol and its position.

    ??? question "`mathesar_types.money` vs `numeric`"
        Compared with `numeric`, the `mathesar_types.money` type only exists to provide compatibility with our custom casting functions that can import CSV data with currency symbols, and to indicate to the upper layers of the Mathesar application that this column is eligible for an additional "Currency Symbol" metadata field.

        You are welcome to store money values in Decimal columns, but you won't be able to display the values with a currency symbol.

    ??? question "`mathesar_types.money` vs `money`"
        Although PostgreSQL _does_ natively have a `money` type, we've chosen to recommend our custom PostgreSQL type for money in order to give you more control over the fractional precision for money columns. The fractional precision of the native `money` type is controlled by the [`LC_MONETARY`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LC-MONETARY) which is set at the database level and thus may not be granular enough or accessible enough for all Mathesar users to configure.

### Time

- **Date & Time**: [`timestamp with time zone`](https://www.postgresql.org/docs/current/datatype-datetime.html) **(default)** and `timestamp without time zone`.
    - Formatting: the format of the displayed date and time.
- **Date**: [`date`](https://www.postgresql.org/docs/current/datatype-datetime.html).
    - Formatting: the format of the displayed date.
- **Time of Day**: [`time with time zone`](https://www.postgresql.org/docs/17/datatype-datetime.html) **(default)** and `time without time zone`.
    - Formatting: the format of the displayed time.
- **Duration**: a length of time, for example "1 hour" or "3 days", as [`interval`](https://www.postgresql.org/docs/current/datatype-datetime.html).
    - Formatting: the format of the displayed duration.
- **Created At**: a Date & Time column whose default is the current time, so it records when each record was created. Its cells can't be edited.
- **Updated At**: a Date & Time column kept at the time its record was last changed, by a trigger in the database. Its cells can't be edited.

Date and time columns can also have the current date and/or time as their default.

### Boolean

- [`boolean`](https://www.postgresql.org/docs/current/datatype-boolean.html)
- Formatting: a dropdown instead of a checkbox, and the text shown in its two options.

### UUID

- [`uuid`](https://www.postgresql.org/docs/17/datatype-uuid.html)

A UUID column can be shown as **users**: set **Show as** to **User** in its display options. It then holds Mathesar user IDs (which are UUIDs), shows each user by their username, display name, or email, and can record the user who creates each record (Created By) or who last changes it (Updated By). Learn more about [working with user columns](./user-type.md).

### File

- `mathesar_types.file`, a custom PostgreSQL type implemented by Mathesar: a composite of the file's link, its media type, and a signature Mathesar makes over them (see [how files are stored](../administration/file-backend-config.md#how-files-are-stored)).

To enable this data type, you must [configure a file backend](../administration/file-backend-config.md). Learn more about [Mathesar's file feature](./files.md).

### Choice

A value from a fixed list, as a PostgreSQL [enum](https://www.postgresql.org/docs/17/datatype-enum.html). A schema's choices are listed in its [Ontology](#ontology).

### Composite

A value made of named fields, as a PostgreSQL [composite type](https://www.postgresql.org/docs/17/rowtypes.html). Mathesar shows composite values as `field: value, field: value`, with a **{…}** button that opens the value's fields in the **Cell** section of the inspector. There each field is a cell of its own type — a checkbox for a boolean field, a file for a file field — to change, and the changes are saved together. A schema's composite types are listed in its [Ontology](#ontology).

### JSON

- **JSON**: [`jsonb`](https://www.postgresql.org/docs/17/datatype-json.html) **(default)** and `json`.
- **JSON List**: `mathesar_types.mathesar_json_array`, a domain over `jsonb` holding JSON arrays.
- **Map**: `mathesar_types.mathesar_json_object`, a domain over `jsonb` holding JSON objects.

### XML

- [`xml`](https://www.postgresql.org/docs/17/datatype-xml.html)

Binary, IP, and 2D values are all shown and edited as the text PostgreSQL writes for them, such as `\xdeadbeef`, `192.168.0.1/24`, and `(1,2)`.

### Binary

- **Bytes**: [`bytea`](https://www.postgresql.org/docs/17/datatype-binary.html) **(default)**, any sequence of bytes.
- **Bits**: [`bit varying`](https://www.postgresql.org/docs/17/datatype-bit.html) **(default)**, or `bit` when you set a fixed number of bits, which every value must then have exactly.

### IP

- **IP Address**: [`inet`](https://www.postgresql.org/docs/17/datatype-net-types.html) **(default)**, an IPv4 or IPv6 address, with the netmask of its network where it has one.
- **IP Network**: `cidr`, a network. An address with bits beyond its netmask isn't one, so changing such a column to IP Network raises.
- **MAC Address**: `macaddr` **(default)**, a MAC-48 address, or `macaddr8`, an EUI-64 one, as the MAC address size chooses. A MAC-48 address becomes the EUI-64 one for it (`ff:fe` in the middle), and only those EUI-64 addresses become MAC-48 ones again.

### 2D

- **Point**: [`point`](https://www.postgresql.org/docs/17/datatype-geometric.html) **(default)**, **Line**: `line`, **Segment**: `lseg`, **Rectangle**: `box`, **Path**: `path`, **Polygon**: `polygon`, and **Circle**: `circle`.

Mathesar can change a 2D column between the kinds PostgreSQL converts between: a shape becomes the point at its centre, the rectangle around it, the polygon of it, and so on. A Line column can't be changed to another kind, and an open path isn't a polygon, so changing such a column to Polygon raises.

Most of these types have no notion of equality, so 2D columns can only be filtered by whether they're empty.

### Database Table

- [`regclass`](https://www.postgresql.org/docs/17/datatype-oid.html): a reference to a table (or view) in the database, shown by its name.

## Ontology

A schema's page has an **Ontology** section listing the types the schema defines:

- its **choices** (enums), with their values;
- its **composite types**, with their fields;
- its **domains**: types with rules of their own (such as a CHECK constraint, NOT NULL, or a default) on top of another type.

### Domains

A column of a domain is treated as a column of the type the domain is defined over: a column of a domain over `text` is a Text column, whose data type section in the column inspector names the domain. To make a column one of its schema's domains, or none, choose it under **Domain** in the column's data type section, which lists the schema's domains over the column's type. Making a column a domain checks its values against the domain's rules.

If you would like to request additional support for a type, please [open an issue](https://github.com/mathesar-foundation/mathesar/issues) requesting the feature. And if you find that an unsupported type is causing _other_ features to break, please note it as a bug.
