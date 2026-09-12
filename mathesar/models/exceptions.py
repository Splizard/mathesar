class NoConnectionAvailable(Exception):
    pass


class NoAdminConnectionAvailable(Exception):
    pass


class SchemaIsInternal(Exception):
    """
    Raised when something asks to write to a schema the database or Mathesar keeps for itself.

    These can be read and explored but never changed; see db.constants.schema_is_internal.
    """
    pass
