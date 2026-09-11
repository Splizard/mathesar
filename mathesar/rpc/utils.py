from db.connection import set_mathesar_user
from mathesar.models.base import Database


def connect(database_id, user):
    """
    Get a psycopg database connection, whose transaction runs on behalf of the
    user (see db.connection.set_mathesar_user).

    Args:
        database_id: The Django id of the Database used for connecting.
        user: A user model instance who'll connect to the database.
    """
    conn = Database.objects.get(id=database_id).connect_user(user)
    set_mathesar_user(conn, user.id)
    return conn
