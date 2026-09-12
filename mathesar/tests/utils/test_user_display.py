"""
Test user display utility functions.

These tests verify the functions in mathesar/utils/user_display.py which
build user display values for user-type columns.
"""
from unittest.mock import MagicMock
from uuid import UUID

from mathesar.utils import user_display as ud


def _make_user(id, full_name="", email="", username=""):
    """Create a mock User object with the given fields."""
    user = MagicMock(spec=['id', 'full_name', 'email', 'username'])
    user.id = id
    user.full_name = full_name
    user.email = email
    user.username = username
    return user


def _column_presentation(*columns):
    """A table's presentation options keyed by attnum, as get_columns_meta_data returns them."""
    return {attnum: {"user_display_field": field} for attnum, field in columns}


def _make_table_meta(user_tracking_attnum=None):
    """Create a mock TableMetaData object."""
    meta = MagicMock()
    meta.user_tracking_attnum = user_tracking_attnum
    return meta


def _uuid(n):
    return UUID(int=n)


class TestGetUserDisplayValues:
    def test_empty_user_ids(self):
        result = ud.get_user_display_values(set(), "full_name")
        assert result == {}

    def test_single_user_full_name(self, monkeypatch):
        mock_user = _make_user(_uuid(1), full_name="Alice Smith")

        def mock_filter(**kwargs):
            assert kwargs == {"id__in": {_uuid(1)}}
            return [mock_user]

        monkeypatch.setattr(ud.User.objects, "filter", mock_filter)
        result = ud.get_user_display_values({_uuid(1)}, "full_name")
        assert result == {str(_uuid(1)): "Alice Smith"}

    def test_multiple_users_email(self, monkeypatch):
        users = [
            _make_user(_uuid(1), email="alice@example.com"),
            _make_user(_uuid(2), email="bob@example.com"),
        ]

        def mock_filter(**kwargs):
            assert kwargs == {"id__in": {_uuid(1), _uuid(2)}}
            return users

        monkeypatch.setattr(ud.User.objects, "filter", mock_filter)
        result = ud.get_user_display_values({_uuid(1), _uuid(2)}, "email")
        assert result == {str(_uuid(1)): "alice@example.com", str(_uuid(2)): "bob@example.com"}

    def test_username_field(self, monkeypatch):
        mock_user = _make_user(_uuid(5), username="charlie")

        def mock_filter(**kwargs):
            return [mock_user]

        monkeypatch.setattr(ud.User.objects, "filter", mock_filter)
        result = ud.get_user_display_values({_uuid(5)}, "username")
        assert result == {str(_uuid(5)): "charlie"}

    def test_missing_user_excluded(self, monkeypatch):
        """If a user_id is requested but doesn't exist, it's omitted."""
        mock_user = _make_user(_uuid(1), full_name="Alice")

        def mock_filter(**kwargs):
            return [mock_user]

        monkeypatch.setattr(ud.User.objects, "filter", mock_filter)
        result = ud.get_user_display_values({_uuid(1), _uuid(99)}, "full_name")
        assert result == {str(_uuid(1)): "Alice"}

    def test_empty_field_value(self, monkeypatch):
        """If the display field is empty, returns empty string."""
        mock_user = _make_user(_uuid(1), full_name="")

        def mock_filter(**kwargs):
            return [mock_user]

        monkeypatch.setattr(ud.User.objects, "filter", mock_filter)
        result = ud.get_user_display_values({_uuid(1)}, "full_name")
        assert result == {str(_uuid(1)): ""}


