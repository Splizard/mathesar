from collections import namedtuple

from django.core.management.base import BaseCommand, CommandError

from mathesar.models.base import Database, UserDatabaseRoleMap

# A column to consider, as presentation_schema knows it.
Column = namedtuple('Column', 'table_oid attnum')

# The column's name and type, and whether the current role may alter its table.
COLUMN_QUERY = """
SELECT
  format('%%s.%%I', c.oid::regclass, a.attname),
  a.atttypid::regtype::text,
  pg_has_role(c.relowner, 'USAGE')
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
WHERE c.oid = %s AND a.attnum = %s AND NOT a.attisdropped
"""


class ColumnConversionCommand(BaseCommand):
    """
    Converts columns Mathesar made in a way it no longer does, found by their
    metadata, connecting as whichever of the database's configured roles may
    alter each column's table.

    Subclasses give the columns to consider, the types they may still have,
    and how to convert one.
    """
    # The types of the columns still to convert; columns of other types are skipped.
    old_types = ()

    # A condition over presentation_schema.columns picking out the columns to consider.
    presentation_filter = None

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be converted, converting nothing.",
        )

    def convert(self, conn, column, where, dry_run):
        """
        Convert the column (of one of old_types) using the connection, and
        report it, returning whether all went well.
        """
        raise NotImplementedError

    def handle(self, *args, dry_run=False, **options):
        failed = False
        for database in Database.objects.all():
            conns = []
            try:
                role_maps = UserDatabaseRoleMap.objects.filter(database=database).select_related('configured_role')
                for role_map in {rm.configured_role_id: rm for rm in role_maps}.values():
                    try:
                        conns.append(role_map.connection)
                    except Exception as e:
                        self.stderr.write(f"{database.name}: can't connect as {role_map.configured_role.name}: {e}")
                if not conns:
                    self.stderr.write(f"{database.name}: no configured role could connect to convert its columns.")
                    failed = True
                    continue
                columns = self._find_columns(database, conns)
                if columns is None:
                    failed = True
                    continue
                for column in columns:
                    if not self._convert(database, column, conns, dry_run):
                        failed = True
            finally:
                for conn in conns:
                    conn.close()
        if failed:
            raise CommandError("Some columns were not converted; see above.")

    def _find_columns(self, database, conns):
        """
        Return the columns to consider, or None if no connection could ask.

        Whichever role can see them: presentation_schema may not even be installed in this
        database yet, in which case there is nothing to convert rather than something to report.
        """
        query = (
            'SELECT "table"::oid, attnum FROM presentation_schema.columns'
            f' WHERE {self.presentation_filter}'
        )
        for conn in conns:
            try:
                return [Column(*row) for row in conn.execute(query).fetchall()]
            except Exception:
                conn.rollback()
        self.stderr.write(f"{database.name}: no configured role could read its presentation metadata.")
        return None

    def _convert(self, database, column, conns, dry_run):
        """Convert the column using the first connection able to, returning whether all went well."""
        found = False
        for conn in conns:
            row = conn.execute(COLUMN_QUERY, (column.table_oid, column.attnum)).fetchone()
            if row is None:
                continue
            found = True
            name, type_, can_alter = row
            if type_ not in self.old_types:
                return True
            if not can_alter:
                continue
            try:
                ok = self.convert(conn, column, f"{database.name}: {name}", dry_run)
            except Exception as e:
                conn.rollback()
                self.stderr.write(f"{database.name}: {name}: {e}")
                return False
            if ok and not dry_run:
                conn.commit()
            else:
                conn.rollback()
            return ok
        if found:
            self.stderr.write(
                f"{database.name}: no configured role can alter table {column.table_oid}"
                f" to convert its column {column.attnum}."
            )
            return False
        # The column is gone (or was never visible); its presentation row is just stale.
        return True
