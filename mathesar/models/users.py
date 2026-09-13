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

    # The person who set this agent going, and null for a person. An agent is a user rather
    # than a thing of its own so that everything that already knows how to name a user, pick
    # one and attribute a write to one goes on working without being told about agents.
    #
    # Deleting a person deletes their agents. The alternative -- leaving them behind with no
    # owner -- would quietly promote them to the service agents that are granted their own
    # privileges, which is the opposite of what losing your owner should mean.
    owner = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='agents',
    )
    # Which model is behind the agent, as a label rather than an identity: two people both
    # running Claude have two agents that happen to say the same thing here. Free text,
    # because the list of models changes faster than Mathesar does.
    agent_model = models.CharField(max_length=63, blank=True, default='')

    class Meta(AbstractUser.Meta):
        constraints = [
            # An agent's name only has to be unique among its owner's, which is what lets two
            # people each call theirs "Claude" without either of them being made to pick again.
            models.UniqueConstraint(
                fields=['owner', 'full_name'],
                condition=models.Q(owner__isnull=False),
                name='agent_name_unique_per_owner',
            ),
            # An agent is never a Mathesar superuser. It borrows its owner's reach into the
            # databases, but administering Mathesar itself is not a thing to be delegated.
            models.CheckConstraint(
                check=~models.Q(owner__isnull=False, is_superuser=True),
                name='agent_is_not_superuser',
            ),
        ]

    @property
    def is_agent(self):
        """Whether this user is an agent somebody set going rather than a person."""
        return self.owner_id is not None

    @property
    def database_principal(self):
        """
        Whose reach into a database this user has.

        An agent has its owner's and no more, which is the whole of "an agent is no more
        privileged than the person who set it going" in practice: it arrives at Postgres as
        that person, and Mathesar is what tells the two of them apart afterwards. That makes
        assignment an expression of trust rather than a boundary, which is named as such in
        docs/proposals/agents-working-rows.md.
        """
        return self.owner or self

    def metadata_privileges(self, database_id):
        return 'read write'
