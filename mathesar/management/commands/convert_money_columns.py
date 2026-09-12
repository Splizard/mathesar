from django.core.management.base import BaseCommand, CommandError

from mathesar.models.base import ColumnMetaData, Database, UserDatabaseRoleMap

# Every column still of the money domain, with whether the current role may alter its table.
MONEY_COLUMN_QUERY = """
SELECT
  c.oid,
  a.attnum,
  format('%s.%I', c.oid::regclass, a.attname),
  pg_has_role(c.relowner, 'USAGE')
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
WHERE a.atttypid = 'mathesar_types.mathesar_money'::regtype
  AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p', 'f')
"""

ALTER = 'ALTER TABLE %s ALTER COLUMN %s TYPE numeric'


class Command(BaseCommand):
    help = (
        "Convert columns of mathesar_types.mathesar_money to numeric columns"
        " carrying a currency symbol in their metadata, which is how Mathesar"
        " stores money now. The domain stays, being useful for recognising an"
        " amount while importing, but nothing is stored as one. Does nothing"
        " once they're all converted."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be converted, converting nothing.",
        )

    def handle(self, *args, dry_run=False, **options):
        failed = False
        for database in Database.objects.all():
            try:
                if not self._convert_database(database, dry_run):
                    failed = True
            except Exception as e:
                self.stderr.write(f"{database.name}: {e}")
                failed = True
        if failed:
            raise CommandError("Some money columns were not converted; see above.")

    def _convert_database(self, database, dry_run):
        role_maps = UserDatabaseRoleMap.objects.filter(
            database=database
        ).select_related('configured_role')
        conns = []
        ok = True
        try:
            for role_map in {rm.configured_role_id: rm for rm in role_maps}.values():
                try:
                    conns.append(role_map.connection)
                except Exception as e:
                    self.stderr.write(
                        f"{database.name}: can't connect as {role_map.configured_role.name}: {e}"
                    )
            if not conns:
                # A database nobody can reach has nothing we can convert, but say so: it may
                # still hold money columns.
                self.stderr.write(
                    f"{database.name}: no configured role could connect to convert its columns."
                )
                return False
            # Whichever role can see them; the domain may not even exist in this database.
            columns = []
            for conn in conns:
                try:
                    columns = conn.execute(MONEY_COLUMN_QUERY).fetchall()
                except Exception:
                    conn.rollback()
                    continue
                break
            for table_oid, attnum, where, _ in columns:
                if not self._convert_column(
                    database, conns, table_oid, attnum, f"{database.name}: {where}", dry_run
                ):
                    ok = False
            return ok
        finally:
            for conn in conns:
                conn.close()

    def _convert_column(self, database, conns, table_oid, attnum, where, dry_run):
        """Convert one column using the first connection whose role may alter its table."""
        for conn in conns:
            row = conn.execute(
                MONEY_COLUMN_QUERY + " AND c.oid = %s AND a.attnum = %s",
                (table_oid, attnum),
            ).fetchone()
            if row is None:
                # Already converted, or not visible to this role.
                continue
            if not row[3]:
                continue
            name = row[2]
            if dry_run:
                self.stdout.write(f"{where}: would become numeric (dry run)")
                return True
            try:
                # The domain is numeric underneath, so nothing is converted but the type.
                conn.execute(ALTER % (name.rsplit('.', 1)[0], _quote(name.rsplit('.', 1)[1])))
            except Exception as e:
                conn.rollback()
                self.stderr.write(f"{where}: {e}")
                return False
            conn.commit()
            # Without a symbol it would read as an ordinary number from here on.
            metadata, _ = ColumnMetaData.objects.get_or_create(
                database=database, table_oid=table_oid, attnum=attnum
            )
            if metadata.mon_currency_symbol is None:
                metadata.mon_currency_symbol = '$'
                metadata.save(update_fields=['mon_currency_symbol'])
            self.stdout.write(f"{where}: now a numeric holding money")
            return True
        self.stderr.write(f"{where}: no configured role can alter it.")
        return False


def _quote(identifier):
    return '"' + identifier.replace('"', '""') + '"'
