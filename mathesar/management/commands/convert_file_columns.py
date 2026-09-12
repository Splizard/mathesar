from db.columns import convert_to_file_column, get_legacy_file_refs
from mathesar.management.commands._column_conversion import ColumnConversionCommand
from mathesar.utils.download_links import sign_legacy_file_refs


class Command(ColumnConversionCommand):
    help = (
        "Convert the file columns Mathesar made before files had a type of their own"
        " (json or jsonb columns with a file backend) to mathesar_types.file,"
        " keeping the files whose signatures verify. Run it after installing"
        " Mathesar's SQL into its databases."
    )
    old_types = ('json', 'jsonb')
    presentation_filter = 'file_backend IS NOT NULL'

    def convert(self, conn, column, where, dry_run):
        refs = get_legacy_file_refs(column.table_oid, column.attnum, conn)
        files = sign_legacy_file_refs(refs)
        links = {ref["uri"] for ref in refs}
        if links and not files:
            # Most likely Mathesar isn't configured as it was when it signed
            # them (its SECRET_KEY or file backends), so don't make it so for good.
            self.stderr.write(
                f"{where}: none of its {len(links)} files' signatures verify, so it's left as it is."
                " Check SECRET_KEY and the file backends."
            )
            return False
        if not dry_run:
            convert_to_file_column(column.table_oid, column.attnum, files, conn)
        self.stdout.write(f"{where}: {len(files)} of {len(links)} files kept{' (dry run)' if dry_run else ''}")
        return True
