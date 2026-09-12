"""
Classes and functions exposed to the RPC endpoint for managing table constraints.
"""
from typing import Optional, TypedDict, Union

from modernrpc.core import REQUEST_KEY

from db.constraints import (
    get_constraints_for_table,
    create_constraint,
    drop_constraint_via_oid,
    check_pattern_violations,
    repair_check_pattern,
)
from mathesar.rpc.decorators import mathesar_rpc_method
from mathesar.rpc.utils import connect


class ForeignKeyConstraint(TypedDict):
    """
    Information about a foreign key constraint.

    Attributes:
        type: The type of the constraint(`'f'` for foreign key constraint).
        columns: List of columns to set a foreign key on.
        fkey_relation_id: The OID of the referent table.
        fkey_columns: List of referent column(s).
        name: The name of the constraint.
        deferrable: Whether to postpone constraint checking until the end of the transaction.
        fkey_update_action: Specifies what action should be taken when the referenced key is updated.
            Valid options include `'a'(no action)`(default behavior), `'r'(restrict)`, `'c'(cascade)`, `'n'(set null)`, `'d'(set default)`
        fkey_delete_action: Specifies what action should be taken when the referenced key is deleted.
            Valid options include `'a'(no action)`(default behavior), `'r'(restrict)`, `'c'(cascade)`, `'n'(set null)`, `'d'(set default)`
        fkey_match_type: Specifies how the foreign key matching should be performed.
            Valid options include `'f'(full match)`, `'s'(simple match)`(default behavior).
    """
    type: str = 'f'
    columns: list[int]
    fkey_relation_id: int
    fkey_columns: list[int]
    name: Optional[str]
    deferrable: Optional[bool]
    fkey_update_action: Optional[str]
    fkey_delete_action: Optional[str]
    fkey_match_type: Optional[str]


class PrimaryKeyConstraint(TypedDict):
    """
    Information about a primary key constraint.

    Attributes:
        type: The type of the constraint(`'p'` for primary key constraint).
        columns: List of columns to set a primary key on.
        name: The name of the constraint.
        deferrable: Whether to postpone constraint checking until the end of the transaction.
    """
    type: str = 'p'
    columns: list[int]
    name: Optional[str]
    deferrable: Optional[bool]


class UniqueConstraint(TypedDict):
    """
    Information about a unique constraint.

    Attributes:
        type: The type of the constraint(`'u'` for unique constraint).
        columns: List of columns to set a unique constraint on.
        name: The name of the constraint.
        deferrable: Whether to postpone constraint checking until the end of the transaction.
    """
    type: str = 'u'
    columns: list[int]
    name: Optional[str]
    deferrable: Optional[bool]


CHECK_PATTERNS = frozenset({'text_box'})
"""
The check constraint patterns a caller may name. Mathesar recognizes a column's type by the
constraint on it, so the expressions it writes are drawn from a fixed set rather than composed by
the caller. The set itself lives in `msar.build_check_expression`, which also quotes the column
names; this is the guard that keeps callers from reaching past it with SQL of their own.
"""


class CheckConstraint(TypedDict):
    """
    Information about a check constraint.

    A check constraint is named, not written: the caller gives a pattern from `CHECK_PATTERNS` and
    the column to apply it to, and the expression is composed in the database. Passing SQL directly
    is not supported, so that this endpoint can't be used to run arbitrary statements.

    Attributes:
        type: The type of the constraint(`'c'` for check constraint).
        pattern: The name of the check pattern to apply. One of `CHECK_PATTERNS`.
        columns: List of columns to apply the pattern to.
        name: The name of the constraint.
        deferrable: Whether to postpone constraint checking until the end of the transaction.
    """
    type: str = 'c'
    pattern: str
    columns: list[int]
    name: Optional[str]
    deferrable: Optional[bool]


CreatableConstraintInfo = list[
    Union[ForeignKeyConstraint, PrimaryKeyConstraint, UniqueConstraint, CheckConstraint]
]
"""
Type alias for a list of creatable constraints which can be unique, primary key, foreign key, or
check constraints.
"""


class ConstraintInfo(TypedDict):
    """
    Information about a constraint

    Attributes:
        oid: The OID of the constraint.
        name: The name of the constraint.
        type: The type of the constraint.
        columns: List of constrained columns.
        referent_table_oid: The OID of the referent table.
        referent_columns: List of referent column(s).
        expression: The boolean expression of a check constraint, as PostgreSQL renders it back,
                    and null for every other type of constraint.
        validated: False for a constraint added with NOT VALID, whose pre-existing rows were
                   never checked against it.
        pattern: The check pattern the expression turns out to be, where Mathesar recognizes it,
                 and null for a check constraint written by someone else.
    """
    oid: int
    name: str
    type: str
    columns: list[int]
    referent_table_oid: Optional[int]
    referent_columns: Optional[list[int]]
    expression: Optional[str]
    validated: bool
    pattern: Optional[str]

    @classmethod
    def from_dict(cls, con_info):
        return cls(
            oid=con_info["oid"],
            name=con_info["name"],
            type=con_info["type"],
            columns=con_info["columns"],
            referent_table_oid=con_info["referent_table_oid"],
            referent_columns=con_info["referent_columns"],
            expression=con_info["expression"],
            validated=con_info["validated"],
            pattern=con_info["pattern"]
        )


