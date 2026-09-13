"""
Test the agents a person sets going.

An agent is a Mathesar user with an owner. These tests are mostly about what that one field
is supposed to buy: two people each having a "Claude" without either being made to rename
theirs, an agent reaching a database exactly as far as its owner, and an agent never being
able to become either a superuser or a second way into somebody's account.
"""
import pytest
from django.db import IntegrityError, transaction

from mathesar.models import User
from mathesar.utils.agents import (
    derive_email,
    derive_username,
    display_name,
    person_label,
)
from mathesar.utils.users import add_agent, delete_agent, list_agents


@pytest.fixture
def quentin(db):
    return User.objects.create(
        username="quentin", full_name="Quentin", email="q@example.com"
    )


@pytest.fixture
def bligh(db):
    return User.objects.create(
        username="bligh", full_name="Bligh", email="b@example.com"
    )


class TestNaming:
    def test_a_person_is_their_own_name(self, quentin):
        assert display_name(quentin) == "Quentin"

    def test_a_person_without_a_name_is_their_username(self, db):
        nameless = User.objects.create(username="someone")
        assert person_label(nameless) == "someone"
        assert display_name(nameless) == "someone"

    def test_an_agent_is_named_by_its_owner_too(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        assert display_name(agent) == "Quentin's Claude"

    def test_an_unnamed_agent_is_just_an_agent(self, bligh):
        agent = add_agent(bligh, "", "codex")
        assert display_name(agent) == "Bligh's Agent"

    def test_two_people_can_each_have_a_claude(self, quentin, bligh):
        """The point of the whole design: a name is only unique among one owner's agents."""
        mine = add_agent(quentin, "Claude", "claude")
        theirs = add_agent(bligh, "Claude", "claude")
        assert mine.full_name == theirs.full_name == "Claude"
        assert mine.username != theirs.username
        assert display_name(mine) == "Quentin's Claude"
        assert display_name(theirs) == "Bligh's Claude"

    def test_one_person_cannot_have_two_claudes(self, quentin):
        add_agent(quentin, "Claude", "claude")
        with pytest.raises(Exception, match="already have an agent called Claude"):
            add_agent(quentin, "Claude", "claude")

    def test_renaming_a_person_renames_their_agents(self, quentin):
        """The possessive is applied when shown, not stored, so this needs no fixing up."""
        agent = add_agent(quentin, "Claude", "claude")
        quentin.full_name = "Q"
        quentin.save()
        agent.refresh_from_db()
        assert display_name(agent) == "Q's Claude"


class TestDerivedHandles:
    def test_username_joins_the_owner_and_the_name(self, quentin):
        assert derive_username(quentin, "Claude") == "quentin__claude"

    def test_username_reduces_what_a_role_may_not_hold(self, quentin):
        assert derive_username(quentin, "My Best Agent!") == "quentin__my_best_agent"

    def test_username_fits_a_postgres_role(self, db):
        long_owner = User.objects.create(username="x" * 60)
        assert len(derive_username(long_owner, "Claude")) <= 63

    def test_username_steps_aside_for_one_taken(self, quentin):
        User.objects.create(username="quentin__claude")
        assert derive_username(quentin, "Claude") == "quentin__claude_2"

    def test_the_identifier_is_on_a_domain_nobody_can_own(self, quentin):
        """
        Not a mailbox, and deliberately not on a real domain.

        Inventing an address on somebody's own domain would imply a mailbox that does not
        exist, could collide with one that does, and would start delivering somewhere the
        day that domain grew a catch-all. RFC 2606 reserves `.invalid` so that it cannot be
        registered by anybody, which is what makes it the honest choice here.
        """
        assert derive_email(quentin, "Claude") == "quentin-claude@agents.invalid"

    def test_it_is_not_built_on_the_owners_domain(self, quentin):
        assert "example.com" not in derive_email(quentin, "Claude")

    def test_it_avoids_plus_addressing(self, quentin):
        """Understood almost everywhere is not everywhere, and this has to survive being
        typed into a certificate, a config file and an allow-list."""
        assert "+" not in derive_email(quentin, "Claude")

    def test_it_does_not_need_the_owner_to_have_an_address(self, db):
        nameless = User.objects.create(username="someone")
        assert derive_email(nameless, "Claude") == "someone-claude@agents.invalid"

    def test_an_installation_may_name_its_own_domain(self, quentin, settings):
        """For a gate that insists on a domain it recognises."""
        settings.AGENT_EMAIL_DOMAIN = "agents.hiddenstrings.com"
        assert derive_email(quentin, "Claude") == "quentin-claude@agents.hiddenstrings.com"


class TestSettingOneGoing:
    def test_an_agent_knows_it_is_one(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        assert agent.is_agent
        assert not quentin.is_agent

    def test_an_agent_reaches_as_far_as_its_owner(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        assert agent.database_principal == quentin
        assert quentin.database_principal == quentin

    def test_an_agent_has_no_password(self, quentin):
        """It arrives through whatever gate its owner does; a password would be a second."""
        agent = add_agent(quentin, "Claude", "claude")
        assert not agent.has_usable_password()

    def test_an_agent_gets_an_address_of_its_own(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        assert agent.email == "quentin-claude@agents.invalid"
        assert agent.email != quentin.email

    def test_an_address_may_be_given(self, quentin):
        agent = add_agent(quentin, "Claude", "claude", "claude@hiddenstrings.com")
        assert agent.email == "claude@hiddenstrings.com"

    def test_an_address_somebody_already_has_is_refused(self, quentin, bligh):
        with pytest.raises(Exception, match="already belongs to somebody"):
            add_agent(quentin, "Claude", "claude", "B@example.com")

    def test_the_model_is_a_label(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        assert agent.agent_model == "claude"

    def test_an_agent_cannot_own_an_agent(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        with pytest.raises(Exception, match="cannot own an agent"):
            add_agent(agent, "Sub", "claude")

    def test_an_agent_cannot_be_a_superuser(self, quentin):
        agent = add_agent(quentin, "Claude", "claude")
        agent.is_superuser = True
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                agent.save()


class TestKeepingThem:
    def test_agents_list_oldest_first(self, quentin):
        add_agent(quentin, "First", "claude")
        add_agent(quentin, "Second", "codex")
        assert [a.full_name for a in list_agents(quentin)] == ["First", "Second"]

    def test_only_your_own_are_listed(self, quentin, bligh):
        add_agent(quentin, "Mine", "claude")
        add_agent(bligh, "Theirs", "claude")
        assert [a.full_name for a in list_agents(quentin)] == ["Mine"]

    def test_somebody_elses_agent_is_not_yours_to_stop(self, quentin, bligh):
        theirs = add_agent(bligh, "Theirs", "claude")
        with pytest.raises(Exception, match="belongs to somebody else"):
            delete_agent(quentin, theirs.id)
        assert list_agents(bligh).count() == 1

    def test_losing_your_owner_is_not_a_promotion(self, quentin):
        """An ownerless agent would be a service account; deleting a person takes theirs."""
        agent = add_agent(quentin, "Claude", "claude")
        quentin.delete()
        assert not User.objects.filter(id=agent.id).exists()
