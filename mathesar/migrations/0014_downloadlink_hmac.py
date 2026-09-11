from django.db import migrations, models


def delete_download_links(apps, schema_editor):
    # Download links are made again whenever records with files are read, and
    # these are keyed by signatures files no longer carry.
    apps.get_model('mathesar', 'DownloadLink').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('mathesar', '0013_datafile_encoding'),
    ]

    operations = [
        migrations.RunPython(delete_download_links, migrations.RunPython.noop),
        # The deletion leaves the checks of the (deferred) foreign keys from the
        # links' sessions pending, and Postgres won't alter the table until they've run.
        migrations.RunSQL('SET CONSTRAINTS ALL IMMEDIATE', migrations.RunSQL.noop),
        migrations.RenameField(
            model_name='downloadlink',
            old_name='mash',
            new_name='hmac',
        ),
        migrations.AddField(
            model_name='downloadlink',
            name='mimetype',
            field=models.CharField(null=True),
        ),
    ]