@mathesar_rpc_method(name="constraints.list", auth="login")
def list_(*, table_oid: int, database_id: int, **kwargs) -> list[ConstraintInfo]:
    """
    List information about constraints in a table. Exposed as `list`.

    Args:
        table_oid: The OID of the table to list constraints for.
        database_id: The Django id of the database containing the table.

    Returns:
        A list of constraint details.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        con_info = get_constraints_for_table(table_oid, conn)
        return [ConstraintInfo.from_dict(con) for con in con_info]


def _check_pattern(pattern):
    """Reject a pattern name that isn't one of ours, before it reaches the database."""
    if pattern not in CHECK_PATTERNS:
        raise ValueError(
            f"Unknown check constraint pattern: {pattern!r}. "
            f"Use one of: {', '.join(sorted(CHECK_PATTERNS))}."
        )


def _checked_constraint_defs(constraint_def_list):
    """
    Return the given constraint definitions, having rejected any check constraint that doesn't name
    a known pattern.

    TypedDicts are annotations rather than runtime validation, so without this a caller could put an
    `expression` key on a check constraint and have it interpolated into the `ALTER TABLE` statement
    as SQL. Patterns are the only way in.
    """
    for con in constraint_def_list:
        if con.get("type") != 'c':
            continue
        if "expression" in con:
            raise ValueError(
                "Check constraints are defined by pattern, not by expression. "
                f"Use one of: {', '.join(sorted(CHECK_PATTERNS))}."
            )
        if con.get("pattern") not in CHECK_PATTERNS:
            raise ValueError(
                f"Unknown check constraint pattern: {con.get('pattern')!r}. "
                f"Use one of: {', '.join(sorted(CHECK_PATTERNS))}."
            )
    return constraint_def_list


@mathesar_rpc_method(name="constraints.add", auth="login")
def add(
    *,
    table_oid: int,
    constraint_def_list: CreatableConstraintInfo,
    database_id: int, **kwargs
) -> list[int]:
    """
    Add constraint(s) on a table in bulk.

    Args:
        table_oid: Identity of the table to add constraints to.
        constraint_def_list: A list describing the constraints to add.
        database_id: The Django id of the database containing the table.

    Returns:
        The OID(s) of all the constraints on the table.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return create_constraint(table_oid, _checked_constraint_defs(constraint_def_list), conn)


@mathesar_rpc_method(name="constraints.delete", auth="login")
def delete(*, table_oid: int, constraint_oid: int, database_id: int, **kwargs) -> str:
    """
    Delete a constraint from a table.

    Args:
        table_oid: Identity of the table to delete constraint from.
        constraint_oid: The OID of the constraint to delete.
        database_id: The Django id of the database containing the table.

    Returns:
        The name of the dropped constraint.
    """
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return drop_constraint_via_oid(table_oid, constraint_oid, conn)


class CheckPatternViolations(TypedDict):
    """
    How far a column is from satisfying a check pattern.

    Attributes:
        violations: The number of rows that break the pattern. Rows holding null don't count,
                    a check constraint passing on null.
        repairable: How many of those could be put right without changing what they say, e.g. by
                    trimming the surroundings of a text box's value. The remainder have to be
                    dealt with by someone.
    """
    violations: int
    repairable: int


@mathesar_rpc_method(name="constraints.check_pattern_violations", auth="login")
def list_check_pattern_violations(
    *,
    table_oid: int,
    column_attnum: int,
    pattern: str,
    database_id: int, **kwargs
) -> CheckPatternViolations:
    """
    Count the rows that would stop a check pattern being applied to a column.

    Applying a pattern fails outright while any row breaks it, so this is how a caller finds out
    what it's up against before offering to do anything about it.

    Args:
        table_oid: The OID of the table.
        column_attnum: The attnum of the column the pattern would go on.
        pattern: The name of the pattern. One of `CHECK_PATTERNS`.
        database_id: The Django id of the database containing the table.

    Returns:
        The number of violating rows, and how many of those are repairable.
    """
    _check_pattern(pattern)
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return check_pattern_violations(table_oid, column_attnum, pattern, conn)


@mathesar_rpc_method(name="constraints.repair_check_pattern", auth="login")
def repair(
    *,
    table_oid: int,
    column_attnum: int,
    pattern: str,
    database_id: int, **kwargs
) -> int:
    """
    Put right the rows a check pattern's repair can fix, leaving the rest alone.

    This changes data, so it is only ever worth calling once someone has been told how many rows it
    would touch and has said to go ahead.

    Args:
        table_oid: The OID of the table.
        column_attnum: The attnum of the column to repair.
        pattern: The name of the pattern. One of `CHECK_PATTERNS`.
        database_id: The Django id of the database containing the table.

    Returns:
        The number of rows changed.
    """
    _check_pattern(pattern)
    user = kwargs.get(REQUEST_KEY).user
    with connect(database_id, user) as conn:
        return repair_check_pattern(table_oid, column_attnum, pattern, conn)
