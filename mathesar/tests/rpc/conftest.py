"""
Fixtures for the tests of the RPC endpoints.

This inherits the fixtures in the parent conftest.py
"""
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def schema_is_not_internal():
    """
    Answer the guard on the writing endpoints with a schema that is the user's own.

    An endpoint marked as writing asks the database which schema it has been pointed at before
    doing anything, so that the schemas the database and Mathesar keep for themselves can be
    explored without being changed (see mathesar.rpc.decorators.refuse_internal_schemas). These
    tests each mock the connection their own endpoint uses, not that one, so it is answered here
    for all of them at once, leaving the guard itself to be tested on its own.
    """
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.execute = MagicMock(return_value=[("a schema of the user's own",)])
    with patch("mathesar.rpc.decorators.connect", return_value=conn) as mock_connect:
        yield mock_connect
