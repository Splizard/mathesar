"""
Make users' ids UUIDs, so that User columns in users' databases can hold them.

Every foreign key to users is converted in place, keeping its indexes and unique
constraints, and each user's old id is kept in legacy_id so that the User
columns holding old ids can be converted (see the convert_user_columns command).
Sessions name their user by id, so they are all ended.
"""
import uuid

from django.db import migrations, models

CONVERT_SQL = """
CREATE TEMPORARY TABLE user_uuids ON COMMIT DROP AS
  SELECT id AS legacy_id, gen_random_uuid() AS uuid FROM mathesar_user;
CREATE FUNCTION pg_temp.user_uuid(integer) RETURNS uuid AS
  'SELECT uuid FROM pg_temp.user_uuids WHERE legacy_id = $1' LANGUAGE SQL STABLE;
CREATE TEMPORARY TABLE user_fkeys ON COMMIT DROP AS
  SELECT c.conrelid::regclass AS tab, c.conname, a.attname AS col, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND c.confrelid = 'mathesar_user'::regclass;

DO $$
DECLARE
  fk record;
  id_seq text := pg_get_serial_sequence('mathesar_user', 'id');
BEGIN
  FOR fk IN SELECT * FROM user_fkeys LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tab, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ALTER COLUMN %I TYPE uuid USING pg_temp.user_uuid(%I)', fk.tab, fk.col, fk.col
    );
  END LOOP;

  ALTER TABLE mathesar_user ADD COLUMN legacy_id integer;
  UPDATE mathesar_user SET legacy_id = id;
  ALTER TABLE mathesar_user ALTER COLUMN id DROP IDENTITY IF EXISTS;
  ALTER TABLE mathesar_user ALTER COLUMN id DROP DEFAULT;
  IF id_seq IS NOT NULL THEN
    -- A serial id's sequence outlives its default.
    EXECUTE format('DROP SEQUENCE IF EXISTS %s', id_seq);
  END IF;
  ALTER TABLE mathesar_user ALTER COLUMN id TYPE uuid USING pg_temp.user_uuid(id);

  FOR fk IN SELECT * FROM user_fkeys LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tab, fk.conname, fk.def);
  END LOOP;
END $$;

DELETE FROM mathesar_downloadlink_sessions;
DELETE FROM django_session;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('mathesar', '0014_downloadlink_hmac'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunSQL(CONVERT_SQL)],
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='legacy_id',
                    field=models.IntegerField(editable=False, null=True),
                ),
                migrations.AlterField(
                    model_name='user',
                    name='id',
                    field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
            ],
        ),
    ]
