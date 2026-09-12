from db.columns import convert_to_user_column
from mathesar.management.commands._column_conversion import ColumnConversionCommand
from mathesar.models.users import User


class Command(ColumnConversionCommand):
    help = (
        "Convert the User columns Mathesar made before users' ids were UUIDs"
        " (integer columns holding their old ids) to uuid columns holding their"
        " ids. Run it after installing Mathesar's SQL into its databases."
    )
    old_types = ('smallint', 'integer', 'bigint')
    presentation_filter = 'user_display_field IS NOT NULL'

    def convert(self, conn, column, where, dry_run):
        users = {
            str(legacy_id): str(id_)
            for id_, legacy_id in User.objects.filter(legacy_id__isnull=False).values_list('id', 'legacy_id')
        }
        if not dry_run:
            convert_to_user_column(column.table_oid, column.attnum, users, conn)
        self.stdout.write(f"{where}: now holds user UUIDs{' (dry run)' if dry_run else ''}")
        return True
