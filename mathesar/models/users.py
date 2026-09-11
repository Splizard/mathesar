from uuid import uuid4

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    # A UUID, so that User columns in users' databases can hold it.
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    # The id the user had before ids were UUIDs, by which the convert_user_columns
    # command converts the User columns made then.
    legacy_id = models.IntegerField(null=True, editable=False)
    # Name fields are changed to mitigate some of the issues in
    # https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/
    # We can get by with a "full name" and "short name" to display in different contexts
    # Both are optional because we can always fall back on username
    first_name = None
    last_name = None
    username = models.CharField(max_length=63, unique=True)
    full_name = models.CharField(max_length=255, blank=True, null=True)
    short_name = models.CharField(max_length=255, blank=True, null=True)
    password_change_needed = models.BooleanField(default=False)
    display_language = models.CharField(max_length=30, blank=True, default='en')

    def metadata_privileges(self, database_id):
        return 'read write'
