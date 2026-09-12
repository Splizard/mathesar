from django.core.management.base import BaseCommand, CommandError

from db.presentation import get_column_presentation, set_column_presentation
from mathesar.models.base import ColumnMetaData, Database, UserDatabaseRoleMap

# What a column's presentation is made of, as opposed to which column it is about.
OPTIONS = [
    field.name for field in ColumnMetaData._meta.get_fields()
    if field.name not in ('id', 'database', 'table_oid', 'attnum', 'created_at', 'updated_at')
]


class Command(BaseCommand):
    help = (
        "Copy the column display settings Mathesar kept in its own database into"
        " presentation_schema in the database they describe, which is where they live"
        " now. A column that already has settings there is left alone, and a column"
        " that has since gone is skipped, so this can be run as often as you like."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would be copied, copying nothing.",
        )

    def handle(self, *args, dry_run=False, **options):
        failed = False
        for database in Database.objects.all():
            rows = ColumnMetaData.objects.filter(database=database)
            if not rows.exists():
                continue
            try:
                if not self._migrate_database(database, rows, dry_run):
                    failed = True
            except Exception as e:
                self.stderr.write(f"{database.name}: {e}")
                failed = True
        if failed:
            raise CommandError("Some column settings were not copied; see above.")

    def _migrate_database(self, database, rows, dry_run):
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
                # Say so rather than passing over it: this database's settings are still only in
                # Mathesar's own database, and nothing here has moved them.
                self.stderr.write(
                    f"{database.name}: no configured role could connect to copy its column settings."
                )
                return False
            copied = 0
            for row in rows:
                settings = {name: getattr(row, name) for name in OPTIONS}
                if not any(value is not None for value in settings.values()):
                    continue
                result = self._copy(database, row, settings, conns, dry_run)
                if result is None:
                    ok = False
                else:
                    copied += result
            if copied:
                self.stdout.write(
                    f"{database.name}: {copied} column(s) copied{' (dry run)' if dry_run else ''}"
                )
            return ok
        finally:
            for conn in conns:
                conn.close()

    def _copy(self, database, row, settings, conns, dry_run):
        """
        Copy one column's settings using the first connection that can, returning how many were
        copied (0 or 1), or None if it went wrong.
        """
        for conn in conns:
            try:
                existing = get_column_presentation(conn, row.table_oid).get(row.attnum)
            except Exception:
                # This role can't see the table, or presentation_schema isn't installed here.
                conn.rollback()
                continue
            if existing is not None and any(
                existing.get(name) is not None for name in settings
            ):
                # Already said, and what is in the database it describes is the newer word.
                return 0
            if dry_run:
                return 1
            try:
                set_column_presentation(conn, row.table_oid, row.attnum, settings)
            except Exception as e:
                conn.rollback()
                # The column may simply be gone, leaving a stale row behind in Mathesar's database.
                self.stdout.write(f"{database.name}: table {row.table_oid} column {row.attnum}: {e}")
                return 0
            conn.commit()
            return 1
        self.stderr.write(
            f"{database.name}: no configured role could reach table {row.table_oid}"
            f" to copy the settings of its column {row.attnum}."
        )
        return None
