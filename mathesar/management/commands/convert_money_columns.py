from django.core.management.base import BaseCommand, CommandError

from db.columns import convert_money_column, find_money_columns
from mathesar.models.base import Database, UserDatabaseRoleMap
from mathesar.utils.columns import record_money_column


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
                    columns = find_money_columns(conn)
                except Exception:
                    conn.rollback()
                    continue
                break
            for table_oid, attnum, schema, table, column, _ in columns:
                where = f"{database.name}: {schema}.{table}.{column}"
                if not self._convert_column(database, conns, table_oid, attnum, where, dry_run):
                    ok = False
            return ok
        finally:
            for conn in conns:
                conn.close()

    def _convert_column(self, database, conns, table_oid, attnum, where, dry_run):
        """Convert one column using the first connection whose role may alter its table."""
        for conn in conns:
            found = find_money_columns(conn, table_oid, attnum)
            if not found:
                # Already converted, or not visible to this role.
                continue
            _, _, schema, table, column, may_alter = found[0]
            if not may_alter:
                continue
            if dry_run:
                self.stdout.write(f"{where}: would become numeric (dry run)")
                return True
            try:
                convert_money_column(schema, table, column, conn)
            except Exception as e:
                conn.rollback()
                self.stderr.write(f"{where}: {e}")
                return False
            conn.commit()
            record_money_column(database, table_oid, attnum)
            self.stdout.write(f"{where}: now a numeric holding money")
            return True
        self.stderr.write(f"{where}: no configured role can alter it.")
        return False
