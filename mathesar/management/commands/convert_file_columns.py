from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError

from db.columns import convert_to_file_column, get_legacy_file_refs
from mathesar.models.base import ColumnMetaData, UserDatabaseRoleMap
from mathesar.utils.download_links import sign_legacy_file_refs

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


class Command(BaseCommand):
    help = (
        "Convert the file columns Mathesar made before files had a type of their own"
        " (json or jsonb columns with a file backend) to mathesar_types.file,"
        " keeping the files whose signatures verify. Run it after installing"
        " Mathesar's SQL into its databases."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be converted, converting nothing.",
        )

    def handle(self, *args, dry_run=False, **options):
        columns_by_database = defaultdict(list)
        for column in ColumnMetaData.objects.filter(file_backend__isnull=False).select_related('database'):
            columns_by_database[column.database].append(column)

        failed = False
        for database, columns in columns_by_database.items():
            conns = []
            try:
                role_maps = UserDatabaseRoleMap.objects.filter(database=database).select_related('configured_role')
                for role_map in {rm.configured_role_id: rm for rm in role_maps}.values():
                    try:
                        conns.append(role_map.connection)
                    except Exception as e:
                        self.stderr.write(f"{database.name}: can't connect as {role_map.configured_role.name}: {e}")
                if not conns:
                    self.stderr.write(f"{database.name}: no configured role could connect to convert its file columns.")
                    failed = True
                    continue
                for column in columns:
                    if not self._convert(database, column, conns, dry_run):
                        failed = True
            finally:
                for conn in conns:
                    conn.close()
        if failed:
            raise CommandError("Some file columns were not converted; see above.")

    def _convert(self, database, column, conns, dry_run):
        """Convert the column using the first connection able to, returning whether all went well."""
        found = False
        for conn in conns:
            row = conn.execute(COLUMN_QUERY, (column.table_oid, column.attnum)).fetchone()
            if row is None:
                continue
            found = True
            name, type_, can_alter = row
            where = f"{database.name}: {name}"
            if type_ not in ('json', 'jsonb'):
                return True
            if not can_alter:
                continue
            refs = get_legacy_file_refs(column.table_oid, column.attnum, conn)
            files = sign_legacy_file_refs(refs)
            links = {ref["uri"] for ref in refs}
            if links and not files:
                # Most likely Mathesar isn't configured as it was when it signed
                # them (its SECRET_KEY or file backends), so don't make it so for good.
                self.stderr.write(
                    f"{where}: none of its {len(links)} files' signatures verify, so it's left as {type_}."
                    " Check SECRET_KEY and the file backends."
                )
                return False
            summary = f"{where}: {len(files)} of {len(links)} files kept"
            if dry_run:
                self.stdout.write(f"{summary} (dry run)")
                return True
            try:
                convert_to_file_column(column.table_oid, column.attnum, files, conn)
                conn.commit()
            except Exception as e:
                conn.rollback()
                self.stderr.write(f"{where}: {e}")
                return False
            self.stdout.write(summary)
            return True
        if found:
            self.stderr.write(
                f"{database.name}: no configured role can alter table {column.table_oid}"
                f" to convert its column {column.attnum}."
            )
            return False
        # The column is gone (or was never visible); its metadata is just stale.
        return True