class TestGetUserLinkedRecordSummaries:
    def test_no_user_columns(self):
        """When no columns have user_display_field, returns None."""
        cols = _column_presentation((1, None), (2, None))
        result = ud.get_user_linked_record_summaries(cols, [{"1": "a", "2": "b"}])
        assert result is None

    def test_single_user_column(self, monkeypatch):
        cols = _column_presentation((1, None), (3, "full_name"))
        results = [
            {"1": "foo", "3": str(_uuid(10))},
            {"1": "bar", "3": str(_uuid(20))},
        ]

        def mock_get_user_display_values(user_ids, display_field):
            assert user_ids == {_uuid(10), _uuid(20)}
            assert display_field == "full_name"
            return {str(_uuid(10)): "Alice", str(_uuid(20)): "Bob"}

        monkeypatch.setattr(ud, "get_user_display_values", mock_get_user_display_values)
        result = ud.get_user_linked_record_summaries(cols, results)
        assert result == {"3": {str(_uuid(10)): "Alice", str(_uuid(20)): "Bob"}}

    def test_multiple_user_columns(self, monkeypatch):
        cols = _column_presentation((2, "email"), (5, "username"))
        results = [
            {"2": str(_uuid(1)), "5": str(_uuid(3))},
            {"2": str(_uuid(2)), "5": str(_uuid(3))},
        ]

        def mock_get_user_display_values(user_ids, display_field):
            if display_field == "email":
                return {str(_uuid(1)): "a@b.com", str(_uuid(2)): "c@d.com"}
            elif display_field == "username":
                return {str(_uuid(3)): "charlie"}
            return {}

        monkeypatch.setattr(ud, "get_user_display_values", mock_get_user_display_values)
        result = ud.get_user_linked_record_summaries(cols, results)
        assert result == {
            "2": {str(_uuid(1)): "a@b.com", str(_uuid(2)): "c@d.com"},
            "5": {str(_uuid(3)): "charlie"},
        }

    def test_null_and_non_uuid_values_in_results(self, monkeypatch):
        """Null user IDs, and values that aren't UUIDs (as in an old integer User column), are skipped."""
        cols = _column_presentation((3, "full_name"))
        results = [
            {"3": str(_uuid(10))},
            {"3": None},
            {"3": 7},
            {"3": str(_uuid(20))},
        ]

        def mock_get_user_display_values(user_ids, display_field):
            assert user_ids == {_uuid(10), _uuid(20)}
            return {str(_uuid(10)): "Alice", str(_uuid(20)): "Bob"}

        monkeypatch.setattr(ud, "get_user_display_values", mock_get_user_display_values)
        result = ud.get_user_linked_record_summaries(cols, results)
        assert result == {"3": {str(_uuid(10)): "Alice", str(_uuid(20)): "Bob"}}

    def test_returns_none_when_no_user_values(self, monkeypatch):
        """If all user columns have null values in results, returns None."""
        cols = _column_presentation((3, "full_name"))
        results = [{"3": None}]

        result = ud.get_user_linked_record_summaries(cols, results)
        assert result is None


class TestApplyTrackEditingUser:
    def test_no_table_meta(self):
        """When table_meta_data is None, record_def is returned unchanged."""
        record_def = {"1": "some_value"}
        result = ud.apply_track_editing_user(record_def, None, 42)
        assert result == {"1": "some_value"}

    def test_no_tracking_attnum(self):
        """When user_tracking_attnum is None, record_def is returned unchanged."""
        table_meta = _make_table_meta(user_tracking_attnum=None)
        record_def = {"1": "some_value"}
        result = ud.apply_track_editing_user(record_def, table_meta, 42)
        assert result == {"1": "some_value"}

    def test_tracking_column_set(self):
        """When user_tracking_attnum is set, inject user_id under its string key."""
        table_meta = _make_table_meta(user_tracking_attnum=5)
        record_def = {"1": "some_value"}
        result = ud.apply_track_editing_user(record_def, table_meta, 42)
        assert result == {"1": "some_value", "5": 42}

    def test_does_not_mutate_original(self):
        table_meta = _make_table_meta(user_tracking_attnum=3)
        record_def = {"1": "original"}
        result = ud.apply_track_editing_user(record_def, table_meta, 10)
        assert result == {"1": "original", "3": 10}
        assert record_def == {"1": "original"}

    def test_overwrites_existing_value(self):
        """If the record already has a value for the tracking column, overwrite it."""
        table_meta = _make_table_meta(user_tracking_attnum=3)
        record_def = {"1": "data", "3": 999}
        result = ud.apply_track_editing_user(record_def, table_meta, 42)
        assert result == {"1": "data", "3": 42}
