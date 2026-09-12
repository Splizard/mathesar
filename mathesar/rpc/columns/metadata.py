"""
Classes and functions exposed to the RPC endpoint for managing column metadata.
"""
from typing import Literal, Optional, TypedDict

from modernrpc.core import REQUEST_KEY

from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.rpc.utils import connect
from mathesar.utils.columns import get_columns_meta_data, set_columns_meta_data


class ColumnMetaDataRecord(TypedDict):
    """
    Metadata for a column in a table.

    Only the `database`, `table_oid`, and `attnum` keys are required.

    Attributes:
        database_id: The Django id of the database containing the table.
        table_oid: The OID of the table containing the column.
        attnum: The attnum of the column in the table.
        bool_input: How the input for a boolean column should be shown.
        bool_true: A string to display for `true` values.
        bool_false: A string to display for `false` values.
        num_min_frac_digits: Minimum digits shown after the decimal point.
        num_max_frac_digits: Maximum digits shown after the decimal point.
        num_grouping: Specifies how grouping separators are displayed for numeric values.
        num_format: Specifies the locale-specific format for displaying numeric values.
        num_unix_time: The unit of a whole number counting from the Unix epoch, when that is what
            the column holds. If non-null, the column is shown as a date and a time rather than as
            a number, formatted by `date_format` and `time_format`.
        mon_currency_symbol: The currency symbol shown for money value.
        mon_currency_location: Where the currency symbol should be shown.
        time_format: A string representing the format of time values.
        date_format: A string representing the format of date values.
        time_checkbox: Whether an instant is shown as a tick rather than as a date and a time. The
            value is still the instant: the tick says whether there is one, ticking writes the
            moment it was ticked, and unticking clears it.
        duration_min: The smallest unit for displaying durations.
        duration_max: The largest unit for displaying durations.
        duration_format: Whether a duration is displayed as a time on a clock or written
            out in words, e.g. "10 seconds".
        display_width: The pixel width of the column
        file_backend: The name of a backend for storing file attachments.
        user_display_field: Which user field to display for user columns (full_name, email, or username).
            If non-null, the column is treated as a user column and values are displayed as user
            references. If null, the column displays as a plain integer.
        array_delimiter: The character separating the values of an array column, a comma by
            default. A backslash escapes it, and a backslash, within a value.
    """
    database_id: int
    table_oid: int
    attnum: int
    bool_input: Optional[Literal["dropdown", "checkbox"]]
    bool_true: Optional[str]
    bool_false: Optional[str]
    num_min_frac_digits: Optional[int]
    num_max_frac_digits: Optional[int]
    num_grouping: Optional[str]
    num_format: Optional[str]
    num_unix_time: Optional[Literal["seconds", "milliseconds", "microseconds", "nanoseconds"]]
    mon_currency_symbol: Optional[str]
    mon_currency_location: Optional[Literal["after-minus", "end-with-space"]]
    time_format: Optional[str]
    date_format: Optional[str]
    time_checkbox: Optional[bool]
    duration_min: Optional[str]
    duration_max: Optional[str]
    duration_format: Optional[Literal["clock", "words"]]
    display_width: Optional[int]
    file_backend: Optional[str]
    user_display_field: Optional[Literal["full_name", "email", "username"]]
    array_delimiter: Optional[str]

    @classmethod
    def from_options(cls, database_id, table_oid, attnum, options):
        return cls(
            database_id=database_id, table_oid=table_oid, attnum=attnum, **options
        )


class ColumnMetaDataBlob(TypedDict):
    """
    The metadata fields which can be set for a column in a table.

    Attributes:
        attnum: The attnum of the column in the table.
        bool_input: How the input for a boolean column should be shown.
        bool_true: A string to display for `true` values.
        bool_false: A string to display for `false` values.
        num_min_frac_digits: Minimum digits shown after the decimal point.
        num_max_frac_digits: Maximum digits shown after the decimal point.
        num_grouping: Specifies how grouping separators are displayed for numeric values.
        num_format: Specifies the locale-specific format for displaying numeric values.
        num_unix_time: The unit of a whole number counting from the Unix epoch, when that is what
            the column holds. If non-null, the column is shown as a date and a time rather than as
            a number, formatted by `date_format` and `time_format`.
        mon_currency_symbol: The currency symbol shown for money value.
        mon_currency_location: Where the currency symbol should be shown.
        time_format: A string representing the format of time values.
        date_format: A string representing the format of date values.
        time_checkbox: Whether an instant is shown as a tick rather than as a date and a time. The
            value is still the instant: the tick says whether there is one, ticking writes the
            moment it was ticked, and unticking clears it.
        duration_min: The smallest unit for displaying durations.
        duration_max: The largest unit for displaying durations.
        duration_format: Whether a duration is displayed as a time on a clock or written
            out in words, e.g. "10 seconds".
        display_width: The pixel width of the column.
        file_backend: The name of a backend for storing file attachments.
        user_display_field: Which user field to display for user columns (full_name, email, or username).
            If non-null, the column is treated as a user column and values are displayed as user
            references. If null, the column displays as a plain integer.
        array_delimiter: The character separating the values of an array column, a comma by
            default. A backslash escapes it, and a backslash, within a value.
    """
    attnum: int
    bool_input: Optional[Literal["dropdown", "checkbox"]]
    bool_true: Optional[str]
    bool_false: Optional[str]
    num_min_frac_digits: Optional[int]
    num_max_frac_digits: Optional[int]
    num_grouping: Optional[str]
    num_format: Optional[str]
    num_unix_time: Optional[Literal["seconds", "milliseconds", "microseconds", "nanoseconds"]]
    mon_currency_symbol: Optional[str]
    mon_currency_location: Optional[Literal["after-minus", "end-with-space"]]
    time_format: Optional[str]
    date_format: Optional[str]
    time_checkbox: Optional[bool]
    duration_min: Optional[str]
    duration_max: Optional[str]
    duration_format: Optional[Literal["clock", "words"]]
    display_width: Optional[int]
    file_backend: Optional[str]
    user_display_field: Optional[Literal["full_name", "email", "username"]]
    array_delimiter: Optional[str]

    @classmethod
    def from_options(cls, attnum, options):
        return cls(attnum=attnum, **options)


@mathesar_rpc_method(name="columns.metadata.list", auth="login")
def list_(*, table_oid: int, database_id: int, **kwargs) -> list[ColumnMetaDataRecord]:
    """
    List metadata associated with columns for a table. Exposed as `list`.

    Args:
        table_oid: Identity of the table in the user's database.
        database_id: The Django id of the database containing the table.

    Returns:
        A list of column metadata objects.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        presentation = get_columns_meta_data(conn, table_oid)
    return [
        ColumnMetaDataRecord.from_options(database_id, table_oid, attnum, options)
        for attnum, options in sorted(presentation.items())
    ]


@mathesar_rpc_method(name="columns.metadata.set", auth="login")
def set_(
    *,
    column_meta_data_list: list[ColumnMetaDataBlob],
    table_oid: int,
    database_id: int,
    **kwargs
) -> None:
    """
    Set metadata associated with columns of a table for a database. Exposed as `set`.

    Args:
        column_meta_data_list: A list describing desired metadata alterations.
        table_oid: Identity of the table whose metadata we'll modify.
        database_id: The Django id of the database containing the table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        set_columns_meta_data(conn, table_oid, column_meta_data_list)
