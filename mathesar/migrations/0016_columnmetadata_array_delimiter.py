# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mathesar", "0015_user_uuid_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="columnmetadata",
            name="array_delimiter",
            field=models.CharField(max_length=1, null=True),
        ),
    ]
